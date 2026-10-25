/**
 * notesInput.ts — the request rules and the row → DTO mapping of the sticky
 * notes wall (N3.4, owner §٤٧ part ٣; table public.dashboard_notes,
 * migration 20261025_31_dashboard_notes.sql).
 *
 * Pure (no imports at all), so `node --test` loads it directly and the route
 * and the screen share one vocabulary: the five colours, the three scopes and
 * the 2000-character limit the table's CHECKs enforce.
 */

export const NOTE_COLORS = ["amber", "emerald", "sky", "rose", "violet"] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

/** Owner §٤٧ ٣: «أصفر كهرماني، زمردي، أزرق سماوي، وردي، بنفسجي». */
export const NOTE_COLOR_LABEL_AR: Record<NoteColor, string> = {
  amber: "كهرماني",
  emerald: "زمردي",
  sky: "سماوي",
  rose: "وردي",
  violet: "بنفسجي",
};

/** The case_notes vocabulary of owner decision ١٦٩. */
export const NOTE_VISIBILITIES = ["private", "case_team", "firm"] as const;
export type NoteVisibility = (typeof NOTE_VISIBILITIES)[number];

export const NOTE_VISIBILITY_LABEL_AR: Record<NoteVisibility, string> = {
  private: "خاصة بي فقط",
  case_team: "فريق القضية",
  firm: "كامل المكتب",
};

export const MAX_NOTE_BODY = 2000;
/** The wall shows at most this many notes (pinned first, then the latest). */
export const NOTES_PAGE_LIMIT = 200;

/** `service_requests.id` is text; anything longer than this is not one of ours. */
const MAX_CASE_ID = 200;

export interface NoteCreateInput {
  body: string;
  color: NoteColor;
  pinned: boolean;
  visibility: NoteVisibility;
  caseRequestId: string | null;
}

export type NotePatchInput = Partial<NoteCreateInput>;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function parseBody(v: unknown): Parsed<string> {
  const body = typeof v === "string" ? v.trim() : "";
  if (!body) return { ok: false, error: "نص الملاحظة مطلوب." };
  if (body.length > MAX_NOTE_BODY) return { ok: false, error: `الملاحظة يجب ألا تتجاوز ${MAX_NOTE_BODY} حرف.` };
  return { ok: true, value: body };
}

function parseColor(v: unknown): Parsed<NoteColor> {
  return typeof v === "string" && (NOTE_COLORS as readonly string[]).includes(v)
    ? { ok: true, value: v as NoteColor }
    : { ok: false, error: "لون الملاحظة غير معروف." };
}

function parseVisibility(v: unknown): Parsed<NoteVisibility> {
  return typeof v === "string" && (NOTE_VISIBILITIES as readonly string[]).includes(v)
    ? { ok: true, value: v as NoteVisibility }
    : { ok: false, error: "نطاق الملاحظة يجب أن يكون: خاصة بك، أو لفريق القضية، أو لكل المكتب." };
}

function parseCaseId(v: unknown): Parsed<string | null> {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  if (typeof v !== "string" || v.trim().length === 0 || v.length > MAX_CASE_ID) {
    return { ok: false, error: "معرّف القضية غير صالح." };
  }
  return { ok: true, value: v.trim() };
}

/** POST body. Defaults: amber, not pinned, private, no case. */
export function parseNoteCreate(raw: unknown): Parsed<NoteCreateInput> {
  const r = isRecord(raw) ? raw : {};
  const body = parseBody(r.body);
  if (!body.ok) return body;
  const color = r.color === undefined ? ({ ok: true, value: "amber" } as const) : parseColor(r.color);
  if (!color.ok) return color;
  const visibility = r.visibility === undefined ? ({ ok: true, value: "private" } as const) : parseVisibility(r.visibility);
  if (!visibility.ok) return visibility;
  const caseId = parseCaseId(r.caseRequestId);
  if (!caseId.ok) return caseId;
  if (visibility.value === "case_team" && !caseId.value) {
    return { ok: false, error: "ملاحظة فريق القضية تحتاج قضية مرتبطة." };
  }
  return {
    ok: true,
    value: {
      body: body.value,
      color: color.value,
      pinned: r.pinned === true,
      visibility: visibility.value,
      caseRequestId: caseId.value,
    },
  };
}

/** PATCH body: only the fields present are validated and returned. */
export function parseNotePatch(raw: unknown): Parsed<NotePatchInput> {
  if (!isRecord(raw)) return { ok: false, error: "لا شيء لتعديله." };
  const out: NotePatchInput = {};
  if ("body" in raw) {
    const p = parseBody(raw.body);
    if (!p.ok) return p;
    out.body = p.value;
  }
  if ("color" in raw) {
    const p = parseColor(raw.color);
    if (!p.ok) return p;
    out.color = p.value;
  }
  if ("pinned" in raw) {
    if (typeof raw.pinned !== "boolean") return { ok: false, error: "قيمة التثبيت غير صالحة." };
    out.pinned = raw.pinned;
  }
  if ("visibility" in raw) {
    const p = parseVisibility(raw.visibility);
    if (!p.ok) return p;
    out.visibility = p.value;
  }
  if ("caseRequestId" in raw) {
    const p = parseCaseId(raw.caseRequestId);
    if (!p.ok) return p;
    out.caseRequestId = p.value;
  }
  if (Object.keys(out).length === 0) return { ok: false, error: "لا شيء لتعديله." };
  return { ok: true, value: out };
}

/**
 * The firm a `firm` note with NO case is shared with: the caller's one active
 * firm. With two or more active firms the choice would be a guess (the trap
 * cases/[id]/notes/_resolveFirmVisibility.ts documents), so it is refused and
 * the lawyer is asked to link the note to a case, whose firm then decides.
 */
export function firmForCaselessNote(activeFirmIds: readonly string[]): { firmId: string } | { error: string } {
  const unique = [...new Set(activeFirmIds.filter(Boolean))];
  if (unique.length === 1) return { firmId: unique[0] };
  if (unique.length === 0) return { error: "لا يمكن مشاركة الملاحظة مع المكتب لأنك غير مرتبط بمكتب نشط." };
  return { error: "أنت عضو في أكثر من مكتب: اربط الملاحظة بقضية ليُعرف المكتب الذي تُشارك معه." };
}

export interface DashboardNoteRow {
  id: string;
  author_user_id: string;
  firm_id: string | null;
  case_request_id: string | null;
  body: string;
  color: string;
  pinned: boolean;
  visibility: string;
  created_at: string;
  updated_at: string;
  service_requests?: { title: string | null } | { title: string | null }[] | null;
}

export const DASHBOARD_NOTE_SELECT =
  "id, author_user_id, firm_id, case_request_id, body, color, pinned, visibility, created_at, updated_at, service_requests(title)";

export interface DashboardNoteDto {
  id: string;
  body: string;
  color: NoteColor;
  pinned: boolean;
  visibility: NoteVisibility;
  caseRequestId: string | null;
  /** The linked case's title when the reader may read the case; null otherwise. */
  caseTitle: string | null;
  /** true when the signed-in user wrote it — the only case the wall offers edit, pin and delete. */
  mine: boolean;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export function toDashboardNoteDto(row: DashboardNoteRow, uid: string, authorName: string | null): DashboardNoteDto {
  const embed = Array.isArray(row.service_requests) ? row.service_requests[0] ?? null : row.service_requests ?? null;
  const mine = row.author_user_id === uid;
  return {
    id: row.id,
    body: row.body,
    color: (NOTE_COLORS as readonly string[]).includes(row.color) ? (row.color as NoteColor) : "amber",
    pinned: row.pinned === true,
    visibility: (NOTE_VISIBILITIES as readonly string[]).includes(row.visibility) ? (row.visibility as NoteVisibility) : "private",
    caseRequestId: row.case_request_id,
    caseTitle: embed?.title?.trim() ? embed.title.trim() : null,
    mine,
    authorName: authorName ?? (mine ? "أنت" : "زميل"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Pinned first, then the most recently edited — the order the API already returns, kept for optimistic updates. */
export function sortNotes<T extends { pinned: boolean; updatedAt: string }>(notes: readonly T[]): T[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/** Postgres error → HTTP status + Arabic message. 23514 CHECK · 23503 FK · 42501 RLS / privilege. */
export function noteDbError(error: { code?: string } | null | undefined): { status: number; message: string } {
  const code = error?.code;
  if (code === "23514") return { status: 400, message: "الملاحظة غير صالحة — تحقق من طولها ولونها ونطاقها." };
  if (code === "23503") return { status: 400, message: "القضية المشار إليها غير موجودة." };
  if (code === "42501") return { status: 403, message: "لا يمكنك ربط الملاحظة بهذه القضية أو مشاركتها بهذا النطاق." };
  return { status: 500, message: "تعذّر حفظ الملاحظة." };
}
