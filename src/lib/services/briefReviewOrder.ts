/**
 * briefReviewOrder.ts — «مراجعة وتدقيق مذكرة» as a real team order.
 *
 * Owner decision (registry Q77, answered 28 Sep): the memo review comes back
 * as a service the TEAM performs, placed in the same order queue as the four
 * wizard services — not an automatic analysis. The page it replaced
 * (/ai/brief-check) waited 2.8 s and then showed the same five hard-coded
 * "findings" for whatever file was dropped on it.
 *
 * The client uploads the memo, names the client's capacity (صفة الموكل), and
 * picks what they want back: a report on the memo's gaps, or a full revision.
 * This module turns those answers into the POST /api/v1/service-requests body.
 *
 * WHY NOT createServiceOrder(): that wrapper takes a closed `ServiceKey`
 * (orderIntake.ts) and maps it to a type through SERVICE_TYPE_BY_KEY; adding
 * a fifth key there means editing orderIntake.ts, which this change does not
 * own. The body below is the same shape createServiceOrder() sends
 * (serviceOrders.ts:82-98) — receiver `ai_workspace`, status
 * `pending_assignment`, payment `{0, not_required}`, `metadata.service` /
 * `serviceTitleAr` / `schemaVersion` / `intake` / `attachments` — so the admin
 * queue, the order page, the fulfilment brief (orderPrompt.ts) and the
 * attachment binding in the route all treat it exactly like the other four.
 *
 * `type` is `ai_draft`: an existing value of the DB CHECK
 * (20260814_service_orders_types.sql), so no migration. What tells a brief
 * review apart from a drafting order is `metadata.service === "brief_review"`
 * — see isBriefReviewOrder() below, which every type-keyed label map must ask
 * first, or the order reads «صياغة مذكرة».
 *
 * INTAKE VALUES ARE STORED IN ARABIC, not as machine ids. The order page and
 * the admin brief render intake through intakeValues.ts, whose value
 * dictionary only knows `clientRole:plaintiff` / `clientRole:defendant`; a new
 * id such as "appellant" would reach both screens in English. Arabic values
 * pass through valueLabelAr() unchanged (its miss-fallback), the same way the
 * corporate AddCaseModal intake does. The keys `clientRole`, `courtType`,
 * `caseType` and `notes` already carry Arabic labels there; `reviewScope` is
 * the one key that needs a label added («المطلوب»).
 *
 * Pure: no I/O, no clock, no React — `node --test` loads it directly.
 */

import { documentIdStr, isRecord, str, type OrderAttachment } from "./orderIntake.ts";

export const BRIEF_REVIEW_SERVICE = "brief_review" as const;
export const BRIEF_REVIEW_TITLE_AR = "مراجعة وتدقيق مذكرة";
/** The short form for badges and list chips (admin queue, request lists). */
export const BRIEF_REVIEW_SHORT_LABEL_AR = "مراجعة مذكرة";
export const BRIEF_REVIEW_SOURCE_PATH = "/ai/brief-check";
/** An existing `service_requests_type_check` value — see the header. */
export const BRIEF_REVIEW_ORDER_TYPE = "ai_draft" as const;

// ─── Picker vocabularies ─────────────────────────────────────────────────────

export type BriefClientRoleId = "plaintiff" | "defendant" | "appellant" | "appellee" | "other";

export const BRIEF_CLIENT_ROLES: readonly { id: BriefClientRoleId; label: string }[] = [
  { id: "plaintiff", label: "مدعٍ" },
  { id: "defendant", label: "مدعى عليه" },
  { id: "appellant", label: "مستأنِف" },
  { id: "appellee", label: "مستأنَف ضده" },
  { id: "other", label: "أخرى" },
];

export type BriefReviewScopeId = "gaps_report" | "full_revision";

/**
 * `short` is the order TITLE. It deliberately leaves out the service name:
 * the admin brief's heading is `# ${serviceTitleAr} — ${title}`
 * (orderPrompt.ts) and the order page prints serviceTitleAr under the title,
 * so repeating «مراجعة وتدقيق مذكرة» in the title printed it twice — the
 * other wizards' titles omit it for the same reason.
 */
export const BRIEF_REVIEW_SCOPES: readonly { id: BriefReviewScopeId; label: string; short: string }[] = [
  {
    id: "gaps_report",
    label: "تقرير بالثغرات في الأسانيد والتسلسل والدفوع والطلبات والوقائع",
    short: "تقرير بثغرات المذكرة",
  },
  {
    id: "full_revision",
    label: "مراجعة المذكرة وتنقيحها كاملة",
    short: "تنقيح المذكرة كاملة",
  },
];

// ─── Limits ──────────────────────────────────────────────────────────────────

export const MAX_ROLE_OTHER_LENGTH = 100;
export const MAX_COURT_LENGTH = 150;
export const MAX_CASE_TYPE_LENGTH = 150;
export const MAX_NOTES_LENGTH = 2000;

/**
 * The memo must be a document the team can read and edit. The platform-wide
 * rule (fileValidation.ts) also admits images; a photographed memo cannot be
 * "revised in full", so this narrower rule applies on top of it.
 */
export const MEMO_FILE_EXTENSIONS = ["pdf", "doc", "docx"] as const;
export const MEMO_FILE_ACCEPT = ".pdf,.doc,.docx";

/** Arabic refusal for a file that is not PDF/Word, or null when it is. */
export function memoFileRejection(fileName: string): string | null {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  if (!(MEMO_FILE_EXTENSIONS as readonly string[]).includes(ext)) {
    return "المذكرة يجب أن تكون ملف PDF أو Word.";
  }
  return null;
}

// ─── Form → validated intake ─────────────────────────────────────────────────

/** Raw page state, exactly as the form holds it. */
export interface BriefReviewForm {
  /** The uploaded memo — an attachment that already exists server-side. */
  memo: OrderAttachment | null;
  clientRole: BriefClientRoleId | "";
  clientRoleOther: string;
  reviewScope: BriefReviewScopeId | "";
  courtType: string;
  caseType: string;
  notes: string;
}

/** What is stored at `metadata.intake`. Values are Arabic — see the header. */
export interface BriefReviewIntakeV1 {
  schemaVersion: 1;
  service: typeof BRIEF_REVIEW_SERVICE;
  clientRole: string;
  reviewScope: string;
  courtType?: string;
  caseType?: string;
  notes?: string;
}

export interface BriefReviewValidated {
  intake: BriefReviewIntakeV1;
  memo: OrderAttachment;
  scopeId: BriefReviewScopeId;
}

export type BriefReviewCheck =
  | { ok: true; value: BriefReviewValidated }
  | { ok: false; errors: string[] };

function roleLabel(id: string): string | null {
  return BRIEF_CLIENT_ROLES.find((r) => r.id === id)?.label ?? null;
}

function scopeOf(id: string) {
  return BRIEF_REVIEW_SCOPES.find((s) => s.id === id) ?? null;
}

export function validateBriefReviewForm(form: BriefReviewForm): BriefReviewCheck {
  const errors: string[] = [];

  // ── memo: required, and a real attachment id ────────────────────────────
  let memo: OrderAttachment | null = null;
  if (!form.memo || !isRecord(form.memo)) {
    errors.push("ارفع المذكرة المراد مراجعتها");
  } else {
    const documentId = documentIdStr(form.memo.documentId);
    if (!documentId) {
      errors.push("ملف المذكرة لم يُرفع بعد — أعد رفعه");
    } else {
      const name = str(form.memo.name) || "المذكرة";
      const rejection = memoFileRejection(name);
      if (rejection) errors.push(rejection);
      memo = {
        documentId,
        name,
        size: typeof form.memo.size === "number" && form.memo.size >= 0 ? form.memo.size : 0,
      };
    }
  }

  // ── clientRole: one of five; «أخرى» needs its own words ─────────────────
  let clientRole = "";
  const role = roleLabel(form.clientRole);
  if (!role) {
    errors.push("حدّد صفة الموكل");
  } else if (form.clientRole === "other") {
    const other = str(form.clientRoleOther);
    if (!other) errors.push("اكتب صفة الموكل");
    else if (other.length > MAX_ROLE_OTHER_LENGTH) {
      errors.push(`صفة الموكل طويلة جداً — الحد ${MAX_ROLE_OTHER_LENGTH} حرفاً`);
    } else clientRole = `${role} — ${other}`;
  } else {
    clientRole = role;
  }

  // ── reviewScope: required ───────────────────────────────────────────────
  const scope = scopeOf(form.reviewScope);
  if (!scope) errors.push("اختر المطلوب: تقرير بالثغرات أو تنقيح كامل");

  // ── optional free text ──────────────────────────────────────────────────
  const courtType = str(form.courtType);
  if (courtType.length > MAX_COURT_LENGTH) {
    errors.push(`اسم المحكمة طويل جداً — الحد ${MAX_COURT_LENGTH} حرفاً`);
  }
  const caseType = str(form.caseType);
  if (caseType.length > MAX_CASE_TYPE_LENGTH) {
    errors.push(`نوع القضية طويل جداً — الحد ${MAX_CASE_TYPE_LENGTH} حرفاً`);
  }
  const notes = str(form.notes);
  if (notes.length > MAX_NOTES_LENGTH) {
    errors.push(`الملاحظات طويلة جداً — الحد ${MAX_NOTES_LENGTH} حرفاً`);
  }

  if (errors.length > 0 || !memo || !scope) {
    return { ok: false, errors: errors.length > 0 ? errors : ["بيانات الطلب غير مكتملة"] };
  }

  // Key order is display order: buildSummaryRows() walks the object as stored.
  const intake: BriefReviewIntakeV1 = {
    schemaVersion: 1,
    service: BRIEF_REVIEW_SERVICE,
    clientRole,
    reviewScope: scope.label,
    ...(courtType ? { courtType } : {}),
    ...(caseType ? { caseType } : {}),
    ...(notes ? { notes } : {}),
  };

  return { ok: true, value: { intake, memo, scopeId: scope.id } };
}

// ─── Validated intake → POST body ────────────────────────────────────────────

export interface BriefReviewRequester {
  name?: string;
  phone?: string;
  email?: string;
}

/**
 * The order's `description` — a readable Arabic summary, because it is what
 * the client's request list shows under «مقتطف من طلبك كما أرسلته» and what
 * «تعديل تفاصيل الطلب» opens for editing. The structured copy stays in
 * `metadata.intake`.
 */
export function briefReviewDescription(intake: BriefReviewIntakeV1): string {
  const lines = [
    `المطلوب: ${intake.reviewScope}`,
    `صفة الموكل: ${intake.clientRole}`,
  ];
  if (intake.courtType) lines.push(`المحكمة / الجهة: ${intake.courtType}`);
  if (intake.caseType) lines.push(`نوع القضية: ${intake.caseType}`);
  if (intake.notes) lines.push(`ملاحظات: ${intake.notes}`);
  return lines.join("\n");
}

export function buildBriefReviewOrderBody(
  value: BriefReviewValidated,
  requester: BriefReviewRequester,
) {
  const scope = scopeOf(value.scopeId);
  // Only defined keys: `requester` lands in a jsonb column verbatim.
  const cleanRequester: BriefReviewRequester = {};
  if (requester.name) cleanRequester.name = requester.name;
  if (requester.phone) cleanRequester.phone = requester.phone;
  if (requester.email) cleanRequester.email = requester.email;

  const base = scope ? scope.short : BRIEF_REVIEW_TITLE_AR;
  return {
    // ≤ 20 + 3 + MAX_CASE_TYPE_LENGTH characters — inside the route's 200.
    title: value.intake.caseType ? `${base} — ${value.intake.caseType}` : base,
    description: briefReviewDescription(value.intake),
    type: BRIEF_REVIEW_ORDER_TYPE,
    receiver: "ai_workspace" as const,
    status: "pending_assignment" as const,
    sourcePath: BRIEF_REVIEW_SOURCE_PATH,
    payment: { amount: 0, status: "not_required" as const },
    requester: cleanRequester,
    metadata: {
      service: BRIEF_REVIEW_SERVICE,
      serviceTitleAr: BRIEF_REVIEW_TITLE_AR,
      schemaVersion: 1 as const,
      intake: value.intake,
      // The route binds these documentIds to the new order server-side
      // (service-requests/route.ts, "Task 9b"), and the admin queue, the order
      // page and the fulfilment brief all list files from this array.
      attachments: [value.memo],
    },
  };
}

// ─── Reading an order back ───────────────────────────────────────────────────

/** True when an order's metadata says it is a memo review. */
export function isBriefReviewOrder(metadata: unknown): boolean {
  return isRecord(metadata) && metadata.service === BRIEF_REVIEW_SERVICE;
}

/**
 * Arabic copy for a failed submit. The route answers every refusal it owns in
 * Arabic (shape check, intake guard, entity scope); 401 is the English word
 * "Unauthorized" and a database failure is a raw Postgres message — neither
 * may reach the screen.
 */
export function briefReviewSubmitErrorAr(raw: string): string {
  if (raw === "Unauthorized") {
    return "انتهت جلستك — يرجى تسجيل الدخول مجدداً ثم إعادة المحاولة.";
  }
  if (/[؀-ۿ]/.test(raw)) return raw;
  return "تعذّر إرسال الطلب — حاول مجدداً";
}

// ─── Server-side check (review of 2026-09-29) ───────────────────────────────

/**
 * The POST route stores `metadata` as sent, and intakeGuard lets an unknown
 * `metadata.service` through — so without this a direct POST could create a
 * memo review with no memo and no scope, an order the team cannot work.
 * intakeGuard.checkOrderIntake calls this for every request that names
 * `brief_review`, in `metadata.service` or in `metadata.intake.service`.
 * It re-checks what buildBriefReviewOrderBody writes: the client's capacity,
 * one of the two scopes (stored as its Arabic label), and ≥ 1 attached file.
 */
export function validateBriefReviewMetadata(metadata: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(metadata)) return ["بيانات طلب المراجعة غير صالحة"];
  const intake = metadata.intake;
  if (!isRecord(intake) || intake.service !== BRIEF_REVIEW_SERVICE) {
    return ["بيانات طلب المراجعة غير مكتملة"];
  }
  const role = str(intake.clientRole);
  if (!role) errors.push("اختر صفة الموكل");
  else if (role.length > MAX_ROLE_OTHER_LENGTH + 20) errors.push("صفة الموكل طويلة جداً");
  const scope = str(intake.reviewScope);
  if (!BRIEF_REVIEW_SCOPES.some((s) => s.label === scope)) errors.push("اختر المطلوب: تقرير بالثغرات أو تنقيح كامل");
  const files = Array.isArray(metadata.attachments) ? metadata.attachments : [];
  if (!files.some((f) => isRecord(f) && documentIdStr(f.documentId) !== "")) {
    errors.push("ارفع المذكرة المراد مراجعتها");
  }
  return errors;
}
