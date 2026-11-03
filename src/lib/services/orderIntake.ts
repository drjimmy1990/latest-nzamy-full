/**
 * orderIntake.ts — pure intake contract for AI service orders.
 *
 * service_requests.metadata is untyped jsonb, so this module is the single
 * validation boundary before a wizard payload is persisted. Pure: no I/O, no
 * clock, no Supabase — unit-testable with `node --test`.
 */

import type { PartyData } from "@/components/draft/draftConstants";
// Relative `.ts`: `node --test` resolves neither the alias nor a bare path.
import { strictNationalId } from "./clientIdentityRules.ts";
import { COMMITTEE_BRANCH_IDS } from "../../components/draft/draftConstants.ts";

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

// ─── A party's legal representative (owner package §3.5-3b) ──────────────────
// Both PartyForms (the drafter's DraftPartyForm and contracts' PartyForm) and
// both intakes (draft here, contracts in orderIntake.contracts.ts) share these,
// and the contracts AI run sends what partyRepresentativeRole() returns.

/** The «أخرى» choice of «صفة الممثل»; what it means is typed in representativeRoleOther. */
export const PARTY_ROLE_OTHER = "أخرى";

/** The representative's capacity as the user meant it: the typed text when «أخرى» was picked. */
export function partyRepresentativeRole(p: unknown): string {
  if (!isRecord(p)) return "";
  const role = str(p.representativeRole);
  return role === PARTY_ROLE_OTHER ? str(p.representativeRoleOther) : role;
}

export const REPRESENTATIVE_ID_ERROR = "رقم هوية الممثل أو إقامته عشرة أرقام تبدأ بـ ١ أو ٢";

/**
 * The representative's national ID / iqama number is optional; when typed it
 * is exactly 10 digits starting with 1 or 2 (clientIdentityRules
 * .strictNationalId: Arabic-Indic digits accepted, surrounding spaces trimmed,
 * any other character refused).
 */
export function representativeIdValid(id: unknown): boolean {
  const typed = str(id);
  return !typed || strictNationalId(typed) !== null;
}

/**
 * A party's representative ID, checked only for a company: the only type whose
 * form shows the field (RepresentativeFields) and the only one the contracts
 * run sends it for. A bad ID typed before switching the party to فرد or جهة
 * would otherwise block the wizard with no field on screen to fix it. A party
 * that is not an object has none.
 */
export function representativeIdOk(p: unknown): boolean {
  if (!isRecord(p) || str(p.type) !== "company") return true;
  return representativeIdValid(p.representativeId);
}

/** Which party forms a wizard shows, so only those are checked and sent. */
export interface PartiesShown { one: boolean; two: boolean }

const BOTH_SHOWN: PartiesShown = { one: true, two: true };

/**
 * The drafter's party forms, as StepCase renders them: both only for
 * «تحرير دعوى» (memoType "case"), and party two not on a committee branch
 * (fixed to هيئة الزكاة والضريبة والجمارك there). Values left in a form the
 * user can no longer see must neither block the wizard nor reach the order.
 */
export function draftPartiesShown(memoType: unknown, legalBranch: unknown): PartiesShown {
  const isCase = str(memoType) === "case";
  return { one: isCase, two: isCase && !COMMITTEE_BRANCH_IDS.has(str(legalBranch)) };
}

/** One error per shown party whose representative ID is malformed. */
export function representativeIdErrors(parties: { one?: unknown; two?: unknown } | null, shown: PartiesShown = BOTH_SHOWN): string[] {
  if (!parties) return [];
  const errors: string[] = [];
  if (shown.one && !representativeIdOk(parties.one)) errors.push(`${REPRESENTATIVE_ID_ERROR} (الطرف الأول)`);
  if (shown.two && !representativeIdOk(parties.two)) errors.push(`${REPRESENTATIVE_ID_ERROR} (الطرف الثاني)`);
  return errors;
}

const REPRESENTATIVE_FIELDS = ["representativeId", "representativeRole", "representativeRoleOther"] as const;

/**
 * A party as the order keeps it (call only after representativeIdErrors passed
 * for it). The representative fields stay only on a shown company party, and
 * there only what the form means now: the ID as 10 ASCII digits,
 * representativeRoleOther only while the capacity is «أخرى». A party hidden by
 * the wizard, or switched to فرد / جهة, loses all three, so the order view
 * never shows a stale value under its label. Everything else passes as before.
 */
export function partyForIntake(p: unknown, shown = true): unknown {
  if (!isRecord(p)) return p;
  const out: Record<string, unknown> = { ...p };
  for (const key of REPRESENTATIVE_FIELDS) delete out[key];
  if (!shown || str(p.type) !== "company") return out;
  if (p.representativeRole !== undefined) out.representativeRole = p.representativeRole;
  if (str(p.representativeRole) === PARTY_ROLE_OTHER && p.representativeRoleOther !== undefined) {
    out.representativeRoleOther = p.representativeRoleOther;
  }
  const id = str(p.representativeId);
  if (id) out.representativeId = strictNationalId(id) ?? id;
  return out;
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
  // Only the party forms StepCase shows for this memo type and branch.
  const shown = draftPartiesShown(memoType, legalBranch);
  errors.push(...representativeIdErrors(partiesRaw, shown));

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
        one: partyForIntake(partiesRaw!.one, shown.one) as Partial<PartyData>,
        two: partyForIntake(partiesRaw!.two, shown.two) as Partial<PartyData>,
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
