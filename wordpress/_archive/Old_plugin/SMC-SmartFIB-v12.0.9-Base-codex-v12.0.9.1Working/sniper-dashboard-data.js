"use strict";

(function (root, factory) {
    var exported = factory(root);
    if (typeof module === "object" && module.exports) {
        module.exports = exported.bridge;
    } else {
        root.SniperDashboardData = exported.bridge;
        root.SniperDashboardEngine = exported.engine;
    }
})(typeof self !== "undefined" ? self : this, function (root) {
    function pipMult(pipType) {
        return pipType === "JPY" ? 0.01 : 0.0001;
    }

    function buildFibRatios() {
        var base = [0.0, 0.25, 0.5, 0.625, 0.75, 1.0];
        var ext = [0.25, 0.625, 1.0, 1.625, 2.0];
        var all = base.slice();
        ext.forEach(function (e) {
            all.push(1.0 + e);
            all.push(-e);
        });
        return Array.from(new Set(all)).sort(function (a, b) {
            return a - b;
        });
    }

    var FIB_RATIOS = buildFibRatios();
    var ICT_STRUCT_LB = 20;
    var ICT_EQ_BUFFER_PCT = 0.03;
    var ICT_PD_TOLERANCE_PCT = 0.1;
    var ICT_BIAS_GATE = 0.1;
    var ICT_BIAS_FLIP_SCORE = 25;
    var ICT_BIAS_CONFIRM_EXEC = true;
    var ICT_DISAGREEMENT_PENALTY_MAX = 10;

    function sfKey(hi, lo, ratio) {
        return hi - (hi - lo) * ratio;
    }

    function edeTier(levelPrice, fibHigh, fibLow) {
        if (fibHigh === fibLow) return 1;
        var pricePos = (levelPrice - fibLow) / (fibHigh - fibLow);
        var distance = Math.abs(pricePos - 0.5);
        return distance < 0.125
            ? 0
            : distance < 0.4
              ? 1
              : distance < 0.75
                ? 2
                : distance < 1.25
                  ? 3
                  : distance < 2.0
                    ? 4
                    : 5;
    }

    function getSessionTf(tfSeconds) {
        if (tfSeconds <= 3600) return "Daily";
        if (tfSeconds <= 14400) return "Weekly";
        if (tfSeconds <= 86400) return "Monthly";
        return "Yearly";
    }

    function normalizeSessionTf(sessionTf) {
        var value = String(sessionTf || "")
            .trim()
            .toUpperCase();
        if (value === "DAILY" || value === "DAY" || value === "D" || value === "1D") return "Daily";
        if (value === "WEEKLY" || value === "WEEK" || value === "W" || value === "1W")
            return "Weekly";
        if (value === "MONTHLY" || value === "MONTH" || value === "M" || value === "1M")
            return "Monthly";
        if (
            value === "YEARLY" ||
            value === "YEAR" ||
            value === "Y" ||
            value === "1Y" ||
            value === "ANNUAL"
        )
            return "Yearly";
        return getSessionTf(14400);
    }

    function toNumber(v) {
        var n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    function isAnchorTraceEnabled(options) {
        var opts = options || {};
        if (opts.anchorTrace === true || opts.debugAnchorTrace === true) return true;
        if (
            root &&
            (root.SNIPER_DASHBOARD_DEBUG_ANCHOR_TRACE === true || root.__ANCHOR_TRACE__ === true)
        )
            return true;
        return false;
    }

    function candleTimeMs(c) {
        var t = c && (c.time ?? c.timestamp ?? c.ts ?? c.t ?? c.datetime ?? c.date);
        if (t == null) return null;
        var n = Number(t);
        if (Number.isFinite(n)) {
            return n < 1e12 ? n * 1000 : n;
        }
        var s = String(t).trim();
        if (!s) return null;
        var isoLike = s;
        if (isoLike.indexOf(" ") !== -1 && isoLike.indexOf("T") === -1) {
            isoLike = isoLike.replace(" ", "T");
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(isoLike)) {
            isoLike += "T00:00:00Z";
        } else if (!/(Z|[+\-]\d{2}:?\d{2})$/.test(isoLike)) {
            isoLike += "Z";
        }
        var p = Date.parse(isoLike);
        return Number.isFinite(p) ? p : null;
    }

    function normalizeCandle(raw) {
        if (!raw) return null;
        var open = toNumber(raw.open ?? raw.o);
        var high = toNumber(raw.high ?? raw.h);
        var low = toNumber(raw.low ?? raw.l);
        var close = toNumber(raw.close ?? raw.c);
        var timeMs = candleTimeMs(raw);
        if (open == null || high == null || low == null || close == null || timeMs == null)
            return null;
        return { open: open, high: high, low: low, close: close, timeMs: timeMs, raw: raw };
    }

    function getSessionKey(timeMs, sessionTf) {
        var d = new Date(timeMs);
        var y = d.getUTCFullYear();
        var m = d.getUTCMonth() + 1;
        var day = d.getUTCDate();

        if (sessionTf === "Daily") {
            return y + "-" + String(m).padStart(2, "0") + "-" + String(day).padStart(2, "0");
        }

        if (sessionTf === "Weekly") {
            var dt = new Date(Date.UTC(y, d.getUTCMonth(), day));
            var dow = dt.getUTCDay();
            var diffToMonday = (dow + 6) % 7;
            dt.setUTCDate(dt.getUTCDate() - diffToMonday);
            var wy = dt.getUTCFullYear();
            var jan1 = new Date(Date.UTC(wy, 0, 1));
            var days = Math.floor((dt - jan1) / 86400000);
            var w = Math.floor(days / 7) + 1;
            return wy + "-W" + String(w).padStart(2, "0");
        }

        if (sessionTf === "Monthly") {
            return y + "-" + String(m).padStart(2, "0");
        }

        return String(y);
    }

    function buildCompletedSessions(candles, sessionTf) {
        var norm = candles
            .map(normalizeCandle)
            .filter(Boolean)
            .sort(function (a, b) {
                return a.timeMs - b.timeMs;
            });
        if (!norm.length) return [];

        var sessions = [];
        var cur = null;

        for (var i = 0; i < norm.length; i++) {
            var c = norm[i];
            var key = getSessionKey(c.timeMs, sessionTf);
            if (!cur || cur.key !== key) {
                if (cur) sessions.push(cur);
                cur = {
                    key: key,
                    startMs: c.timeMs,
                    endMs: c.timeMs,
                    open: c.open,
                    close: c.close,
                    high: c.high,
                    low: c.low,
                    candles: [c],
                };
            } else {
                cur.endMs = c.timeMs;
                cur.close = c.close;
                cur.high = Math.max(cur.high, c.high);
                cur.low = Math.min(cur.low, c.low);
                cur.candles.push(c);
            }
        }
        if (cur) sessions.push(cur);

        // Exclude only if the most recent grouped session is the currently in-progress session.
        // Historical/offline datasets (where the latest session key is in the past) should retain all sessions.
        if (sessions.length > 0) {
            var latest = sessions[sessions.length - 1];
            var nowKey = getSessionKey(Date.now(), sessionTf);
            if (latest.key === nowKey) sessions.pop();
        }

        return sessions;
    }

    function sessionToFib(s) {
        if (!s) return null;
        return { high: s.high, low: s.low, bull: s.close >= s.open };
    }

    function computeF2FromSwap(s1, s2, pipType, f1Bull, f3Bull) {
        var f2High;
        var f2Low;
        var f2Bull;
        var expanded = false;

        if (f3Bull) {
            f2High = s2.high;
            f2Low = s1.low;
            f2Bull = false;
        } else {
            f2High = s2.low;
            f2Low = s1.high;
            f2Bull = true;
        }

        var sameDir = f3Bull === f1Bull;
        var swapRange = Math.abs(f2High - f2Low);
        var fullRange = f3Bull ? Math.abs(s1.high - s2.low) : Math.abs(s2.high - s1.low);
        var threshold = pipType === "JPY" ? 0.35 : 0.25;

        if (sameDir && fullRange > 0 && swapRange / fullRange < threshold) {
            expanded = true;
            if (f3Bull) {
                f2High = s1.high;
                f2Low = s2.low;
                f2Bull = true;
            } else {
                f2High = s2.high;
                f2Low = s1.low;
                f2Bull = false;
            }
        }

        return {
            high: f2High,
            low: f2Low,
            bull: f2Bull,
            name: expanded ? "SWAP EXP" : "SWAP",
            _meta: {
                sameDir: sameDir,
                swapRange: swapRange,
                fullRange: fullRange,
                threshold: threshold,
                expanded: expanded,
                branch: expanded ? "EXPANDED" : "SWAP",
            },
        };
    }

    function computeCgBestBodyPct(candles, options) {
        var structureEventField = options.structureEventField || "structureChanged";
        var minBodyPct = options.cgMinBodyPct == null ? 0.4 : Number(options.cgMinBodyPct);
        var best = Number.isFinite(options.cgBestBodyPct) ? Number(options.cgBestBodyPct) : 0;
        var structureId = options.structureId == null ? null : String(options.structureId);

        var norm = candles
            .map(normalizeCandle)
            .filter(Boolean)
            .sort(function (a, b) {
                return a.timeMs - b.timeMs;
            });
        for (var i = 0; i < norm.length; i++) {
            var c = norm[i];
            var range = Math.abs(c.high - c.low);
            var body = Math.abs(c.close - c.open);
            var bodyPct = range > 0 ? body / range : 0;

            var raw = c.raw || {};
            var localStructureChanged = !!raw[structureEventField];
            if (localStructureChanged) {
                best = bodyPct;
            } else {
                best = Math.max(best, bodyPct);
            }

            if (raw.structureId != null) structureId = String(raw.structureId);
        }

        if (options.structureChanged === true) {
            var last = norm[norm.length - 1];
            if (last) {
                var lr = Math.abs(last.high - last.low);
                var lb = Math.abs(last.close - last.open);
                best = lr > 0 ? lb / lr : 0;
            } else {
                best = 0;
            }
        }

        return {
            cgBestBodyPct: best,
            cgValidDisp: best >= minBodyPct,
            structureId: structureId,
        };
    }

    function computeFibAnchors(candles, opts) {
        var options = opts || {};
        var tfSeconds = Number(options.tfSeconds || 3600);
        var pipType = options.pipType === "JPY" ? "JPY" : "USD";
        var sessionTf = options.sessionTf || getSessionTf(tfSeconds);
        var cgMinRangeUSD = Number(options.cgMinRangeUSD == null ? 5 : options.cgMinRangeUSD);
        var cgMinRangeJPY = Number(options.cgMinRangeJPY == null ? 8 : options.cgMinRangeJPY);

        var sessions = buildCompletedSessions(candles || [], sessionTf);
        var s1 = sessions.length >= 1 ? sessions[sessions.length - 1] : null;
        var s2 = sessions.length >= 2 ? sessions[sessions.length - 2] : null;

        var f3 = sessionToFib(s1);
        var f1 = sessionToFib(s2);
        var f2 = null;

        if (s1 && s2) {
            f2 = computeF2FromSwap(s1, s2, pipType, f1.bull, f3.bull);
        }

        if (isAnchorTraceEnabled(options)) {
            console.log("[ANCHOR_TRACE:FIB_INPUT]", {
                sessionTf: sessionTf,
                sessionCount: sessions.length,
                hasS1: !!s1,
                hasS2: !!s2,
                hasF3: !!f3,
            });
        }

        var lockedHigh = toNumber(options.lockedHigh);
        var lockedLow = toNumber(options.lockedLow);
        var cgMinRange =
            (pipType === "JPY" ? cgMinRangeJPY : cgMinRangeUSD) * pipMult(pipType) * 10;
        var lockedRange =
            lockedHigh != null && lockedLow != null ? Math.abs(lockedHigh - lockedLow) : null;
        var cgValidRange = lockedRange != null && lockedRange >= cgMinRange;

        var cg = computeCgBestBodyPct(candles || [], options);
        var allowFib = !!(
            cgValidRange &&
            cg.cgValidDisp &&
            lockedHigh != null &&
            lockedLow != null
        );

        return {
            f1: f1,
            f2: f2 ? { high: f2.high, low: f2.low, bull: f2.bull, name: f2.name } : null,
            f3: f3,
            allowFib: allowFib,
            _meta: {
                sessionTf: sessionTf,
                s1: s1,
                s2: s2,
                cgMinRange: cgMinRange,
                lockedRange: lockedRange,
                cgValidRange: cgValidRange,
                cgBestBodyPct: cg.cgBestBodyPct,
                cgValidDisp: cg.cgValidDisp,
                f2: f2 ? f2._meta : null,
            },
        };
    }

    function isValidFib(fib) {
        return !!(
            fib &&
            Number.isFinite(fib.high) &&
            Number.isFinite(fib.low) &&
            fib.high > fib.low
        );
    }

    function bosThresh(pipType, bosMinPips) {
        return pipMult(pipType === "JPY" ? "JPY" : "USD") * Number(bosMinPips || 0);
    }

    function pivotHigh(candles, i, lookback) {
        if (i < lookback || i + lookback >= candles.length) return null;
        var pivot = candles[i].high;
        for (var k = i - lookback; k <= i + lookback; k++) {
            if (k === i) continue;
            if (candles[k].high >= pivot) return null;
        }
        return pivot;
    }

    function pivotLow(candles, i, lookback) {
        if (i < lookback || i + lookback >= candles.length) return null;
        var pivot = candles[i].low;
        for (var k = i - lookback; k <= i + lookback; k++) {
            if (k === i) continue;
            if (candles[k].low <= pivot) return null;
        }
        return pivot;
    }

    function computeAtrSeries(norm, period) {
        var atr = new Array(norm.length).fill(0);
        var tr = new Array(norm.length).fill(0);
        for (var i = 0; i < norm.length; i++) {
            var prevClose = i > 0 ? norm[i - 1].close : norm[i].close;
            var rangeHL = norm[i].high - norm[i].low;
            var rangeHC = Math.abs(norm[i].high - prevClose);
            var rangeLC = Math.abs(norm[i].low - prevClose);
            tr[i] = Math.max(rangeHL, rangeHC, rangeLC);
        }
        for (var j = 0; j < norm.length; j++) {
            var start = Math.max(0, j - period + 1);
            var sum = 0;
            var count = 0;
            for (var x = start; x <= j; x++) {
                sum += tr[x];
                count += 1;
            }
            atr[j] = count > 0 ? sum / count : 0;
        }
        return atr;
    }

    function computeSweepMssSequence(candles, opts) {
        var options = opts || {};
        var pipType = options.pipType === "JPY" ? "JPY" : "USD";
        var bosMinPips = Number(options.bosMinPips == null ? 5 : options.bosMinPips);
        var sweepConfirmBars = Number(
            options.sweepConfirmBars == null ? 2 : options.sweepConfirmBars,
        );
        var mssConfirmBars = Number(options.mssConfirmBars == null ? 4 : options.mssConfirmBars);
        var swingLookback = Number(options.swingLookback == null ? 10 : options.swingLookback);
        var execPivotLb = Number(options.execPivotLb == null ? 4 : options.execPivotLb);
        var requireDispMss = options.requireDispMss !== false;
        var mintick = Number(options.mintick == null ? 1e-10 : options.mintick);
        var efMinRangePips = Number(options.efMinRangePips == null ? 15 : options.efMinRangePips);
        var efDispMult = Number(options.efDispMult == null ? 1.0 : options.efDispMult);
        var ltfFallbackDisabled = options.ltfFallbackDisabled === true;

        var norm = (candles || [])
            .map(normalizeCandle)
            .filter(Boolean)
            .sort(function (a, b) {
                return a.timeMs - b.timeMs;
            });
        var atrSeries = computeAtrSeries(norm, 14);

        var lastPH1 = null;
        var lastPH2 = null;
        var lastPL1 = null;
        var lastPL2 = null;
        var pdh = null;
        var pdl = null;
        var pwh = null;
        var pwl = null;
        var curDay = null;
        var curWeek = null;
        var dayHi = null;
        var dayLo = null;
        var weekHi = null;
        var weekLo = null;

        var swpCandDir = 0;
        var swpCandPrice = null;
        var swpCandBar = null;
        var swpAcceptCount = 0;
        var lastConfirmedSweepDir = 0;

        var execSH1 = null;
        var execSL1 = null;

        var sweep_bar = null;
        var mss_bar = null;
        var mss_sweep_bar = null;
        var mss_sweep_dir = 0;
        var bullLegLow = null;
        var bullLegHigh = null;
        var bearLegLow = null;
        var bearLegHigh = null;
        var barsInZone = 0;
        var lastBearHigh = null;
        var lastBearLow = null;
        var lastBullHigh = null;
        var lastBullLow = null;
        var lastBearAge = null;
        var lastBullAge = null;

        var rows = [];

        for (var i = 0; i < norm.length; i++) {
            var c = norm[i];
            if (lastBearAge != null) lastBearAge += 1;
            if (lastBullAge != null) lastBullAge += 1;
            if (c.close < c.open) {
                lastBearHigh = c.high;
                lastBearLow = c.low;
                lastBearAge = 0;
            }
            if (c.close > c.open) {
                lastBullHigh = c.high;
                lastBullLow = c.low;
                lastBullAge = 0;
            }
            var dayKey = getSessionKey(c.timeMs, "Daily");
            var weekKey = getSessionKey(c.timeMs, "Weekly");
            if (curDay !== dayKey) {
                if (dayHi != null && dayLo != null) {
                    pdh = dayHi;
                    pdl = dayLo;
                }
                curDay = dayKey;
                dayHi = c.high;
                dayLo = c.low;
            } else {
                dayHi = Math.max(dayHi, c.high);
                dayLo = Math.min(dayLo, c.low);
            }
            if (curWeek !== weekKey) {
                if (weekHi != null && weekLo != null) {
                    pwh = weekHi;
                    pwl = weekLo;
                }
                curWeek = weekKey;
                weekHi = c.high;
                weekLo = c.low;
            } else {
                weekHi = Math.max(weekHi, c.high);
                weekLo = Math.min(weekLo, c.low);
            }

            var swingPivotIdx = i - swingLookback;
            var ph = swingPivotIdx >= 0 ? pivotHigh(norm, swingPivotIdx, swingLookback) : null;
            if (ph != null) {
                lastPH2 = lastPH1;
                lastPH1 = ph;
            }
            var pl = swingPivotIdx >= 0 ? pivotLow(norm, swingPivotIdx, swingLookback) : null;
            if (pl != null) {
                lastPL2 = lastPL1;
                lastPL1 = pl;
            }

            var execPivotIdx = i - execPivotLb;
            var execPH = execPivotIdx >= 0 ? pivotHigh(norm, execPivotIdx, execPivotLb) : null;
            if (execPH != null) execSH1 = execPH;
            var execPL = execPivotIdx >= 0 ? pivotLow(norm, execPivotIdx, execPivotLb) : null;
            if (execPL != null) execSL1 = execPL;

            var eqThresh = bosThresh(pipType, bosMinPips) * 0.5;
            var eqhActive =
                lastPH1 != null && lastPH2 != null && Math.abs(lastPH1 - lastPH2) <= eqThresh;
            var eqlActive =
                lastPL1 != null && lastPL2 != null && Math.abs(lastPL1 - lastPL2) <= eqThresh;
            var eqhPrice = eqhActive ? Math.max(lastPH1, lastPH2) : null;
            var eqlPrice = eqlActive ? Math.min(lastPL1, lastPL2) : null;

            var liqHighRef = eqhActive ? eqhPrice : pdh != null ? pdh : pwh != null ? pwh : lastPH1;
            var liqLowRef = eqlActive ? eqlPrice : pdl != null ? pdl : pwl != null ? pwl : lastPL1;

            var swept_up = false;
            var swept_down = false;
            var confirmed_sweep_up = false;
            var confirmed_sweep_down = false;

            if (swpCandDir === 1) swpAcceptCount = c.close > swpCandPrice ? swpAcceptCount + 1 : 0;
            if (swpCandDir === -1) swpAcceptCount = c.close < swpCandPrice ? swpAcceptCount + 1 : 0;
            if (swpCandDir !== 0 && (swpAcceptCount >= 2 || i - swpCandBar > sweepConfirmBars)) {
                swpCandDir = 0;
                swpCandPrice = null;
                swpCandBar = null;
                swpAcceptCount = 0;
            }

            if (swpCandDir === 0) {
                if (liqHighRef != null && c.high > liqHighRef) {
                    swpCandDir = 1;
                    swpCandPrice = liqHighRef;
                    swpCandBar = i;
                    swpAcceptCount = 0;
                } else if (liqLowRef != null && c.low < liqLowRef) {
                    swpCandDir = -1;
                    swpCandPrice = liqLowRef;
                    swpCandBar = i;
                    swpAcceptCount = 0;
                }
            }

            if (
                swpCandDir === 1 &&
                i > swpCandBar &&
                i - swpCandBar <= sweepConfirmBars &&
                c.close < swpCandPrice
            ) {
                confirmed_sweep_up = true;
                swept_up = true;
                lastConfirmedSweepDir = 1;
                swpCandDir = 0;
                swpCandPrice = null;
                swpCandBar = null;
                swpAcceptCount = 0;
            } else if (
                swpCandDir === -1 &&
                i > swpCandBar &&
                i - swpCandBar <= sweepConfirmBars &&
                c.close > swpCandPrice
            ) {
                confirmed_sweep_down = true;
                swept_down = true;
                lastConfirmedSweepDir = -1;
                swpCandDir = 0;
                swpCandPrice = null;
                swpCandBar = null;
                swpAcceptCount = 0;
            }

            if (confirmed_sweep_up) {
                sweep_bar = i;
                mss_sweep_bar = i;
                mss_sweep_dir = 1;
                bearLegHigh = c.high;
                bearLegLow = c.low;
            } else if (confirmed_sweep_down) {
                sweep_bar = i;
                mss_sweep_bar = i;
                mss_sweep_dir = -1;
                bullLegLow = c.low;
                bullLegHigh = c.high;
            }

            if (mss_sweep_dir === -1) {
                bullLegLow = bullLegLow == null ? c.low : Math.min(bullLegLow, c.low);
                bullLegHigh = bullLegHigh == null ? c.high : Math.max(bullLegHigh, c.high);
            } else if (mss_sweep_dir === 1) {
                bearLegHigh = bearLegHigh == null ? c.high : Math.max(bearLegHigh, c.high);
                bearLegLow = bearLegLow == null ? c.low : Math.min(bearLegLow, c.low);
            }

            var atr14 = atrSeries[i];
            var dispBodyRatio = Math.abs(c.close - c.open) / Math.max(c.high - c.low, mintick);
            var dispRangeATR = atr14 > 0 ? (c.high - c.low) / atr14 : 0;
            var dispFvgBull = i >= 2 ? c.low > norm[i - 2].high : false;
            var dispFvgBear = i >= 2 ? c.high < norm[i - 2].low : false;
            var dispExtendBull = execSH1 != null && c.close - execSH1 >= atr14 * 0.2;
            var dispExtendBear = execSL1 != null && execSL1 - c.close >= atr14 * 0.2;
            var dispScoreBull =
                (dispBodyRatio >= 0.55 ? 1 : 0) +
                (dispRangeATR >= 1.3 ? 1 : 0) +
                (dispFvgBull ? 1 : 0) +
                (dispExtendBull ? 1 : 0);
            var dispScoreBear =
                (dispBodyRatio >= 0.55 ? 1 : 0) +
                (dispRangeATR >= 1.3 ? 1 : 0) +
                (dispFvgBear ? 1 : 0) +
                (dispExtendBear ? 1 : 0);

            var mss_bullish = false;
            var mss_bearish = false;
            var mssRejected = false;
            if (mss_sweep_bar != null) {
                if (i - mss_sweep_bar > mssConfirmBars) {
                    mss_sweep_bar = null;
                    mss_sweep_dir = 0;
                } else {
                    if (mss_sweep_dir === -1 && execSH1 != null && c.high > execSH1) {
                        if (!requireDispMss || dispScoreBull >= 2) mss_bullish = true;
                        else mssRejected = true;
                    }
                    if (mss_sweep_dir === 1 && execSL1 != null && c.low < execSL1) {
                        if (!requireDispMss || dispScoreBear >= 2) mss_bearish = true;
                        else mssRejected = true;
                    }
                }
            }
            if (mss_bullish || mss_bearish) mss_bar = i;

            var efLegMin = efMinRangePips * pipMult(pipType);
            var bullLegRange =
                bullLegHigh != null && bullLegLow != null ? Math.abs(bullLegHigh - bullLegLow) : 0;
            var bearLegRange =
                bearLegHigh != null && bearLegLow != null ? Math.abs(bearLegHigh - bearLegLow) : 0;
            var hasBullSweepContext = lastConfirmedSweepDir === -1 || mss_sweep_dir === -1;
            var hasBearSweepContext = lastConfirmedSweepDir === 1 || mss_sweep_dir === 1;
            var bullNarrativeValid = !!(
                hasBullSweepContext &&
                mss_bullish === true &&
                bullLegRange >= efLegMin &&
                bullLegLow != null &&
                c.close - bullLegLow >= atr14 * efDispMult
            );
            var bearNarrativeValid = !!(
                hasBearSweepContext &&
                mss_bearish === true &&
                bearLegRange >= efLegMin &&
                bearLegHigh != null &&
                bearLegHigh - c.close >= atr14 * efDispMult
            );

            var efAnchorLow = null;
            var efAnchorHigh = null;
            var efAnchorDir = 0;
            var ef_is_narrative = false;
            if (bullNarrativeValid) {
                efAnchorLow = bullLegLow;
                efAnchorHigh = bullLegHigh;
                efAnchorDir = 1;
                ef_is_narrative = true;
            } else if (bearNarrativeValid) {
                efAnchorLow = bearLegLow;
                efAnchorHigh = bearLegHigh;
                efAnchorDir = -1;
                ef_is_narrative = true;
            }

            var efOteLo = null;
            var efOteHi = null;
            if (
                Number.isFinite(efAnchorHigh) &&
                Number.isFinite(efAnchorLow) &&
                efAnchorHigh > efAnchorLow
            ) {
                var efRange = efAnchorHigh - efAnchorLow;
                if (efAnchorDir === 1) {
                    efOteLo = efAnchorHigh - efRange * 0.79;
                    efOteHi = efAnchorHigh - efRange * 0.625;
                } else if (efAnchorDir === -1) {
                    efOteLo = efAnchorLow + efRange * 0.625;
                    efOteHi = efAnchorLow + efRange * 0.79;
                }
            }
            if (efOteLo != null && efOteHi != null && c.close >= efOteLo && c.close <= efOteHi)
                barsInZone += 1;
            else barsInZone = 0;

            var sequenceStatus;
            if (sweep_bar === null) sequenceStatus = "AWAIT SWEEP";
            else if (mss_bar === null || mss_bar <= sweep_bar) {
                if (mss_sweep_bar === null && i - sweep_bar > mssConfirmBars)
                    sequenceStatus = "STALE";
                else sequenceStatus = "AWAIT MSS";
            } else if (i - sweep_bar > 10) sequenceStatus = "STALE";
            else sequenceStatus = "READY";

            var bodyRatioCur = Math.abs(c.close - c.open) / Math.max(c.high - c.low, mintick);
            var reactionCandleQuality = bodyRatioCur >= 0.5 && c.high - c.low >= atr14 * 0.6;
            var raw = c.raw || {};
            var rawLastBearAge = toNumber(raw.lastBearAge);
            var rawLastBullAge = toNumber(raw.lastBullAge);
            var effectiveLastBearAge = rawLastBearAge != null ? rawLastBearAge : lastBearAge;
            var effectiveLastBullAge = rawLastBullAge != null ? rawLastBullAge : lastBullAge;
            var bullPoiFresh = effectiveLastBearAge != null && effectiveLastBearAge <= 12;
            var bearPoiFresh = effectiveLastBullAge != null && effectiveLastBullAge <= 12;
            var liquidityType = String(raw.liquidity_type || raw.liquidityType || "NONE");
            var pdaRankBonusMap = {
                EQH: 10,
                EQL: 10,
                PDH: 8,
                PDL: 8,
                PWH: 6,
                PWL: 6,
                BSL: 3,
                SSL: 3,
            };
            var pdaRankBonus = pdaRankBonusMap[liquidityType] || 0;
            var liqBonus = liquidityType !== "NONE" ? 10 + pdaRankBonus : 0;
            var narrativeOk =
                liquidityType !== "NONE" &&
                (mss_bullish || mss_bearish) &&
                sequenceStatus === "READY";
            var narrativeBonus = narrativeOk ? 1 : 0;
            var pz = Number(raw.pz);
            var htfBullFvg = !!raw.htfBullFvg;
            var htfBearFvg = !!raw.htfBearFvg;
            var htfTrend = Number(raw.htfTrend);
            var htfFvgBonus = (pz === -1 && htfBullFvg) || (pz === 1 && htfBearFvg) ? 2 : 0;
            var htfTrendBonus =
                (pz === -1 && htfTrend === 1) || (pz === 1 && htfTrend === -1) ? 1 : 0;
            var dwellPenalty = barsInZone > 6 ? -15 : barsInZone > 3 ? 0 : barsInZone > 0 ? 10 : 0;
            var reactionBonus = reactionCandleQuality ? 10 : 0;
            var setupQualityBase = Number(
                raw.setup_quality == null
                    ? raw.setupQ == null
                        ? 0
                        : raw.setupQ
                    : raw.setup_quality,
            );
            var execQualityBase = Number(
                raw.execution_quality == null
                    ? raw.execQ == null
                        ? 0
                        : raw.execQ
                    : raw.execution_quality,
            );
            var setupQuality =
                setupQualityBase + liqBonus + narrativeBonus + htfFvgBonus + htfTrendBonus;
            var executionQuality = execQualityBase + dwellPenalty + reactionBonus;
            var rrOk = raw.rr_ok != null ? !!raw.rr_ok : true;
            var poiOk =
                efAnchorDir === 1
                    ? bullPoiFresh
                    : efAnchorDir === -1
                      ? bearPoiFresh
                      : bullPoiFresh || bearPoiFresh;
            var majorOk = raw.major_bos != null ? !!raw.major_bos : true;
            var setupClass = gradeSetupClass(setupQuality, executionQuality, rrOk, poiOk, majorOk);
            var blockedReason = !rrOk ? "RR_BELOW_MIN" : "";
            var state = String(raw.state || "");
            var ladderDir = Number(raw.ladderDir == null ? raw.ladder_dir : raw.ladderDir);
            var ef_tp_narrative_valid = !!(
                ef_is_narrative ||
                (state === "ACTIVE" && ladderDir === efAnchorDir)
            );
            var entry_zone_price = toNumber(raw.entry_zone_price);
            if (entry_zone_price == null) entry_zone_price = c.close;
            var efTp1Ref = toNumber(raw.ef_tp1_ref);
            var efTp2Ref = toNumber(raw.ef_tp2_ref);
            var validatedTp1 = efTp1Ref;
            var validatedTp2 = efTp2Ref;
            if (efAnchorDir === -1) {
                if (!(validatedTp1 != null && validatedTp1 < entry_zone_price)) validatedTp1 = null;
                if (!(validatedTp2 != null && validatedTp2 < entry_zone_price)) validatedTp2 = null;
            } else if (efAnchorDir === 1) {
                if (!(validatedTp1 != null && validatedTp1 > entry_zone_price)) validatedTp1 = null;
                if (!(validatedTp2 != null && validatedTp2 > entry_zone_price)) validatedTp2 = null;
            }

            rows.push({
                barIndex: i,
                timeMs: c.timeMs,
                swept_up: swept_up,
                swept_down: swept_down,
                confirmed_sweep_up: confirmed_sweep_up,
                confirmed_sweep_down: confirmed_sweep_down,
                lastConfirmedSweepDir: lastConfirmedSweepDir,
                swpCandDir: swpCandDir,
                swpCandPrice: swpCandPrice,
                swpCandBar: swpCandBar,
                swpAcceptCount: swpAcceptCount,
                liqHighRef: liqHighRef,
                liqLowRef: liqLowRef,
                raidUp: liqHighRef != null ? c.high > liqHighRef : false,
                raidDown: liqLowRef != null ? c.low < liqLowRef : false,
                mss_bullish: mss_bullish,
                mss_bearish: mss_bearish,
                mssRejected: mssRejected,
                dispBodyRatio: dispBodyRatio,
                dispRangeATR: dispRangeATR,
                dispFvgBull: dispFvgBull,
                dispFvgBear: dispFvgBear,
                dispScoreBull: dispScoreBull,
                dispScoreBear: dispScoreBear,
                sequenceStatus: sequenceStatus,
                bodyRatioCur: bodyRatioCur,
                reactionCandleQuality: reactionCandleQuality,
                sweep_bar: sweep_bar,
                mss_bar: mss_bar,
                mss_sweep_bar: mss_sweep_bar,
                mss_sweep_dir: mss_sweep_dir,
                efAnchorLow: efAnchorLow,
                efAnchorHigh: efAnchorHigh,
                efAnchorDir: efAnchorDir,
                ef_is_narrative: ef_is_narrative,
                efOteLo: efOteLo,
                efOteHi: efOteHi,
                bars_in_zone: barsInZone,
                bullPoiFresh: bullPoiFresh,
                bearPoiFresh: bearPoiFresh,
                lastBullAge: effectiveLastBullAge,
                lastBearAge: effectiveLastBearAge,
                bullPoiHigh: lastBearHigh,
                bullPoiLow: lastBearLow,
                bearPoiHigh: lastBullHigh,
                bearPoiLow: lastBullLow,
                htfBullFvg: htfBullFvg,
                htfBearFvg: htfBearFvg,
                liquidity_type: liquidityType,
                pdaRankBonus: pdaRankBonus,
                liqBonus: liqBonus,
                narrativeBonus: narrativeBonus,
                htfFvgBonus: htfFvgBonus,
                htfTrendBonus: htfTrendBonus,
                setup_quality: setupQuality,
                execution_quality: executionQuality,
                setup_class: setupClass,
                blocked_reason: blockedReason,
                entry_zone_price: entry_zone_price,
                ef_tp_narrative_valid: ef_tp_narrative_valid,
                ef_tp1_ref: ef_tp_narrative_valid ? validatedTp1 : null,
                ef_tp2_ref: ef_tp_narrative_valid ? validatedTp2 : null,
            });
        }

        return {
            bars: rows,
            state: {
                swpCandDir: swpCandDir,
                swpCandPrice: swpCandPrice,
                swpCandBar: swpCandBar,
                swpAcceptCount: swpAcceptCount,
                sweep_bar: sweep_bar,
                mss_bar: mss_bar,
                mss_sweep_bar: mss_sweep_bar,
                mss_sweep_dir: mss_sweep_dir,
            },
        };
    }

    function gradeSetupClass(setupQ, execQ, rrOk, poiOk, majorOk) {
        if (rrOk && poiOk && majorOk && setupQ >= 85 && execQ >= 70) return "A+";
        if (rrOk && poiOk && majorOk && setupQ >= 75) return "A";
        if (rrOk && poiOk && setupQ >= 60) return "B";
        if (rrOk && setupQ >= 45) return "C";
        return "BLOCKED";
    }

    function colorTierFromStar(star, validCount) {
        var baseTier = star <= 1 ? 1 : star <= 3 ? 2 : 3;
        return Math.min(baseTier, validCount);
    }

    function applyStarsForSide(
        sfLevels,
        startIdx,
        endIdx,
        step,
        sfAnchorHigh,
        sfAnchorLow,
        validCount,
    ) {
        var runningMax = 0;
        for (var idx = startIdx; idx !== endIdx; idx += step) {
            var level = sfLevels[idx];
            var rawStar = edeTier(level.price, sfAnchorHigh, sfAnchorLow);
            var bonus = Math.max(validCount - 2, 0);
            var star = Math.max(rawStar + bonus, runningMax);
            star = Math.min(star, 5);
            runningMax = star;
            level.star = star;
            level.colorTier = colorTierFromStar(star, validCount);
        }
    }

    function computeSfEngine(f1, f2, f3) {
        var fibs = [f1, f2, f3].filter(isValidFib);
        var validCount = fibs.length;

        if (validCount < 2) return { sfValid: false };

        var sfAnchorHigh =
            fibs.reduce(function (acc, fib) {
                return acc + fib.high;
            }, 0) / validCount;
        var sfAnchorLow =
            fibs.reduce(function (acc, fib) {
                return acc + fib.low;
            }, 0) / validCount;
        var sfMid = (sfAnchorHigh + sfAnchorLow) / 2;

        var sfLevels = FIB_RATIOS.map(function (ratio) {
            var price = sfKey(sfAnchorHigh, sfAnchorLow, ratio);
            return {
                ratio: ratio,
                price: price,
                star: null,
                colorTier: 1,
                zone: price > sfMid ? "sell" : "buy",
            };
        });

        var idx50 = FIB_RATIOS.indexOf(0.5);
        if (idx50 === -1) throw new Error("FIB_RATIOS must include 0.5");

        // 50% level: always neutral.
        sfLevels[idx50].star = 0;
        sfLevels[idx50].colorTier = 1;

        // Sell side (ratios < 0.5), walk away from 50%.
        applyStarsForSide(sfLevels, idx50 - 1, -1, -1, sfAnchorHigh, sfAnchorLow, validCount);
        // Buy side (ratios > 0.5), walk away from 50%.
        applyStarsForSide(
            sfLevels,
            idx50 + 1,
            sfLevels.length,
            1,
            sfAnchorHigh,
            sfAnchorLow,
            validCount,
        );

        // OBSOLETE-SPRINT4: replaced by EDE engine
        // Legacy confluence-count star system was intentionally neutralized here.

        return {
            sfValid: true,
            sfAnchorHigh: sfAnchorHigh,
            sfAnchorLow: sfAnchorLow,
            validCount: validCount,
            sfLevels: sfLevels,
        };
    }

    function getBoot() {
        return root && root.SNIPER ? root.SNIPER : {};
    }

    function normalizeFibTimeframeKey(raw) {
        var value = String(raw || "")
            .trim()
            .toUpperCase();
        if (["DAILY", "DAY", "D", "1D"].indexOf(value) > -1) return "DAILY";
        if (["WEEKLY", "WEEK", "W", "1W"].indexOf(value) > -1) return "WEEKLY";
        if (["MONTHLY", "MONTH", "M", "1M", "H4"].indexOf(value) > -1) return "MONTHLY";
        if (["YEARLY", "YEAR", "Y", "1Y", "ANNUAL"].indexOf(value) > -1) return "YEARLY";
        return "MONTHLY";
    }

    function buildProfile(rawTimeframe) {
        switch (normalizeFibTimeframeKey(rawTimeframe)) {
            case "DAILY":
                return {
                    key: "DAILY",
                    label: "Day Trader",
                    fib_timeframe: "DAILY",
                    candleInterval: "1h",
                    interval: "1h",
                    historyDepth: 160,
                    outputSize: 160,
                    outputsize: 160,
                    proximityThreshold: 12,
                    strategyHorizon: "1 Day",
                };
            case "MONTHLY":
                return {
                    key: "MONTHLY",
                    label: "Positional",
                    fib_timeframe: "MONTHLY",
                    candleInterval: "1day",
                    interval: "1day",
                    historyDepth: 180,
                    outputSize: 180,
                    outputsize: 180,
                    proximityThreshold: 35,
                    strategyHorizon: "1 Month",
                };
            case "YEARLY":
                return {
                    key: "YEARLY",
                    label: "Institutional",
                    fib_timeframe: "YEARLY",
                    candleInterval: "1week",
                    interval: "1week",
                    historyDepth: 220,
                    outputSize: 220,
                    outputsize: 220,
                    proximityThreshold: 50,
                    strategyHorizon: "1 Year",
                };
            case "WEEKLY":
            default:
                return {
                    key: "WEEKLY",
                    label: "Swing Trader",
                    fib_timeframe: "WEEKLY",
                    candleInterval: "4h",
                    interval: "4h",
                    historyDepth: 140,
                    outputSize: 140,
                    outputsize: 140,
                    proximityThreshold: 20,
                    strategyHorizon: "1 Week",
                };
        }
    }

    function resolveBiasProfile(tfSeconds) {
        var seconds = Number(tfSeconds || 0);
        if (!Number.isFinite(seconds) || seconds <= 0) seconds = 14400;
        if (seconds <= 3600) {
            return {
                timeframe_profile: "INTRADAY",
                bias_profile: "INTRADAY",
                matrix_tf: "DAILY",
                pd_tf: "DAILY",
                dol_pool_profile: "PDH/PDL + PWH/PWL + EQH/EQL + LOCAL",
            };
        }
        if (seconds <= 14400) {
            return {
                timeframe_profile: "SWING",
                bias_profile: "SWING",
                matrix_tf: "WEEKLY",
                pd_tf: "WEEKLY",
                dol_pool_profile: "PWH/PWL + PMH/PML + EQH/EQL + LOCAL",
            };
        }
        return {
            timeframe_profile: "POSITION",
            bias_profile: "POSITION",
            matrix_tf: "MONTHLY",
            pd_tf: "MONTHLY",
            dol_pool_profile: "PMH/PML + MAJOR EQH/EQL + MAJOR LOCAL",
        };
    }

    function computeStructureRegime(norm, opts) {
        var options = opts || {};
        var pipType = options.pipType === "JPY" ? "JPY" : "USD";
        var bosDefault = pipType === "JPY" ? 40 : 15;
        var bos = bosThresh(
            pipType,
            Number(options.bosMinPips == null ? bosDefault : options.bosMinPips),
        );
        var lb = Number(options.swingLookback == null ? 10 : options.swingLookback);
        if (!norm.length) {
            return {
                trend: 0,
                prevTrend: 0,
                regime: "RANGING",
                pivots: { highs: [], lows: [] },
                labels: [],
            };
        }
        var highs = [];
        var lows = [];
        for (var i = lb; i < norm.length - lb; i++) {
            var ph = pivotHigh(norm, i, lb);
            if (ph != null) highs.push({ i: i, price: ph });
            var pl = pivotLow(norm, i, lb);
            if (pl != null) lows.push({ i: i, price: pl });
        }
        var regimeState = 0;
        var prevRegimeState = 0;
        var trendConfirmedIndex = -1;
        var latest = { hh: false, hl: false, lh: false, ll: false };
        for (var h = 1; h < highs.length; h++) {
            var hiNow = highs[h];
            var hiPrev = highs[h - 1];
            latest.hh = hiNow.price > hiPrev.price + bos;
            latest.lh = hiNow.price < hiPrev.price - bos;
        }
        for (var l = 1; l < lows.length; l++) {
            var loNow = lows[l];
            var loPrev = lows[l - 1];
            latest.hl = loNow.price > loPrev.price + bos;
            latest.ll = loNow.price < loPrev.price - bos;
        }
        var limit = Math.max(highs.length, lows.length);
        for (var idx = 0; idx < limit; idx++) {
            var isHh =
                idx > 0 && idx < highs.length && highs[idx].price > highs[idx - 1].price + bos;
            var isLh =
                idx > 0 && idx < highs.length && highs[idx].price < highs[idx - 1].price - bos;
            var isHl = idx > 0 && idx < lows.length && lows[idx].price > lows[idx - 1].price + bos;
            var isLl = idx > 0 && idx < lows.length && lows[idx].price < lows[idx - 1].price - bos;

            if (isHh && isHl) {
                prevRegimeState = regimeState;
                regimeState = 1;
                trendConfirmedIndex = idx;
            } else if (isLl && isLh) {
                prevRegimeState = regimeState;
                regimeState = -1;
                trendConfirmedIndex = idx;
            } else if (regimeState === 1 && isLh && !isHl) {
                if (trendConfirmedIndex < 0 || idx > trendConfirmedIndex) {
                    prevRegimeState = regimeState;
                    regimeState = 2;
                }
            } else if (regimeState === -1 && isHl && !isLh) {
                if (trendConfirmedIndex < 0 || idx > trendConfirmedIndex) {
                    prevRegimeState = regimeState;
                    regimeState = 2;
                }
            }
        }
        if (highs.length < 2 || lows.length < 2) {
            prevRegimeState = regimeState;
            regimeState = 0;
        }
        var trend = regimeState === 1 ? 1 : regimeState === -1 ? -1 : 0;
        var prevTrend = prevRegimeState === 1 ? 1 : prevRegimeState === -1 ? -1 : 0;
        var regime =
            regimeState === 1
                ? "TREND UP"
                : regimeState === -1
                  ? "TREND DOWN"
                  : regimeState === 2
                    ? "REVERSAL ZONE"
                    : "RANGING";
        return {
            trend: trend,
            prevTrend: prevTrend,
            regime: regime,
            pivots: { highs: highs.slice(-6), lows: lows.slice(-6) },
            labels: [
                latest.hh ? "HH" : latest.lh ? "LH" : null,
                latest.hl ? "HL" : latest.ll ? "LL" : null,
            ].filter(Boolean),
        };
    }

    function collectPivotLiquidity(norm, lookback, maxCount) {
        var lb = Math.max(2, Number(lookback || 5));
        var limit = Math.max(1, Number(maxCount || 6));
        var highs = [];
        var lows = [];
        if (!Array.isArray(norm) || !norm.length) return { highs: highs, lows: lows };
        for (var i = lb; i < norm.length - lb; i++) {
            var ph = pivotHigh(norm, i, lb);
            if (ph != null)
                highs.push({ price: ph, timeMs: norm[i].timeMs, source: "LOCAL_PIVOT_HIGH" });
            var pl = pivotLow(norm, i, lb);
            if (pl != null)
                lows.push({ price: pl, timeMs: norm[i].timeMs, source: "LOCAL_PIVOT_LOW" });
        }
        return { highs: highs.slice(-limit), lows: lows.slice(-limit) };
    }

    function collectEqualLiquidity(norm, pipType, majorOnly) {
        var candles = Array.isArray(norm) ? norm : [];
        if (candles.length < 3) return { eqh: [], eql: [] };
        var thresh = bosThresh(pipType, majorOnly ? 12 : 6);
        var eqh = [];
        var eql = [];
        for (var i = 1; i < candles.length; i++) {
            var prev = candles[i - 1];
            var cur = candles[i];
            if (Math.abs(cur.high - prev.high) <= thresh) {
                eqh.push({
                    price: (cur.high + prev.high) * 0.5,
                    timeMs: cur.timeMs,
                    source: majorOnly ? "MAJOR_EQH" : "EQH",
                });
            }
            if (Math.abs(cur.low - prev.low) <= thresh) {
                eql.push({
                    price: (cur.low + prev.low) * 0.5,
                    timeMs: cur.timeMs,
                    source: majorOnly ? "MAJOR_EQL" : "EQL",
                });
            }
        }
        return {
            eqh: eqh.slice(-(majorOnly ? 4 : 8)),
            eql: eql.slice(-(majorOnly ? 4 : 8)),
        };
    }

    function buildHtfLiquidityPools(profile, norm, candles, pipType) {
        var highs = [];
        var lows = [];
        var daily = buildCompletedSessions(candles || [], "Daily");
        var weekly = buildCompletedSessions(candles || [], "Weekly");
        var monthly = buildCompletedSessions(candles || [], "Monthly");

        function pushSessionPool(list, sourceHigh, sourceLow) {
            if (!list || !list.length) return;
            var s = list[list.length - 1];
            highs.push({ price: s.high, source: sourceHigh, timeMs: s.endMs });
            lows.push({ price: s.low, source: sourceLow, timeMs: s.endMs });
        }

        if (profile.timeframe_profile === "INTRADAY") {
            pushSessionPool(daily, "PDH", "PDL");
            pushSessionPool(weekly, "PWH", "PWL");
        } else if (profile.timeframe_profile === "SWING") {
            pushSessionPool(weekly, "PWH", "PWL");
            pushSessionPool(monthly, "PMH", "PML");
        } else {
            pushSessionPool(monthly, "PMH", "PML");
        }

        var eq = collectEqualLiquidity(norm, pipType, profile.timeframe_profile === "POSITION");
        highs = highs.concat(eq.eqh);
        lows = lows.concat(eq.eql);

        var pivots = collectPivotLiquidity(
            norm,
            profile.timeframe_profile === "POSITION" ? 8 : 5,
            profile.timeframe_profile === "POSITION" ? 4 : 6,
        );
        highs = highs.concat(
            pivots.highs.map(function (h) {
                return {
                    price: h.price,
                    source:
                        profile.timeframe_profile === "POSITION"
                            ? "MAJOR_PIVOT_HIGH"
                            : "LOCAL_PIVOT_HIGH",
                    timeMs: h.timeMs,
                };
            }),
        );
        lows = lows.concat(
            pivots.lows.map(function (l) {
                return {
                    price: l.price,
                    source:
                        profile.timeframe_profile === "POSITION"
                            ? "MAJOR_PIVOT_LOW"
                            : "LOCAL_PIVOT_LOW",
                    timeMs: l.timeMs,
                };
            }),
        );

        return {
            highs: highs.filter(function (v) {
                return v && Number.isFinite(v.price);
            }),
            lows: lows.filter(function (v) {
                return v && Number.isFinite(v.price);
            }),
        };
    }

    function resolveHtfDealingRange(candles, matrixTf) {
        var sessions = buildCompletedSessions(candles || [], normalizeSessionTf(matrixTf));
        if (!sessions || !sessions.length) return null;
        var lookback = ICT_STRUCT_LB * 2;
        var start = Math.max(0, sessions.length - 1 - lookback);
        var end = sessions.length;
        var window = sessions.slice(start, end);
        if (!window.length) window = sessions.slice(-1);
        var hi = window.reduce(function (acc, s) {
            return Math.max(acc, Number(s.high));
        }, -Infinity);
        var lo = window.reduce(function (acc, s) {
            return Math.min(acc, Number(s.low));
        }, Infinity);
        if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi <= lo) return null;
        return { low: lo, high: hi, source: matrixTf, lookback_bars: lookback };
    }

    function resolvePriorSessionOHLC(candles, sessionTf, offset) {
        var sessions = buildCompletedSessions(candles || [], normalizeSessionTf(sessionTf));
        if (!sessions || sessions.length <= offset) return null;
        return sessions[sessions.length - 1 - offset] || null;
    }

    function fibPressureComponent(price, fibHigh, fibLow) {
        if (
            !Number.isFinite(price) ||
            !Number.isFinite(fibHigh) ||
            !Number.isFinite(fibLow) ||
            fibHigh === fibLow
        ) {
            return { bull: 0, bear: 0, inChop: false, pos: null };
        }
        var rng = fibHigh - fibLow;
        var pos = Math.max(0, Math.min(1, (price - fibLow) / rng));
        var bullW = Math.pow(1 - pos, 2);
        var bearW = Math.pow(pos, 2);
        var inChop = pos >= 0.375 && pos <= 0.625;
        if (inChop) {
            bullW *= 0.5;
            bearW *= 0.5;
        }
        return { bull: bullW, bear: bearW, inChop: inChop, pos: pos };
    }

    function signPressure(bull, bear, gate) {
        var diff = Number(bull) - Number(bear);
        return diff > gate ? 1 : diff < -gate ? -1 : 0;
    }

    function mapFinalBiasStateToLabel(state) {
        if (state === 1) return "BULL_EXP";
        if (state === 2) return "BULL_PB";
        if (state === -1) return "BEAR_EXP";
        if (state === -2) return "BEAR_RALLY";
        if (state === 3) return "TRANSITION";
        return "NEUTRAL";
    }

    function buildPdArrayAssessment(seqBar, context) {
        var ctx = context || {};
        var raw = (seqBar && seqBar.raw) || {};
        var htfBullFvg = !!((seqBar && seqBar.htfBullFvg) || raw.htfBullFvg);
        var htfBearFvg = !!((seqBar && seqBar.htfBearFvg) || raw.htfBearFvg);
        var lastBullAge = toNumber(seqBar && seqBar.lastBullAge);
        if (lastBullAge == null) lastBullAge = toNumber(raw.lastBullAge);
        var lastBearAge = toNumber(seqBar && seqBar.lastBearAge);
        if (lastBearAge == null) lastBearAge = toNumber(raw.lastBearAge);
        var freshBullPoi =
            seqBar && typeof seqBar.bullPoiFresh === "boolean"
                ? seqBar.bullPoiFresh
                : lastBullAge != null && lastBullAge <= 12;
        var freshBearPoi =
            seqBar && typeof seqBar.bearPoiFresh === "boolean"
                ? seqBar.bearPoiFresh
                : lastBearAge != null && lastBearAge <= 12;
        var efDir = seqBar && seqBar.efAnchorDir != null ? Number(seqBar.efAnchorDir) : 0;
        var pdTol = Number(ctx.pdTolerance || 0);
        var htfHigh1 = toNumber(ctx.htfHigh1);
        var htfLow1 = toNumber(ctx.htfLow1);
        var htfHigh3 = toNumber(ctx.htfHigh3);
        var htfLow3 = toNumber(ctx.htfLow3);
        var lastHigh = toNumber(ctx.lastHigh);
        var lastLow = toNumber(ctx.lastLow);
        var bullPoiHigh = toNumber(seqBar && seqBar.bullPoiHigh);
        var bullPoiLow = toNumber(seqBar && seqBar.bullPoiLow);
        var bearPoiHigh = toNumber(seqBar && seqBar.bearPoiHigh);
        var bearPoiLow = toNumber(seqBar && seqBar.bearPoiLow);
        var efNearEntryBuy = !!(
            efDir === 1 &&
            toNumber(seqBar && seqBar.efOteLo) != null &&
            toNumber(seqBar && seqBar.efOteHi) != null &&
            toNumber(ctx.lastClose) >= toNumber(seqBar.efOteLo) &&
            toNumber(ctx.lastClose) <= toNumber(seqBar.efOteHi)
        );
        var efNearEntrySell = !!(
            efDir === -1 &&
            toNumber(seqBar && seqBar.efOteLo) != null &&
            toNumber(seqBar && seqBar.efOteHi) != null &&
            toNumber(ctx.lastClose) >= toNumber(seqBar.efOteLo) &&
            toNumber(ctx.lastClose) <= toNumber(seqBar.efOteHi)
        );

        var bullFvgLow = Math.min(
            htfHigh3 == null ? Infinity : htfHigh3,
            htfLow1 == null ? Infinity : htfLow1,
        );
        var bullFvgHigh = Math.max(
            htfHigh3 == null ? -Infinity : htfHigh3,
            htfLow1 == null ? -Infinity : htfLow1,
        );
        var bearFvgLow = Math.min(
            htfHigh1 == null ? Infinity : htfHigh1,
            htfLow3 == null ? Infinity : htfLow3,
        );
        var bearFvgHigh = Math.max(
            htfHigh1 == null ? -Infinity : htfHigh1,
            htfLow3 == null ? -Infinity : htfLow3,
        );

        var bullPdSupport =
            (htfBullFvg &&
                lastLow != null &&
                lastLow <= bullFvgHigh + pdTol &&
                lastLow >= bullFvgLow - pdTol) ||
            (freshBullPoi &&
                bullPoiHigh != null &&
                bullPoiLow != null &&
                lastLow != null &&
                lastLow <= bullPoiHigh + pdTol &&
                lastLow >= bullPoiLow - pdTol) ||
            efNearEntryBuy;
        var bearPdSupport =
            (htfBearFvg &&
                lastHigh != null &&
                lastHigh <= bearFvgHigh + pdTol &&
                lastHigh >= bearFvgLow - pdTol) ||
            (freshBearPoi &&
                bearPoiHigh != null &&
                bearPoiLow != null &&
                lastHigh != null &&
                lastHigh <= bearPoiHigh + pdTol &&
                lastHigh >= bearPoiLow - pdTol) ||
            efNearEntrySell;
        var bullishSupport = bullPdSupport || efDir === 1;
        var bearishSupport = bearPdSupport || efDir === -1;
        var pdArrayDir =
            bullPdSupport && !bearPdSupport ? 1 : bearPdSupport && !bullPdSupport ? -1 : 0;
        var mixed = !(bullishSupport && !bearishSupport) && !(bearishSupport && !bullishSupport);
        var label = mixed
            ? "MIXED PDA"
            : pdArrayDir === 1
              ? "BULLISH PDA"
              : pdArrayDir === -1
                ? "BEARISH PDA"
                : "MIXED PDA";
        return {
            pd_array_dir: pdArrayDir,
            pd_array_label: label,
            bull_pd_support: bullPdSupport,
            bear_pd_support: bearPdSupport,
            htf_fvg_support: bullishSupport,
            htf_fvg_resistance: bearishSupport,
            fresh_poi_support: freshBullPoi,
            fresh_poi_resistance: freshBearPoi,
            ef_alignment_dir: efDir,
            mixed: mixed,
            directional: !mixed,
            sf_alignment_dir: 0,
        };
    }

    function computeInstrumentSnapshot(pair, candles, runtimeContext) {
        var ctx = runtimeContext || {};
        var anchorTraceEnabled = isAnchorTraceEnabled(ctx);
        var tfSeconds = Number(ctx.tfSeconds || 14400);
        var pipType = ctx.pipType === "JPY" ? "JPY" : "USD";
        var profile = resolveBiasProfile(tfSeconds);
        var norm = (candles || [])
            .map(normalizeCandle)
            .filter(Boolean)
            .sort(function (a, b) {
                return a.timeMs - b.timeMs;
            });
        var last = norm.length ? norm[norm.length - 1] : null;
        var prev = norm.length > 1 ? norm[norm.length - 2] : last;
        var anchorsRaw = computeFibAnchors(candles || [], {
            tfSeconds: tfSeconds,
            pipType: pipType,
            sessionTf: normalizeSessionTf(profile.matrix_tf),
            lockedHigh: ctx.lockedHigh,
            lockedLow: ctx.lockedLow,
            anchorTrace: anchorTraceEnabled,
        });
        var sf = computeSfEngine(anchorsRaw.f1, anchorsRaw.f2, anchorsRaw.f3);
        if (anchorTraceEnabled) {
            console.log("[ANCHOR_TRACE:SNAPSHOT_ANCHORS]", pair, {
                f1: anchorsRaw ? anchorsRaw.f1 || null : null,
                f2: anchorsRaw ? anchorsRaw.f2 || null : null,
                f3: anchorsRaw ? anchorsRaw.f3 || null : null,
                sfValid: !!(sf && sf.sfValid),
                sfAnchorHigh: sf && sf.sfAnchorHigh != null ? sf.sfAnchorHigh : null,
                sfAnchorLow: sf && sf.sfAnchorLow != null ? sf.sfAnchorLow : null,
            });
        }
        var structure = computeStructureRegime(norm, {
            pipType: pipType,
            swingLookback: 10,
            bosMinPips: ctx.bosMinPips,
        });
        var seq = computeSweepMssSequence(candles || [], { pipType: pipType });
        var seqBar = seq && seq.bars && seq.bars.length ? seq.bars[seq.bars.length - 1] : {};

        var liqPools = buildHtfLiquidityPools(profile, norm, candles || [], pipType);
        var upLiq = null;
        var dnLiq = null;
        var upPool = null;
        var dnPool = null;
        if (last && liqPools.highs.length) {
            upPool = liqPools.highs.reduce(function (best, pool) {
                if (!(pool.price > last.close)) return best;
                if (!best) return pool;
                return pool.price - last.close < best.price - last.close ? pool : best;
            }, null);
            if (!upPool) {
                upPool = liqPools.highs.reduce(function (best, pool) {
                    if (!best) return pool;
                    return Math.abs(pool.price - last.close) < Math.abs(best.price - last.close)
                        ? pool
                        : best;
                }, null);
            }
        }
        if (last && liqPools.lows.length) {
            dnPool = liqPools.lows.reduce(function (best, pool) {
                if (!(pool.price < last.close)) return best;
                if (!best) return pool;
                return last.close - pool.price < last.close - best.price ? pool : best;
            }, null);
            if (!dnPool) {
                dnPool = liqPools.lows.reduce(function (best, pool) {
                    if (!best) return pool;
                    return Math.abs(pool.price - last.close) < Math.abs(best.price - last.close)
                        ? pool
                        : best;
                }, null);
            }
        }
        if (upPool) upLiq = upPool.price;
        if (dnPool) dnLiq = dnPool.price;
        var htfStructBias = structure.trend === 1 ? 1 : structure.trend === -1 ? -1 : 0;
        var htfDolScoreUp = 0;
        var htfDolScoreDown = 0;
        htfDolScoreUp += upPool ? 20 : 0;
        htfDolScoreDown += dnPool ? 20 : 0;
        htfDolScoreUp += htfStructBias === 1 ? 20 : 0;
        htfDolScoreDown += htfStructBias === -1 ? 20 : 0;
        htfDolScoreUp += upPool && last && last.close < upPool.price ? 10 : 0;
        htfDolScoreDown += dnPool && last && last.close > dnPool.price ? 10 : 0;
        var htfDolDir =
            htfDolScoreUp > htfDolScoreDown ? 1 : htfDolScoreDown > htfDolScoreUp ? -1 : 0;
        var htfDolLabel = htfDolDir === 1 ? "BSL" : htfDolDir === -1 ? "SSL" : "NEUTRAL";

        var matrixRange = resolveHtfDealingRange(candles || [], profile.matrix_tf);
        var matrixState = "EQUILIBRIUM";
        var matrixPressureLabel = "BALANCED";
        var matrixDir = 0;
        var matrixEquilibriumBuffer = null;
        if (matrixRange && last) {
            var mid = (matrixRange.high + matrixRange.low) / 2;
            var rangeSpan = Math.max(
                Math.abs(matrixRange.high - matrixRange.low),
                pipMult(pipType) * 10,
            );
            var eqBuffer = rangeSpan * ICT_EQ_BUFFER_PCT;
            matrixEquilibriumBuffer = eqBuffer;
            if (last.close > mid + eqBuffer) {
                matrixState = "PREMIUM";
                matrixPressureLabel = "SELL SIDE";
                matrixDir = -1;
            } else if (last.close < mid - eqBuffer) {
                matrixState = "DISCOUNT";
                matrixPressureLabel = "BUY SIDE";
                matrixDir = 1;
            }
        }

        var pdSession = resolvePriorSessionOHLC(candles || [], profile.pd_tf, 0);
        var pdSession3 = resolvePriorSessionOHLC(candles || [], profile.pd_tf, 2);
        var htfHigh1 = pdSession ? pdSession.high : null;
        var htfLow1 = pdSession ? pdSession.low : null;
        var htfHigh3 = pdSession3 ? pdSession3.high : null;
        var htfLow3 = pdSession3 ? pdSession3.low : null;
        var pdTol = matrixRange
            ? Math.abs(matrixRange.high - matrixRange.low) * ICT_PD_TOLERANCE_PCT
            : (seqBar.dispRangeATR || 0) * 0.25;
        var pdArrayAssessment = buildPdArrayAssessment(seqBar, {
            pdTolerance: pdTol,
            htfHigh1: htfHigh1,
            htfLow1: htfLow1,
            htfHigh3: htfHigh3,
            htfLow3: htfLow3,
            lastHigh: last ? last.high : null,
            lastLow: last ? last.low : null,
            lastClose: last ? last.close : null,
        });
        var pdArrayDir = pdArrayAssessment.pd_array_dir;
        var pdArrayLabel = pdArrayAssessment.pd_array_label;

        var sfComp =
            sf && sf.sfValid && last
                ? fibPressureComponent(last.close, sf.sfAnchorHigh, sf.sfAnchorLow)
                : { bull: 0.5, bear: 0.5 };
        var f1Comp =
            isValidFib(anchorsRaw.f1) && last
                ? fibPressureComponent(last.close, anchorsRaw.f1.high, anchorsRaw.f1.low)
                : { bull: 0, bear: 0 };
        var f2Comp =
            isValidFib(anchorsRaw.f2) && last
                ? fibPressureComponent(last.close, anchorsRaw.f2.high, anchorsRaw.f2.low)
                : { bull: 0, bear: 0 };
        var f3Comp =
            isValidFib(anchorsRaw.f3) && last
                ? fibPressureComponent(last.close, anchorsRaw.f3.high, anchorsRaw.f3.low)
                : { bull: 0, bear: 0 };
        var bullPressureRaw = sfComp.bull;
        var bearPressureRaw = sfComp.bear;
        var totalPressure = bullPressureRaw + bearPressureRaw;
        var bullPressure = totalPressure > 0 ? bullPressureRaw / totalPressure : 0.5;
        var bearPressure = totalPressure > 0 ? bearPressureRaw / totalPressure : 0.5;
        var pressureBiasValue = bullPressure - bearPressure;
        var pressureBias =
            pressureBiasValue > ICT_BIAS_GATE
                ? "BULLISH"
                : pressureBiasValue < -ICT_BIAS_GATE
                  ? "BEARISH"
                  : "NEUTRAL";
        matrixPressureLabel =
            pressureBiasValue > ICT_BIAS_GATE
                ? "DISC PRESS"
                : pressureBiasValue < -ICT_BIAS_GATE
                  ? "PREM PRESS"
                  : "BALANCED";

        var p1Dir = signPressure(f1Comp.bull, f1Comp.bear, ICT_BIAS_GATE);
        var p2Dir = signPressure(f2Comp.bull, f2Comp.bear, ICT_BIAS_GATE);
        var p3Dir = signPressure(f3Comp.bull, f3Comp.bear, ICT_BIAS_GATE);
        var sfDir = signPressure(bullPressure, bearPressure, ICT_BIAS_GATE);
        var bullVotes = (p1Dir === 1 ? 1 : 0) + (p2Dir === 1 ? 1 : 0) + (p3Dir === 1 ? 1 : 0);
        var bearVotes = (p1Dir === -1 ? 1 : 0) + (p2Dir === -1 ? 1 : 0) + (p3Dir === -1 ? 1 : 0);
        var voteConsensusDir = bullVotes > bearVotes ? 1 : bearVotes > bullVotes ? -1 : 0;
        var refDir = sfDir !== 0 ? sfDir : voteConsensusDir;
        var disagreementCount = 0;
        disagreementCount += p1Dir === 0 || (refDir !== 0 && p1Dir !== refDir) ? 1 : 0;
        disagreementCount += p2Dir === 0 || (refDir !== 0 && p2Dir !== refDir) ? 1 : 0;
        disagreementCount += p3Dir === 0 || (refDir !== 0 && p3Dir !== refDir) ? 1 : 0;
        var fibDisagreementPenalty = Math.min(disagreementCount * 4, ICT_DISAGREEMENT_PENALTY_MAX);

        var execBullOk = !!(
            seqBar.confirmed_sweep_down &&
            seqBar.mss_bullish &&
            seqBar.dispScoreBull >= 2
        );
        var execBearOk = !!(
            seqBar.confirmed_sweep_up &&
            seqBar.mss_bearish &&
            seqBar.dispScoreBear >= 2
        );
        var inHtfPremium = matrixState === "PREMIUM";
        var inHtfDiscount = matrixState === "DISCOUNT";
        var inHtfEquilibrium = matrixState === "EQUILIBRIUM";

        var bullBiasScore = 0;
        var bearBiasScore = 0;
        bullBiasScore += htfDolDir === 1 ? 35 : 0;
        bearBiasScore += htfDolDir === -1 ? 35 : 0;
        bullBiasScore += inHtfDiscount ? 15 : inHtfEquilibrium ? 5 : -10;
        bearBiasScore += inHtfPremium ? 15 : inHtfEquilibrium ? 5 : -10;
        bullBiasScore += pdArrayAssessment.bull_pd_support ? 20 : 0;
        bearBiasScore += pdArrayAssessment.bear_pd_support ? 20 : 0;
        bullBiasScore += execBullOk ? 20 : 0;
        bearBiasScore += execBearOk ? 20 : 0;
        bullBiasScore += pressureBiasValue > ICT_BIAS_GATE ? 5 : 0;
        bearBiasScore += pressureBiasValue < -ICT_BIAS_GATE ? 5 : 0;
        if (disagreementCount > 0) {
            if (bullBiasScore > bearBiasScore) bullBiasScore -= fibDisagreementPenalty;
            else if (bearBiasScore > bullBiasScore) bearBiasScore -= fibDisagreementPenalty;
        }

        var finalBiasDelta = bullBiasScore - bearBiasScore;
        var rawFinalBiasState =
            finalBiasDelta >= 35
                ? inHtfPremium
                    ? 2
                    : 1
                : finalBiasDelta <= -35
                  ? inHtfDiscount
                      ? -2
                      : -1
                  : Math.abs(finalBiasDelta) < 15
                    ? 0
                    : 3;
        var hardFlipToBull = finalBiasDelta >= ICT_BIAS_FLIP_SCORE && execBullOk;
        var hardFlipToBear = finalBiasDelta <= -ICT_BIAS_FLIP_SCORE && execBearOk;
        var finalBiasState = rawFinalBiasState;
        if (ICT_BIAS_CONFIRM_EXEC) {
            if (rawFinalBiasState === 1 && !hardFlipToBull) finalBiasState = inHtfPremium ? 2 : 3;
            else if (rawFinalBiasState === -1 && !hardFlipToBear)
                finalBiasState = inHtfDiscount ? -2 : 3;
        }
        var finalBias = mapFinalBiasStateToLabel(finalBiasState);
        var hardFlipAllowed = hardFlipToBull || hardFlipToBear;
        var pressureBias =
            bullPressure > bearPressure
                ? "BULLISH"
                : bearPressure > bullPressure
                  ? "BEARISH"
                  : "NEUTRAL";

        var chopBand = null;
        if (sf && sf.sfValid) {
            var lo = sf.sfAnchorLow + (sf.sfAnchorHigh - sf.sfAnchorLow) * 0.375;
            var hi = sf.sfAnchorLow + (sf.sfAnchorHigh - sf.sfAnchorLow) * 0.625;
            chopBand = { low: lo, high: hi, source: "SF_ANCHOR_PARITY" };
        }
        var gate = "NONE";
        var gateReason = "NO_BIAS";
        if (
            structure.regime === "TREND UP" &&
            (finalBias === "BULL_EXP" || finalBias === "BULL_PB")
        ) {
            gate = "BUY";
            gateReason = "BIAS_ALIGNED";
        } else if (
            structure.regime === "TREND DOWN" &&
            (finalBias === "BEAR_EXP" || finalBias === "BEAR_RALLY")
        ) {
            gate = "SELL";
            gateReason = "BIAS_ALIGNED";
        } else if (finalBias === "TRANSITION") {
            gate = "BOTH";
            gateReason = "TRANSITIONAL_BIAS";
        } else if (structure.regime === "REVERSAL ZONE") {
            gate = "BOTH";
            gateReason = "REVERSAL_CONTEXT";
        } else if (structure.regime === "RANGING") {
            gateReason = "STRUCTURE_RANGING";
        }
        if (chopBand && last && last.close >= chopBand.low && last.close <= chopBand.high) {
            gate = "NONE";
            gateReason = "IN_CHOP_BAND";
        }

        return {
            pair: pair,
            timeframe_profile: profile.timeframe_profile,
            bias_profile: profile.bias_profile,
            regime: structure.regime,
            prev_regime:
                structure.prevTrend === 1
                    ? "TREND UP"
                    : structure.prevTrend === -1
                      ? "TREND DOWN"
                      : "RANGING",
            structure: {
                ict_struct_trend: structure.trend,
                prev_struct_trend: structure.prevTrend,
                labels: structure.labels,
                pivots: structure.pivots,
            },
            htf_dol: {
                nearest_upside_liquidity: upLiq,
                nearest_downside_liquidity: dnLiq,
                htf_dol_dir: htfDolDir,
                htf_dol_label: htfDolLabel,
                htf_dol_score_up: htfDolScoreUp,
                htf_dol_score_down: htfDolScoreDown,
                nearest_upside_pool: upPool ? upPool.source : null,
                nearest_downside_pool: dnPool ? dnPool.source : null,
                nearest_upside_pool_price: upPool ? upPool.price : null,
                nearest_downside_pool_price: dnPool ? dnPool.price : null,
            },
            matrix: {
                matrix_state: matrixState,
                matrix_pressure_label: matrixPressureLabel,
                dealing_range: matrixRange,
                equilibrium_buffer: matrixEquilibriumBuffer,
            },
            matrix_tf: profile.matrix_tf,
            pd_array: Object.assign(
                { pd_array_dir: pdArrayDir, pd_array_label: pdArrayLabel },
                pdArrayAssessment,
            ),
            pd_tf: profile.pd_tf,
            final_bias: finalBias,
            bull_bias_score: bullBiasScore,
            bear_bias_score: bearBiasScore,
            bull_pressure: Math.round(bullPressure * 100) / 100,
            bear_pressure: Math.round(bearPressure * 100) / 100,
            pressure_bias: pressureBias,
            pressure_bias_value: pressureBiasValue,
            fib_disagreement_penalty: fibDisagreementPenalty,
            sweep_state: seqBar.confirmed_sweep_up
                ? "SWEEP_UP_CONFIRMED"
                : seqBar.confirmed_sweep_down
                  ? "SWEEP_DOWN_CONFIRMED"
                  : "NO_SWEEP",
            mss_state: seqBar.mss_bullish
                ? "BULLISH_MSS"
                : seqBar.mss_bearish
                  ? "BEARISH_MSS"
                  : "NO_MSS",
            displacement_state: seqBar.dispRangeATR >= 1.3 ? "STRONG" : "NORMAL",
            ef_state: seqBar.ef_is_narrative ? "NARRATIVE" : "UNAVAILABLE",
            sequence_status: seqBar.sequenceStatus || "AWAIT SWEEP",
            chop_band: chopBand,
            gate: gate,
            gate_reason: gateReason,
            anchors: {
                f1: anchorsRaw.f1,
                f2: anchorsRaw.f2,
                f3: anchorsRaw.f3,
                sf_anchor_high: sf.sfAnchorHigh,
                sf_anchor_low: sf.sfAnchorLow,
            },
            anchors_meta: {
                session_tf: anchorsRaw._meta.sessionTf,
                completed_sessions: {
                    s1_key: anchorsRaw._meta.s1 ? anchorsRaw._meta.s1.key : null,
                    s2_key: anchorsRaw._meta.s2 ? anchorsRaw._meta.s2.key : null,
                },
                fib_roles: {
                    f1: "OLDER_COMPLETED_SESSION",
                    f3: "MOST_RECENT_COMPLETED_SESSION",
                },
                f2_branch: anchorsRaw._meta.f2 ? anchorsRaw._meta.f2.branch : null,
                f2_label: anchorsRaw.f2 ? anchorsRaw.f2.name : null,
            },
            levels: sf.sfLevels || [],
            blockers: gate === "NONE" ? [gateReason] : [],
            hard_flip_allowed: hardFlipAllowed,
            hard_flip_to_bull: hardFlipToBull,
            hard_flip_to_bear: hardFlipToBear,
            raw_final_bias_state: rawFinalBiasState,
            final_bias_state_code: finalBiasState,
            updated_at: new Date((last && last.timeMs) || Date.now()).toISOString(),
        };
    }

    var runtimeCache = {
        signals: [],
        regimes: {},
        candidateSymbols: [],
        hydratedSignals: false,
        hydratedRegimes: false,
    };

    function fetchJson(path) {
        if (!root || typeof root.fetch !== "function") return Promise.resolve(null);
        var boot = getBoot();
        var base = boot.rest_url || "";
        if (!base) return Promise.resolve(null);
        return root
            .fetch(base + path, {
                method: "GET",
                credentials: "include",
                headers: {
                    Accept: "application/json",
                    "X-WP-Nonce": boot.nonce || "",
                },
            })
            .then(function (response) {
                if (!response.ok) {
                    if (root && root.console && typeof root.console.warn === "function") {
                        root.console.warn(
                            "[SniperDashboardData] GET " +
                                path +
                                " failed with HTTP " +
                                response.status,
                        );
                    }
                    return null;
                }
                return response.json();
            })
            .catch(function (err) {
                if (root && root.console && typeof root.console.warn === "function") {
                    root.console.warn(
                        "[SniperDashboardData] GET " + path + " failed:",
                        err && err.message ? err.message : err,
                    );
                }
                return null;
            });
    }

    function canonicalState(rawState, validityBarsRemaining) {
        if (Number(validityBarsRemaining) === 0) return "EXPIRED";
        var state = String(rawState || "")
            .trim()
            .toUpperCase()
            .replace(/[_-]+/g, " ");
        if (["EXPIRED", "INVALID", "WATCHLIST", "READY", "ACTIVE"].indexOf(state) > -1)
            return state;
        if (state === "PENDING" || state === "AWAIT MSS" || state === "AWAIT SWEEP")
            return "WATCHLIST";
        if (state === "BLOCKED" || state === "STALE" || state === "INVALIDATED") return "INVALID";
        return "INVALID";
    }
    var signalStateUtil = {
        canonicalize: canonicalState,
    };
    if (root) root.SniperSignalState = signalStateUtil;

    function canonicalPair(rawPair) {
        var value = String(rawPair || "")
            .trim()
            .toUpperCase();
        if (!value) return "";
        if (value.indexOf(":") > -1) value = value.split(":").pop();
        value = value.replace(/[^A-Z0-9]/g, "");
        if (value.length === 6) return value.slice(0, 3) + "/" + value.slice(3);
        return value;
    }

    function canonicalSignal(raw) {
        var input = raw || {};
        var pair = canonicalPair(input.pair || input.symbol || input.instrument_id || "");
        var profile = buildProfile(
            input.fib_timeframe || input.session_tf || getBoot().fib_timeframe,
        );
        var validityBarsRemaining = Number(
            input.validity_bars_remaining != null
                ? input.validity_bars_remaining
                : input.signal_valid_bars != null
                  ? input.signal_valid_bars
                  : 1,
        );
        if (!Number.isFinite(validityBarsRemaining) || validityBarsRemaining < 0)
            validityBarsRemaining = 1;
        var totalLot = Number(
            input.total_lot_size != null ? input.total_lot_size : input.total_lots,
        );
        if (!Number.isFinite(totalLot)) {
            totalLot = Array.isArray(input.entries)
                ? input.entries.reduce(function (sum, entry) {
                      return sum + (Number(entry && entry.lot) || 0);
                  }, 0)
                : null;
        }
        return {
            signal_id: String(
                input.signal_id ||
                    input.signal_hash ||
                    [pair, input.direction || "NA", input.updated_at || "na"].join("|"),
            ),
            pair: pair,
            direction: String(input.direction || "").toUpperCase(),
            state: canonicalState(
                input.state || input.signal_state || input.status,
                validityBarsRemaining,
            ),
            entry: {
                zone_price: toNumber(
                    input.zone_price != null ? input.zone_price : input.entry_zone_price,
                ),
                label: input.zone_label || input.entry_zone_label || null,
                ladder: Array.isArray(input.entries)
                    ? input.entries
                          .map(function (entry) {
                              return Number(entry && (entry.price != null ? entry.price : entry));
                          })
                          .filter(function (entry) {
                              return Number.isFinite(entry);
                          })
                    : [],
            },
            sl: toNumber(input.sl),
            tp: {
                primary: toNumber(input.tp1),
                secondary: toNumber(input.tp2),
                final: toNumber(input.tp != null ? input.tp : input.tp3),
            },
            lot_size: {
                stages: Array.isArray(input.entries)
                    ? input.entries
                          .map(function (entry) {
                              return Number(entry && entry.lot);
                          })
                          .filter(function (lot) {
                              return Number.isFinite(lot);
                          })
                    : [],
                total: Number.isFinite(totalLot) ? totalLot : null,
            },
            risk_amount: {
                usc: toNumber(input.total_risk_usc),
                zar: toNumber(input.total_risk_zar),
                dd_impact_pct: toNumber(input.dd_impact_pct),
            },
            sequence_status: input.sequence_status || null,
            setup_quality: toNumber(input.setup_quality),
            execution_quality: toNumber(input.execution_quality),
            gate: input.gate || null,
            gate_reason: input.gate_reason || null,
            chop_band: input.chop_band || null,
            anchors: input.anchors && typeof input.anchors === "object" ? input.anchors : null,
            levels: Array.isArray(input.levels) ? input.levels.slice() : [],
            f1_high: toNumber(input.f1_high),
            f1_low: toNumber(input.f1_low),
            f2_high: toNumber(input.f2_high),
            f2_low: toNumber(input.f2_low),
            f3_high: toNumber(input.f3_high),
            f3_low: toNumber(input.f3_low),
            final_bias: input.final_bias || null,
            matrix: input.matrix && typeof input.matrix === "object" ? input.matrix : null,
            matrix_tf: input.matrix_tf || null,
            pd_array: input.pd_array && typeof input.pd_array === "object" ? input.pd_array : null,
            pd_tf: input.pd_tf || null,
            regime: input.regime || null,
            fib_timeframe: profile,
            validity_bars_remaining: validityBarsRemaining,
            enrichment_meta: {
                sequence_status: input.sequence_status || null,
                setup_quality: toNumber(input.setup_quality),
                execution_quality: toNumber(input.execution_quality),
                rank_score: toNumber(input.rank_score),
                rr_estimate: toNumber(input.rr_estimate),
                chop: input.chop || null,
                source: input.source || input.provenance || null,
                aliases_applied: [],
            },
        };
    }

    function getCoreRuntimeState() {
        var core = root && root.SniperDashboardCore;
        if (!core || typeof core.getRuntimeState !== "function") return null;
        try {
            return core.getRuntimeState();
        } catch (err) {
            return null;
        }
    }

    function seedSignalsFromRuntime() {
        var runtime = getCoreRuntimeState();
        var liveSignals =
            runtime && Array.isArray(runtime.liveSignals)
                ? runtime.liveSignals
                : root && Array.isArray(root.liveSignals)
                  ? root.liveSignals
                  : null;
        if (liveSignals && liveSignals.length) {
            runtimeCache.signals = liveSignals.map(canonicalSignal);
            runtimeCache.hydratedSignals = true;
            return;
        }
        var signals =
            runtime && Array.isArray(runtime.signals)
                ? runtime.signals
                : root && Array.isArray(root.signals)
                  ? root.signals
                  : null;
        if (signals && signals.length) {
            runtimeCache.signals = signals.map(canonicalSignal);
            runtimeCache.hydratedSignals = true;
        }
    }

    function seedRegimesFromRuntime() {
        var runtime = getCoreRuntimeState();
        var regimes =
            runtime && runtime.savedRegimes && typeof runtime.savedRegimes === "object"
                ? runtime.savedRegimes
                : root && root.savedRegimes && typeof root.savedRegimes === "object"
                  ? root.savedRegimes
                  : null;
        if (regimes) {
            runtimeCache.regimes = Object.assign({}, regimes);
            runtimeCache.hydratedRegimes = true;
        }
    }

    function refreshSignals() {
        seedSignalsFromRuntime();
        if (runtimeCache.hydratedSignals) return;
        runtimeCache.hydratedSignals = true;
        fetchJson("live-signals").then(function (payload) {
            var rows = payload && Array.isArray(payload.live_signals) ? payload.live_signals : [];
            runtimeCache.signals = rows.map(canonicalSignal);
        });
    }

    function refreshRegimes() {
        seedRegimesFromRuntime();
        if (runtimeCache.hydratedRegimes) return;
        runtimeCache.hydratedRegimes = true;
        fetchJson("regimes").then(function (payload) {
            runtimeCache.regimes = payload && payload.regimes ? payload.regimes : {};
        });
    }

    function candidateSymbols() {
        var pairs = runtimeCache.signals
            .map(function (signal) {
                return signal.pair;
            })
            .filter(Boolean);
        if (!pairs.length && root && Array.isArray(root.PAIRS)) {
            pairs = root.PAIRS.slice();
        }
        if (!pairs.length) {
            pairs = [
                "GBP/USD",
                "AUD/USD",
                "USD/JPY",
                "AUD/JPY",
                "EUR/USD",
                "XAU/USD",
                "US30",
                "NAS100",
            ];
        }
        var mapped = [];
        pairs.forEach(function (pair) {
            var canonical = canonicalPair(pair);
            var compact = canonical.replace("/", "");
            mapped.push(canonical, compact, "FX:" + compact);
            if (canonical === "XAU/USD") mapped.push("OANDA:XAUUSD", "XAUUSD");
            if (canonical === "BTC/USD")
                mapped.push("BINANCE:BTCUSDT", "BITSTAMP:BTCUSD", "BTCUSD");
            if (canonical === "ETH/USD")
                mapped.push("BINANCE:ETHUSDT", "BITSTAMP:ETHUSD", "ETHUSD");
            if (canonical === "US30") mapped.push("OANDA:US30USD");
            if (canonical === "NAS100") mapped.push("OANDA:NAS100USD");
        });
        return Array.from(new Set(mapped.filter(Boolean)));
    }

    var bridge = {
        getProfile: function () {
            var boot = getBoot();
            var liveTimeframe =
                root && root.FIB_TIMEFRAME
                    ? root.FIB_TIMEFRAME
                    : boot && boot.fib_timeframe
                      ? boot.fib_timeframe
                      : "";
            if (!liveTimeframe && root && root.SNIPER && root.SNIPER.fib_timeframe) {
                liveTimeframe = root.SNIPER.fib_timeframe;
            }
            if (!liveTimeframe) {
                liveTimeframe = "WEEKLY";
            }
            return buildProfile(liveTimeframe);
        },
        getSignals: function () {
            refreshSignals();
            return runtimeCache.signals.slice();
        },
        getCandidateSymbols: function () {
            runtimeCache.candidateSymbols = candidateSymbols();
            return runtimeCache.candidateSymbols.slice();
        },
        getRegime: function (pair) {
            refreshRegimes();
            if (!pair) return Object.assign({}, runtimeCache.regimes);
            var normalized = canonicalPair(pair).replace("/", "");
            return (
                runtimeCache.regimes[normalized] ||
                runtimeCache.regimes[canonicalPair(pair)] ||
                null
            );
        },
        isChopCondition: function (pairOrSignal, price) {
            var signal = pairOrSignal && typeof pairOrSignal === "object" ? pairOrSignal : null;
            if (
                signal &&
                signal.enrichment_meta &&
                signal.enrichment_meta.chop &&
                signal.enrichment_meta.chop.active
            ) {
                return true;
            }
            if (root && typeof root.getChopBand === "function") {
                var pair = signal ? signal.pair : pairOrSignal;
                var band = root.getChopBand(pair);
                var marketPrice = Number(
                    signal && signal.market_price != null ? signal.market_price : price,
                );
                return !!(
                    band &&
                    Number.isFinite(marketPrice) &&
                    marketPrice >= band.lo &&
                    marketPrice <= band.hi
                );
            }
            return false;
        },
    };

    var engine = {
        getSessionTf: getSessionTf,
        computeFibAnchors: computeFibAnchors,
        computeSfEngine: computeSfEngine,
        computeSweepMssSequence: computeSweepMssSequence,
        computeInstrumentSnapshot: computeInstrumentSnapshot,
        FIB_RATIOS: FIB_RATIOS,
        sfKey: sfKey,
        edeTier: edeTier,
        _internal: {
            getSessionKey: getSessionKey,
            buildCompletedSessions: buildCompletedSessions,
            computeF2FromSwap: computeF2FromSwap,
            computeCgBestBodyPct: computeCgBestBodyPct,
            pipMult: pipMult,
            bosThresh: bosThresh,
            pivotHigh: pivotHigh,
            pivotLow: pivotLow,
            computeAtrSeries: computeAtrSeries,
            gradeSetupClass: gradeSetupClass,
            colorTierFromStar: colorTierFromStar,
            applyStarsForSide: applyStarsForSide,
            isValidFib: isValidFib,
        },
    };

    return {
        bridge: bridge,
        engine: engine,
    };
});
