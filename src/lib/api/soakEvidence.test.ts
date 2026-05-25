import { describe, expect, it, vi } from "vitest";

import { SOAK_EVIDENCE_TYPES, assertValidSoakEvidencePayload } from "./soakEvidence.ts";

describe("assertValidSoakEvidencePayload", () => {
  it("throws before any network call for invalid evidence_type", () => {
    let loggedPayload: unknown = null;

    const logger = {
      error: vi.fn((_message: string, details: unknown) => {
        loggedPayload = details;
      }),
    };

    expect(() =>
      assertValidSoakEvidencePayload(
        {
          evidence_key: "baseline.started_by",
          evidence_type: "bogus",
          evidence_value: "operator",
          operator: "wordpress-admin",
        },
        logger,
      ),
    ).toThrow(/unsupported evidence_type value\(s\): bogus/);

    expect(loggedPayload).toEqual({
      allowedEvidenceTypes: SOAK_EVIDENCE_TYPES,
      payload: {
        evidence_key: "baseline.started_by",
        evidence_type: "bogus",
        evidence_value: "operator",
        operator: "wordpress-admin",
      },
    });
  });

  it("accepts whitelisted evidence types", () => {
    expect(() =>
      assertValidSoakEvidencePayload(
        SOAK_EVIDENCE_TYPES.map((evidenceType) => ({
          evidence_type: evidenceType,
        })),
      ),
    ).not.toThrow();
  });
});
