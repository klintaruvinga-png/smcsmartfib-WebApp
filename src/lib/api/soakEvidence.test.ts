import assert from "node:assert/strict";
import test from "node:test";

import {
  SOAK_EVIDENCE_TYPES,
  assertValidSoakEvidencePayload,
} from "./soakEvidence.ts";

test("assertValidSoakEvidencePayload throws before any network call for invalid evidence_type", () => {
  let loggedPayload: unknown = null;

  const logger = {
    error: (_message: string, details: unknown) => {
      loggedPayload = details;
    },
  };

  assert.throws(
    () =>
      assertValidSoakEvidencePayload(
        {
          evidence_key: "baseline.started_by",
          evidence_type: "bogus",
          evidence_value: "operator",
          operator: "wordpress-admin",
        },
        logger,
      ),
    /unsupported evidence_type value\(s\): bogus/,
  );

  assert.deepEqual(loggedPayload, {
    allowedEvidenceTypes: SOAK_EVIDENCE_TYPES,
    payload: {
      evidence_key: "baseline.started_by",
      evidence_type: "bogus",
      evidence_value: "operator",
      operator: "wordpress-admin",
    },
  });
});

test("assertValidSoakEvidencePayload accepts whitelisted evidence types", () => {
  assert.doesNotThrow(() =>
    assertValidSoakEvidencePayload(
      SOAK_EVIDENCE_TYPES.map((evidenceType) => ({
        evidence_type: evidenceType,
      })),
    ),
  );
});
