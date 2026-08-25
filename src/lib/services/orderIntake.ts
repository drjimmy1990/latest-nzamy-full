/**
 * orderIntake.ts — pure intake contract for AI service orders.
 *
 * service_requests.metadata is untyped jsonb, so this module is the single
 * validation boundary before a wizard payload is persisted. Pure: no I/O, no
 * clock, no Supabase — unit-testable with `node --test`.
 */

import type { PartyData } from "@/components/draft/draftConstants";

export type ServiceKey = "draft" | "contracts" | "wargaming" | "legal_opinion";

export const SERVICE_TYPE_BY_KEY: Record<ServiceKey, string> = {
  draft: "ai_draft",
  contracts: "ai_contracts",
  wargaming: "ai_wargaming",
  legal_opinion: "ai_legal_opinion",
};

export const SERVICE_TITLE_AR: Record<ServiceKey, string> = {
  draft: "الصائغ القانوني",
  contracts: "محترف العقود",
  wargaming: "المحاكي الشامل",
  legal_opinion: "الرأي الفصل",
};

export interface OrderAttachment {
  documentId: string;
  name: string;
  size: number;
}

export interface DraftIntakeV1 {
  schemaVersion: 1;
  service: "draft";
  clientRole: "plaintiff" | "defendant";
  memoType: string;
  memoSubType?: string;
  legalBranch: string;
  caseText: string;
  parties: { one: Partial<PartyData>; two: Partial<PartyData> };
  judgment?: {
    number?: string; court?: string; date?: string;
    text?: string; reasons?: string;
  };
  lawyerNotes?: string;
  attachments: OrderAttachment[];
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const MIN_CASE_TEXT = 30;

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * documentId comes from Postgres's `attachments.id` (bigserial). PostgREST
 * serialises int8 as a JSON number, not a string, and `POST /api/v1/documents`
 * returns that value uncast (see `uploadDocumentFile` -> `doc.id`, consumed by
 * `attachFile()` in useDraftState.ts) — so a well-formed attachment's
 * documentId arrives here as a runtime `number` despite OrderAttachment's
 * `string` type. `str()` above returns "" for a number, which made this
 * loop reject every real attachment. Accept both and coerce — the same fix
 * already applied in service-requests/route.ts's documentIds filter and the
 * admin queue's render filter (page.tsx). Exported so sibling intake
 * validators (e.g. orderIntake.wargaming.ts's memoAttachmentIds) reuse this
 * exact coercion instead of re-deriving it with a `typeof v === "string"`
 * check that would silently reject every numeric id.
 */
export function documentIdStr(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/**
 * Shared attachment-list validator for every AI service intake. Coerces
 * `documentId` with `documentIdStr` (see above — bigserial arrives as a JS
 * number), pushes one Arabic error per malformed entry into the caller's
 * `errors` accumulator, and returns only the well-formed attachments.
 * Exported so orderIntake.wargaming.ts / .contracts.ts / .legalOpinion.ts
 * reuse this loop instead of re-declaring it three times (and risking the
 * documentId coercion drifting out of sync between them).
 */
export function collectAttachments(rawAttachments: unknown, errors: string[]): OrderAttachment[] {
  const attachmentsRaw = Array.isArray(rawAttachments) ? rawAttachments : [];
  const attachments: OrderAttachment[] = [];
  attachmentsRaw.forEach((a, i) => {
    const documentId = isRecord(a) ? documentIdStr(a.documentId) : "";
    if (!isRecord(a) || !documentId) {
      errors.push(`المرفق رقم ${i + 1} غير صالح`);
      return;
    }
    attachments.push({
      documentId,
      name: str(a.name) || "مرفق",
      size: typeof a.size === "number" && a.size >= 0 ? a.size : 0,
    });
  });
  return attachments;
}

export function validateDraftIntake(input: unknown): ValidationResult<DraftIntakeV1> {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ["البيانات المرسلة غير صالحة"] };
  }

  const service = str(input.service);
  if (service !== "draft") {
    errors.push("نوع الخدمة غير صحيح");
  }

  const clientRole = str(input.clientRole);
  if (clientRole !== "plaintiff" && clientRole !== "defendant") {
    errors.push("صفة الموكل غير محددة");
  }

  const memoType = str(input.memoType);
  if (!memoType) errors.push("نوع المذكرة مطلوب");

  const legalBranch = str(input.legalBranch);
  if (!legalBranch) errors.push("الفرع القانوني مطلوب");

  const caseText = str(input.caseText);
  if (caseText.length < MIN_CASE_TEXT) {
    errors.push(`الوقائع قصيرة جداً — الحد الأدنى ${MIN_CASE_TEXT} حرفاً`);
  }

  const partiesRaw = isRecord(input.parties) ? input.parties : null;
  if (!partiesRaw || !isRecord(partiesRaw.one) || !isRecord(partiesRaw.two)) {
    errors.push("بيانات الأطراف غير مكتملة");
  }

  const attachments = collectAttachments(input.attachments, errors);

  if (errors.length > 0) return { ok: false, errors };

  const judgmentRaw = isRecord(input.judgment) ? input.judgment : null;

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      service: "draft",
      clientRole: clientRole as "plaintiff" | "defendant",
      memoType,
      ...(str(input.memoSubType) ? { memoSubType: str(input.memoSubType) } : {}),
      legalBranch,
      caseText,
      parties: {
        one: (partiesRaw!.one as Partial<PartyData>),
        two: (partiesRaw!.two as Partial<PartyData>),
      },
      ...(judgmentRaw
        ? {
            judgment: {
              number: str(judgmentRaw.number), court: str(judgmentRaw.court),
              date: str(judgmentRaw.date), text: str(judgmentRaw.text),
              reasons: str(judgmentRaw.reasons),
            },
          }
        : {}),
      ...(str(input.lawyerNotes) ? { lawyerNotes: str(input.lawyerNotes) } : {}),
      attachments,
    },
  };
}
