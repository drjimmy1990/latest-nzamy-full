/**
 * citationCheck.ts — L8 مراجعة وتدقيق مذكرة: every article a memo cites, checked
 * against the library by the app (plan §5 L8). The model only reports what the
 * memo cites, as written (law name + article number); it never decides whether
 * an article exists, is in force, or was amended. This module does, on the
 * job's callback, before the result is stored:
 *
 *   law name → library.laws (spelling-tolerant: alef/hamza, taa marbuta and
 *              alif maqsura match each other; a year suffix «لعام …هـ» is not
 *              part of the name) → the best candidates (exact name first, the
 *              law in force first)
 *   number   → library.articles of those laws → ok (in force) / amended /
 *              repealed / not_found (no such law, or no such article in it)
 *
 * A library read that fails marks its citations `unchecked` rather than failing
 * a paid run.
 *
 * Pure: relative imports only (type-only for Supabase), so `node --test` runs it.
 */
import type { createServiceClient } from "../supabase/server.ts";
import { normalizeSearch } from "../../utils/normalizeArabic.ts";
import { apiSlug } from "../../utils/apiSlug.ts";

/** The service-role client (the alias library-column-lock.test.ts recognises). */
type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export interface CitedRef {
  law: string;
  article: number;
  as_written: string;
}

export type CitationStatus = "ok" | "amended" | "repealed" | "not_found" | "unchecked";

export interface CitationResult {
  cited: string;
  law: string;
  article: number;
  status: CitationStatus;
  /** Why it is not_found: the law, or the article in it. */
  missing?: "law" | "article";
  law_title?: string;
  library_id?: string;
  url?: string;
}

interface LawRow { slug: string; title: string; status: string | null }
interface ArticleRow { id: string; number: number | null; status: string | null; law_slug: string }

const MAX_CITATIONS = 30;
const MAX_LAWS = 15;
const CANDIDATES_PER_LAW = 3;

/** A law title reduced to what names it: normalised letters, no diacritics, no year suffix. */
export function coreTitle(s: string): string {
  return normalizeSearch(String(s ?? ""))
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/\(.*?\)/g, " ")
    // «لعام 1426هـ», «الصادر بالمرسوم…»: whole words only («العامة» is part of a name).
    .replace(/(^|\s)(لعام|عام|الصادر)(\s.*)?$/u, " ")
    .replace(/\d+\s*ه?ـ?/g, " ")
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The ILIKE pattern for a law name: each letter that has spelling variants in
 * the library (ا أ إ آ, ه ة, ي ى) becomes `_`, so «نظام الاثبات» finds «نظام
 * الإثبات». LIKE's own wildcards in the name are escaped first.
 */
export function lawNamePattern(name: string): string {
  const core = coreTitle(name);
  return `%${core.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[اأإآهةيى]/g, "_").replace(/\s+/g, "%")}%`;
}

/** Candidates best first: the exact name, then a title starting with it, then the rest; the law in force first; the shorter title first. */
export function rankLaws(name: string, laws: LawRow[]): LawRow[] {
  const want = coreTitle(name);
  const score = (l: LawRow) => {
    const t = coreTitle(l.title);
    return (t === want ? 0 : t.startsWith(want) ? 1 : 2) * 10 + (l.status === "active" || !l.status ? 0 : 1);
  };
  return [...laws].sort((a, b) => score(a) - score(b) || a.title.length - b.title.length);
}

const STATUS_RANK: Record<string, number> = { active: 0, amended: 1, repealed: 2 };

/** One law's article number → its status: in force if any version is, then amended, then repealed. */
function articleStatus(rows: ArticleRow[]): { status: CitationStatus; row: ArticleRow } {
  const best = [...rows].sort((a, b) => (STATUS_RANK[a.status ?? "active"] ?? 3) - (STATUS_RANK[b.status ?? "active"] ?? 3))[0];
  const s = best.status ?? "active";
  return { status: s === "repealed" ? "repealed" : s === "amended" ? "amended" : "ok", row: best };
}

/** The model's list of what the memo cites, cleaned: a law name, a whole article number, each pair once. */
export function cleanCited(raw: unknown): CitedRef[] {
  if (!Array.isArray(raw)) return [];
  const out: CitedRef[] = [];
  for (const c of raw) {
    if (typeof c !== "object" || c === null) continue;
    const r = c as Record<string, unknown>;
    const law = typeof r.law === "string" ? r.law.trim().slice(0, 200) : "";
    const n = typeof r.article === "number" ? r.article : Number(String(r.article ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
    if (!law || !Number.isInteger(n) || n < 1 || n > 9999) continue;
    if (out.some((x) => coreTitle(x.law) === coreTitle(law) && x.article === n)) continue;
    const asWritten = typeof r.as_written === "string" && r.as_written.trim() ? r.as_written.trim().slice(0, 200) : `المادة ${n} من ${law}`;
    out.push({ law, article: n, as_written: asWritten });
    if (out.length >= MAX_CITATIONS) break;
  }
  return out;
}

export async function checkCitations(admin: ServiceClient, cited: CitedRef[]): Promise<CitationResult[]> {
  const byLaw = new Map<string, CitedRef[]>();
  for (const c of cited) {
    const key = coreTitle(c.law);
    if (!byLaw.has(key) && byLaw.size >= MAX_LAWS) continue;
    byLaw.set(key, [...(byLaw.get(key) ?? []), c]);
  }

  const results = new Map<CitedRef, CitationResult>();
  await Promise.all(
    [...byLaw.values()].map(async (refs) => {
      const name = refs[0].law;
      const base = (c: CitedRef): CitationResult => ({ cited: c.as_written, law: c.law, article: c.article, status: "unchecked" });
      const laws = await admin.schema("library").from("laws").select("slug, title, status").ilike("title", lawNamePattern(name)).limit(25);
      if (laws.error) {
        console.warn("[ai/citations] laws", laws.error.code, laws.error.message);
        for (const c of refs) results.set(c, base(c));
        return;
      }
      const candidates = rankLaws(name, (laws.data ?? []) as LawRow[]).slice(0, CANDIDATES_PER_LAW);
      if (candidates.length === 0) {
        for (const c of refs) results.set(c, { ...base(c), status: "not_found", missing: "law" });
        return;
      }
      const arts = await admin
        .schema("library")
        .from("articles")
        .select("id, number, status, law_slug")
        .in("law_slug", candidates.map((l) => l.slug))
        .in("number", [...new Set(refs.map((c) => c.article))]);
      if (arts.error) {
        console.warn("[ai/citations] articles", arts.error.code, arts.error.message);
        for (const c of refs) results.set(c, { ...base(c), law_title: candidates[0].title });
        return;
      }
      const rows = (arts.data ?? []) as ArticleRow[];
      for (const c of refs) {
        // The best-ranked law that has this article; else the article is missing from the best law.
        const law = candidates.find((l) => rows.some((r) => r.law_slug === l.slug && r.number === c.article));
        if (!law) {
          results.set(c, { ...base(c), status: "not_found", missing: "article", law_title: candidates[0].title });
          continue;
        }
        const { status, row } = articleStatus(rows.filter((r) => r.law_slug === law.slug && r.number === c.article));
        results.set(c, {
          ...base(c),
          status,
          law_title: law.title,
          library_id: row.id,
          url: `/laws/${apiSlug(law.slug)}#${encodeURIComponent(row.id)}`,
        });
      }
    }),
  );
  // In the memo's order; a citation past the law cap stays unchecked.
  return cited.map((c) => results.get(c) ?? { cited: c.as_written, law: c.law, article: c.article, status: "unchecked" as const });
}

/** The job's validated output → what is stored: the model's `cited` list replaced by the library's verdict on it. */
export async function enrichBriefCheck(admin: ServiceClient, output: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { cited, ...rest } = output;
  return { ...rest, citation_check: await checkCitations(admin, cleanCited(cited)) };
}
