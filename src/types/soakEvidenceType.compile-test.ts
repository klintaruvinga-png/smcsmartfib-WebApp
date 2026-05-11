import type { SoakEvidenceType } from "./sniper";

const validEvidenceType: SoakEvidenceType = "baseline_metadata";

// @ts-expect-error SoakEvidenceType must reject unlisted evidence_type literals.
const invalidEvidenceType: SoakEvidenceType = "bogus";

void validEvidenceType;
void invalidEvidenceType;
