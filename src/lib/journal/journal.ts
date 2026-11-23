/**
 * journal.ts — «المجلة التشريعية», phase 1 (owner Q190–Q195, batch l13).
 * Pure: no I/O, relative imports only, so `node --test` loads it and the
 * client pages can import it. The database reads and writes live in
 * journalServer.ts; the PDF in journalPdf.ts.
 *
 *   ENTRY   one news item an admin types in (Q195 manual entry first):
 *           title, the legislation's date, issuing body, source link, impact
 *           lines, badge «معدّل» / «سريان وشيك», effective date; draft until
 *           an admin approves it (Q194: «محامي المنصة» is not named yet).
 *   VIEW    Q190 (ب): a visitor reads the title and the date ONLY; a
 *           subscriber reads the badge, the effective date, the impact lines,
 *           the issuing body and the link as well. shapeEntryForViewer() is
 *           the one place that decides it — the page, the issue page and the
 *           PDF all call it, so no view can show a visitor more.
 *   ISSUE   one per Gregorian month (Q192), keyed by the 1st of the month it
 *           covers (Riyadh date), built on the 1st of the next month from the
 *           approved entries not yet in an issue, approved by an admin before
 *           it is sent.
 *   E-MAIL  Q191 (أ): registered accounts that turned on «النشرة» in their
 *           settings. The message is the same for everyone and carries the
 *           visitor view only (titles + dates) with a link to the issue, which
 *           shapes itself for whoever opens it.
 */
import { describeDateAr, toArabicDigits } from "../services/hijri.ts";

// ── switch ───────────────────────────────────────────────────────────────────

/** The feature flag (src/lib/featureFlags/featureFlags.ts), default OFF. */
export const JOURNAL_FLAG = "legislative_journal_enabled" as const;

// ── entries ──────────────────────────────────────────────────────────────────

export type JournalBadge = "amended" | "imminent_effect";
export type JournalEntryStatus = "draft" | "approved";

export const JOURNAL_BADGES: Readonly<Record<JournalBadge, string>> = Object.freeze({
  amended: "معدّل",
  imminent_effect: "سريان وشيك",
});

export const ENTRY_LIMITS = Object.freeze({
  titleMin: 3,
  titleMax: 300,
  issuingBodyMax: 200,
  urlMax: 1000,
  impactLinesMax: 10,
  impactLineMax: 500,
});

/** A row of public.journal_entries as the server reads it. */
export interface JournalEntryRow {
  id: string;
  title: string;
  published_on: string;
  issuing_body: string | null;
  source_url: string | null;
  impact_lines: string[] | null;
  badge: JournalBadge | null;
  effective_on: string | null;
  status: JournalEntryStatus;
  approved_at?: string | null;
  created_at?: string | null;
}

/** The columns every entry read selects. */
export const ENTRY_COLUMNS =
  "id, title, published_on, issuing_body, source_url, impact_lines, badge, effective_on, status, approved_at, approved_by, created_at, updated_at";

/** The fields an admin may set (create / edit). */
export interface JournalEntryInput {
  title: string;
  published_on: string;
  issuing_body: string | null;
  source_url: string | null;
  impact_lines: string[];
  badge: JournalBadge | null;
  effective_on: string | null;
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day as YYYY-MM-DD, else false. */
export function isIsoDay(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = ISO_DAY.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d && y >= 1900 && y <= 2200;
}

/** An absolute http(s) link without spaces, else null. */
export function cleanSourceUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > ENTRY_LIMITS.urlMax || /\s/.test(s)) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? s : null;
  } catch {
    return null;
  }
}

const isBadge = (v: unknown): v is JournalBadge => v === "amended" || v === "imminent_effect";

/** Impact lines from a textarea (one per line) or an array: trimmed, empty dropped. */
export function impactLinesFrom(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/\r?\n/) : [];
  return raw
    .map((x) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim() : ""))
    .filter((x) => x !== "");
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * The admin form → a valid entry, or the first problem in plain Arabic.
 * `partial` (an edit): only the fields present are checked and returned.
 */
export function parseEntryInput(body: unknown, partial = false): ParseResult<Partial<JournalEntryInput>> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "بيانات غير صالحة" };
  const b = body as Record<string, unknown>;
  const has = (k: string) => Object.hasOwn(b, k);
  const out: Partial<JournalEntryInput> = {};

  if (!partial || has("title")) {
    const title = typeof b.title === "string" ? b.title.replace(/\s+/g, " ").trim() : "";
    if (title.length < ENTRY_LIMITS.titleMin) return { ok: false, error: "اكتب عنوان الخبر (ثلاثة أحرف على الأقل)" };
    if (title.length > ENTRY_LIMITS.titleMax) return { ok: false, error: `العنوان أطول من ${ENTRY_LIMITS.titleMax} حرف` };
    out.title = title;
  }
  if (!partial || has("published_on")) {
    if (!isIsoDay(b.published_on)) return { ok: false, error: "اختر تاريخ الخبر" };
    out.published_on = b.published_on;
  }
  if (!partial || has("issuing_body")) {
    const body = typeof b.issuing_body === "string" ? b.issuing_body.replace(/\s+/g, " ").trim() : "";
    if (body.length > ENTRY_LIMITS.issuingBodyMax) return { ok: false, error: `اسم الجهة المصدرة أطول من ${ENTRY_LIMITS.issuingBodyMax} حرف` };
    out.issuing_body = body || null;
  }
  if (!partial || has("source_url")) {
    const raw = typeof b.source_url === "string" ? b.source_url.trim() : "";
    if (raw) {
      const url = cleanSourceUrl(raw);
      if (!url) return { ok: false, error: "الرابط يجب أن يبدأ بـ https:// أو http:// وبلا مسافات" };
      out.source_url = url;
    } else {
      out.source_url = null;
    }
  }
  if (!partial || has("impact_lines")) {
    const lines = impactLinesFrom(b.impact_lines);
    if (lines.length > ENTRY_LIMITS.impactLinesMax) return { ok: false, error: `سطور الأثر ${ENTRY_LIMITS.impactLinesMax} على الأكثر` };
    if (lines.some((l) => l.length > ENTRY_LIMITS.impactLineMax)) return { ok: false, error: `كل سطر أثر ${ENTRY_LIMITS.impactLineMax} حرف على الأكثر` };
    out.impact_lines = lines;
  }
  if (!partial || has("badge")) {
    if (b.badge === null || b.badge === undefined || b.badge === "") out.badge = null;
    else if (isBadge(b.badge)) out.badge = b.badge;
    else return { ok: false, error: "الشارة غير معروفة" };
  }
  if (!partial || has("effective_on")) {
    if (b.effective_on === null || b.effective_on === undefined || b.effective_on === "") out.effective_on = null;
    else if (isIsoDay(b.effective_on)) out.effective_on = b.effective_on;
    else return { ok: false, error: "تاريخ النفاذ غير صالح" };
  }
  return { ok: true, value: out };
}

// ── the viewer's view (Q190 ب) ───────────────────────────────────────────────

export type JournalViewer = "visitor" | "subscriber";

export interface PublicJournalEntry {
  id: string;
  title: string;
  publishedOn: string;
  /** Subscriber only. */
  badge?: JournalBadge | null;
  effectiveOn?: string | null;
  impactLines?: string[];
  issuingBody?: string | null;
  sourceUrl?: string | null;
}

/**
 * THE rule: a visitor gets the title and the date and NOTHING else (the keys
 * are absent, not empty); a subscriber gets the rest too. Unapproved rows are
 * never shaped — the caller must only pass approved ones, and a draft passed
 * by mistake returns null.
 */
export function shapeEntryForViewer(row: JournalEntryRow, viewer: JournalViewer): PublicJournalEntry | null {
  if (!row || row.status !== "approved") return null;
  const base: PublicJournalEntry = { id: row.id, title: row.title, publishedOn: row.published_on };
  if (viewer !== "subscriber") return base;
  return {
    ...base,
    badge: isBadge(row.badge) ? row.badge : null,
    effectiveOn: row.effective_on ?? null,
    impactLines: Array.isArray(row.impact_lines) ? row.impact_lines.filter((l) => typeof l === "string" && l.trim() !== "") : [],
    issuingBody: row.issuing_body ?? null,
    sourceUrl: cleanSourceUrl(row.source_url),
  };
}

/** «الأربعاء ١٠ نوفمبر ٢٠٢٦ م · ٢٠ جمادى الأولى ١٤٤٨ هـ», or the raw value. */
export function dateAr(iso: string | null | undefined): string {
  if (!iso) return "";
  return describeDateAr(iso.slice(0, 10)) ?? iso;
}

// ── months and issues ────────────────────────────────────────────────────────

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const;

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Today's date in Riyadh (UTC+3, no daylight saving) as YYYY-MM-DD. */
export function riyadhToday(now: Date = new Date()): string {
  return new Date(now.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** The 1st of the month `iso` falls in. */
export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** The 1st of the month `delta` months from the month of `iso`. */
export function shiftMonthStart(iso: string, delta: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1 + delta;
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
}

/** The month the issue built today covers: the previous Gregorian month (Riyadh). */
export function issuePeriodFor(now: Date = new Date()): string {
  return shiftMonthStart(monthStart(riyadhToday(now)), -1);
}

/** "YYYY-MM" (the admin's month picker) → the 1st of that month, or null. */
export function periodFromMonthInput(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}$/.test(v)) return null;
  const iso = `${v}-01`;
  return isIsoDay(iso) ? iso : null;
}

/** «نوفمبر ٢٠٢٦ م» */
export function periodLabelAr(periodMonth: string): string {
  const y = Number(periodMonth.slice(0, 4));
  const m = Number(periodMonth.slice(5, 7));
  return `${AR_MONTHS[m - 1] ?? ""} ${toArabicDigits(y)} م`;
}

/** «مجلة نظامي التشريعية — عدد نوفمبر ٢٠٢٦ م» */
export function issueTitleAr(periodMonth: string): string {
  return `مجلة نظامي التشريعية — عدد ${periodLabelAr(periodMonth)}`;
}

export type JournalIssueStatus = "draft" | "approved" | "sending" | "sent";

export const ISSUE_STATUS_AR: Readonly<Record<JournalIssueStatus, string>> = Object.freeze({
  draft: "بانتظار الاعتماد",
  approved: "معتمد — لم يُرسل",
  sending: "جارٍ الإرسال",
  sent: "أُرسل",
});

export interface JournalIssueRow {
  id: string;
  period_month: string;
  title: string;
  status: JournalIssueStatus;
  built_at?: string | null;
  approved_at?: string | null;
  sent_at?: string | null;
}

export const ISSUE_COLUMNS = "id, period_month, title, status, built_at, approved_at, approved_by, send_started_at, sent_at, created_at";

/** Issues a visitor may open: an admin approved them. */
export function issueIsPublic(issue: Pick<JournalIssueRow, "status"> | null | undefined): boolean {
  return !!issue && (issue.status === "approved" || issue.status === "sending" || issue.status === "sent");
}

/**
 * Which approved entries a new issue for `periodMonth` takes: approved, not
 * yet in any issue, dated before the 1st of the following month — so an item
 * approved late for an earlier month is carried by the next issue instead of
 * being lost. Oldest first.
 */
export function entriesForIssue<T extends Pick<JournalEntryRow, "id" | "status" | "published_on">>(
  rows: readonly T[],
  periodMonth: string,
  alreadyInIssue: ReadonlySet<string>,
): T[] {
  const end = shiftMonthStart(periodMonth, 1);
  return rows
    .filter((r) => r.status === "approved" && !alreadyInIssue.has(r.id) && isIsoDay(r.published_on) && r.published_on < end)
    .sort((a, b) => (a.published_on === b.published_on ? a.id.localeCompare(b.id) : a.published_on.localeCompare(b.published_on)));
}

// ── PDF availability ─────────────────────────────────────────────────────────

/** True when the server has a headless Chromium to print the issue (env CHROMIUM_PATH). */
export function pdfConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return (env.CHROMIUM_PATH ?? "").trim() !== "";
}

/** Site paths of an issue: the print page (always) and the PDF (when configured). */
export function issuePaths(issueId: string): { page: string; pdf: string } {
  const id = encodeURIComponent(issueId);
  return { page: `/journal/issues/${id}`, pdf: `/api/v1/journal/issues/${id}/pdf` };
}
