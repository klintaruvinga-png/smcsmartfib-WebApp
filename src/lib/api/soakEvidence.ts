export const SOAK_EVIDENCE_TYPES = [
  "baseline_metadata",
  "signal_parity_confirm",
  "feed_stable_window",
  "engine_run_observation",
  "manual_note",
] as const;

const SOAK_EVIDENCE_TYPE_SET = new Set<string>(SOAK_EVIDENCE_TYPES);

type SoakEvidencePayloadLike = {
  evidence_type: unknown;
};

type ErrorLogger = Pick<Console, "error">;

export function isSoakEvidenceType(value: unknown): value is (typeof SOAK_EVIDENCE_TYPES)[number] {
  return typeof value === "string" && SOAK_EVIDENCE_TYPE_SET.has(value);
}

export function assertValidSoakEvidencePayload<T extends SoakEvidencePayloadLike>(
  payload: T | readonly T[],
  logger: ErrorLogger = console,
): void {
  const entries = Array.isArray(payload) ? payload : [payload];
  const invalidEntries = entries.filter((entry) => !isSoakEvidenceType(entry.evidence_type));

  if (invalidEntries.length === 0) {
    return;
  }

  logger.error("[PHASE0_SOAK] Invalid soak evidence payload", {
    allowedEvidenceTypes: SOAK_EVIDENCE_TYPES,
    payload,
  });

  const invalidValues = invalidEntries.map((entry) => String(entry.evidence_type)).join(", ");

  throw new Error(
    `Invalid soak evidence payload: unsupported evidence_type value(s): ${invalidValues}`,
  );
}
