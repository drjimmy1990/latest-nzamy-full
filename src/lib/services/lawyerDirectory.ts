/**
 * lawyerDirectory.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The API row that GET /api/v1/lawyers actually returns → the view model the
 * client directory actually renders.
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 * `getLawyers()` used to end in `return response.lawyers ?? []` typed as
 * `Lawyer[]` — the MOCK-directory interface from find-lawyer/data.ts. That was
 * a cast, not a mapping. The API has never returned a `name`, a `specialty`, a
 * `rating` or an `expertise` array, so every field the card read was
 * `undefined`; the search box called `l.name.includes(q)` and threw on the
 * first keystroke, and the price filter compared `undefined <= maxPrice` and
 * dropped every card that survived.
 *
 * ── The rule this file is built on ───────────────────────────────────────────
 * Five fields of the old interface have NO SOURCE ANYWHERE IN THE SCHEMA:
 * `rating`, `reviewCount`, `successRate`, `consultationsCount`,
 * `responseTime`. There is no ratings table, no reviews table and no
 * case-outcome data. A mapper that filled them with 0 — or with 4.5, or with
 * «خلال ساعة» — would be manufacturing a professional claim about a named,
 * licensed advocate. They are therefore not in `DirectoryLawyer` at all: not
 * optional, not nullable, ABSENT, so that no future card can render one by
 * accident.
 *
 * ── And the rule that follows from it ────────────────────────────────────────
 * Everything here is optional because every column behind it is. Measured
 * against production: of the 5 lawyer rows, 4 carry zero specialties,
 * `years_experience = 0` and an empty bio. So `0` and `""` mean NOT STATED,
 * never «صفر سنة خبرة» or «٠ ر.س». They are normalised to `undefined` at this
 * boundary — once, here — because a card that has to remember to special-case
 * a zero is a card that will eventually forget.
 *
 * ── No imports, deliberately ─────────────────────────────────────────────────
 * This module is pure and dependency-free so `node --test` can load it: it must
 * NOT import `lawyerService.ts`, which is `"use client"` and pulls `@/lib/...`
 * aliases the bare test runner cannot resolve. The dependency arrow is
 * lawyerService → lawyerDirectory and never back, which is also why the row
 * interface below is declared locally rather than imported.
 */

// ─── The API row ──────────────────────────────────────────────────────────────

/**
 * Mirrors the `select` string in src/app/api/v1/lawyers/route.ts:33 — nothing
 * more. Declared here rather than reusing `PublicLawyerProfile` (the /[id]
 * route's shape) because the two projections genuinely differ: the list
 * returns `user_type` and does NOT return `created_at` or `country_code`.
 * Importing the wrong one is how a directory card ends up promising «عضو منذ
 * undefined». src/app/lawyers/browse/page.tsx made the same call for the same
 * reason.
 */
export interface DirectoryLawyerProfileRow {
  user_id?: string;
  specialties?: string[] | null;
  years_experience?: number | null;
  hourly_rate?: number | null;
  bio_ar?: string | null;
  bio_en?: string | null;
  is_accepting_clients?: boolean | null;
  bar_association?: string | null;
  /**
   * Projected by the route and DELETED per-row unless the lawyer set
   * `show_contact`. Regulated credential data — it is typed here only so that
   * nobody re-adds it to the projection thinking it is missing, and it is
   * deliberately not mapped into `DirectoryLawyer`: a licence number does not
   * belong on a directory card.
   */
  license_number?: string | null;
  /** Phase 7 (item 130) — the lawyer's chosen public link segment, e.g. `/lawyers/ahmad-alghamdi`. */
  slug?: string | null;
}

export interface DirectoryLawyerRow {
  id?: string | null;
  display_name?: string | null;
  display_name_en?: string | null;
  avatar_url?: string | null;
  city?: string | null;
  user_type?: string | null;
  /**
   * PostgREST returns an embedded to-one relationship either as an object or
   * as a single-element array, depending on how it resolves the relationship.
   * The route normalises it for its own `show_contact` strip but forwards the
   * row as-is, so it can arrive either way — see `embeddedProfile` below.
   * `normalizeEmbedded` in lawyerService.ts hit the same fork.
   */
  lawyer_profiles?:
    | DirectoryLawyerProfileRow
    | DirectoryLawyerProfileRow[]
    | null;
  /** Phase 7 (item 130) — mirrors `lawyer_profiles.slug`, promoted to the top level by the route. */
  slug?: string | null;
  /**
   * Phase 7 (item 192) — attached by the route from a SEPARATE query on the
   * `lawyer_review_stats` view (no PostgREST-embeddable FK from `profiles`),
   * never part of the `lawyer_profiles!inner(...)` projection above. `null`
   * means either "no active reviews yet" or "the stats query failed" — the
   * route does not tell the two apart per row, the same honest-absence rule
   * `listRead.ts` states for lists.
   */
  reviewStats?: {
    reviewCount: number;
    avgRating: number | null;
    lastReviewAt: string | null;
  } | null;
}

// ─── The view model ───────────────────────────────────────────────────────────

/**
 * Only what the schema has. `undefined` means the lawyer did not state it, and
 * the card must then render NOTHING for it — no dash, no zero, no «غير محدد»
 * standing in for a number that was never promised.
 */
export interface DirectoryLawyer {
  id: string;
  /** `undefined` when the profile carries no display name in either language. */
  name?: string;
  city?: string;
  /** Always an array; empty when the lawyer listed no specialisations. */
  specialties: string[];
  yearsExperience?: number;
  /** The lawyer's stated hourly rate. NOT a consultation price. */
  hourlyRate?: number;
  bio?: string;
  /** `undefined` = never answered. Distinct from `false` = not accepting. */
  isAcceptingClients?: boolean;
  avatarUrl?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * An empty or whitespace-only string is as absent as `null`. A column default
 * of `''` is not content, and 4 of the 5 production rows rely on this.
 */
function text(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * A count that is absent, zero or nonsensical is not a fact about the lawyer.
 *
 * Zero is the load-bearing case: `years_experience` defaults to 0 on 4 of 5
 * rows, and «٠ سنة خبرة» beside a licensed advocate's name is a fabricated
 * claim in exactly the way «١٢ سنة» would be. Non-finite values (NaN from a
 * malformed payload) are dropped for the same reason.
 */
function positiveNumber(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value > 0 ? value : undefined;
}

/**
 * Trimmed, blank-free, and DEDUPED — first occurrence wins.
 *
 * `specialties` is filled from a FREE-TEXT box: dashboard/lawyer/profile/edit
 * (page.tsx:76) splits one input on «،»/",", so a lawyer who types
 * «قانون تجاري، قانون عمل، قانون عمل» stores three entries. The directory card
 * then does `specialties.slice(1, 4).map((s) => <span key={s}>)` — duplicate
 * React keys, reachable entirely through the real UI with no bad data anywhere.
 * `directoryFacet` was already safe because it collects into a `Set`; the
 * mapper was not, so the dedupe belongs HERE and both call sites inherit it.
 *
 * Order is preserved and nothing is sorted: `specialties[0]` is the headline
 * specialisation printed under the lawyer's name, and sorting in the mapper
 * would silently change which one he leads with. Matching is exact rather than
 * case-folded or normalised — deciding that two spellings a lawyer typed mean
 * the same thing is a claim about his practice, not a string operation.
 */
function uniqueTexts(
  values: (string | null | undefined)[] | null | undefined,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const trimmed = text(value);
    if (trimmed === undefined || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function embeddedProfile(
  row: DirectoryLawyerRow,
): DirectoryLawyerProfileRow | undefined {
  const embedded = row.lawyer_profiles;
  if (Array.isArray(embedded)) return embedded[0] ?? undefined;
  return embedded ?? undefined;
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

/**
 * One API row → one card. Returns `null` for a row with no id, because a card
 * without an id has no stable React key and no destination to link to; a
 * silently-rendered idless card is worse than one fewer card.
 */
export function toDirectoryLawyer(
  row: DirectoryLawyerRow | null | undefined,
): DirectoryLawyer | null {
  if (!row) return null;
  const id = text(row.id);
  if (!id) return null;

  const lp = embeddedProfile(row);

  return {
    id,
    // Arabic first — this is an Arabic UI — falling back to the English name
    // only when there is no Arabic one, rather than to a placeholder.
    name: text(row.display_name) ?? text(row.display_name_en),
    city: text(row.city),
    specialties: uniqueTexts(lp?.specialties),
    yearsExperience: positiveNumber(lp?.years_experience),
    hourlyRate: positiveNumber(lp?.hourly_rate),
    bio: text(lp?.bio_ar) ?? text(lp?.bio_en),
    // Strictly tri-state. `null` (never answered) must not collapse into
    // `false`, which the card renders as «لا يستقبل موكلين حالياً» — a
    // statement the lawyer never made.
    isAcceptingClients:
      lp?.is_accepting_clients === true ? true
      : lp?.is_accepting_clients === false ? false
      : undefined,
    avatarUrl: text(row.avatar_url),
  };
}

export function toDirectoryLawyers(
  rows: DirectoryLawyerRow[] | null | undefined,
): DirectoryLawyer[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(toDirectoryLawyer)
    .filter((l): l is DirectoryLawyer => l !== null);
}

// ─── Search & facets ──────────────────────────────────────────────────────────

/**
 * Does this card match what was typed?
 *
 * Lives here, not in the page, for one reason: the version in the page was
 * `l.name.includes(q)` on a model whose `name` was always `undefined`, so the
 * directory THREW on the first keystroke. Every field read below is optional
 * and treated as such, and the behaviour is under test.
 *
 * `toLowerCase()` is applied to both sides. It does nothing for Arabic — the
 * script is caseless — but the corpus contains Latin-script firm names and
 * `display_name_en`, and lowercasing only one side is a bug that only shows up
 * for those.
 */
export function matchesDirectoryQuery(
  lawyer: DirectoryLawyer,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [lawyer.name, lawyer.city, lawyer.bio, ...lawyer.specialties];
  return haystack.some((field) => field?.toLowerCase().includes(q));
}

/**
 * The cities and specialisations to offer as filters, derived from the rows
 * that actually came back.
 *
 * The page used to carry hard-coded chip lists — eight cities, nine
 * specialisation keys — matched against `l.specialtyKey`, a field the API has
 * never returned. Every chip was therefore a filter that matched nothing, and
 * we cannot verify from the client whether the DB stores «عمالي», `labor` or a
 * canonical SA-xx code. Deriving the options from the data means a chip can
 * only ever offer a filter that has at least one result behind it.
 */
export function directoryFacet(
  lawyers: DirectoryLawyer[],
  key: "city" | "specialties",
): string[] {
  const seen = new Set<string>();
  for (const lawyer of lawyers) {
    if (key === "city") {
      if (lawyer.city) seen.add(lawyer.city);
    } else {
      for (const s of lawyer.specialties) seen.add(s);
    }
  }
  // Arabic collation, so «الرياض» and «جدة» sort the way a reader expects
  // rather than by code point.
  return [...seen].sort((a, b) => a.localeCompare(b, "ar"));
}

/**
 * How many lawyers said yes to new clients.
 *
 * `=== true` only: a `null` (never answered) counted as available was one of
 * the invented numbers this pass exists to delete.
 */
export function acceptingClientsCount(lawyers: DirectoryLawyer[]): number {
  return lawyers.filter((l) => l.isAcceptingClients === true).length;
}

// ─── Ordering ─────────────────────────────────────────────────────────────────

/** The orderings the page offers. Every one maps to a column that exists. */
export type DirectorySortKey = "experience" | "fee_asc" | "name";

/**
 * Sort a value the lawyer never stated to the END, in both directions.
 *
 * A lawyer who never entered his years of practice is not the least
 * experienced, one who never published an hourly rate is not the cheapest, and
 * one with no display name in either language is not first in the alphabet.
 * Treating `undefined` as 0 — or, for the name, as `''` — ranks the four
 * near-empty production rows above every lawyer who filled his profile in.
 *
 * Returns `null` when both values are stated, which is the caller's signal to
 * apply its own comparison; the non-null assertions below are safe on exactly
 * that branch.
 */
function unstatedLast<T>(a: T | undefined, b: T | undefined): number | null {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return null;
}

/**
 * The directory's orderings, in the tested module rather than beside the call
 * site.
 *
 * They lived in the page, where `unstatedLast` was written, documented as
 * "unstated last, in BOTH directions", applied to `yearsExperience` and
 * `hourlyRate` — and then simply not applied to the third comparator, which
 * was `(a.name ?? '').localeCompare(b.name ?? '', 'ar')`. `''` collates before
 * every real name, so «أبجدياً» gave top billing to the one card that renders
 * with no heading at all, contradicting the invariant three lines above it.
 * An invariant that is restated by hand at each call site is an invariant that
 * will be forgotten at one of them.
 *
 * Returns a NEW array; the caller's list is never reordered in place, because
 * `lawyers` is React state and `Array.prototype.sort` mutates.
 */
export function sortDirectoryLawyers(
  lawyers: DirectoryLawyer[],
  key: DirectorySortKey,
): DirectoryLawyer[] {
  const result = [...lawyers];
  switch (key) {
    case "fee_asc":
      return result.sort(
        (a, b) =>
          unstatedLast(a.hourlyRate, b.hourlyRate) ??
          a.hourlyRate! - b.hourlyRate!,
      );
    case "name":
      return result.sort(
        (a, b) =>
          unstatedLast(a.name, b.name) ?? a.name!.localeCompare(b.name!, "ar"),
      );
    case "experience":
    default:
      return result.sort(
        (a, b) =>
          unstatedLast(a.yearsExperience, b.yearsExperience) ??
          b.yearsExperience! - a.yearsExperience!,
      );
  }
}

// ─── Arabic number agreement ──────────────────────────────────────────────────
// Arabic has singular / dual / plural-of-paucity / plural, and the old card
// printed `{l.experienceYears} سنة` for all of them — «1 سنة», «2 سنة»,
// «12 سنة». These helpers live in the tested module rather than in the page so
// the agreement is pinned — the VERB included, since a correct noun beside a
// hard-coded plural verb is still a disagreeing sentence;
// src/app/lawyers/browse/page.tsx carries its own copies and should import
// these instead (that file belongs to another change).

/** «سنة واحدة من الممارسة» … «١٢ سنة من الممارسة». */
export function arabicYearsOfPractice(years: number): string {
  if (years === 1) return "سنة واحدة من الممارسة";
  if (years === 2) return "سنتان من الممارسة";
  const n = years.toLocaleString("ar-SA");
  // 3–10 take the plural of paucity («سنوات»); 11 and up revert to the
  // singular noun in the accusative («سنة»).
  return years <= 10 ? `${n} سنوات من الممارسة` : `${n} سنة من الممارسة`;
}

/** «محامٍ واحد» / «محاميان» / «٥ محامين» / «١٢ محامياً». */
export function arabicLawyerCount(count: number): string {
  if (count === 1) return "محامٍ واحد";
  if (count === 2) return "محاميان";
  const n = count.toLocaleString("ar-SA");
  return count <= 10 ? `${n} محامين` : `${n} محامياً`;
}

/**
 * The predicate that has to agree with `arabicLawyerCount` above it:
 * «يستقبل» / «يستقبلان» / «يستقبلون موكلين جدداً».
 *
 * It is here, and not next to the count, because that is precisely where it
 * went wrong: the header printed `arabicLawyerCount(acceptingCount)` directly
 * above a FIXED plural literal «يستقبلون موكلين جدداً», so «محامٍ واحد /
 * يستقبلون» and «محاميان / يستقبلون» were both on screen — and a directory of
 * one or two is the EXPECTED state the moment the first lawyer opts in, not an
 * edge case. A helper that gets the noun right, beside a literal that gets the
 * verb wrong, is not agreement; it is half of one.
 *
 * 11 and up keep the plural verb even though the noun reverts to the singular
 * accusative («١٢ محامياً يستقبلون»): the تمييز is singular, the subject is not.
 * 0 never reaches a screen — the caller renders nothing when there is nothing
 * to count — so it falls through to the plural rather than earning a branch.
 */
export function arabicAcceptingClientsPredicate(count: number): string {
  if (count === 1) return "يستقبل موكلين جدداً";
  if (count === 2) return "يستقبلان موكلين جدداً";
  return "يستقبلون موكلين جدداً";
}
