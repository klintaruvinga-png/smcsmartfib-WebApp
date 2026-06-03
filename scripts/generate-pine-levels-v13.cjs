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
 * Minimum candle history required per timeframe (to satisfy 3 completed authority sessions):
 *   M15 -> authority=Weekly  -> need >= 3 completed weeks  -> ~21 days
 *   H1  -> authority=Monthly -> need >= 3 completed months -> ~90 days
 *   H4  -> authority=Quarterly -> need >= 3 completed quarters -> ~270 days
 *   D1  -> authority=Yearly  -> need >= 3 completed years  -> ~1095 days
 * Candle files shorter than these depths will cause a FAIL on HTF_AF for that timeframe.
 *
 * LTF_SF anchor: F1/F2/F3 weighted composite of 3 most recent completed
 *   sessions at sessionTf granularity.
 *   Weights: 3 sessions = F1:0.40, F2:0.35, F3:0.25
 *            2 sessions = F1:0.55, F2:0.45
 *            1 session  = F1:1.00
 *
 * HTF_AF anchor: raw high/low of the 3rd most recent completed authority session.
 *
 * Outputs:
 *   reports/phase4-parity/pine-levels.json          - pure 384-row validator array
 *   reports/phase4-parity/pine-levels.metadata.json - debug/audit metadata
 *
 * Guards:
 *   - Fails if any required candle file is missing
 *   - Fails if any candle file's last candle is older than staleness threshold
 *   - Fails if output row count != 384
 *
 * Usage (from repo root):
 *   node scripts/generate-pine-levels-v13.cjs [--candle-dir <path>] [--mt5-file <path>]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---- Config ----
const REPO_ROOT      = path.resolve(__dirname, '..');
const REPORTS_DIR    = path.join(REPO_ROOT, 'reports', 'phase4-parity');
const OUTPUT_LEVELS  = path.join(REPORTS_DIR, 'pine-levels.json');
const OUTPUT_META    = path.join(REPORTS_DIR, 'pine-levels.metadata.json');

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
const CANDLE_DIR = getArg('--candle-dir') || path.join(REPO_ROOT, 'data');
const MT5_FILE   = getArg('--mt5-file')   || path.join(REPO_ROOT, 'reports', 'phase4-parity', 'mt5-levels.json');

const SYMBOLS    = ['EURUSD', 'USDJPY', 'XAUUSD'];
const TIMEFRAMES = ['M15', 'H1', 'H4', 'D1'];
const RATIOS     = [-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300];

// Staleness: how far behind the last candle is allowed to be per timeframe
// (in milliseconds). Candle files older than this relative to mt5-levels.json
// mtime will cause a hard fail.
const STALE_MS = {
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
        const t = raw.time ?? raw.timestamp ?? raw.ts ?? raw.t;
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
            cur = { key, high: c.high, low: c.low, open: c.open, close: c.close, startMs: c.timeMs };
        } else {
            cur.high  = Math.max(cur.high, c.high);
            cur.low   = Math.min(cur.low, c.low);
            cur.close = c.close;
        }
    }
    if (cur) sessions.push(cur);

    // Drop last session - may be still forming (matches EA "completed sessions only")
    if (sessions.length > 0) sessions.pop();

    return sessions;
}

// ---- LTF_SF anchor ----
// F1 = most recent completed, F2 = 2nd, F3 = 3rd.
// Recency-weighted composite high/low.
function computeLtfAnchor(candles, sessionTf) {
    const sessions = buildCompletedSessions(candles, sessionTf);
    const n = sessions.length;
    if (n === 0) return null;

    const f1 = sessions[n - 1];
    const f2 = n >= 2 ? sessions[n - 2] : null;
    const f3 = n >= 3 ? sessions[n - 3] : null;

    let high, low;
    if (n >= 3) {
        high = 0.40 * f1.high + 0.35 * f2.high + 0.25 * f3.high;
        low  = 0.40 * f1.low  + 0.35 * f2.low  + 0.25 * f3.low;
    } else if (n === 2) {
        high = 0.55 * f1.high + 0.45 * f2.high;
        low  = 0.55 * f1.low  + 0.45 * f2.low;
    } else {
        high = f1.high;
        low  = f1.low;
    }

    return {
        high, low,
        dbg: {
            f1_key: f1.key,
            f2_key: f2 ? f2.key : null,
            f3_key: f3 ? f3.key : null,
        }
    };
}

// ---- HTF_AF anchor ----
// Raw high/low of the 3rd most recent completed authority session (idx3).
function computeHtfAnchor(candles, authorityTf) {
    const sessions = buildCompletedSessions(candles, authorityTf);
    const n = sessions.length;
    if (n < 3) return null;

    const idx3 = sessions[n - 3];
    return {
        high: idx3.high,
        low:  idx3.low,
        dbg: { anchor_key: idx3.key }
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

// ---- Staleness guard ----
function checkStaleness(mt5Mtime) {
    // mt5Mtime = Date object of mt5-levels.json last modification
    for (const sym of SYMBOLS) {
        for (const tf of TIMEFRAMES) {
            const candles = loadCandles(sym, tf);
            const norm = candles.map(normalizeCandle).filter(Boolean);
            if (!norm.length) {
                console.error(`FAIL: no valid candles in ${path.join(CANDLE_DIR, `${sym}_${tf}.json`)}`);
                process.exit(1);
            }
            const lastMs   = Math.max(...norm.map(c => c.timeMs));
            const staleMs  = STALE_MS[tf];
            const mt5Ms    = mt5Mtime.getTime();
            // Guard: last candle must be within staleMs of mt5 export time
            // (last candle should be "recent" - within one period of mt5 mtime)
            if (lastMs < mt5Ms - staleMs) {
                const lastDate = new Date(lastMs).toISOString();
                const mt5Date  = mt5Mtime.toISOString();
                console.error(
                    `FAIL: stale candles in ${sym}_${tf}.json - ` +
                    `last candle ${lastDate}, mt5 export ${mt5Date}, ` +
                    `max allowed gap: ${staleMs / 1000}s`
                );
                process.exit(1);
            }
            console.log(`  [staleness OK] ${sym} ${tf}: last candle ${new Date(lastMs).toISOString()}`);
        }
    }
}

// ---- Main ----
function main() {
    console.log('[generate-pine-levels-v13] Starting...');
    console.log(`  candle-dir : ${CANDLE_DIR}`);
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

    for (const sym of SYMBOLS) {
        for (const tf of TIMEFRAMES) {
            const sessionTf   = toSessionTf(tf);
            const authorityTf = toAuthorityTf(sessionTf);
            const candles     = loadCandles(sym, tf);

            const ltf = computeLtfAnchor(candles, sessionTf);
            const htf = computeHtfAnchor(candles, authorityTf);

            if (!ltf && !htf) {
                console.error(`FAIL: no anchor computable for ${sym} ${tf}`);
                process.exit(1);
            }

            const anchors = { LTF_SF: ltf, HTF_AF: htf };
            for (const [family, anchor] of Object.entries(anchors)) {
                if (!anchor) {
                    console.error(`FAIL: insufficient completed anchor history for ${sym} ${tf} ${family}`);
                    process.exit(1);
                }
                for (const ratio of RATIOS) {
                    const price = fibLevel(anchor.high, anchor.low, ratio);
                    levels.push({ symbol: sym, timeframe: tf, family, ratio, price });
                }
                metaRows.push({
                    symbol: sym, timeframe: tf, family,
                    session_tf: sessionTf,
                    authority_tf: authorityTf,
                    anchor_high: anchor.high,
                    anchor_low:  anchor.low,
                    dbg: anchor.dbg,
                });
            }
        }
    }

    // Row count guard
    if (levels.length !== 384) {
        console.error(`FAIL: expected 384 output rows, got ${levels.length}`);
        process.exit(1);
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
        generated_at: new Date().toISOString(),
        candle_dir:   CANDLE_DIR,
        mt5_file:     MT5_FILE,
        mt5_mtime:    mt5Mtime.toISOString(),
        session_ladder: { M15: 'Daily', H1: 'Weekly', H4: 'Monthly', D1: 'Quarterly' },
        authority_ladder: { Daily: 'Weekly', Weekly: 'Monthly', Monthly: 'Quarterly', Quarterly: 'Yearly' },
        output_rows:  levels.length,
        anchors:      metaRows,
    };
    fs.writeFileSync(OUTPUT_META, JSON.stringify(metadata, null, 2));
    console.log(`[generate-pine-levels-v13] Wrote metadata -> ${OUTPUT_META}`);
    console.log('[generate-pine-levels-v13] Done.');
}

main();
