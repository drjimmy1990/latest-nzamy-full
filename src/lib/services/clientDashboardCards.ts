/**
 * clientDashboardCards.ts — turning /api/v1/dashboard/summary rows into the
 * cards the client landing page (/dashboard/client) actually renders.
 *
 * WHY THIS MODULE EXISTS — the summary route hands the page raw
 * `service_requests` rows, and the page used to launder them into the card
 * shape with a bare `as ClientCase[]`. `statusColor` is not a column on that
 * table, so `STATUS_COLOR[cs.statusColor]` evaluated to `undefined` and
 * reading `.bg` off it threw a TypeError: the client landing page crashed for
 * every client who had ever placed an order, and only worked for a brand-new
 * client with nothing on it. A cast is not a conversion. This is the
 * conversion.
 *
 * WHAT IT REFUSES TO DO — a `service_requests` row carries no lawyer name, no
 * progress percentage and no urgency flag, so nothing here produces one. The
 * card that used to show all three now shows only what the row can prove:
 * status, title, the shared order reference, the service the client ordered,
 * and when they submitted it. An empty slot is a correct answer; a
 * plausible-looking one is not.
 *
 * DELIBERATELY IMPORT-FREE of anything touching the network, React or the
 * Supabase client, so `node --test` can load it — the same constraint
 * taskMetadata.ts documents. `orderReference.ts` is imported with its explicit
 * extension because node's ESM resolver does no extension guessing; that is
 * the established pattern here (see orderIntake.contracts.ts, intakeGuard.ts).
 *
 * The `ServiceOrder` import is TYPE-ONLY on purpose. The original reason — that
 * serviceOrders.ts imported `@/lib/services/api`, which node could not resolve —
 * stopped being true when that module was given relative imports so it could be
 * tested. The DECISION stands on its own: this module renders a client's
 * dashboard from data somebody else already fetched, and it must not acquire a
 * path to the fetch layer just because one is now resolvable. Its own test
 * imports both modules and pins that the two status vocabularies agree, which
 * is the only coupling that was ever wanted.
 */

import type { ServiceOrder } from "./serviceOrders";
import { orderReference } from "./orderReference.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The colour keys STATUS_COLOR (src/app/dashboard/client/_data.ts) must define.
 *
 * This union is the fix for the crash, not merely a tidy-up: STATUS_COLOR is
 * typed `Record<CaseTone, …>`, so a tone this module can emit but that map does
 * not define is a build error rather than a page that throws in a client's
 * browser.
 */
export type CaseTone = "amber" | "blue" | "green" | "zinc";

/**
 * A status the order lifecycle models, plus the honest answer for a row whose
 * status string we do not recognise. `"unknown"` is a real outcome, not a
 * placeholder: the service_requests CHECK constraint also permits `draft` and
 * `pending_payment`, which ServiceOrder["status"] does not model, and the
 * column is plain text that a future migration can widen.
 */
export type ClientCaseStatus = ServiceOrder["status"] | "unknown";

export interface ClientCase {
  id: string;
  title: string;
  /** The shared short reference, e.g. `ORD-8F14E4`. Never empty — a row that
   *  cannot produce one is dropped by the mapper instead. */
  caseNo: string;
  status: ClientCaseStatus;
  statusLabel: string;
  statusColor: CaseTone;
  /** `metadata.serviceTitleAr` when the order carries one, else null. */
  serviceLabel: string | null;
  /** «١٢ أبريل ٢٠٢٦», or null when `created_at` is missing or unparseable. */
  createdAtLabel: string | null;
}

/** The badge colour family a document row's format gets on screen. */
export type DocumentFormat = "pdf" | "word" | "image" | "other";

export interface ClientDocumentRow {
  id: string;
  name: string;
  format: DocumentFormat;
  /** Short format label for the badge, e.g. «PDF» or «صورة». */
  formatLabel: string;
  /** «١٢ أبريل ٢٠٢٦», or null when `created_at` is missing or unparseable. */
  dateLabel: string | null;
  /**
   * The order this file is attached to, as `ORD-8F14E4` — or null when
   * `request_id` is null, which is the common case for a file the client
   * simply uploaded to their own library. A document that carries no order
   * must show no order, and must never be captioned with a case number: a
   * caption like «محضر الجلسة.pdf · قضية ٢٠٢٥-٠٠١» is a statement about the
   * client's own legal file.
   */
  orderRef: string | null;
}

// ─── Status wording ───────────────────────────────────────────────────────────

/**
 * The Arabic status wording, copied verbatim from ORDER_STATUS_AR in
 * serviceOrders.ts — the app's one status vocabulary — rather than reworded.
 * It is copied instead of imported to keep this module clear of the fetch
 * layer (see the header).
 *
 * Neither half of the copy can drift silently. The KEY SET is fixed at build
 * time: this is `Record<ServiceOrder["status"], …>`, so adding a status to that
 * union without adding it here fails the build. The LABELS are pinned by
 * clientDashboardCards.test.ts, which imports the original and asserts the two
 * agree string for string — a build error cannot catch «جاهز» being reworded
 * on one side only, and two screens quietly disagreeing about the same order
 * is what a copied vocabulary risks. The
 * tones are this dashboard's own — `emerald` there is `green` here, because
 * these keys name entries in STATUS_COLOR, not Tailwind palettes.
 */
const STATUS_AR: Record<ServiceOrder["status"], { label: string; tone: CaseTone }> = {
  pending_assignment: { label: "بانتظار الاستلام", tone: "amber" },
  assigned:           { label: "قيد التنفيذ",      tone: "blue"  },
  in_review:          { label: "قيد التنفيذ",      tone: "blue"  },
  completed:          { label: "جاهز",             tone: "green" },
  cancelled:          { label: "ملغى",             tone: "zinc"  },
};

/**
 * What a row whose status we do not recognise is told. It says we cannot read
 * the state rather than guessing at one — a card that quietly showed
 * «قيد التنفيذ» for an unmodelled status would be asserting work is under way
 * that nothing in the row supports.
 */
const UNKNOWN_STATUS: { label: string; tone: CaseTone } = {
  label: "الحالة غير معروفة",
  tone: "zinc",
};

// ─── Small pure helpers ───────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

/**
 * Arabic-Indic digits, converted by table rather than by
 * `toLocaleString("ar-EG")`.
 *
 * The locale call would give the same string in the browser, but its output
 * depends on the ICU data the runtime happens to ship — which would make the
 * unit tests for the sentences below assert against the test runner's build
 * rather than against this code. A ten-entry table cannot vary.
 *
 * Negative and non-integer inputs are floored to zero: every caller is
 * counting rows, and «-١ قضية» is not a sentence.
 */
export function toArabicDigits(value: number): string {
  const safe = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  return String(safe)
    .split("")
    .map((d) => ARABIC_DIGITS[Number(d)] ?? d)
    .join("");
}

const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/**
 * «١٢ أبريل ٢٠٢٦» from a timestamptz string, or null when there is nothing
 * readable to show.
 *
 * Returning null rather than a fallback string is the point: `new
 * Date(junk).toLocaleDateString()` renders the literal text «Invalid Date» on
 * screen, which is both English and a lie about the row. Callers render
 * nothing at all instead.
 *
 * The local-time getters are deliberate — a client in Riyadh should see the
 * day it was for them, not the UTC day.
 */
export function formatArabicDate(value: unknown): string | null {
  const raw = str(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const month = MONTHS_AR[d.getMonth()];
  if (!month) return null;
  return `${toArabicDigits(d.getDate())} ${month} ${toArabicDigits(d.getFullYear())}`;
}

// ─── Case mapping ─────────────────────────────────────────────────────────────

/**
 * One `service_requests` row → one card, or null when the row cannot make a
 * working one.
 *
 * Takes `unknown` because that is what it really receives: the summary route's
 * JSON, shaped by whatever the database returned. Every field is read
 * defensively for the same reason.
 */
export function toClientCase(row: unknown): ClientCase | null {
  if (!isRecord(row)) return null;

  const id = str(row.id);
  // A row with no id has no card to render: the link would go to
  // /dashboard/client/cases/ (a route that does not exist), the reference
  // would print as an empty «رقم الطلب: », and two such rows would collide on
  // the same React key. Dropping it is the honest outcome — a dead card that
  // looks live is exactly what this file exists to stop.
  if (!id) return null;

  // The SECOND way a row can fail to produce a reference, and the one the
  // `caseNo` docblock promised was handled when it was not: `orderReference`
  // strips hyphens before slicing, so an id of «---» is a non-empty string
  // that survives the guard above and still yields "". The card then printed
  // «رقم الطلب: » with nothing after it — the exact empty-field the guard
  // above exists to prevent, reached by a different route. No production
  // `service_requests.id` looks like this (the column is a uuid), so this is
  // a contract being made true rather than a bug being observed; it is here
  // because a promise in a docblock that the code does not keep is how the
  // next reader gets misled.
  const caseNo = orderReference(id);
  if (!caseNo) return null;

  const rawStatus = str(row.status);
  // hasOwnProperty, not a plain lookup: `STATUS_AR["constructor"]` is a
  // truthy inherited value whose `.label` is undefined, which would put an
  // empty status badge on screen for a row whose status string happened to
  // name an Object.prototype member.
  const known = Object.prototype.hasOwnProperty.call(STATUS_AR, rawStatus)
    ? STATUS_AR[rawStatus as ServiceOrder["status"]]
    : undefined;

  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const serviceLabel = str(metadata.serviceTitleAr) || null;

  const rawTitle = str(row.title);
  // When the service name stands in for a missing title it must NOT also
  // render as the chip beside it — CaseCard draws both, and the card would
  // print «صياغة عقد» twice, one line above the other.
  const serviceIsTheTitle = !rawTitle && serviceLabel !== null;

  return {
    id,
    // `title` is NOT NULL in the schema, so the fallbacks are for rows written
    // before that was true and for a title that is nothing but whitespace.
    title: rawTitle || serviceLabel || "طلب دون عنوان",
    caseNo,
    status: known ? (rawStatus as ServiceOrder["status"]) : "unknown",
    statusLabel: (known ?? UNKNOWN_STATUS).label,
    statusColor: (known ?? UNKNOWN_STATUS).tone,
    serviceLabel: serviceIsTheTitle ? null : serviceLabel,
    createdAtLabel: formatArabicDate(row.created_at),
  };
}

/** Every row that can make a card, in the order the route returned them. */
export function toClientCases(rows: unknown): ClientCase[] {
  if (!Array.isArray(rows)) return [];
  const cases: ClientCase[] = [];
  for (const row of rows) {
    const mapped = toClientCase(row);
    if (mapped) cases.push(mapped);
  }
  return cases;
}

// ─── Arabic count agreement ───────────────────────────────────────────────────

/**
 * «قضيتان نشطتان» — the counted noun phrase for the welcome line, or null when
 * there is nothing to count.
 *
 * The line it feeds used to be the literal string «قضيتان نشطتان», printed to
 * every client regardless of how many orders they had, including none.
 *
 * NULL AT ZERO, and the caller drops the whole sentence: «لديك ٠ قضايا» is
 * worse than saying nothing.
 *
 * The four branches are Arabic number agreement, which has no singular/plural
 * pair to switch on:
 *   1        — the noun alone, «واحدة» after it for emphasis.
 *   2        — the dual, «قضيتان نشطتان»; no digit is written for it.
 *   3 – 10   — plural noun, «٣ قضايا نشطة».
 *   11 and up — SINGULAR noun, «١١ قضية نشطة» — the tamyiz. Writing «قضايا»
 *              here, as a naive plural rule would, is the mistake this branch
 *              exists to avoid.
 *
 * Left unvocalized, which is what the rest of this codebase does. The tamyiz
 * is accusative and would strictly be «قضيةً»; on a ta marbuta that case is a
 * bare diacritic rather than a letter, and half-vocalized UI copy reads worse
 * to a Saudi client than none. (Contrast «استفساراً» elsewhere in the app —
 * there the accusative alif is part of the written skeleton, not a diacritic.)
 */
export function activeCasesPhraseAr(count: number): string | null {
  if (!Number.isFinite(count)) return null;
  const n = Math.floor(count);
  if (n <= 0) return null;
  if (n === 1) return "قضية نشطة واحدة";
  if (n === 2) return "قضيتان نشطتان";
  if (n <= 10) return `${toArabicDigits(n)} قضايا نشطة`;
  return `${toArabicDigits(n)} قضية نشطة`;
}

// ─── Document mapping ─────────────────────────────────────────────────────────

const FORMAT_LABEL: Record<DocumentFormat, string> = {
  pdf: "PDF",
  word: "Word",
  image: "صورة",
  other: "ملف",
};

/**
 * The format badge, read off the file's own name.
 *
 * Anything not recognised becomes «ملف» rather than the raw extension: an
 * uppercased fragment of a filename is not a format, and a badge reading
 * «TAR.G» tells the client nothing true.
 */
function documentFormat(fileName: string): DocumentFormat {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  if (ext === "pdf") return "pdf";
  if (ext === "doc" || ext === "docx") return "word";
  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp" || ext === "gif") return "image";
  return "other";
}

/**
 * `attachments` rows (documentService.getDocuments) → the «مستنداتي» rows on
 * the landing page.
 *
 * This replaces three hardcoded files — «عقد التوظيف.pdf», «إشعار قانوني.docx»
 * and «محضر الجلسة.pdf», each captioned with an invented case number and each
 * linking to a documents page where none of them existed. Every field below
 * comes off a real row, and the ones a row cannot answer come back null.
 */
export function toClientDocumentRows(docs: unknown, limit: number): ClientDocumentRow[] {
  if (!Array.isArray(docs) || !Number.isFinite(limit) || limit <= 0) return [];
  const rows: ClientDocumentRow[] = [];
  for (const doc of docs) {
    if (rows.length >= Math.floor(limit)) break;
    if (!isRecord(doc)) continue;
    const id = str(doc.id);
    const name = str(doc.file_name);
    // No id means no stable React key; no name means a row with nothing to
    // read. Neither is worth a line on the client's dashboard.
    if (!id || !name) continue;
    const format = documentFormat(name);
    rows.push({
      id,
      name,
      format,
      formatLabel: FORMAT_LABEL[format],
      dateLabel: formatArabicDate(doc.created_at),
      orderRef: orderReference(str(doc.request_id)) || null,
    });
  }
  return rows;
}
