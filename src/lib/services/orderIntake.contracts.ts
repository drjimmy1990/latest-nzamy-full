/**
 * orderIntake.contracts.ts — pure intake contract for محترف العقود orders
 * (draft mode and review mode share one service key, discriminated by `mode`).
 *
 * Sibling of orderIntake.ts (draft). Pure: no I/O, no clock, no Supabase —
 * unit-testable with `node --test`. Reuses isRecord/str/collectAttachments
 * from orderIntake.ts rather than re-declaring them.
 */

import { isRecord, str, collectAttachments, type OrderAttachment, type ValidationResult } from "./orderIntake.ts";

export interface ContractsIntakeV1 {
  schemaVersion: 1;
  service: "contracts";
  mode: "draft" | "review";
  // draft mode:
  complexity?: "simple" | "detailed";
  contractType?: string;
  language?: string;
  parties?: { one: unknown; two: unknown };
  contractDesc?: string;
  selectedClauses?: string[];
  additionalClauses?: string[];
  // review mode:
  representing?: string;
  concerns?: string;
  otherParty?: string;
  attachments: OrderAttachment[];
}

function strArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.map((x) => str(x)).filter(Boolean);
  return out.length > 0 ? out : undefined;
}

/**
 * Draft mode has no uploaded document to fall back on — contractDesc IS the
 * brief the admin drafts from. Review mode has no free-text minimum: the
 * uploaded contract (attachments, required below) is the deliverable.
 * Ruling: coordinator review of af0929e, 2026-08-16.
 */
const MIN_CONTRACT_DESC = 20;

export function validateContractsIntake(input: unknown): ValidationResult<ContractsIntakeV1> {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ["البيانات المرسلة غير صالحة"] };
  }

  const service = str(input.service);
  if (service !== "contracts") {
    errors.push("نوع الخدمة غير صحيح");
  }

  const mode = str(input.mode);
  if (mode !== "draft" && mode !== "review") {
    errors.push("وضع الخدمة غير محدد");
  }

  const complexity = str(input.complexity);
  if (complexity && complexity !== "simple" && complexity !== "detailed") {
    errors.push("مستوى تفصيل العقد غير صحيح");
  }

  // parties is optional, but if present both sides must be objects — the
  // inner shape is deliberately `unknown`, this validator only checks shape.
  const partiesRaw = isRecord(input.parties) ? input.parties : null;
  if (input.parties !== undefined && (!partiesRaw || !isRecord(partiesRaw.one) || !isRecord(partiesRaw.two))) {
    errors.push("بيانات الأطراف غير مكتملة");
  }

  const contractDesc = str(input.contractDesc);
  if (mode === "draft" && contractDesc.length < MIN_CONTRACT_DESC) {
    errors.push(`وصف العقد قصير جداً — الحد الأدنى ${MIN_CONTRACT_DESC} حرفاً`);
  }

  const representing = str(input.representing);
  if (mode === "review" && !representing) {
    errors.push("يجب تحديد الطرف الذي تمثله");
  }

  const attachments = collectAttachments(input.attachments, errors);
  if (mode === "review" && attachments.length === 0) {
    errors.push("مراجعة العقد تتطلب إرفاق العقد على الأقل");
  }

  if (errors.length > 0) return { ok: false, errors };

  const contractType = str(input.contractType);
  const language = str(input.language);
  const concerns = str(input.concerns);
  const otherParty = str(input.otherParty);
  const selectedClauses = strArray(input.selectedClauses);
  const additionalClauses = strArray(input.additionalClauses);

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      service: "contracts",
      mode: mode as "draft" | "review",
      ...(complexity ? { complexity: complexity as "simple" | "detailed" } : {}),
      ...(contractType ? { contractType } : {}),
      ...(language ? { language } : {}),
      ...(partiesRaw ? { parties: { one: partiesRaw.one, two: partiesRaw.two } } : {}),
      ...(contractDesc ? { contractDesc } : {}),
      ...(selectedClauses ? { selectedClauses } : {}),
      ...(additionalClauses ? { additionalClauses } : {}),
      ...(representing ? { representing } : {}),
      ...(concerns ? { concerns } : {}),
      ...(otherParty ? { otherParty } : {}),
      attachments,
    },
  };
}
