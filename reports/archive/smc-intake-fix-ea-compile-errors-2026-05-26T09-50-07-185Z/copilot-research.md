# SMC SuperFIB - MT5 EA Compile Error Research

**Date:** 2026-05-26  
**Issue:** SMC Intake - Fix EA compile errors

---

## 1. Issue classification

- **Severity:** HIGH
- **Category:** migration-governance
- **Layer(s) affected:** MT5
- **Phase impact:** Phase 6

---

## 2. Confirmed evidence

- **Compile diagnostics:** 10 errors reported during MT5 EA build.
- **Files involved:** mt5/RegimeEngine.mqh, mt5/SignalEngine.mqh.
- **Error types:** illegal assignment use at class static constant declarations; unresolved static variable at uses of those constants.
- **RegimeEngine evidence:**
  - mt5/RegimeEngine.mqh line 21: static const int EMA_PERIOD = 20;
  - mt5/RegimeEngine.mqh line 24: static const int ATR_PERIOD = 14;
  - mt5/RegimeEngine.mqh line 27: static const int MIN_BARS = 25;
  - mt5/RegimeEngine.mqh line 31: static const double TREND_THRESHOLD;
  - mt5/RegimeEngine.mqh line 37: static const double CHOP_LOWER;
  - mt5/RegimeEngine.mqh line 38: static const double CHOP_UPPER;
  - mt5/RegimeEngine.mqh lines 232-234 define external storage for the double constants.
  - mt5/RegimeEngine.mqh line 60: EMA_PERIOD + 5 reference unresolved.
  - mt5/RegimeEngine.mqh line 61: MIN_BARS - 10 reference unresolved.
  - mt5/RegimeEngine.mqh line 84: ATR_PERIOD + 5 reference unresolved.
- **SignalEngine evidence:**
  - mt5/SignalEngine.mqh line 58: static const int PROXIMITY_PIPS = 15;
  - mt5/SignalEngine.mqh line 62: static const int DISPLACEMENT_PIPS = 8;
  - mt5/SignalEngine.mqh line 65: static const double HTF_ALIGNED_BOOST;
  - mt5/SignalEngine.mqh line 66: static const double HTF_OPPOSED_PENALTY;
  - mt5/SignalEngine.mqh lines 326-327 define external storage for the double constants.
  - mt5/SignalEngine.mqh line 97: PROXIMITY_PIPS reference unresolved.
  - mt5/SignalEngine.mqh line 98: DISPLACEMENT_PIPS reference unresolved.
- **No backend, dashboard, or PHP evidence** is directly implicated by this compile failure; the issue is isolated to MT5 engine source.

---

## 3. Root cause hypothesis

- **Most likely root cause:** MQL class static constant initialization rules are being misused.
- **Why:** The code declares integer static const members with inline initializers inside the class body, which produces illegal assignment use in MQL and prevents those constants from resolving in member functions.
- **Supporting patterns:** static const double members in the same classes are declared without initializers and are defined externally, indicating the intended MQL-compatible pattern for class static constants.
- **Likely trigger:** porting C++/header-style static class constants into MQL without following MQL's allowed class constant syntax.

Confirmed: RegimeEngine and SignalEngine both contain static class constants that the MQL compiler cannot resolve.

---

## 4. Blast radius

- **Epicentre files:** mt5/RegimeEngine.mqh, mt5/SignalEngine.mqh.
- **Affected system:** MT5 EA compilation and runtime signal/regime engines.
- **Likely downstream consumers:** any EA code that includes these headers, such as mt5/SMC_MarketDataEA.mq5 or mt5/ExecutionEngine.mqh.
- **Parity surfaces at risk:** Pine ↔ MT5 regime/signal parity if the correction changes constant declarations or value semantics.
- **Other risk:** if these constants are refactored incorrectly, CopyClose, CopyRates, gate distance thresholds, and displacement logic could change behavior.

---

## 5. Regression surface

- **Behavior to preserve:** exact numeric thresholds used for regime bias and signal proximity/displacement.
- **Sensitive code paths:**
  - CopyClose(symbol, PERIOD_D1, 0, EMA_PERIOD + 5, d1Close)
  - CopyRates(symbol, PERIOD_H1, 0, ATR_PERIOD + 5, h1Rates)
  - 
earestDist <= proxBand and displacement checks using PROXIMITY_PIPS / DISPLACEMENT_PIPS
- **Existing guards:** the code already defines HTF_ALIGNED_BOOST and HTF_OPPOSED_PENALTY externally, showing a partial pattern for MQL class statics.
- **Tests or audits:** no MT5 compile/test artifacts are visible in current repo evidence for these classes; compile errors are the primary signal.

---

## 6. Resolution path options

### Path A: Narrow fix
- Replace the inline static const int declarations with MQL-friendly constants.
- Options:
  - use enum { EMA_PERIOD = 20, ATR_PERIOD = 14, MIN_BARS = 25 }; inside RegimeEngine
  - use enum { PROXIMITY_PIPS = 15, DISPLACEMENT_PIPS = 8 }; inside SignalEngine
- Keep the double constants as externally defined static const double members.
- This is the narrowest change and leaves behavior values unchanged.

### Path B: Structural cleanup
- Refactor class constant patterns across MT5 engine headers into a shared constants header or macro definitions.
- This would standardize MQL syntax and reduce repeat mistakes in future MT5 class constants.
- Broader surface: mt5/RegimeEngine.mqh, mt5/SignalEngine.mqh, and any other mt5/*.mqh headers with similar static const use.

### Recommended
- **Path A**. The compile failure is isolated and the fix should be minimal: align static const int definitions with MQL's allowed class constant syntax while preserving numeric values.

---

## 7. Risk flags

- **High-risk system involved:** Yes. MT5 engine compile failure blocks build and runtime signal/regime generation.
- **Requires parity re-validation:** Yes. RegimeEngine and SignalEngine values affect Phase 5/6 parity comparisons.
- **Migration-blocking:** Yes. The EA cannot compile until these constant declarations are corrected.
- **Human review required before merge:** Yes. A reviewer should verify the MQL syntax change and ensure the constants retain the same runtime behavior.

---

## 8. Handoff package

- **Epicentre files to inspect first:** mt5/RegimeEngine.mqh, mt5/SignalEngine.mqh.
- **Inputs Codex must verify before planning:**
  1. MQL syntax rules for class static const int and whether inline initialization is permitted.
  2. Whether class constants in MT5 should be defined with enum or external storage.
  3. The exact values for EMA_PERIOD, ATR_PERIOD, MIN_BARS, PROXIMITY_PIPS, and DISPLACEMENT_PIPS.
  4. Build success when compiling the EA entrypoint including these headers.
- **Open unknowns:**
  1. Are there other .mqh headers in mt5/ using the same unsupported static constant pattern?
  2. Does the MQL compiler version used by the pipeline differ in class constant support from the local editor's parser?
  3. Is there a preferred repository convention for MT5 compile-time constants in classes?
