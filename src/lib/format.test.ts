import { describe, expect, it } from "vitest";
import { fmtCurrency, fmtLocalCurrency } from "./format";

describe("fmtCurrency", () => {
  it("formats USC as account-currency cents instead of USD dollars", () => {
    expect(fmtCurrency(46.04, "USC")).toBe("USC 46.04");
    expect(fmtCurrency(46.04, "USC", true)).toBe("+USC 46.04");
  });
});

describe("fmtLocalCurrency", () => {
  it("returns a placeholder for missing or non-finite values", () => {
    expect(fmtLocalCurrency(undefined, "ZAR", "en-ZA")).toBe("--");
    expect(fmtLocalCurrency(null, "ZAR", "en-ZA")).toBe("--");
    expect(fmtLocalCurrency(Number.NaN, "ZAR", "en-ZA")).toBe("--");
    expect(fmtLocalCurrency(Number.POSITIVE_INFINITY, "ZAR", "en-ZA")).toBe("--");
  });

  it("falls back to ZAR when currency is absent", () => {
    expect(fmtLocalCurrency(1250, undefined, "en-US")).toBe("ZAR\u00a01,250.00");
  });

  it("formats an explicit local currency deterministically", () => {
    expect(fmtLocalCurrency(1250.5, "USD", "en-US")).toBe("$1,250.50");
  });
});
