"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PINE_FILE = path.resolve(REPO_ROOT, "SMC_SuperFib_v10.16.1.pine");

function loadPineSource() {
    return fs.readFileSync(PINE_FILE, "utf8");
}

function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function candleTimeMs(candle) {
    const raw =
        candle &&
        (candle.time ??
            candle.timestamp ??
            candle.ts ??
            candle.t ??
            candle.datetime ??
            candle.date);
    if (raw == null) return null;
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
        return numeric < 1e12 ? numeric * 1000 : numeric;
    }
    const iso = String(raw).trim().replace(" ", "T");
    const parsed = Date.parse(iso);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCandle(raw) {
    if (!raw) return null;
    const open = toNumber(raw.open ?? raw.o);
    const high = toNumber(raw.high ?? raw.h);
    const low = toNumber(raw.low ?? raw.l);
    const close = toNumber(raw.close ?? raw.c);
    const timeMs = candleTimeMs(raw);
    if (open == null || high == null || low == null || close == null || timeMs == null) return null;
    return { open, high, low, close, timeMs, raw };
}

function getSessionKey(timeMs, sessionTf) {
    const d = new Date(timeMs);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();

    if (sessionTf === "Daily") {
        return y + "-" + String(m).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    }

    if (sessionTf === "Weekly") {
        const dt = new Date(Date.UTC(y, d.getUTCMonth(), day));
        const dow = dt.getUTCDay();
        const diffToMonday = (dow + 6) % 7;
        dt.setUTCDate(dt.getUTCDate() - diffToMonday);
        const wy = dt.getUTCFullYear();
        const jan1 = new Date(Date.UTC(wy, 0, 1));
        const days = Math.floor((dt - jan1) / 86400000);
        const week = Math.floor(days / 7) + 1;
        return wy + "-W" + String(week).padStart(2, "0");
    }

    if (sessionTf === "Monthly") {
        return y + "-" + String(m).padStart(2, "0");
    }

    return String(y);
}

function buildCompletedSessions(candles, sessionTf, nowMs) {
    const norm = (candles || [])
        .map(normalizeCandle)
        .filter(Boolean)
        .sort((a, b) => a.timeMs - b.timeMs);
    if (!norm.length) return [];

    const sessions = [];
    let current = null;

    for (const candle of norm) {
        const key = getSessionKey(candle.timeMs, sessionTf);
        if (!current || current.key !== key) {
            if (current) sessions.push(current);
            current = {
                key,
                open: candle.open,
                close: candle.close,
                high: candle.high,
                low: candle.low,
                startMs: candle.timeMs,
                endMs: candle.timeMs,
            };
            continue;
        }

        current.endMs = candle.timeMs;
        current.close = candle.close;
        current.high = Math.max(current.high, candle.high);
        current.low = Math.min(current.low, candle.low);
    }

    if (current) sessions.push(current);

    if (sessions.length > 0) {
        const latest = sessions[sessions.length - 1];
        const nowKey = getSessionKey(nowMs == null ? Date.now() : nowMs, sessionTf);
        if (latest.key === nowKey) sessions.pop();
    }

    return sessions;
}

function sessionToFib(session) {
    if (!session) return null;
    return {
        high: session.high,
        low: session.low,
        bull: session.close >= session.open,
    };
}

function computePineF2(s1, s2, pipType, f1Bull, f3Bull) {
    let high;
    let low;
    let bull;
    let expanded = false;

    if (f3Bull) {
        high = s2.high;
        low = s1.low;
        bull = false;
    } else {
        high = s2.low;
        low = s1.high;
        bull = true;
    }

    const sameDir = f3Bull === f1Bull;
    const swapRange = Math.abs(high - low);
    const fullRange = f3Bull ? Math.abs(s1.high - s2.low) : Math.abs(s2.high - s1.low);
    const threshold = pipType === "JPY" ? 0.35 : 0.25;

    if (sameDir && fullRange > 0 && swapRange / fullRange < threshold) {
        expanded = true;
        if (f3Bull) {
            high = s1.high;
            low = s2.low;
            bull = true;
        } else {
            high = s2.high;
            low = s1.low;
            bull = false;
        }
    }

    return {
        high,
        low,
        bull,
        name: expanded ? "SWAP EXP" : "SWAP",
        _meta: {
            sameDir,
            swapRange,
            fullRange,
            threshold,
            expanded,
            branch: expanded ? "EXPANDED" : "SWAP",
        },
    };
}

function computePineFibAnchors(candles, options) {
    const opts = options || {};
    const sessionTf = opts.sessionTf || "Weekly";
    const pipType = opts.pipType === "JPY" ? "JPY" : "USD";
    const nowMs = opts.nowMs == null ? Date.now() : opts.nowMs;
    const sessions = buildCompletedSessions(candles || [], sessionTf, nowMs);
    const s1 = sessions.length >= 1 ? sessions[sessions.length - 1] : null;
    const s2 = sessions.length >= 2 ? sessions[sessions.length - 2] : null;
    const f3 = sessionToFib(s1);
    const f1 = sessionToFib(s2);
    const f2 = s1 && s2 ? computePineF2(s1, s2, pipType, f1.bull, f3.bull) : null;

    return {
        f1,
        f2,
        f3,
        _meta: {
            sessionTf,
            s1,
            s2,
            f2: f2 ? f2._meta : null,
        },
    };
}

function buildFibRatios() {
    const base = [0.0, 0.25, 0.5, 0.625, 0.75, 1.0];
    const ext = [0.25, 0.625, 1.0, 1.625, 2.0];
    const levels = base.slice();
    for (const ratio of ext) {
        if (!levels.includes(1.0 + ratio)) levels.push(1.0 + ratio);
    }
    for (const ratio of ext) {
        if (!levels.includes(-ratio)) levels.push(-ratio);
    }
    return levels.sort((a, b) => a - b);
}

function formatRatioLabel(ratio) {
    const pct = ratio * 100;
    return Number.isInteger(pct) ? String(pct) + "%" : pct.toFixed(1).replace(/\.0$/, "") + "%";
}

function pineFibLevel(high, low, ratio) {
    return high - (high - low) * ratio;
}

function renderFibLevels(fib, fibName) {
    if (!fib) return [];
    return buildFibRatios().map((ratio) => {
        const price = pineFibLevel(fib.high, fib.low, ratio);
        return {
            ratio,
            price,
            text: fibName + " " + formatRatioLabel(ratio) + " @ " + String(price),
        };
    });
}

module.exports = {
    PINE_FILE,
    buildCompletedSessions,
    buildFibRatios,
    computePineFibAnchors,
    formatRatioLabel,
    getSessionKey,
    loadPineSource,
    pineFibLevel,
    renderFibLevels,
};
