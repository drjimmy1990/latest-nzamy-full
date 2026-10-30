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
  /** Absent for the specialist modes, which have no plaintiff/defendant. */
  clientRole?: "plaintiff" | "defendant";
  memoType: string;
  memoSubType?: string;
  /** "" for the specialist modes. */
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

/**
 * The wizard's specialist modes (arbitration award, notarised deed, report,
 * minutes): no plaintiff/defendant and no legal branch — the wizard asks
 * only for the sub-type — so the order needs neither (plan, "fix the drafter
 * before L14": they could never submit).
 */
export const SPECIALIST_MEMO_TYPES: ReadonlySet<string> = new Set(["arbitration", "notary", "report", "minutes"]);

/**
 * A draft order for a pleading (a claim, a memo, a challenge) rather than a
 * specialist document — what a legal consultant may not order (Art. 18 of
 * نظام المحاماة; the service-requests POST refuses it).
 */
export function isPleadingDraftIntake(intake: unknown): boolean {
  return isRecord(intake) && str(intake.service) === "draft" && !SPECIALIST_MEMO_TYPES.has(str(intake.memoType));
}

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

  const memoType = str(input.memoType);
  if (!memoType) errors.push("نوع المذكرة مطلوب");
  const specialist = SPECIALIST_MEMO_TYPES.has(memoType);

  const role = str(input.clientRole);
  const clientRole = role === "plaintiff" || role === "defendant" ? role : null;
  if (!clientRole && !specialist) errors.push("صفة الموكل غير محددة");

  const legalBranch = str(input.legalBranch);
  if (!legalBranch && !specialist) errors.push("الفرع القانوني مطلوب");

  const partiesRaw = isRecord(input.parties) ? input.parties : null;
  if (!partiesRaw || !isRecord(partiesRaw.one) || !isRecord(partiesRaw.two)) {
    errors.push("بيانات الأطراف غير مكتملة");
  }

  const attachments = collectAttachments(input.attachments, errors);

  // The facts may be in the attached documents instead of typed (plan: a
  // file without typed facts used to fail MIN_CASE_TEXT).
  const caseText = str(input.caseText);
  if (caseText.length < MIN_CASE_TEXT && attachments.length === 0) {
    errors.push(`اكتب الوقائع (${MIN_CASE_TEXT} حرفاً على الأقل) أو أرفق مستنداتها`);
  }

  if (errors.length > 0) return { ok: false, errors };

  const judgmentRaw = isRecord(input.judgment) ? input.judgment : null;

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      service: "draft",
      ...(clientRole ? { clientRole } : {}),
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
