/**
 * orderIntake.legalOpinion.ts — pure intake contract for الرأي الفصل orders.
 * One service key ("legal_opinion"), seven sub-flows discriminated by
 * `outputType`.
 *
 * Sibling of orderIntake.ts (draft). Pure: no I/O, no clock, no Supabase —
 * unit-testable with `node --test`. Reuses isRecord/str/collectAttachments
 * from orderIntake.ts rather than re-declaring them.
 *
 * `outputType` uses the underscore set from the brief
 * (consult|study|memo|research|due_diligence|cross_exam|letter). The UI's
 * own identifiers are hyphenated (legal-memo, due-diligence, cross-exam) —
 * Task C4 owns mapping those to this set. This validator intentionally does
 * NOT accept the hyphenated forms: accepting both spellings would make the
 * stored data ambiguous.
 */

import { isRecord, str, collectAttachments, type OrderAttachment, type ValidationResult } from "./orderIntake.ts";

export const LEGAL_OPINION_OUTPUT_TYPES = [
  "consult",
  "study",
  "memo",
  "research",
  "due_diligence",
  "cross_exam",
  "letter",
] as const;

export type LegalOpinionOutputType = (typeof LEGAL_OPINION_OUTPUT_TYPES)[number];

export interface LegalOpinionIntakeV1 {
  schemaVersion: 1;
  service: "legal_opinion";
  outputType: LegalOpinionOutputType;
  topicArea?: string;
  description?: string;
  question?: string;
  settings?: Record<string, unknown>;
  letter?: Record<string, unknown>;
  attachments: OrderAttachment[];
}

function isValidOutputType(v: string): v is LegalOpinionOutputType {
  return (LEGAL_OPINION_OUTPUT_TYPES as readonly string[]).includes(v);
}

/**
 * For the six non-letter sub-flows, `description` IS the request — the
 * admin has nothing else to fulfil the order from. `letter` is exempt: its
 * content comes from the structured `letter` fields the wizard collects and
 * composes into a letter body, so it legitimately has no long free-text
 * field. Ruling: coordinator review of af0929e, 2026-08-16.
 */
const MIN_DESCRIPTION = 20;

export function validateLegalOpinionIntake(input: unknown): ValidationResult<LegalOpinionIntakeV1> {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ["البيانات المرسلة غير صالحة"] };
  }

  const service = str(input.service);
  if (service !== "legal_opinion") {
    errors.push("نوع الخدمة غير صحيح");
  }

  const outputType = str(input.outputType);
  if (!isValidOutputType(outputType)) {
    errors.push("نوع الرأي القانوني غير صحيح");
  }

  const settingsRaw = isRecord(input.settings) ? input.settings : null;
  if (input.settings !== undefined && !settingsRaw) {
    errors.push("إعدادات الطلب غير صالحة");
  }

  const letterRaw = isRecord(input.letter) ? input.letter : null;
  if (input.letter !== undefined && !letterRaw) {
    errors.push("بيانات الخطاب غير صالحة");
  }

  const description = str(input.description);
  if (outputType !== "letter" && description.length < MIN_DESCRIPTION) {
    errors.push(`وصف الطلب قصير جداً — الحد الأدنى ${MIN_DESCRIPTION} حرفاً`);
  }

  const attachments = collectAttachments(input.attachments, errors);

  if (errors.length > 0) return { ok: false, errors };

  const topicArea = str(input.topicArea);
  const question = str(input.question);

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      service: "legal_opinion",
      outputType: outputType as LegalOpinionOutputType,
      ...(topicArea ? { topicArea } : {}),
      ...(description ? { description } : {}),
      ...(question ? { question } : {}),
      ...(settingsRaw ? { settings: settingsRaw } : {}),
      ...(letterRaw ? { letter: letterRaw } : {}),
      attachments,
    },
  };
}
