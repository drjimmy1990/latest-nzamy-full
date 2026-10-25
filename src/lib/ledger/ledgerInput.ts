/**
 * ledgerInput.ts — the request rules, filters and row → DTO mapping of the
 * legal outgoing / incoming register (N3.7, owner §٤٥ axis 1; table
 * public.legal_ledger_entries, migration 20261025_33_legal_ledger.sql).
 *
 * Pure (no imports), so `node --test` loads it directly; the routes, the
 * activity page's ledger tab, the case timeline and the quick-add modal share
 * one vocabulary with the table's CHECKs.
 */

export const LEDGER_DIRECTIONS = ["out", "in"] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

export const LEDGER_DIRECTION_LABEL_AR: Record<LedgerDirection, string> = {
  out: "صادر",
  in: "وارد",
};

/** Owner §٤٥ axis 1: «واتساب، بريد إلكتروني، تسليم يدوي، منصة ناجز، بريد مسجل». */
export const LEDGER_CHANNELS = ["whatsapp", "email", "hand", "najiz", "registered_mail"] as const;
export type LedgerChannel = (typeof LEDGER_CHANNELS)[number];

export const LEDGER_CHANNEL_LABEL_AR: Record<LedgerChannel, string> = {
  whatsapp: "واتساب",
  email: "بريد إلكتروني",
  hand: "تسليم يدوي",
  najiz: "منصة ناجز",
  registered_mail: "بريد مسجل",
};

export const MAX_LEDGER_TITLE = 300;
export const MAX_LEDGER_NOTES = 4000;
export const LEDGER_PAGE_SIZE = 50;
const MAX_CASE_ID = 200;
/** A record of something that happened: up to a day ahead absorbs clock and zone slop, no more. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;
const EARLIEST_MS = Date.UTC(1990, 0, 1);

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const isLedgerDirection = (v: unknown): v is LedgerDirection =>
  typeof v === "string" && (LEDGER_DIRECTIONS as readonly string[]).includes(v);
export const isLedgerChannel = (v: unknown): v is LedgerChannel =>
  typeof v === "string" && (LEDGER_CHANNELS as readonly string[]).includes(v);

function parseCaseId(v: unknown): Parsed<string> {
  if (typeof v !== "string" || !v.trim() || v.length > MAX_CASE_ID) return { ok: false, error: "اختر القضية التي يخصها القيد." };
  return { ok: true, value: v.trim() };
}

function parseTitle(v: unknown): Parsed<string> {
  const t = typeof v === "string" ? v.trim() : "";
  if (!t) return { ok: false, error: "عنوان القيد مطلوب (مثال: مذكرة جوابية، أصل الوكالة)." };
  if (t.length > MAX_LEDGER_TITLE) return { ok: false, error: `العنوان يجب ألا يتجاوز ${MAX_LEDGER_TITLE} حرف.` };
  return { ok: true, value: t };
}

function parseNotes(v: unknown): Parsed<string> {
  if (v === undefined || v === null) return { ok: true, value: "" };
  if (typeof v !== "string") return { ok: false, error: "الملاحظات غير صالحة." };
  const t = v.trim();
  if (t.length > MAX_LEDGER_NOTES) return { ok: false, error: `الملاحظات يجب ألا تتجاوز ${MAX_LEDGER_NOTES} حرف.` };
  return { ok: true, value: t };
}

/** An ISO instant, not in the future (beyond a day of slack) and not absurdly old. */
export function parseOccurredAt(v: unknown, nowMs: number): Parsed<string> {
  if (typeof v !== "string" || !v.trim()) return { ok: false, error: "تاريخ القيد مطلوب." };
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) return { ok: false, error: "تاريخ القيد غير صالح." };
  if (ms > nowMs + FUTURE_SLACK_MS) return { ok: false, error: "تاريخ القيد في المستقبل — القيد يسجّل ما صدر أو ورد فعلاً." };
  if (ms < EARLIEST_MS) return { ok: false, error: "تاريخ القيد غير صالح." };
  return { ok: true, value: new Date(ms).toISOString() };
}

export interface LedgerCreateInput {
  caseRequestId: string;
  direction: LedgerDirection;
  channel: LedgerChannel;
  title: string;
  notes: string;
  occurredAt: string;
}

export function parseLedgerCreate(raw: unknown, nowMs: number): Parsed<LedgerCreateInput> {
  const r = isRecord(raw) ? raw : {};
  const caseId = parseCaseId(r.caseRequestId);
  if (!caseId.ok) return caseId;
  if (!isLedgerDirection(r.direction)) return { ok: false, error: "اختر اتجاه القيد: صادر أو وارد." };
  if (!isLedgerChannel(r.channel)) return { ok: false, error: "اختر قناة التسليم." };
  const title = parseTitle(r.title);
  if (!title.ok) return title;
  const notes = parseNotes(r.notes);
  if (!notes.ok) return notes;
  const occurredAt = r.occurredAt === undefined ? { ok: true as const, value: new Date(nowMs).toISOString() } : parseOccurredAt(r.occurredAt, nowMs);
  if (!occurredAt.ok) return occurredAt;
  return {
    ok: true,
    value: {
      caseRequestId: caseId.value,
      direction: r.direction,
      channel: r.channel,
      title: title.value,
      notes: notes.value,
      occurredAt: occurredAt.value,
    },
  };
}

export interface LedgerPatchInput {
  direction?: LedgerDirection;
  channel?: LedgerChannel;
  title?: string;
  notes?: string;
  occurredAt?: string;
  archived?: boolean;
}

/** PATCH: the text fields, and `archived` (owner directive 5: archive, never delete). Case and firm never move. */
export function parseLedgerPatch(raw: unknown, nowMs: number): Parsed<LedgerPatchInput> {
  if (!isRecord(raw)) return { ok: false, error: "لا شيء لتعديله." };
  const out: LedgerPatchInput = {};
  if ("direction" in raw) {
    if (!isLedgerDirection(raw.direction)) return { ok: false, error: "اتجاه القيد غير صالح." };
    out.direction = raw.direction;
  }
  if ("channel" in raw) {
    if (!isLedgerChannel(raw.channel)) return { ok: false, error: "قناة التسليم غير صالحة." };
    out.channel = raw.channel;
  }
  if ("title" in raw) {
    const p = parseTitle(raw.title);
    if (!p.ok) return p;
    out.title = p.value;
  }
  if ("notes" in raw) {
    const p = parseNotes(raw.notes);
    if (!p.ok) return p;
    out.notes = p.value;
  }
  if ("occurredAt" in raw) {
    const p = parseOccurredAt(raw.occurredAt, nowMs);
    if (!p.ok) return p;
    out.occurredAt = p.value;
  }
  if ("archived" in raw) {
    if (typeof raw.archived !== "boolean") return { ok: false, error: "قيمة الأرشفة غير صالحة." };
    out.archived = raw.archived;
  }
  if (Object.keys(out).length === 0) return { ok: false, error: "لا شيء لتعديله." };
  return { ok: true, value: out };
}

/** The column update a parsed PATCH becomes. */
export function ledgerPatchToRow(p: LedgerPatchInput, nowIso: string): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.direction !== undefined) row.direction = p.direction;
  if (p.channel !== undefined) row.channel = p.channel;
  if (p.title !== undefined) row.title = p.title;
  if (p.notes !== undefined) row.notes = p.notes;
  if (p.occurredAt !== undefined) row.occurred_at = p.occurredAt;
  if (p.archived !== undefined) row.archived_at = p.archived ? nowIso : null;
  return row;
}

export interface LedgerFilters {
  direction: LedgerDirection | null;
  channel: LedgerChannel | null;
  caseId: string | null;
  includeArchived: boolean;
  /** occurred_at of the last row already shown (cursor). */
  before: string | null;
}

/** Query string → filters. Unknown values are ignored (a stale link still lists), never trusted. */
export function parseLedgerFilters(get: (name: string) => string | null): LedgerFilters {
  const direction = get("direction");
  const channel = get("channel");
  const caseId = get("caseId");
  const before = get("before");
  return {
    direction: isLedgerDirection(direction) ? direction : null,
    channel: isLedgerChannel(channel) ? channel : null,
    caseId: caseId && caseId.trim() && caseId.length <= MAX_CASE_ID ? caseId.trim() : null,
    includeArchived: get("archived") === "1",
    before: before && !Number.isNaN(Date.parse(before)) ? new Date(Date.parse(before)).toISOString() : null,
  };
}

export interface LedgerRow {
  id: string;
  case_request_id: string;
  created_by: string | null;
  direction: string;
  channel: string;
  title: string;
  notes: string;
  occurred_at: string;
  archived_at: string | null;
  created_at: string;
  service_requests?: { title: string | null } | { title: string | null }[] | null;
}

export const LEDGER_SELECT =
  "id, case_request_id, created_by, direction, channel, title, notes, occurred_at, archived_at, created_at, service_requests(title)";

export interface LedgerEntryDto {
  id: string;
  caseRequestId: string;
  caseTitle: string | null;
  direction: LedgerDirection;
  channel: LedgerChannel;
  title: string;
  notes: string;
  occurredAt: string;
  archived: boolean;
  /** The signed-in user wrote it — the only case the screen offers edit and archive. */
  mine: boolean;
  createdByName: string;
}

export function toLedgerDto(row: LedgerRow, uid: string, writerName: string | null): LedgerEntryDto {
  const embed = Array.isArray(row.service_requests) ? row.service_requests[0] ?? null : row.service_requests ?? null;
  const mine = !!row.created_by && row.created_by === uid;
  return {
    id: row.id,
    caseRequestId: row.case_request_id,
    caseTitle: embed?.title?.trim() ? embed.title.trim() : null,
    direction: isLedgerDirection(row.direction) ? row.direction : "in",
    channel: isLedgerChannel(row.channel) ? row.channel : "hand",
    title: row.title,
    notes: row.notes ?? "",
    occurredAt: row.occurred_at,
    archived: !!row.archived_at,
    mine,
    createdByName: writerName ?? (mine ? "أنت" : row.created_by ? "زميل" : "حساب محذوف"),
  };
}

export function ledgerDbError(error: { code?: string } | null | undefined): { status: number; message: string } {
  const code = error?.code;
  if (code === "23514") return { status: 400, message: "القيد غير صالح — تحقق من العنوان والاتجاه والقناة." };
  if (code === "23503") return { status: 400, message: "القضية المشار إليها غير موجودة." };
  if (code === "42501") return { status: 403, message: "لا يمكنك تسجيل قيد على قضية لا تعمل عليها." };
  return { status: 500, message: "تعذّر حفظ القيد." };
}

/** One line for the activity feeds: «قيد صادر: مذكرة جوابية (منصة ناجز)». */
export function ledgerActivityTitle(direction: unknown, channel: unknown, title: unknown): string {
  const dir = isLedgerDirection(direction) ? LEDGER_DIRECTION_LABEL_AR[direction] : "";
  const ch = isLedgerChannel(channel) ? ` (${LEDGER_CHANNEL_LABEL_AR[channel]})` : "";
  const t = typeof title === "string" && title.trim() ? `: ${title.trim()}` : "";
  return `${dir ? `قيد ${dir}` : "قيد في سجل الصادر والوارد"}${t}${ch}`;
}

/**
 * The entry form's `<input type="datetime-local">` is read as RIYADH wall
 * clock (+03:00), the platform convention for hearings and reminders — so a
 * lawyer abroad and one in Riyadh record the same moment for «10:00».
 * "YYYY-MM-DDTHH:MM" → ISO instant; null when malformed.
 */
export function riyadhLocalInputToIso(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 3 * 60 * 60 * 1000;
  if (Number.isNaN(ms) || +m[4] > 23 || +m[5] > 59) return null;
  return new Date(ms).toISOString();
}

/** ISO instant → the Riyadh "YYYY-MM-DDTHH:MM" a datetime-local input shows. */
export function isoToRiyadhLocalInput(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
