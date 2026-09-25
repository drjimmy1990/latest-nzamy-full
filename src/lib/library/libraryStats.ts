/**
 * The legal library's size, as the public site advertises it.
 *
 * WHY THIS EXISTS. Six components (home SocialProof + CommunityHighlights,
 * LegalLibraryBanner, /about, /ai, /login) used to print hardcoded figures:
 * first «٣٨٦ / ١٣٬٠٠٠+ / ١٧٬٠٠٠+» (true on the cloud project), then
 * «٥٬٩٠٠+ / ١١٠٬٠٠٠+» (true only on the self-hosted instance). The same code
 * is deployed against EITHER database, so any literal is false on one of them.
 * Every figure now comes from a real count of whichever database the site
 * runs on, read by GET /api/library/stats (cached ~24h there).
 *
 * This module is deliberately CLIENT-SAFE: no next/cache, no next/headers, no
 * "@/" imports. It holds the types, the count routine (over an injected
 * client, so the route owns the client and the cache), the display rules, the
 * response parser. The cached read lives in src/app/api/library/stats/route.ts;
 * the client hook lives in ./useLibraryStats.ts (a separate file because the
 * route imports this one, and an App Route may not import a module that uses
 * React hooks).
 *
 * DISPLAY RULES (floors, never exact totals — a floor stays true as rows are
 * added): below 10,000 floor to the hundred, from 10,000 floor to the
 * thousand, then «+». 5,901 → ٥٬٩٠٠+; 110,794 → ١١٠٬٠٠٠+; 18,983 → ١٨٬٠٠٠+;
 * 386 → ٣٠٠+.
 *
 * LABELS. library.laws holds EVERY instrument type (on self-hosted only 593 of
 * 5,901 rows are «نظام»; the rest are لائحة تنفيذية, قرار, اتفاقية دولية,
 * مرسوم ملكي, تعميم …), so it is «وثيقة نظامية», never «نظام ولائحة».
 */

export type LibraryStatKey = "laws" | "articles" | "principles" | "decrees";

export type LibraryStats = Record<LibraryStatKey, number>;

/** Display order used by every counter strip. */
export const LIBRARY_STAT_KEYS: readonly LibraryStatKey[] = ["laws", "articles", "principles", "decrees"];

/**
 * Table and a narrow, always-present column per stat. A narrow head:true
 * select keeps the count cheap (the cloud's anon statement_timeout is ~3s; a
 * wide select on principles measured 2.9s there, a narrow one 0.2s).
 * library.laws has no `id` column — its key is `slug`.
 */
export const LIBRARY_STAT_TABLES: Readonly<Record<LibraryStatKey, { table: string; column: string }>> = {
  laws: { table: "laws", column: "slug" },
  articles: { table: "articles", column: "id" },
  principles: { table: "principles", column: "id" },
  decrees: { table: "decrees_circulars", column: "id" },
};

export const LIBRARY_STAT_LABELS: Readonly<Record<LibraryStatKey, { ar: string; en: string }>> = {
  laws: { ar: "وثيقة نظامية", en: "Legal instruments" },
  articles: { ar: "مادة", en: "Articles" },
  principles: { ar: "مبدأ قضائي", en: "Judicial principles" },
  decrees: { ar: "قرار وتعميم", en: "Decrees & circulars" },
};

// ─── Counting (server side, client injected) ────────────────────────────────

interface HeadCountResult {
  count: number | null;
  error: { message: string; code?: string } | null;
}

/** The slice of a supabase-js client this module uses. */
export interface LibraryCountClient {
  schema(name: "library"): {
    from(table: string): {
      select(columns: string, options: { count: "exact"; head: true }): PromiseLike<HeadCountResult>;
    };
  };
}

/**
 * Exact row counts for the four advertised tables, in parallel. Throws on any
 * error or on a null count: a failed count must never become a displayed 0,
 * and one table failing means the caller shows no numbers at all.
 */
export async function countLibraryTables(client: LibraryCountClient): Promise<LibraryStats> {
  const entries = await Promise.all(
    LIBRARY_STAT_KEYS.map(async (key) => {
      const { table, column } = LIBRARY_STAT_TABLES[key];
      const { count, error } = await client
        .schema("library")
        .from(table)
        .select(column, { count: "exact", head: true });
      if (error) throw new Error(`library.${table} count failed: ${error.message}`);
      if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
        throw new Error(`library.${table} count missing`);
      }
      return [key, count] as const;
    }),
  );
  return Object.fromEntries(entries) as LibraryStats;
}

// ─── Display ────────────────────────────────────────────────────────────────

/** <10k → floor to 100; ≥10k → floor to 1,000. Never rounds up. */
export function floorLibraryCount(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const step = n >= 10_000 ? 1_000 : 100;
  return Math.floor(n / step) * step;
}

/**
 * «٥٬٩٠٠+» (Arabic) or «5,900+» (English). Returns null when the floor is 0
 * (fewer than 100 rows): «٠+» says nothing true worth printing.
 */
export function formatLibraryCount(n: number, lang: "ar" | "en" = "ar"): string | null {
  const floored = floorLibraryCount(n);
  if (floored <= 0) return null;
  return `${floored.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}+`;
}

// ─── Response caching ───────────────────────────────────────────────────────

/** Normal case (library open): safe to sit in a shared cache for everyone. */
export const STATS_CACHE_PUBLIC = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400";

/**
 * The library is closed and this 200 only exists because the caller is an
 * admin — libraryGate() (src/lib/library-gate.ts) sends every non-admin a 503
 * instead. A shared cache (nginx, a CDN) does not know that: `public`/
 * `s-maxage` on this response would let it replay the counts to the very
 * next guest, while the library is closed to them. `private, no-store` keeps
 * it out of every shared cache, and out of the admin's own browser cache too.
 */
export const STATS_CACHE_PRIVATE = "private, no-store";

/**
 * Cache-Control for a GET /api/library/stats 200, given whether the library
 * is currently closed (in which case reaching this 200 at all means the
 * caller is an admin — see STATS_CACHE_PRIVATE). Pure so the decision is
 * testable without a request or a Supabase client.
 */
export function statsCacheControl(libraryClosed: boolean): string {
  return libraryClosed ? STATS_CACHE_PRIVATE : STATS_CACHE_PUBLIC;
}

export const LIBRARY_STATS_ENDPOINT = "/api/library/stats";

/**
 * Validates the GET /api/library/stats body ({ data: { laws, articles,
 * principles, decrees } }). Anything else — an error body, a missing or
 * non-numeric field — is null, so the caller shows no number.
 */
export function parseLibraryStatsResponse(body: unknown): LibraryStats | null {
  if (!body || typeof body !== "object") return null;
  const data = (body as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const out: Partial<LibraryStats> = {};
  for (const key of LIBRARY_STAT_KEYS) {
    const v = (data as Record<string, unknown>)[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
    out[key] = v;
  }
  return out as LibraryStats;
}
