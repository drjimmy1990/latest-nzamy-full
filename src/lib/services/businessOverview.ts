/**
 * businessOverview.ts — the pure logic behind /dashboard/business, the one
 * corporate overview screen a company can still reach.
 *
 * WHY THIS MODULE EXISTS — until 2026-08-27 that page opened with four KPI
 * cards («٤ استشارات معلقة», «٣٤ عقود سارية», «معدل امتثال ٩٢٪»), two dated
 * legal deadlines with day countdowns, three departmental requests with ids
 * and timestamps, a named seconded advocate with «١٢/٤٠» billable hours left,
 * and a subscription plan called «Growth» with its quota bars filled in. Not
 * one of those numbers came from a query. They were module-level literals,
 * identical for every company that logged in. A company reading its own
 * compliance score off that screen was reading a constant somebody typed.
 *
 * The replacement prints only what a row can prove. That is a smaller screen,
 * and it is meant to be: the owner's ruling of 26 August is that an empty
 * screen beats another company's numbers.
 *
 * WHAT IS DELIBERATELY ABSENT — there is no "0" fallback anywhere below. A
 * rendered zero is a claim ("your company has no open matters") and we are
 * usually in no position to make it: `GET /api/v1/documents` answers a
 * database failure with `200 {"data": []}`, so an empty list and an unreadable
 * one arrive identical. Every function here returns null/[] for "nothing to
 * say" and the page renders nothing at all rather than a numeral.
 *
 * DELIBERATELY IMPORT-FREE of React, the network and the Supabase client so
 * `node --test` can load it. `clientDashboardCards.ts` is imported with its
 * explicit `.ts` extension because node's ESM resolver does no extension
 * guessing (the established pattern here — see clientDashboardCards.ts's own
 * header). The `LegalRepCapacity` import is TYPE-ONLY on purpose: its module
 * lives under src/app and pulls in form code node cannot resolve, and an
 * erased import costs nothing at runtime while still failing the build if the
 * capacity vocabulary below drifts from the one the database accepts.
 */

import type { LegalRepCapacity } from "@/app/register/client/components/_corporateIdentity";
import { toArabicDigits } from "./clientDashboardCards.ts";

// ─── Company identity ─────────────────────────────────────────────────────────

export type CompanyIdentityKey =
  | "company_name"
  | "cr_number"
  | "legal_rep_name"
  | "legal_rep_capacity";

export interface CompanyIdentityField {
  key: CompanyIdentityKey;
  /** The Arabic label the panel prints beside the value. */
  label: string;
  /** Always a non-empty string — a field with nothing to show is not emitted. */
  value: string;
}

/**
 * The Arabic capacity wording, keyed by the exact strings
 * `business_profiles.legal_rep_capacity` may hold.
 *
 * Typed `Record<LegalRepCapacity, string>`, so adding a capacity to
 * LEGAL_REP_CAPACITIES (src/app/register/client/components/_corporateIdentity.ts)
 * and to the column's CHECK constraint without adding it here is a BUILD
 * ERROR rather than a corporate dashboard that silently drops the new value.
 *
 * The wording is copied from that module rather than imported so this file
 * stays loadable by `node --test`; the type import above is what keeps the two
 * copies' key sets from drifting apart. Only the six strings are duplicated,
 * and they are display text, not a contract.
 */
const CAPACITY_AR: Record<LegalRepCapacity, string> = {
  owner: "المالك",
  partner: "شريك",
  manager: "المدير",
  authorized_signatory: "المفوّض بالتوقيع",
  legal_counsel: "المستشار القانوني",
  other: "صفة أخرى",
};

/**
 * Names that are NOT this company's name, even though they are what the record
 * holds.
 *
 * TWO SOURCES ARE SCREENED BY THIS ONE LIST, and only the first of them mirrors
 * the migration:
 *
 *   1. `business_profiles.company_name_ar` (→ toCompanyIdentityFields). The
 *      column is NOT NULL, so the signup trigger had to write something for an
 *      account that never sent one — and until
 *      20260826_corporate_identity_persisted.sql ran, /register/client never
 *      sent one at all, so EVERY corporate row in production read «شركة جديدة».
 *      For this source the list mirrors the migration's own backfill guard (its
 *      §3a WHERE clause), which refuses to promote these same strings into a
 *      trading name. Keeping the two in step matters: anything the migration
 *      declines to recover is exactly what this must decline to display.
 *
 *   2. the session's display name (→ accountDisplayName). Nothing in the
 *      database constrains that one, but /register/client/page.tsx:246 ends its
 *      own fallback chain at the literal «عميل نظامي», so a corporate signup
 *      that skipped the company-name field carries that string in auth
 *      metadata, and the dashboard heading is where it surfaces.
 *
 * Printing any of these at the top of a paying company's dashboard, styled
 * exactly like a real trading name, is the same defect as the invented KPIs
 * this module replaced: a placeholder wearing the clothes of a fact.
 *
 * Matched EXACTLY, not case-insensitively, because of source 1: the migration's
 * guard is an exact comparison, and a looser rule here would start hiding
 * trading names the migration was willing to keep.
 */
const PLACEHOLDER_COMPANY_NAMES: readonly string[] = [
  "شركة جديدة",
  "New Company",
  "جهة جديدة",
  "عميل نظامي",
  "مستخدم جديد",
];

/**
 * Leading/trailing whitespace, including the four invisible characters an RTL
 * copy-paste routinely carries: NBSP, zero-width space, and the LRM/RLM marks.
 *
 * `String.prototype.trim()` removes NBSP and ZWSP but leaves LRM/RLM, so a CR
 * number pasted out of a bidi document would keep a direction mark and print
 * as a value that looks right and does not compare equal to itself anywhere
 * else. Same character set the migration's `btrim` uses, for the same reason.
 *
 * Written as \uXXXX escapes and never as the characters themselves — the same
 * discipline 20260826_corporate_identity_persisted.sql applies to its own trim
 * set. Pasted literally, all four are invisible in an editor, and the next
 * person to touch this line deletes one without ever seeing it.
 */
const EDGE_BLANKS = /^[\s\u00A0\u200B\u200E\u200F]+|[\s\u00A0\u200B\u200E\u200F]+$/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(EDGE_BLANKS, "");
}

/** Exact match against PLACEHOLDER_COMPANY_NAMES; see that list's header. */
function isPlaceholderName(cleaned: string): boolean {
  return PLACEHOLDER_COMPANY_NAMES.includes(cleaned);
}

/**
 * The session's display name, or null when there is nothing there that may be
 * printed as the name of a company.
 *
 * WHY THIS IS NOT JUST `user.name.trim()`. src/hooks/useUser.ts:620 builds that
 * value as `meta.display_name ?? meta.full_name ?? user.email ?? ""` — a chain
 * whose last real link is the EMAIL ADDRESS. So an account that never set a
 * display name gets `someone@example.com` returned as its "name", and
 * /dashboard/business rendered exactly that as its `<h1>`, 26 lines above a
 * panel that was correctly refusing to print «عميل نظامي» as a trading name.
 * One screen both asserting and denying that it knows who the company is.
 *
 * THE «@» TEST IS DELIBERATELY BROAD — any «@» anywhere disqualifies the
 * string, rather than an email-shaped regex. The two failure modes are not
 * symmetric:
 *   • over-rejecting costs the heading «لوحة المنشأة», which is true of every
 *     account that can see this page;
 *   • under-rejecting prints a person's email address, in 24px bold, on a
 *     screen a company may well show to someone else.
 * A tighter pattern (`\S+@\S+\.\S+`) would let `admin@localhost` through for no
 * gain, and no Saudi trading name contains «@». Anyone tempted to narrow this
 * should re-read the two bullets above first.
 *
 * Returns null and never "" so the caller must handle absence explicitly; an
 * empty string falls through `||` silently and that is how a blank heading
 * ships.
 */
export function accountDisplayName(name: unknown): string | null {
  const cleaned = clean(name);
  if (!cleaned) return null;
  if (isPlaceholderName(cleaned)) return null;
  if (cleaned.includes("@")) return null;
  return cleaned;
}

/**
 * One `business_profiles` row → the identity lines the panel prints, in a
 * fixed order, with every unanswerable line simply absent.
 *
 * Takes `unknown` because that is what PostgREST hands back: a row shaped by
 * whatever the database returned, on a schema that gained two of these columns
 * in August 2026 and may gain more.
 *
 * FOUR COLUMNS, NOT THE WHOLE ROW. `size` and `legal_structure` are
 * deliberately excluded even though every row has them, because every row has
 * them *by default*: the schema declares `size not null default 'medium'` and
 * `legal_structure not null default 'llc'`
 * (20260603_phase1_002_entities.sql:224-230) and no registration form has ever
 * asked. Printing «متوسطة · ذات مسؤولية محدودة» under a heading that says
 * "your company's record" would be telling a two-person sole proprietorship a
 * fact about itself that only a column default ever asserted. They come back
 * the day something asks the company for them.
 */
export function toCompanyIdentityFields(row: unknown): CompanyIdentityField[] {
  if (!isRecord(row)) return [];

  const fields: CompanyIdentityField[] = [];

  // No «@» test here, unlike accountDisplayName above: `company_name_ar` has no
  // fallback chain ending at an email — whatever is in the column is what
  // someone typed into the field, so an address there would be a deliberate (if
  // odd) answer rather than a leak.
  const name = clean(row.company_name_ar);
  if (name && !isPlaceholderName(name)) {
    fields.push({ key: "company_name", label: "الاسم التجاري", value: name });
  }

  const cr = clean(row.cr_number);
  if (cr) {
    fields.push({ key: "cr_number", label: "رقم السجل التجاري", value: cr });
  }

  const repName = clean(row.legal_rep_name);
  if (repName) {
    fields.push({ key: "legal_rep_name", label: "الممثل النظامي", value: repName });
  }

  // hasOwnProperty, not a plain lookup: `CAPACITY_AR["constructor"]` is a
  // truthy inherited value, and a row whose capacity string happened to name
  // an Object.prototype member would otherwise put `function Object() {…}` on
  // a company's dashboard. An unrecognised capacity is dropped rather than
  // printed raw — «authorized_signatory» in the middle of Arabic copy is the
  // English-key leak this codebase keeps having to fix.
  const capacity = clean(row.legal_rep_capacity);
  if (Object.prototype.hasOwnProperty.call(CAPACITY_AR, capacity)) {
    fields.push({
      key: "legal_rep_capacity",
      label: "صفة الممثل النظامي",
      value: CAPACITY_AR[capacity as LegalRepCapacity],
    });
  }

  return fields;
}

// ─── Document vault ───────────────────────────────────────────────────────────

/**
 * «١٢ وثيقة محفوظة» — the counted phrase for the vault tile, or null when
 * there is nothing to count.
 *
 * NULL AT ZERO, and the caller shows the upload invitation instead of a
 * numeral. That is not only a style preference: `GET /api/v1/documents`
 * returns `200 {"data": []}` when its Supabase query fails
 * (src/app/api/v1/documents/route.ts:26-29), so a zero here can mean "the
 * vault is empty" or "the vault could not be read", and «٠ وثيقة محفوظة»
 * asserts the first. An invitation to open the vault is true either way.
 *
 * The four branches are Arabic number agreement, which has no single plural
 * rule to apply — the same shape as activeCasesPhraseAr in
 * clientDashboardCards.ts, and for the same reason:
 *   1         — the noun alone with «واحدة»; no digit.
 *   2         — the dual «وثيقتان محفوظتان»; no digit.
 *   3 – 10    — plural noun, «٣ وثائق محفوظة».
 *   11 and up — SINGULAR noun, «١١ وثيقة محفوظة» — the tamyiz. A naive plural
 *               rule writes «وثائق» here and is wrong.
 */
export function vaultDocumentsPhraseAr(count: number): string | null {
  if (!Number.isFinite(count)) return null;
  const n = Math.floor(count);
  if (n <= 0) return null;
  if (n === 1) return "وثيقة واحدة محفوظة";
  if (n === 2) return "وثيقتان محفوظتان";
  if (n <= 10) return `${toArabicDigits(n)} وثائق محفوظة`;
  return `${toArabicDigits(n)} وثيقة محفوظة`;
}

/**
 * How many rows in the account's document list belong to the company vault.
 *
 * The vault is the set of attachments NOT bound to an order — the exact same
 * definition /dashboard/business/documents renders
 * (`all.filter(d => !d.request_id)`, that page's line 85). Duplicating the
 * predicate rather than exporting one from that page is deliberate: the page is
 * a "use client" React module and this has to stay loadable by `node --test`.
 *
 * THE PREDICATE IS COPIED CHARACTER FOR CHARACTER, and that is the whole
 * discipline here. Both surfaces are handed the SAME unfiltered list from
 * `getDocuments()` — the overview counts it here, the vault page filters it
 * there — so any difference between the two booleans is a tile whose number
 * disagrees with the list it summarises, with no error anywhere.
 *
 * It used to differ. This function tested `=== null || === undefined` and
 * carried a comment saying an empty-string `request_id` was excluded because
 * counting it "would put a document the company cannot see in this page's
 * count". That reasoning was simply wrong on the facts: `!""` is `true`, so the
 * vault page SHOWS such a row, and it was the count that was hiding it. A
 * company with one malformed row read «وثيقة واحدة محفوظة» on the overview and
 * opened a page listing two. Fixed by writing the same boolean, not a
 * paraphrase of it — a paraphrase is what drifted in the first place.
 *
 * Returns null — never 0 — for input that is not a list, so a caller that was
 * handed something unexpected renders nothing instead of «لا توجد وثائق».
 */
export function countVaultDocuments(docs: unknown): number | null {
  if (!Array.isArray(docs)) return null;
  let count = 0;
  for (const doc of docs) {
    if (!isRecord(doc)) continue;
    if (!doc.request_id) count += 1;
  }
  return count;
}
