#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

let harness;
try {
  harness = require("../wordpress/_archive/Old_plugin/SMC-SmartFIB-v12.0.9-Base-codex-v12.0.9.1Working/tests/helpers/pine-fib-harness.js");
} catch (err) {
  console.error("Failed to load pine-fib-harness.js helper from repo:", err.message);
  process.exitCode = 2;
}

const SYMBOLS = ["EURUSD", "USDJPY", "XAUUSD"];
const TIMEFRAMES = ["M15", "H1", "H4", "D1"];
const FAMILIES = { LTF_SF: "f3", HTF_AF: "f2" };
const RATIOS = [
  -200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300,
];

function loadCandles(symbol, tf) {
  const p = path.resolve(process.cwd(), "data", `${symbol}_${tf}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf8");
    const data = JSON.parse(raw);
    return data;
  } catch (e) {
    console.warn(`Failed to read/parse ${p}: ${e.message}`);
    return null;
  }
}

function toSessionTf(timeframe) {
  if (timeframe === "D1") return "Daily";
  return "Weekly";
}

function ensureHarness() {
  if (!harness) {
    console.error("Required harness is not available; cannot compute Pine levels.");
    process.exit(2);
  }
}

function generate() {
  ensureHarness();
  const out = [];

  for (const sym of SYMBOLS) {
    for (const tf of TIMEFRAMES) {
      const candles = loadCandles(sym, tf);
      if (!candles) {
        console.warn(`missing candles for ${sym} ${tf}, skipping`);
        continue;
      }
      const pine = harness.computePineFibAnchors(candles, { sessionTf: toSessionTf(tf) });
      for (const family of Object.keys(FAMILIES)) {
        const fibName = FAMILIES[family];
        const fibObj = pine[fibName];
        if (!fibObj) {
          console.warn(`no ${fibName} for ${sym} ${tf}`);
          continue;
        }
        for (const ratio of RATIOS) {
          const priceRaw = harness.pineFibLevel(fibObj.high, fibObj.low, ratio / 100);
          const price = Number(priceRaw == null ? null : Number(priceRaw).toFixed(8));
          out.push({
            symbol: sym,
            timeframe: tf,
            family: family,
            ratio: ratio,
            price: price,
          });
        }
      }
    }
  }

  fs.writeFileSync("pine-levels.json", JSON.stringify(out, null, 2));
  console.log("Wrote pine-levels.json with", out.length, "entries");
}

if (require.main === module) {
  generate();
}
