/**
 * orderIntake.wargaming.ts — pure intake contract for المحاكي الشامل orders.
 *
 * Sibling of orderIntake.ts (draft). Pure: no I/O, no clock, no Supabase —
 * unit-testable with `node --test`. Reuses isRecord/str/collectAttachments
 * from orderIntake.ts rather than re-declaring them.
 */

import { isRecord, str, collectAttachments, documentIdStr, type OrderAttachment, type ValidationResult } from "./orderIntake.ts";

/**
 * The wargaming wizard's "نقض المذكرة" (critique-the-memo) target id, from
 * the `SimTarget` union in src/app/ai/wargaming/page.tsx. When this target
 * is selected, the wizard needs the memo's own text to critique — so
 * `memoText` becomes required. Exported so Task C1 imports this instead of
 * hardcoding the string "critique".
 */
export const WARGAMING_CRITIQUE_TARGET = "critique";

/**
 * The «أخرى» tile of the wizard's specialty picker (owner test 28-9, T28-32).
 * The picker offers the platform's 31 sections (LEGAL_TAXONOMY, stored as
 * their SA-xx ids) plus this one; choosing it makes `areaOther` — the client's
 * own wording for the specialty — required. `area` itself stays a free string
 * here: orders placed before the switch carry the old eight ids ("labor",
 * "commercial", …) and must keep validating on the server.
 */
export const WARGAMING_AREA_OTHER = "other";
export const MAX_AREA_OTHER_LENGTH = 120;

const MIN_CASE_SUMMARY = 20;

export interface WargamingIntakeV1 {
  schemaVersion: 1;
  service: "wargaming";
  role: "plaintiff" | "defendant" | "advisor";
  area: string;
  /** Present only when area === "other": the specialty as the client typed it. */
  areaOther?: string;
  caseSummary: string;
  targets: string[];
  memoText?: string;
  // documentIds (from `attachments`) that the client tagged specifically as
  // the memo being critiqued — a strict subset of `attachments`, never all
  // of it. Distinct from "the order has at least one attachment": a case
  // file uploaded for an unrelated reason must not satisfy the critique
  // requirement just because *something* was attached.
  memoAttachmentIds?: string[];
  attachments: OrderAttachment[];
}

export function validateWargamingIntake(input: unknown): ValidationResult<WargamingIntakeV1> {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ["البيانات المرسلة غير صالحة"] };
  }

  const service = str(input.service);
  if (service !== "wargaming") {
    errors.push("نوع الخدمة غير صحيح");
  }

  const role = str(input.role);
  if (role !== "plaintiff" && role !== "defendant" && role !== "advisor") {
    errors.push("صفة الموكل غير محددة");
  }

  const area = str(input.area);
  // Read only for «أخرى»: a stale areaOther left behind after the client
  // switched to a listed section must not ride along in the order.
  const areaOther = area === WARGAMING_AREA_OTHER ? str(input.areaOther) : "";
  if (!area) {
    errors.push("تخصص القضية مطلوب");
  } else if (area === WARGAMING_AREA_OTHER && !areaOther) {
    errors.push("اكتب تخصص القضية عند اختيار «أخرى»");
  } else if (areaOther.length > MAX_AREA_OTHER_LENGTH) {
    errors.push(`وصف التخصص طويل جداً — الحد الأقصى ${MAX_AREA_OTHER_LENGTH} حرفاً`);
  }

  const caseSummary = str(input.caseSummary);
  if (caseSummary.length < MIN_CASE_SUMMARY) {
    errors.push(`ملخص القضية قصير جداً — الحد الأدنى ${MIN_CASE_SUMMARY} حرفاً`);
  }

  // targets is deliberately a plain string array, not a closed enum — the
  // wizard's own target ids are Task C1's concern, not this validator's.
  const targetsRaw = Array.isArray(input.targets) ? input.targets : [];
  const targets = targetsRaw.map((t) => str(t)).filter(Boolean);
  if (targets.length === 0) {
    errors.push("يجب اختيار هدف واحد على الأقل للمحاكاة");
  }

  const memoText = str(input.memoText);
  // memoAttachmentIds must be tagged specifically as the memo — NOT "any
  // attachment on the order". An earlier version of this validator accepted
  // attachments.length > 0, which let an unrelated case file uploaded in
  // step 1 silently satisfy "the client supplied the memo": the admin would
  // receive an order asking for a memo critique with no memo anywhere in
  // it. Coerce with documentIdStr, not `typeof v === "string"` — a
  // Postgres bigserial documentId arrives here as a JSON number.
  const memoAttachmentIdsRaw = Array.isArray(input.memoAttachmentIds) ? input.memoAttachmentIds : [];
  const memoAttachmentIds = memoAttachmentIdsRaw.map((v) => documentIdStr(v)).filter(Boolean);
  const attachments = collectAttachments(input.attachments, errors);
  // The client supplies the memo being critiqued either as pasted text or as
  // an uploaded file tagged as the memo (owners field-tested the text-only
  // textarea and found clients hold the memo as a PDF, not text they can
  // paste) — so either satisfies the requirement. A file that was removed
  // (dropped from memoAttachmentIds by the caller) no longer counts, even if
  // it is still present elsewhere in `attachments`.
  if (targets.includes(WARGAMING_CRITIQUE_TARGET) && !memoText && memoAttachmentIds.length === 0) {
    errors.push("المذكرة المراد نقضها غير موجودة — أدخل نصها أو أرفق ملفها");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      service: "wargaming",
      role: role as "plaintiff" | "defendant" | "advisor",
      area,
      ...(areaOther ? { areaOther } : {}),
      caseSummary,
      targets,
      ...(memoText ? { memoText } : {}),
      ...(memoAttachmentIds.length > 0 ? { memoAttachmentIds } : {}),
      attachments,
    },
  };
}
