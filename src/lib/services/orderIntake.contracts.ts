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
  // Only meaningful when language === "custom" (StepDomain's custom-language
  // panel). Optional, unvalidated passthrough — same shape as DraftIntakeV1's
  // `judgment` in orderIntake.ts: no required sub-shape, just carried along
  // when the wizard set it, so it isn't silently dropped from the admin's
  // order the way "hide, do not delete" is meant to prevent (Task C2).
  customLanguageName?: string;
  customLanguageLayout?: "single" | "dual";
  customLanguageBase?: "ar" | "en";
  // Optional in the TS type (review mode never sets it), but required and
  // both sides must be named when mode === "draft" — see partyIsNamed and
  // its call below (Task 12).
  parties?: { one: unknown; two: unknown };
  contractDesc?: string;
  // The client's chosen jurisdiction (StepContext) — free-text-equivalent,
  // no required shape, same passthrough rationale as the custom-language
  // fields above (Task C2).
  courtType?: string;
  selectedClauses?: string[];
  additionalClauses?: string[];
  // review mode:
  representing?: string;
  concerns?: string;
  otherParty?: string;
  attachments: OrderAttachment[];
}

/**
 * A party is "named" when it carries a non-empty fullName, companyName or
 * entityName — the three shapes PartyData supports for individual/company/
 * government respectively (src/components/contracts/types.ts:33-42).
 * Checked independently of whatever `type` the payload claims: `p` arrives
 * here as `unknown` (parties' inner shape is deliberately unvalidated
 * elsewhere in this file), so a forged or mismatched `type` discriminator
 * must not decide which single field gets checked — that would silently
 * reject, e.g., a company party whose `type` field was dropped or wrong.
 *
 * Exported so useContractsState.ts's canProceed() gates the wizard's
 * "parties" step on this exact same function — Task 12 requires the two
 * rules to agree exactly, and sharing one implementation is the only way to
 * guarantee that rather than hoping two hand-written conditions stay in
 * sync.
 */
export function partyIsNamed(p: unknown): boolean {
  if (!isRecord(p)) return false;
  return !!(str(p.fullName) || str(p.companyName) || str(p.entityName));
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

  // Task 12 (owner's 16 August technical report, pending-decision 2): draft
  // mode's order is drafted by a human admin from the two named parties —
  // an order with a blank party name is not fulfillable, the same rationale
  // as MIN_CONTRACT_DESC below. Review mode never collects party1Data/
  // party2Data (buildReviewIntake() never sets `parties`), so this is
  // draft-mode-only. useContractsState.ts's canProceed() gates the wizard's
  // "parties" step on the identical condition so the client is stopped at
  // the form, not here at submit.
  if (mode === "draft" && !(partyIsNamed(partiesRaw?.one) && partyIsNamed(partiesRaw?.two))) {
    errors.push("يجب إدخال اسم الطرف الأول والطرف الثاني قبل إرسال طلب الصياغة — تحقق من الأطراف");
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
  const courtType = str(input.courtType);
  const customLanguageName = str(input.customLanguageName);
  const customLanguageLayoutRaw = str(input.customLanguageLayout);
  const customLanguageLayout =
    customLanguageLayoutRaw === "single" || customLanguageLayoutRaw === "dual" ? customLanguageLayoutRaw : undefined;
  const customLanguageBaseRaw = str(input.customLanguageBase);
  const customLanguageBase =
    customLanguageBaseRaw === "ar" || customLanguageBaseRaw === "en" ? customLanguageBaseRaw : undefined;

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      service: "contracts",
      mode: mode as "draft" | "review",
      ...(complexity ? { complexity: complexity as "simple" | "detailed" } : {}),
      ...(contractType ? { contractType } : {}),
      ...(language ? { language } : {}),
      ...(customLanguageName ? { customLanguageName } : {}),
      ...(customLanguageLayout ? { customLanguageLayout } : {}),
      ...(customLanguageBase ? { customLanguageBase } : {}),
      ...(partiesRaw ? { parties: { one: partiesRaw.one, two: partiesRaw.two } } : {}),
      ...(contractDesc ? { contractDesc } : {}),
      ...(courtType ? { courtType } : {}),
      ...(selectedClauses ? { selectedClauses } : {}),
      ...(additionalClauses ? { additionalClauses } : {}),
      ...(representing ? { representing } : {}),
      ...(concerns ? { concerns } : {}),
      ...(otherParty ? { otherParty } : {}),
      attachments,
    },
  };
}
