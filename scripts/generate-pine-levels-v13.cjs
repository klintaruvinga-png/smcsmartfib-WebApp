#!/usr/bin/env node
/**
 * generate-pine-levels-v13.cjs
 *
 * Pine v13-compatible reference generator for Phase 4 parity gate.
 *
 * NOT a live TradingView/Pine export. Produces locally-computed levels that
 * match Pine v13.1.3 anchor logic using the same candle source as the EA.
 *
 * Session ladder (v13.1.3):
 *   M15 -> Daily
 *   H1  -> Weekly
 *   H4  -> Monthly
 *   D1  -> Quarterly
 *
 * Authority ladder (v13.1.3):
 *   Daily     -> Weekly
 *   Weekly    -> Monthly
 *   Monthly   -> Quarterly
 *   Quarterly -> Yearly
 *
 * Minimum M15 candle history required (to satisfy completed sessions):
 *   LTF_SF needs up to 3 completed session-TF sessions.
 *   HTF_AF needs the most recent completed authority-TF session (auth_f1).
 * M15 candle history shorter than these depths will cause a FAIL for the affected anchor.
 *
 * LTF_SF anchor: F1/F2/F3 weighted composite of 3 most recent completed
 *   sessions at sessionTf granularity.
 *   Weights: 3 sessions = F1:0.40, F2:0.35, F3:0.25
 *            2 sessions = F1:0.55, F2:0.45
 *            1 session  = F1:1.00
 *
 * HTF_AF anchor: raw high/low of the most recent completed authority session (auth_f1).
 *
 * Outputs:
 *   <reports-dir>/pine-levels.json          - pure 384-row validator array
 *   <reports-dir>/pine-levels.metadata.json - debug/audit metadata
 *   <reports-dir>/pine-anchor-debug.json    - anchor ingredient diagnostics
 *
 * Guards:
 *   - Fails if any required M15 source candle file is missing
 *   - Fails if any M15 source candle file's last candle is older than staleness threshold
 *   - Fails if output row count does not match symbols x timeframes x families x ratios
 *
 * Usage (from repo root):
 *   node scripts/generate-pine-levels-v13.cjs [--candle-dir <path>] [--mt5-file <path>] [--reports-dir <path>] [--run-ts <iso8601>]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---- Config ----
const REPO_ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
function getArg(flag) {
    const i = args.indexOf(flag);
    if (i < 0) return null;
    const value = args[i + 1];
    if (!value || value.startsWith('--')) {
        console.error(`FAIL: missing value for ${flag}`);
        process.exit(1);
    }
    return value;
}
const REPORTS_DIR   = path.resolve(getArg('--reports-dir') || path.join(REPO_ROOT, 'reports', 'phase4-parity'));
const RUN_TS        = getArg('--run-ts') || new Date().toISOString();
const OUTPUT_LEVELS = path.join(REPORTS_DIR, 'pine-levels.json');
const OUTPUT_META   = path.join(REPORTS_DIR, 'pine-levels.metadata.json');
const OUTPUT_ANCHOR_DEBUG = path.join(REPORTS_DIR, 'pine-anchor-debug.json');
const CANDLE_DIR    = path.resolve(getArg('--candle-dir') || path.join(REPO_ROOT, 'data'));
const MT5_FILE      = path.resolve(getArg('--mt5-file') || path.join(REPORTS_DIR, 'mt5-levels.json'));

// Default symbols/timeframes preserved; override via --symbols / --timeframes CLI flags.
// e.g. node generate-pine-levels-v13.cjs --symbols EURUSD,USDJPY --timeframes M15
const _symbolsArg    = getArg('--symbols');
const _timeframesArg = getArg('--timeframes');
const SYMBOLS    = _symbolsArg    ? _symbolsArg.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
                                  : ['EURUSD', 'USDJPY', 'XAUUSD'];
const TIMEFRAMES = _timeframesArg ? _timeframesArg.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
                                  : ['M15', 'H1', 'H4', 'D1'];
const RATIOS     = [-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300];
const SOURCE_TIMEFRAME = 'M15';

// Staleness: how far behind the last candle is allowed to be per timeframe
// (in milliseconds). Candle files older than this relative to mt5-levels.json
// mtime will cause a hard fail.
const STALE_MS = {
    M15: 15  * 60 * 1000,
    H1:  1   * 3600 * 1000,
    H4:  4   * 3600 * 1000,
    D1:  1   * 86400 * 1000,
};

const TF_MS = {
    M15: 15  * 60 * 1000,
    H1:  1   * 3600 * 1000,
    H4:  4   * 3600 * 1000,
    D1:  1   * 86400 * 1000,
};

// ---- Session ladder v13.1.3 ----
function toSessionTf(timeframe) {
    const map = { M15: 'Daily', H1: 'Weekly', H4: 'Monthly', D1: 'Quarterly' };
    if (!map[timeframe]) throw new Error(`Unsupported timeframe: ${timeframe}`);
    return map[timeframe];
}

function toAuthorityTf(sessionTf) {
    const map = { Daily: 'Weekly', Weekly: 'Monthly', Monthly: 'Quarterly', Quarterly: 'Yearly' };
    if (!map[sessionTf]) throw new Error(`Unsupported sessionTf: ${sessionTf}`);
    return map[sessionTf];
}

function helperTimeframeForSessionTf(sessionTf) {
    const map = {
        Daily: 'M15',
        Weekly: 'H1',
        Monthly: 'D1',
        Quarterly: 'D1',
        Yearly: 'D1',
    };
    if (!map[sessionTf]) throw new Error(`Unsupported helper sessionTf: ${sessionTf}`);
    return map[sessionTf];
}

// ---- ISO week - Thursday-pivot, matches PHP gmdate('o','W') and EA GetISOWeekYear ----
function isoWeekYear(utcYear, utcMonth1, utcDay) {
    // dayOfYear (1-based)
    const MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
    const leap = (utcYear % 4 === 0 && (utcYear % 100 !== 0 || utcYear % 400 === 0));
    let doy = utcDay;
    for (let m = 1; m < utcMonth1; m++) doy += (m === 2 && leap) ? 29 : MONTH_DAYS[m - 1];

    // Monday-based DOW (0=Mon, 6=Sun)
    const d = new Date(Date.UTC(utcYear, utcMonth1 - 1, utcDay));
    const dow = d.getUTCDay();
    const monDow = (dow === 0) ? 6 : (dow - 1);

    // Ordinal of Thursday in same ISO week
    const thurOrd = doy + (3 - monDow);
    const daysInYear = leap ? 366 : 365;

    if (thurOrd <= 0) {
        const prevYear = utcYear - 1;
        const prevLeap = (prevYear % 4 === 0 && (prevYear % 100 !== 0 || prevYear % 400 === 0));
        const adjThur = thurOrd + (prevLeap ? 366 : 365);
        return { isoYear: prevYear, isoWeek: Math.floor((adjThur + 6) / 7) };
    }
    if (thurOrd > daysInYear) {
        return { isoYear: utcYear + 1, isoWeek: 1 };
    }
    return { isoYear: utcYear, isoWeek: Math.floor((thurOrd + 6) / 7) };
}

// ---- Session key - matches EA GetSessionKey exactly ----
function getSessionKey(timeMs, sessionTf) {
    const d = new Date(timeMs);
    const y  = d.getUTCFullYear();
    const mo = d.getUTCMonth() + 1;
    const dy = d.getUTCDate();

    if (sessionTf === 'Daily') {
        return y * 10000 + mo * 100 + dy;   // YYYYMMDD integer
    }
    if (sessionTf === 'Weekly') {
        const { isoYear, isoWeek } = isoWeekYear(y, mo, dy);
        return isoYear * 100 + isoWeek;     // YYYYWW integer
    }
    if (sessionTf === 'Monthly') {
        return y * 100 + mo;               // YYYYMM integer
    }
    if (sessionTf === 'Quarterly') {
        const q = Math.ceil(mo / 3);
        return y * 10 + q;                 // YYYYQ integer
    }
    if (sessionTf === 'Yearly') {
        return y;
    }
    throw new Error(`Unknown sessionTf: ${sessionTf}`);
}

// ---- Candle normalizer ----
function normalizeCandle(raw) {
    const timeMs = (() => {
        const t = raw.timeMs ?? raw.time ?? raw.timestamp ?? raw.ts ?? raw.t;
        if (t == null) return null;
        const n = Number(t);
        if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
        const p = Date.parse(String(t).trim().replace(' ', 'T'));
        return Number.isFinite(p) ? p : null;
    })();
    const high  = Number(raw.high  ?? raw.h);
    const low   = Number(raw.low   ?? raw.l);
    const open  = Number(raw.open  ?? raw.o);
    const close = Number(raw.close ?? raw.c);
    if (!Number.isFinite(timeMs) || !Number.isFinite(high) || !Number.isFinite(low)) return null;
    return { timeMs, open, high, low, close };
}

function roundToNearestMinuteMs(timeMs) {
    return Math.round(timeMs / 60000) * 60000;
}

function bucketStartMs(timeMs, tf) {
    const bucketInputMs = tf === 'M15' ? roundToNearestMinuteMs(timeMs) : timeMs;
    const d = new Date(bucketInputMs);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    const hour = d.getUTCHours();
    const minute = d.getUTCMinutes();

    if (tf === 'M15') {
        return Date.UTC(y, m, day, hour, Math.floor(minute / 15) * 15, 0, 0);
    }
    if (tf === 'H1') {
        return Date.UTC(y, m, day, hour, 0, 0, 0);
    }
    if (tf === 'H4') {
        return Date.UTC(y, m, day, Math.floor(hour / 4) * 4, 0, 0, 0);
    }
    if (tf === 'D1') {
        return Date.UTC(y, m, day, 0, 0, 0, 0);
    }
    throw new Error(`Unsupported aggregation timeframe: ${tf}`);
}

function aggregateCandles(candles, tf) {
    const norm = candles.map(normalizeCandle).filter(Boolean).sort((a, b) => a.timeMs - b.timeMs);
    const aggregated = [];
    let cur = null;

    for (const c of norm) {
        const timeMs = bucketStartMs(c.timeMs, tf);
        if (!cur || cur.timeMs !== timeMs) {
            if (cur) aggregated.push(cur);
            cur = { timeMs, open: c.open, high: c.high, low: c.low, close: c.close };
        } else {
            cur.high = Math.max(cur.high, c.high);
            cur.low = Math.min(cur.low, c.low);
            cur.close = c.close;
        }
    }

    if (cur) aggregated.push(cur);
    return aggregated;
}

function buildHelperFeeds(sourceCandles) {
    const m15 = aggregateCandles(sourceCandles, 'M15');
    return {
        M15: m15,
        H1: aggregateCandles(m15, 'H1'),
        H4: aggregateCandles(m15, 'H4'),
        D1: aggregateCandles(m15, 'D1'),
    };
}

// ---- Build completed sessions ----
// Excludes the currently forming (latest) session - matches EA barstate.islast exclusion.
function buildCompletedSessions(candles, sessionTf) {
    const norm = candles.map(normalizeCandle).filter(Boolean).sort((a, b) => a.timeMs - b.timeMs);
    if (!norm.length) return [];

    const sessions = [];
    let cur = null;
    for (const c of norm) {
        const key = getSessionKey(c.timeMs, sessionTf);
        if (!cur || cur.key !== key) {
            if (cur) sessions.push(cur);
            cur = {
                key,
                high: c.high,
                low: c.low,
                open: c.open,
                close: c.close,
                startMs: c.timeMs,
                endMs: c.timeMs,
                candleCount: 1,
            };
        } else {
            cur.high  = Math.max(cur.high, c.high);
            cur.low   = Math.min(cur.low, c.low);
            cur.close = c.close;
            cur.endMs = c.timeMs;
            cur.candleCount++;
        }
    }
    if (cur) sessions.push(cur);

    // Drop last session - may be still forming (matches EA "completed sessions only")
    if (sessions.length > 0) sessions.pop();

    return sessions;
}

// ---- Compression threshold - matches EA CompressionThreshold() / PHP fib_compression_threshold() ----
// EA: pip_size * min_pips (JPY=40, else=20)
// Regression note: pip_size is hardcoded, not derived from broker SYMBOL_POINT, to match
// the EA regression fix that guards against brokers reporting SYMBOL_POINT=0.001 for JPY.
function pipSizeForSymbol(symbol) {
    if (/JPY$/.test(symbol)) return 0.01;
    if (symbol === 'XAUUSD' || symbol === 'XAGUSD') return 0.01;
    return 0.0001;
}

function compressionThreshold(symbol) {
    const minPips = /JPY$/.test(symbol) ? 40.0 : 20.0;
    return minPips * pipSizeForSymbol(symbol);
}

// Per-session compression check. Mirrors EA f1v/f2v/f3v logic.
function sessionPassesCompression(session, threshold) {
    return session && (session.high - session.low) >= threshold;
}

function isoOrBlank(timeMs) {
    return Number.isFinite(timeMs) ? new Date(timeMs).toISOString() : '';
}

function sessionRange(session) {
    return session ? session.high - session.low : null;
}

function buildAnchorComponent(slot, session, compressionPass, weight) {
    return {
        slot,
        key: session ? session.key : null,
        high: session ? session.high : null,
        low: session ? session.low : null,
        range: sessionRange(session),
        compression_pass: !!compressionPass,
        weight,
        candle_count: session ? session.candleCount : 0,
        first_candle: session ? isoOrBlank(session.startMs) : '',
        last_candle: session ? isoOrBlank(session.endMs) : '',
    };
}

// ---- LTF_SF anchor with per-session compression filtering ----
// Mirrors EA ComputeLTFAnchor exactly:
//   - filter F1/F2/F3 individually against compression threshold
//   - weight only sessions that pass
//   - reject final composite if (out_high - out_low) < threshold
function computeLtfAnchorWithCompression(candles, sessionTf, threshold) {
    const sessions = buildCompletedSessions(candles, sessionTf);
    const n = sessions.length;
    if (n === 0) return null;

    const f1 = n >= 1 ? sessions[n - 1] : null;
    const f2 = n >= 2 ? sessions[n - 2] : null;
    const f3 = n >= 3 ? sessions[n - 3] : null;

    const f1v = sessionPassesCompression(f1, threshold);
    const f2v = sessionPassesCompression(f2, threshold);
    const f3v = sessionPassesCompression(f3, threshold);

    const validCount = (f1v ? 1 : 0) + (f2v ? 1 : 0) + (f3v ? 1 : 0);
    if (validCount < 1) return null;

    let wf1 = 0;
    let wf2 = 0;
    let wf3 = 0;
    if (validCount === 3) {
        wf1 = 0.40;
        wf2 = 0.35;
        wf3 = 0.25;
    } else if (validCount === 2) {
        if (f1v) {
            wf1 = 0.55;
            wf2 = f2v ? 0.45 : 0.0;
            wf3 = f3v ? 0.45 : 0.0;
        } else {
            wf1 = 0.0;
            wf2 = 0.55;
            wf3 = 0.45;
        }
    } else {
        wf1 = f1v ? 1.0 : 0.0;
        wf2 = f2v ? 1.0 : 0.0;
        wf3 = f3v ? 1.0 : 0.0;
    }

    const wt = wf1 + wf2 + wf3;
    if (wt <= 0) return null;

    let sumH = 0;
    let sumL = 0;
    if (f1v && wf1 > 0) { sumH += f1.high * wf1; sumL += f1.low * wf1; }
    if (f2v && wf2 > 0) { sumH += f2.high * wf2; sumL += f2.low * wf2; }
    if (f3v && wf3 > 0) { sumH += f3.high * wf3; sumL += f3.low * wf3; }

    const high = sumH / wt;
    const low  = sumL / wt;

    if ((high - low) < threshold) return null;

    return {
        high, low,
        components: [
            buildAnchorComponent('F1', f1, f1v, wf1),
            buildAnchorComponent('F2', f2, f2v, wf2),
            buildAnchorComponent('F3', f3, f3v, wf3),
        ],
        dbg: {
            f1_key: f1 ? f1.key : null,
            f2_key: f2 ? f2.key : null,
            f3_key: f3 ? f3.key : null,
            f1v,
            f2v,
            f3v,
            wf1,
            wf2,
            wf3,
        }
    };
}

// ---- HTF_AF anchor with compression filtering ----
// Mirrors Pine v13.1.3 HTF Authority AF: draw from auth_f1, the most recent
// completed authority session. Reject if (auth_f1.high - auth_f1.low) < threshold.
function computeHtfAnchorWithCompression(candles, authorityTf, threshold) {
    const sessions = buildCompletedSessions(candles, authorityTf);
    const n = sessions.length;
    if (n < 1) return null;

    const authF1 = sessions[n - 1];
    if ((authF1.high - authF1.low) < threshold) return null;

    return {
        high: authF1.high,
        low:  authF1.low,
        authority_component: {
            source: 'auth_f1',
            key: authF1.key,
            high: authF1.high,
            low: authF1.low,
            range: authF1.high - authF1.low,
            candle_count: authF1.candleCount,
            first_candle: isoOrBlank(authF1.startMs),
            last_candle: isoOrBlank(authF1.endMs),
        },
        dbg: { anchor_key: authF1.key, anchor: 'auth_f1' }
    };
}

// helperTf: the intermediate derived feed used for session grouping, e.g. 'H1' for H4 LTF_SF.
// helperBars: candle count of that derived feed (not raw M15 count).
// candle_lineage is always 'derived_from_M15' for this generator.
function buildAnchorDebugRecord(symbol, timeframe, family, sessionTf, authorityTf, threshold, anchor,
                                helperTf, helperBars) {
    const base = {
        symbol,
        timeframe,
        family,
        session_tf: sessionTf,
        authority_tf: authorityTf,
        // candle_lineage identifies the bar source so the parity validator can
        // classify LINEAGE_MISMATCH before comparing prices.
        candle_lineage:   `derived_from_${SOURCE_TIMEFRAME}`,
        source_period:    helperTf    != null ? helperTf    : SOURCE_TIMEFRAME,
        source_feed_bars: helperBars  != null ? helperBars  : 0,
        anchor_high: anchor.high,
        anchor_low: anchor.low,
        anchor_range: anchor.high - anchor.low,
        compression_threshold: threshold,
    };

    if (family === 'LTF_SF') {
        return {
            ...base,
            components: anchor.components,
        };
    }

    return {
        ...base,
        ...anchor.authority_component,
        components: [],
    };
}

// ---- Fib level formula ----
// high - ((ratio / 100) * (high - low))  [ratio is integer percent]
function fibLevel(high, low, ratioPct) {
    return high - (ratioPct / 100) * (high - low);
}

// ---- Load candles ----
function loadCandles(symbol, tf) {
    const p = path.join(CANDLE_DIR, `${symbol}_${tf}.json`);
    if (!fs.existsSync(p)) {
        console.error(`FAIL: missing candle file: ${p}`);
        process.exit(1);
    }
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (err) {
        console.error(`FAIL: malformed candle JSON in ${p}: ${err.message}`);
        process.exit(1);
    }
    if (!Array.isArray(raw) || raw.length === 0) {
        console.error(`FAIL: empty or malformed candle file: ${p}`);
        process.exit(1);
    }
    return raw;
}

function loadSourceCandles(symbol) {
    return loadCandles(symbol, SOURCE_TIMEFRAME);
}

// ---- Staleness guard ----
function checkStaleness(mt5Mtime) {
    // mt5Mtime = Date object of mt5-levels.json last modification
    for (const sym of SYMBOLS) {
        const candles = loadSourceCandles(sym);
        const norm = candles.map(normalizeCandle).filter(Boolean);
        if (!norm.length) {
            console.error(`FAIL: no valid candles in ${path.join(CANDLE_DIR, `${sym}_${SOURCE_TIMEFRAME}.json`)}`);
            process.exit(1);
        }
        const lastOpenMs     = Math.max(...norm.map(c => c.timeMs));
        const candleMs       = TF_MS[SOURCE_TIMEFRAME];
        const lastCloseMs    = lastOpenMs + candleMs;
        const staleMs        = STALE_MS[SOURCE_TIMEFRAME];
        const mt5Ms          = mt5Mtime.getTime();
        const ageFromCloseMs = mt5Ms - lastCloseMs;

        // Guard: the latest closed source candle must be within the staleness window
        // relative to the MT5 export timestamp.
        if (ageFromCloseMs > staleMs) {
            const lastOpenDate  = new Date(lastOpenMs).toISOString();
            const lastCloseDate = new Date(lastCloseMs).toISOString();
            const mt5Date       = mt5Mtime.toISOString();
            console.error(
                `FAIL: stale candles in ${sym}_${SOURCE_TIMEFRAME}.json - ` +
                `open=${lastOpenDate} close=${lastCloseDate} reference=${mt5Date} ` +
                `age_from_close=${Math.round(ageFromCloseMs / 1000)}s max_age=${staleMs / 1000}s`
            );
            process.exit(1);
        }
        console.log(`  [staleness OK] ${sym} ${SOURCE_TIMEFRAME}: open=${new Date(lastOpenMs).toISOString()} close=${new Date(lastCloseMs).toISOString()}`);
    }
}

// ---- Main ----
function main() {
    console.log('[generate-pine-levels-v13] Starting...');
    console.log(`  candle-dir : ${CANDLE_DIR}`);
    console.log(`  reports-dir: ${REPORTS_DIR}`);
    console.log(`  mt5-file   : ${MT5_FILE}`);

    // Read mt5 file mtime for staleness guard
    if (!fs.existsSync(MT5_FILE)) {
        console.error(`FAIL: mt5 file not found: ${MT5_FILE}`);
        process.exit(1);
    }
    const mt5Stat  = fs.statSync(MT5_FILE);
    const mt5Mtime = mt5Stat.mtime;
    console.log(`  mt5 mtime  : ${mt5Mtime.toISOString()}`);

    // Staleness guard
    console.log('[generate-pine-levels-v13] Checking candle staleness...');
    checkStaleness(mt5Mtime);

    // Generate levels
    console.log('[generate-pine-levels-v13] Computing levels...');
    const levels   = [];
    const metaRows = [];
    const anchorDebugRows = [];

    for (const sym of SYMBOLS) {
        const sourceCandles = loadSourceCandles(sym);
        const helperFeeds = buildHelperFeeds(sourceCandles);

        for (const tf of TIMEFRAMES) {
            const sessionTf   = toSessionTf(tf);
            const authorityTf = toAuthorityTf(sessionTf);
            const ltfHelperTf = helperTimeframeForSessionTf(sessionTf);
            const htfHelperTf = helperTimeframeForSessionTf(authorityTf);
            const ltfCandles  = helperFeeds[ltfHelperTf];
            const htfCandles  = helperFeeds[htfHelperTf];
            const threshold   = compressionThreshold(sym);

            const ltf = computeLtfAnchorWithCompression(ltfCandles, sessionTf, threshold);
            const htf = computeHtfAnchorWithCompression(htfCandles, authorityTf, threshold);

            // LTF_SF is required; without it the primary fib grid is unusable.
            // HTF_AF is skippable when the DB lacks sufficient history (e.g. a newly
            // deployed instance that hasn't yet accumulated a completed authority session).
            // Export PINE_REQUIRE_HTF=1 to restore hard-fail for CI with full history.
            const requireHtf = process.env.PINE_REQUIRE_HTF === '1';

            if (!ltf) {
                console.error(`FAIL: no LTF anchor computable for ${sym} ${tf}`);
                process.exit(1);
            }

            if (!htf) {
                if (requireHtf) {
                    console.error(`FAIL: insufficient HTF_AF anchor history for ${sym} ${tf} - PINE_REQUIRE_HTF=1`);
                    process.exit(1);
                }
                const authTf = toAuthorityTf(toSessionTf(tf));
                console.warn(`WARN: skipping HTF_AF for ${sym} ${tf} - insufficient ${authTf} authority-session history`);
            }

            const anchors = { LTF_SF: ltf, HTF_AF: htf };
            for (const [family, anchor] of Object.entries(anchors)) {
                if (!anchor) {
                    // HTF_AF was already warned above; skip rows for this family.
                    continue;
                }
                for (const ratio of RATIOS) {
                    const price = fibLevel(anchor.high, anchor.low, ratio);
                    levels.push({ symbol: sym, timeframe: tf, family, ratio, price });
                }
                metaRows.push({
                    symbol: sym, timeframe: tf, family,
                    session_tf: sessionTf,
                    authority_tf: authorityTf,
                    ltf_helper_tf: ltfHelperTf,
                    htf_helper_tf: htfHelperTf,
                    compression_threshold: threshold,
                    anchor_high: anchor.high,
                    anchor_low:  anchor.low,
                    dbg: anchor.dbg,
                });
                // Pass helper-feed TF and bar count so the debug record reports
                // which derived feed was used for session grouping.
                const helperTf   = (family === 'LTF_SF') ? ltfHelperTf : htfHelperTf;
                const helperFeed = helperFeeds[helperTf];
                const helperBars = Array.isArray(helperFeed) ? helperFeed.length : 0;
                anchorDebugRows.push(buildAnchorDebugRecord(
                    sym, tf, family, sessionTf, authorityTf, threshold, anchor,
                    helperTf, helperBars));
            }
        }
    }

    // Row count guard: symbols × timeframes × 2 families × 16 ratios.
    // Computed dynamically so --symbols / --timeframes overrides are respected.
    // When PINE_REQUIRE_HTF is not set, HTF_AF rows may be absent due to insufficient
    // authority-session history; compute the minimum acceptable count accordingly.
    const requireHtfGlobal = process.env.PINE_REQUIRE_HTF === '1';
    const EXPECTED_ROWS    = SYMBOLS.length * TIMEFRAMES.length * 2 * RATIOS.length;
    const MIN_ROWS         = requireHtfGlobal
        ? EXPECTED_ROWS
        : SYMBOLS.length * TIMEFRAMES.length * 1 * RATIOS.length; // at least LTF_SF per cell
    if (levels.length < MIN_ROWS || levels.length > EXPECTED_ROWS) {
        console.error(`FAIL: expected ${MIN_ROWS}-${EXPECTED_ROWS} output rows, got ${levels.length}`);
        process.exit(1);
    }
    if (levels.length < EXPECTED_ROWS) {
        console.warn(`WARN: partial output - ${levels.length}/${EXPECTED_ROWS} rows (some HTF_AF skipped due to insufficient history)`);
    }

    // Write outputs
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_LEVELS, JSON.stringify(levels, null, 2));
    console.log(`[generate-pine-levels-v13] Wrote ${levels.length} rows -> ${OUTPUT_LEVELS}`);

    const metadata = {
        generator:    'generate-pine-levels-v13.cjs',
        version:      'v13.1.3',
        source:       'local-candles-pine-v13-compatible',
        authority:    'NOT a live TradingView/Pine export - locally computed Pine v13-compatible reference',
        generated_at: RUN_TS,
        candle_dir:   CANDLE_DIR,
        mt5_file:     MT5_FILE,
        mt5_mtime:    mt5Mtime.toISOString(),
        source_timeframe: SOURCE_TIMEFRAME,
        helper_feed_ladder: { Daily: 'M15', Weekly: 'H1', Monthly: 'D1', Quarterly: 'D1', Yearly: 'D1' },
        session_ladder: { M15: 'Daily', H1: 'Weekly', H4: 'Monthly', D1: 'Quarterly' },
        authority_ladder: { Daily: 'Weekly', Weekly: 'Monthly', Monthly: 'Quarterly', Quarterly: 'Yearly' },
        output_rows:  levels.length,
        anchors:      metaRows,
    };
    fs.writeFileSync(OUTPUT_META, JSON.stringify(metadata, null, 2));
    console.log(`[generate-pine-levels-v13] Wrote metadata -> ${OUTPUT_META}`);
    fs.writeFileSync(OUTPUT_ANCHOR_DEBUG, JSON.stringify(anchorDebugRows, null, 2));
    console.log(`[generate-pine-levels-v13] Wrote anchor debug -> ${OUTPUT_ANCHOR_DEBUG}`);
    console.log('[generate-pine-levels-v13] Done.');
}

main();
