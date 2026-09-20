#!/usr/bin/env npx ts-node
/**
 * seed-library.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Universal seeder for the Nzamy Legal Library.
 *
 * Reads JSON output files from the four parsers (laws, decrees, precedents,
 * feqh) and inserts all data into Supabase in FK-safe order.
 *
 * Insertion order:
 *   1. laws          → chapters → articles → article_amendments
 *   2. decrees_circulars → decree_pages
 *   3. judicial_collections → principles → principle_paragraphs
 *   4. feqh_books    → feqh_chapters → feqh_sections → feqh_blocks
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL    — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   — Service role key (bypasses RLS)
 *
 * Usage:
 *   npx tsx scripts/seed-library.ts --dir ./output
 *   npx tsx scripts/seed-library.ts --dir ./output --dry-run
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { assertPublicCorpusRows } from "./parsers/corpus-scope";
import {
  assertLiveSeedPreflight,
  findUnresolvedLawTypeReviews,
  findUnseededPrecedentDetails,
  PRIVATE_PRECEDENT_STORAGE_VERSION,
} from "./seed-library.live-preflight";

// ══════════════════════════════════════════════════════════════════════════════
// Types — Imported from parser output shapes
// ══════════════════════════════════════════════════════════════════════════════

type ContentType = "laws" | "decrees" | "precedents" | "feqh";

interface SeedStats {
  table: string;
  inserted: number;
  skipped: number;
  errors: number;
}

interface SeedResult {
  dry_run: boolean;
  /** Present only for an explicitly requested, local dry-seed snapshot. */
  dry_seed_jsonl_dir?: string;
  dry_seed_row_counts?: Record<string, number>;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  stats: SeedStats[];
  errors: string[];
}

// ══════════════════════════════════════════════════════════════════════════════
// Supabase Client
// ══════════════════════════════════════════════════════════════════════════════

let supabaseClient: ReturnType<typeof createSupabaseClient> | null = null;

// Target schema. Defaults to the live schema; set LIBRARY_SCHEMA=library_next to
// seed a shadow build that production is not yet reading from.
const LIBRARY_SCHEMA = process.env.LIBRARY_SCHEMA || "library";

function createSupabaseClient(url: string, key: string) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "Content-Profile": LIBRARY_SCHEMA,
    "Accept-Profile": LIBRARY_SCHEMA,
  };

  return {
    url,
    headers,

    async upsert(
      table: string,
      rows: Record<string, unknown>[],
      options?: { onConflict?: string }
    ): Promise<{ data: Record<string, unknown>[] | null; error: string | null }> {
      if (rows.length === 0) return { data: [], error: null };

      const conflictTarget = options?.onConflict || (table === "laws" ? "slug" : "id");
      const urlWithConflict = `${url}/rest/v1/${table}?on_conflict=${conflictTarget}`;

      try {
        const resp = await fetch(urlWithConflict, {
          method: "POST",
          headers: {
            ...headers,
            Prefer: "return=representation,resolution=merge-duplicates"
          },
          body: JSON.stringify(rows),
        });

        if (!resp.ok) {
          const body = await resp.text();
          return { data: null, error: `${resp.status}: ${body}` };
        }

        const data = await resp.json();
        return { data: Array.isArray(data) ? data : [data], error: null };
      } catch (err) {
        return { data: null, error: (err as Error).message };
      }
    },

    async delete(table: string, filter: Record<string, string>): Promise<{ error: string | null }> {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filter)) {
        params.append(key, value);
      }
      // PostgREST refuses an unfiltered DELETE (400). When no filter is given,
      // match every row via a "<pk> not null" predicate so --clean actually clears
      // the table. `laws` has no `id` column (its PK is `slug`); every other library
      // table has `id`. Using the wrong column 400s ("column ... does not exist").
      if (params.toString() === "") {
        params.append(table === "laws" ? "slug" : "id", "not.is.null");
      }

      try {
        const resp = await fetch(`${url}/rest/v1/${table}?${params.toString()}`, {
          method: "DELETE",
          headers,
        });
        if (!resp.ok) {
          const body = await resp.text();
          return { error: `${resp.status}: ${body}` };
        }
        return { error: null };
      } catch (err) {
        return { error: (err as Error).message };
      }
    },

    async rpc(
      functionName: string,
      params: Record<string, unknown> = {},
    ): Promise<{ data: unknown; error: string | null }> {
      try {
        const resp = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
          method: "POST",
          headers: {
            ...headers,
            // Library rows use the private `library` schema, but the narrowly
            // granted RPC facade is deliberately in `public` for PostgREST.
            "Content-Profile": "public",
            "Accept-Profile": "public",
          },
          body: JSON.stringify(stripNul(params)),
        });
        if (!resp.ok) {
          const body = await resp.text();
          return { data: null, error: `${resp.status}: ${body}` };
        }
        const text = await resp.text();
        return { data: text ? JSON.parse(text) : null, error: null };
      } catch (err) {
        return { data: null, error: (err as Error).message };
      }
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Batch upsert helper
// ══════════════════════════════════════════════════════════════════════════════

const BATCH_SIZE = 100;

// Postgres `text`/`jsonb` cannot store NUL (U+0000); PostgREST rejects it with
// 22P05 "unsupported Unicode escape sequence". Scanned/HTML/PDF-extracted source
// (decrees, feqh) contains stray NULs — strip them from every string value,
// recursing into arrays/objects, before upserting.
function stripNul<T>(value: T): T {
  if (typeof value === "string") return value.split(String.fromCharCode(0)).join("") as unknown as T;
  if (Array.isArray(value)) return value.map(stripNul) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = stripNul(v);
    return out as unknown as T;
  }
  return value;
}

/**
 * An append-free representation of the rows that a dry seed would submit to
 * PostgREST.  It is deliberately created only in a fresh directory outside
 * this developer pack: this is an inspection artefact, not another seed
 * input, and it must never silently replace an earlier audit snapshot.
 */
export interface DrySeedJsonlExporter {
  readonly outputDir: string;
  readonly rowCounts: Readonly<Record<string, number>>;
  write(table: string, rows: Record<string, unknown>[]): void;
}

export function pathIsWithin(
  candidate: string,
  parent: string,
  pathApi: Pick<typeof path, "relative" | "isAbsolute" | "sep"> = path,
): boolean {
  const relative = pathApi.relative(parent, candidate);
  // On Windows, a different volume returns an absolute path (D:\\audit)
  // rather than ../audit. It is outside the package, not inside it.
  return relative === "" || (!pathApi.isAbsolute(relative)
    && !relative.startsWith(`..${pathApi.sep}`) && relative !== "..");
}

/**
 * Creates a brand-new audit directory. The caller must select an absolute
 * path whose existing parent resolves outside the developer package.  The
 * check resolves the parent first, so a symlink cannot smuggle output back
 * into the package; no existing output directory or JSONL file is reused.
 */
export function createDrySeedJsonlExporter(
  requestedDir: string,
  protectedProjectRoot: string,
): DrySeedJsonlExporter {
  if (!path.isAbsolute(requestedDir)) {
    throw new Error("--dry-seed-jsonl-dir must be an absolute path outside the developer package.");
  }

  const outputDir = path.resolve(requestedDir);
  if (fs.existsSync(outputDir)) {
    throw new Error(`Refusing to reuse existing dry-seed output directory: ${outputDir}`);
  }

  const parentDir = path.dirname(outputDir);
  if (!fs.existsSync(parentDir) || !fs.statSync(parentDir).isDirectory()) {
    throw new Error(`Dry-seed output parent must already exist and be a directory: ${parentDir}`);
  }

  const realParent = fs.realpathSync(parentDir);
  const webRoot = path.resolve(protectedProjectRoot);
  const candidateBundleRoot = path.dirname(webRoot);
  const bundleRoot = path.basename(webRoot) === "web"
    && fs.existsSync(path.join(candidateBundleRoot, "MANIFEST.json"))
    && fs.existsSync(path.join(candidateBundleRoot, "corpus"))
    && fs.existsSync(path.join(candidateBundleRoot, "sample"))
    ? candidateBundleRoot : webRoot;
  const realProjectRoot = fs.realpathSync(bundleRoot);
  if (pathIsWithin(realParent, realProjectRoot)) {
    throw new Error("Refusing dry-seed output inside the developer package.");
  }

  fs.mkdirSync(outputDir, { mode: 0o700 });
  const rowCounts: Record<string, number> = {};

  return {
    outputDir,
    rowCounts,
    write(table, rows) {
      const filePath = path.join(outputDir, `${table}.jsonl`);
      // `wx` is intentional: a future call for the same table must fail
      // rather than append a second, ambiguous snapshot.
      const body = rows.map((row) => JSON.stringify(row)).join("\n");
      fs.writeFileSync(filePath, body.length > 0 ? `${body}\n` : "", { encoding: "utf8", flag: "wx", mode: 0o600 });
      rowCounts[table] = rows.length;
    },
  };
}

async function batchUpsert(
  client: NonNullable<typeof supabaseClient>,
  table: string,
  rows: Record<string, unknown>[],
  dryRun: boolean,
  stats: SeedStats,
  errors: string[],
  drySeedExporter?: DrySeedJsonlExporter,
): Promise<void> {
  if (dryRun) {
    // Match the actual live payload shape: live upserts strip NUL characters
    // before serialisation, so a dry snapshot must do the same.
    drySeedExporter?.write(table, rows.map(stripNul));
    if (rows.length === 0) return;
    console.log(`    [DRY RUN] Would insert ${rows.length} rows into ${table}`);
    stats.inserted += rows.length;
    return;
  }

  if (rows.length === 0) return;

  // Upsert a slice; on failure, split-and-retry down to a single row. This both
  // shrinks the payload past a Postgres statement timeout (57014) AND isolates a
  // single offending row so one bad row no longer fails its whole 100-row batch.
  async function upsertSlice(slice: Record<string, unknown>[]): Promise<void> {
    if (slice.length === 0) return;
    const { error } = await client.upsert(table, slice.map(stripNul));
    if (!error) {
      stats.inserted += slice.length;
      return;
    }
    if (slice.length > 1) {
      const mid = Math.floor(slice.length / 2);
      await upsertSlice(slice.slice(0, mid));
      await upsertSlice(slice.slice(mid));
      return;
    }
    // Single row still failing → record and move on (don't abort the whole seed).
    console.error(`\n    ✗ Row failed in ${table}: ${error}`);
    errors.push(`${table} row: ${error}`);
    stats.errors += 1;
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const progress = Math.min(i + BATCH_SIZE, rows.length);
    process.stdout.write(`    → ${table}: ${progress}/${rows.length} rows\r`);
    await upsertSlice(batch);
  }

  console.log(`    ✓ ${table}: ${stats.inserted} inserted, ${stats.errors} errors`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Deterministic UUID (UUIDv5-style) for child rows whose PK/FK columns are `uuid`
// on the live schema (chapters.id, articles.chapter_id, article_amendments.id,
// decree_pages.id, principle_paragraphs.id, feqh_chapters.id, feqh_sections.id +
// chapter_id, feqh_blocks.section_id). Derived string keys like `${lawId}__ch-N`
// are NOT valid uuids; hashing them to a stable uuid keeps parent↔child FKs
// consistent AND is idempotent across re-seeds. Passthrough if already a uuid.
// ══════════════════════════════════════════════════════════════════════════════
export function toUuid(key: string): string {
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(key)) {
    return key.toLowerCase();
  }
  const h = crypto.createHash("sha1").update(key).digest();
  h[6] = (h[6] & 0x0f) | 0x50; // version 5
  h[8] = (h[8] & 0x3f) | 0x80; // RFC-4122 variant
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Make collId__pr-number identities unique without changing the one existing
 * row that the former Map last-wins behaviour retained. Earlier duplicates get
 * a deterministic, source-order-derived suffix; their source number/text stay
 * untouched, and the returned ids always fit principles.id varchar(150).
 */
function resolveLastWinsStringIds(legacyIds: readonly string[], label: string): string[] {
  const totals = new Map<string, number>();
  for (const id of legacyIds) totals.set(id, (totals.get(id) || 0) + 1);

  const seen = new Map<string, number>();
  const resolved = new Set<string>();
  return legacyIds.map((legacyId) => {
    const occurrence = (seen.get(legacyId) || 0) + 1;
    seen.set(legacyId, occurrence);
    const total = totals.get(legacyId) || 0;

    // The final occurrence is the exact row preserved by the old Map.
    if (total === 1 || occurrence === total) {
      if (resolved.has(legacyId)) throw new Error(`${label} id collision: ${legacyId}`);
      resolved.add(legacyId);
      return legacyId;
    }

    // The occurrence is fixed by source order; the hash keeps a long base from
    // eating the suffix, while avoiding a made-up legal locator in the id.
    const suffix = `__dup-${toUuid(`${legacyId}::${occurrence}`).replace(/-/g, "").slice(0, 12)}`;
    const id = `${legacyId.slice(0, 150 - suffix.length)}${suffix}`;
    if (resolved.has(id)) throw new Error(`generated ${label} id collision: ${id}`);
    resolved.add(id);
    return id;
  });
}

export function resolvePrecedentPrincipleIds(legacyIds: readonly string[]): string[] {
  return resolveLastWinsStringIds(legacyIds, "principle");
}

// The historic seeder used a Map keyed by each UUID/text identity, preserving
// only the final source occurrence. Keep that surviving id byte-for-byte while
// assigning deterministic ids to earlier occurrences. This is identity repair,
// not a legal locator: source numbers, titles, and text are never altered.
export function resolveLawChapterIds(legacyIds: readonly string[]): string[] {
  const totals = new Map<string, number>();
  for (const id of legacyIds) totals.set(id, (totals.get(id) || 0) + 1);

  const seen = new Map<string, number>();
  const resolved = new Set<string>();
  return legacyIds.map((legacyId) => {
    const occurrence = (seen.get(legacyId) || 0) + 1;
    seen.set(legacyId, occurrence);
    const total = totals.get(legacyId) || 0;
    const id = total === 1 || occurrence === total
      ? legacyId
      : toUuid(`${legacyId}::law-chapter-duplicate::${occurrence}`);
    if (resolved.has(id)) throw new Error(`generated law chapter id collision: ${id}`);
    resolved.add(id);
    return id;
  });
}

export function resolveLawArticleIds(legacyIds: readonly string[]): string[] {
  return resolveLastWinsStringIds(legacyIds, "law article");
}

/**
 * Preserve the historic Map survivor for decree page identities while making
 * prior same-number page occurrences stable UUIDs. Page numbers and content
 * remain source values; the alternate UUID is only a storage identity.
 */
export function resolveDecreePageIds(legacyIds: readonly string[]): string[] {
  const totals = new Map<string, number>();
  for (const id of legacyIds) totals.set(id, (totals.get(id) || 0) + 1);

  const seen = new Map<string, number>();
  const resolved = new Set<string>();
  return legacyIds.map((legacyId) => {
    const occurrence = (seen.get(legacyId) || 0) + 1;
    seen.set(legacyId, occurrence);
    const total = totals.get(legacyId) || 0;
    const id = total === 1 || occurrence === total
      ? legacyId
      : toUuid(`${legacyId}::decree-page-duplicate::${occurrence}`);
    if (resolved.has(id)) throw new Error(`generated decree page id collision: ${id}`);
    resolved.add(id);
    return id;
  });
}

// Clamp to the PostgreSQL int4 range. Source data sometimes puts a case/ruling
// number (17+ digits) into an integer column (year_hijri/order_index) → 22003
// "out of range for type integer". Out-of-range/NaN → fallback instead of a crash.
const INT4_MAX = 2147483647;

/**
 * Instrument types the decrees_circulars CHECK constraint accepts. MUST stay in
 * sync with supabase/migrations/20260729_decree_instrument_taxonomy.sql. The
 * three legacy values are included because existing rows still carry them.
 */
const ALLOWED_DECREE_TYPES = new Set([
  "royal", "cabinet", "circular",
  "royal_decree", "royal_order", "supreme_order", "supreme_directive", "decree",
  "cabinet_decision", "ministerial_decision", "economic_council_decision",
  "administrative_decision", "decision",
  "rules", "principles", "regulation", "standards", "guide", "policy",
  "instructions", "organization", "interpretation", "law",
  "unknown",
]);

const ALLOWED_ARTICLE_STATUSES = new Set([
  "active", "amended", "repealed", "suspended", "added", "merged", "status_undeclared",
]);

/** Parser-independent boundary guard: never persist a missing article state as active. */
export function resolveSeedArticleStatus(rawValue: unknown): string {
  const status = rawValue == null ? "" : String(rawValue).trim();
  if (status === "") return "status_undeclared";
  if (!ALLOWED_ARTICLE_STATUSES.has(status)) {
    throw new Error(`unknown article status "${status}" at seed boundary`);
  }
  return status;
}

/**
 * Identity continuity is deliberately distinct from the status persisted for
 * display/search. Pre-57 parses collapsed missing article status to active;
 * the parser now carries provenance so that correcting the status does not
 * create a second article row on an upsert. This helper is never DB metadata.
 */
export function resolveArticleIdentityStatus(article: Record<string, unknown>): string {
  const status = resolveSeedArticleStatus(article.status);
  if (article.status_provenance === "missing") return "active";
  if (article.status_provenance === "synthetic_parent_legacy") {
    return resolveSeedArticleStatus(article.status_legacy_identity);
  }
  return status;
}
function safeInt(v: unknown, fallback: number | null): number | null {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n >= -2147483648 && n <= INT4_MAX ? n : fallback;
}

/** Source-order rank for every article in a law, independent of printed numbers. */
export function buildArticleOrderByRef(chapters: any[]): Map<any, number> {
  const orderByArticle = new Map<any, number>();
  const flat = (chapters || []).flatMap((chapter: any, ci: number) =>
    ((chapter?.articles || []) as any[]).map((article, ai) => ({ article, ci, ai })),
  );
  flat
    .sort((left, right) =>
      (left.article.source_index ?? Number.MAX_SAFE_INTEGER) - (right.article.source_index ?? Number.MAX_SAFE_INTEGER)
      || left.ci - right.ci || left.ai - right.ai,
    )
    .forEach(({ article }, order) => orderByArticle.set(article, order));
  return orderByArticle;
}

// ══════════════════════════════════════════════════════════════════════════════
// Seed: LAWS
// ══════════════════════════════════════════════════════════════════════════════

export async function seedLaws(
  client: NonNullable<typeof supabaseClient>,
  data: Record<string, unknown>,
  dryRun: boolean,
  errors: string[],
  clean: boolean,
  drySeedExporter?: DrySeedJsonlExporter,
): Promise<SeedStats[]> {
  const allStats: SeedStats[] = [];
  const laws = (data.laws || []) as any[];

  // Direct callers cannot bypass the file-bound preflight and publish a
  // source whose type review is still open, even under a permissive overlay.
  if (!dryRun) {
    const unresolvedTypes = findUnresolvedLawTypeReviews(data);
    if (unresolvedTypes.length > 0) {
      throw new Error(`${unresolvedTypes.length} law type-review marker(s) remain unresolved; no live law seed: ${unresolvedTypes.slice(0, 3).join(", ")}`);
    }
  }

  assertPublicCorpusRows(data, "laws");
  console.log(`\n🏛️  Seeding ${laws.length} laws...\n`);

  if (clean && !dryRun) {
    console.log("    🧹 Cleaning laws tables (delete before insert)...");
    // FK-safe order: children first.
    for (const t of ["article_amendments", "article_regulations", "articles", "chapters", "laws"]) {
      const { error } = await client.delete(t, {});
      if (error) {
        console.error(`    ✗ clean ${t}: ${error}`);
        errors.push(`clean ${t}: ${error}`);
      }
    }
  }

  const lawRows: Record<string, unknown>[] = [];
  const chapterRows: Record<string, unknown>[] = [];
  const articleRows: Record<string, unknown>[] = [];
  const amendmentRows: Record<string, unknown>[] = [];
  const regulationRows: Record<string, unknown>[] = [];

  // Allocate all child identities before writing rows. The previous per-row
  // construction then Map-deduplication lost the earlier occurrence whenever a
  // law restarted its chapter/article numbers. This plan deliberately retains
  // the old last-wins id for the final occurrence and gives only earlier source
  // rows deterministic identities, so existing surviving records are stable.
  const identityPlans = new Map<any, { chapterIds: string[]; articleIds: string[][] }>();
  const legacyChapterIds: string[] = [];
  const legacyArticleIds: string[] = [];

  for (const law of laws) {
    const lawId = String(law.slug || law.id);
    if (lawId.includes("EXTRACTION_REPORT")) continue;
    const chapters = (law.chapters || []) as any[];
    const articleIds: string[][] = [];
    const chapterIds: string[] = [];
    const seenArtIds = new Set<string>();
    const buildArtId = (core: string) => {
      const full = `${lawId}${core}`;
      if (full.length <= 150) return full;
      return `${lawId.substring(0, Math.max(0, 150 - core.length))}${core}`;
    };

    for (let ci = 0; ci < chapters.length; ci++) {
      const ch = chapters[ci];
      // Match the prior identity exactly (including its index fallback), then
      // resolve duplicates in one corpus-wide, source-order pass below.
      const legacyChapterId = toUuid(`${lawId}__ch-${ch.number ?? chapters.indexOf(ch)}`);
      chapterIds.push(legacyChapterId);
      legacyChapterIds.push(legacyChapterId);

      const articles = (ch.articles || []) as any[];
      articleIds.push([]);
      for (const art of articles) {
        const hasRealNumber = art.number !== null && art.number !== undefined && art.number !== 0;
        const baseNum = hasRealNumber ? art.number : `i${articles.indexOf(art)}`;
        const identityStatus = resolveArticleIdentityStatus(art);
        const statusSuffix = identityStatus !== "active" ? `-${identityStatus}` : "";
        let artCore = `__art-${baseNum}${statusSuffix}`;
        let artId = buildArtId(artCore);
        if (seenArtIds.has(artId)) {
          artCore = `${artCore}__ch${ch.number ?? "x"}_i${articles.indexOf(art)}`;
          artId = buildArtId(artCore);
        }
        seenArtIds.add(artId);
        articleIds[ci].push(artId);
        legacyArticleIds.push(artId);
      }
    }
    identityPlans.set(law, { chapterIds, articleIds });
  }

  const resolvedChapterIds = resolveLawChapterIds(legacyChapterIds);
  const resolvedArticleIds = resolveLawArticleIds(legacyArticleIds);
  let chapterIdCursor = 0;
  let articleIdCursor = 0;
  for (const law of laws) {
    const lawId = String(law.slug || law.id);
    if (lawId.includes("EXTRACTION_REPORT")) continue;
    const plan = identityPlans.get(law);
    if (!plan) throw new Error(`missing law identity plan: ${lawId}`);
    for (let ci = 0; ci < plan.chapterIds.length; ci++) {
      plan.chapterIds[ci] = resolvedChapterIds[chapterIdCursor++];
      for (let ai = 0; ai < plan.articleIds[ci].length; ai++) {
        plan.articleIds[ci][ai] = resolvedArticleIds[articleIdCursor++];
      }
    }
  }
  if (chapterIdCursor !== legacyChapterIds.length || articleIdCursor !== legacyArticleIds.length) {
    throw new Error("law identity plan cursor mismatch");
  }

  for (const law of laws) {
    const lawId = String(law.slug || law.id);
    if (lawId.includes("EXTRACTION_REPORT")) continue;

    lawRows.push({
      slug: lawId.substring(0, 200),
      title: law.title,
      title_en: law.title_en || "",
      type: (law.type || "نظام").substring(0, 50),
      description: law.description || law.title || "",
      section_code: String(law.section_code || "").substring(0, 20),
      section_name: String(law.section_name || "").substring(0, 200),
      issuing_body: String(law.issuing_body || "").substring(0, 200),
      issuing_instrument: String(law.issuance_decree || "").substring(0, 200),
      issue_date_hijri: String(law.issuance_date || "").substring(0, 20),
      issue_date_gregorian: String(law.issue_date_gregorian || "").substring(0, 20),
      // ك-12 (2026-08-24): the parser now extracts all 5 effective-date-family
      // fields (see ParsedLaw in parse-laws.ts), but only 2 of the 5 have a
      // real DB column today — publication_date_hijri/effective_date_hijri
      // (20260626_legal_library_schema.sql:83-84). The other 3
      // (*_gregorian, effective_date_note) are written by migration
      // 20260824_laws_effective_date_gregorian_columns.sql, NOT YET APPLIED
      // — do not map them here until that migration lands, or every law row
      // fails to upsert (unknown column). `null` here means "not stated in
      // the source" (rule ق-2), so it's passed through as-is, not `|| ""`.
      publication_date_hijri: law.publication_date_hijri ?? null,
      effective_date_hijri: law.effective_date_hijri ?? null,
      total_articles: law.total_articles || 0,
      preamble: (law.preamble || "") + (law.regulation_preamble ? `\n***\n${law.regulation_preamble}` : ""),
      has_merged_regulation: law.has_executive_reg || false,
      status: (law.law_status || "status_undeclared").substring(0, 30),
      boe_source_url: String(law.boe_source_url || law.boe_url || "").substring(0, 500),
      official_source_url: String(law.official_source_url || "").substring(0, 500),
      // ب-114: jsonb column — pass the structured object through as-is. The prior
      // String(...).substring(500) both stringified it to "[object Object]" and could
      // truncate mid-structure, corrupting the JSON; article_status_summary is only
      // ever a small per-status count map, so no length cap is needed.
      article_status_summary: (law.article_status_summary && typeof law.article_status_summary === "object")
        ? law.article_status_summary
        : {},
      // ب-127: same jsonb-passthrough idiom as article_status_summary above — column
      // already existed on library.laws (latest_update jsonb), just never populated.
      latest_update: (law.latest_update && typeof law.latest_update === "object")
        ? law.latest_update
        : null,
      law_guid: String(law.law_guid || "").substring(0, 100),
      // Registry identity and parent linkage are deliberately separate from
      // BOE's law_guid namespace. Empty source values become SQL NULL so a
      // partial UNIQUE index can reject only real identity collisions.
      instrument_id: String(law.instrument_id || "").trim().substring(0, 100) || null,
      parent_law_id: String(law.parent_law_id || "").trim().substring(0, 100) || null,
      parent_law: String(law.parent_law || "").trim() || null,
      enabling_article: String(law.enabling_article || "").trim() || null,
      // ب-139: always write the CURRENT value, never conditionally — a file
      // whose flag was cleared must see needs_human_review flip back to
      // false on the next reseed, not stay stuck true forever.
      needs_human_review: Boolean(law.needsHumanReview),
      // Council review (Codex, 2026-08-22) suggested a CHECK constraint
      // requiring a non-empty reason whenever the flag is true — but 3 known
      // live files carry the flag with no review_reason recorded in source
      // at all. Rather than relax the constraint (losing its real value: a
      // future seeder bug that sets the flag without ever assigning a
      // reason), record that gap honestly instead of leaving it null.
      review_reason: law.needsHumanReview
        ? String(law.reviewReason || "").trim() || "(بلا سبب مسجَّل بالمصدر — العلم موجود بالفرونت-ماتر بلا review_reason)"
        : null,
    });

    const chapters = (law.chapters || []) as any[];
    const plan = identityPlans.get(law);
    if (!plan) throw new Error(`missing law identity plan: ${lawId}`);
    const articleOrderByRef = buildArticleOrderByRef(chapters);
    for (let ci = 0; ci < chapters.length; ci++) {
      const ch = chapters[ci];
      const chapterId = plan.chapterIds[ci];
      chapterRows.push({
        id: chapterId,
        law_slug: lawId.substring(0, 200),
        number: ch.number || 0,
        title: ch.title || "",
        order_index: ch.number || 0,
      });

      const articles = (ch.articles || []) as any[];
      for (let ai = 0; ai < articles.length; ai++) {
        const art = articles[ai];
        // `??` only substitutes on null/undefined — but parse-laws.ts's own
        // `Number(artMeta.number || 0)` uses 0 as ITS "no real number"
        // sentinel, so `art.number ?? fallback` let every "no number"
        // article through as the literal number 0 instead of falling back to
        // the index. Confirmed on the real corpus (2026-08-21): 1,321
        // articles carry number:0, 15 laws have more than one — up to 368 in
        // a single file — so `art-0` collided repeatedly and the Map-based
        // dedup below kept only the last one (council review: Antigravity).
        const artId = plan.articleIds[ci][ai];

        const regs = (art.regulations || []) as any[];
        const amends = (art.amendments || []) as any[];

        articleRows.push({
          id: artId,
          law_slug: lawId.substring(0, 200),
          chapter_id: chapterId,
          number: String(art.number || "0").substring(0, 20),
          number_text: (art.number_text || "").substring(0, 50),
          title: art.title || "",
          status: resolveSeedArticleStatus(art.status).substring(0, 30),
          text: art.text || "",
          free: art.free !== false,
          executive_reg_text: regs.map(r => r.text || "").join("\n\n") || null,
          executive_reg_ref: regs.map(r => r.ref || "").join(", ") || null,
          instrument: art.instrument || regs[0]?.instrument || null,
          order_index: articleOrderByRef.get(art) ?? 0,
          // Recovered history. Until these columns existed the parser extracted
          // this text and the seeder dropped it on the floor — and for the 1,613
          // repealed articles whose `text` is legitimately empty, that is the
          // whole article. NULL (not "") so "the source has none" stays
          // distinguishable from "the source has an empty one".
          original_text: art.original_text || null,
          historic_regulation_text: art.historic_regulation_text || null,
          // Quarantine only: excluded from the fts index by the migration and
          // never returned by any API route.
          unparsed_details: art.unparsed_details || null,
          // English courtesy translation — never authoritative, never
          // indexed into `fts`. NULL (not "") so "no English source" stays
          // distinguishable from "an empty one".
          title_en: art.title_en || null,
          text_en: art.text_en || null,
          english_text_status: art.text_en ? "unverified" : null,
        });

        for (let ai = 0; ai < amends.length; ai++) {
          amendmentRows.push({
            // article_amendments.id is `uuid`; article_id (→ articles.id, text) stays.
            id: toUuid(`${artId}__amd-${ai}`),
            article_id: artId,
            date: (amends[ai].date || "").substring(0, 30),
            source: amends[ai].decree || "",
            type: (amends[ai].type || "تعديل").substring(0, 50),
            summary: amends[ai].summary || "",
            full_text: amends[ai].original_text || null,
          });
        }

        for (let ri = 0; ri < regs.length; ri++) {
          const r = regs[ri];
          regulationRows.push({
            // article_regulations.id is `uuid`; article_id (→ articles.id) stays.
            id: toUuid(`${artId}__reg-${ri}`),
            article_id: artId,
            law_slug: lawId.substring(0, 200),
            system_article_number: String(art.number || "0").substring(0, 20),
            ref: String(r.ref || "").substring(0, 300),
            reg_num: r.regNum != null ? String(r.regNum).substring(0, 50) : null,
            sort_key: String(r.sortKey || "99999").substring(0, 50),
            text: r.text || "",
            status: (r.status || "active").substring(0, 30),
            is_secondary_display: r.isSecondaryDisplay === true,
          });
        }
      }
    }
  }

  // Deduplicate arrays in memory to prevent ON CONFLICT DO UPDATE commands from trying to affect the same row twice in the same batch
  const uniqueLawRows = Array.from(new Map(lawRows.map(r => [r.slug, r])).values());
  const uniqueChapterRows = Array.from(new Map(chapterRows.map(r => [r.id, r])).values());
  const uniqueArticleRows = Array.from(new Map(articleRows.map(r => [r.id, r])).values());
  const uniqueAmendmentRows = Array.from(new Map(amendmentRows.map(r => [r.id, r])).values());
  const uniqueRegulationRows = Array.from(new Map(regulationRows.map(r => [r.id, r])).values());

  if (uniqueChapterRows.length !== chapterRows.length || uniqueArticleRows.length !== articleRows.length ||
      uniqueAmendmentRows.length !== amendmentRows.length || uniqueRegulationRows.length !== regulationRows.length) {
    throw new Error("law child identity collision after allocation");
  }

  const lawStats: SeedStats = { table: "laws", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "laws", uniqueLawRows, dryRun, lawStats, errors, drySeedExporter);
  allStats.push(lawStats);

  const chStats: SeedStats = { table: "chapters", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "chapters", uniqueChapterRows, dryRun, chStats, errors, drySeedExporter);
  allStats.push(chStats);

  const artStats: SeedStats = { table: "articles", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "articles", uniqueArticleRows, dryRun, artStats, errors, drySeedExporter);
  allStats.push(artStats);

  if (uniqueAmendmentRows.length > 0) {
    const amdStats: SeedStats = { table: "article_amendments", inserted: 0, skipped: 0, errors: 0 };
    await batchUpsert(client, "article_amendments", uniqueAmendmentRows, dryRun, amdStats, errors, drySeedExporter);
    allStats.push(amdStats);
  }

  if (uniqueRegulationRows.length > 0) {
    const regStats: SeedStats = { table: "article_regulations", inserted: 0, skipped: 0, errors: 0 };
    await batchUpsert(client, "article_regulations", uniqueRegulationRows, dryRun, regStats, errors, drySeedExporter);
    allStats.push(regStats);
  }

  return allStats;
}

// ══════════════════════════════════════════════════════════════════════════════
// Seed: DECREES
// ═══════════════════════════════════════════════════════════════════════════

export async function seedDecrees(
  client: NonNullable<typeof supabaseClient>,
  data: Record<string, unknown>,
  dryRun: boolean,
  errors: string[],
  clean: boolean,
  drySeedExporter?: DrySeedJsonlExporter,
): Promise<SeedStats[]> {
  const allStats: SeedStats[] = [];
  const decrees = (data.decrees || []) as any[];
  assertPublicCorpusRows(data, "decrees");

  console.log(`\n📋 Seeding ${decrees.length} decrees...\n`);

  if (clean && !dryRun) {
    console.log("    🧹 Cleaning decrees tables (delete before insert)...");
    for (const t of ["decree_pages", "decrees_circulars"]) {
      const { error } = await client.delete(t, {});
      if (error) {
        console.error(`    ✗ clean ${t}: ${error}`);
        errors.push(`clean ${t}: ${error}`);
      }
    }
  }

  const decreeRows: Record<string, unknown>[] = [];
  const pageRows: Record<string, unknown>[] = [];

  for (const dec of decrees) {
    const rawId = String(dec.id || dec.slug);
    if (rawId.includes("EXTRACTION_REPORT")) continue;

    // decrees_circulars.id is `uuid` and decree source ids are Arabic strings →
    // deterministic uuid (also makes re-seeds idempotent instead of duplicating).
    const decId = toUuid(rawId);

    // decrees_circulars.type has a CHECK allowing only royal|cabinet|circular.
    // Instrument type. The parser (lib/instrument.ts) now emits a precise value;
    // this asserts it is one the DB accepts rather than silently coercing.
    //
    // The old code clamped anything outside ('royal','cabinet','circular') to
    // "circular" — which is how every قرار وزاري (Ministerial Decision) ended up
    // stored as a mere circular. Silently rewriting a legal instrument type is
    // exactly the failure this program exists to remove, so an unexpected value
    // now fails loudly instead.
    const decType = String(dec.type || "unknown");
    if (!ALLOWED_DECREE_TYPES.has(decType)) {
      throw new Error(
        `decree "${dec.id}" has instrument type "${decType}", which the ` +
          `decrees_circulars CHECK constraint does not allow. Apply migration ` +
          `20260729_decree_instrument_taxonomy.sql, or add the value there — ` +
          `do NOT coerce it to another instrument.`,
      );
    }
    decreeRows.push({
      id: decId,
      title: dec.title || "",
      type: decType,
      instrument_ar: dec.instrument_ar || null,
      issuer: dec.issuer || "",
      ref: dec.ref || "",
      date: dec.date || "",
      summary: dec.summary || "",
      summary_brief: dec.summary_brief || "",
      category: (dec.cat || "").substring(0, 100),
      preamble: dec.preamble || "",
      hashtags: dec.hashtags || [],
      official_url: dec.official_url || "",
      // ب-139: same convention as lawRows above — always the current value.
      needs_human_review: Boolean(dec.needsHumanReview),
      review_reason: dec.needsHumanReview
        ? String(dec.reviewReason || "").trim() || "(بلا سبب مسجَّل بالمصدر — العلم موجود بالفرونت-ماتر بلا review_reason)"
        : null,
    });

    const arts = (dec.articles || []) as any[];

    for (let pi = 0; pi < arts.length; pi++) {
      const art = arts[pi];
      pageRows.push({
        id: toUuid(`${decId}__pg-${art.number ?? pi}`), // decree_pages.id is `uuid`
        decree_id: decId,
        page_number: art.number || 0,
        content: art.text || "",
      });
    }
  }

  // Resolve identities before the Map guard. The old Map retained the last
  // same-number page; retain that exact UUID and give every earlier source
  // occurrence a stable UUID so content and its decree FK cannot disappear.
  const resolvedPageIds = resolveDecreePageIds(pageRows.map((row) => String(row.id)));
  pageRows.forEach((row, index) => { row.id = resolvedPageIds[index]; });

  // Deduplicate parent rows only; page identity collisions after allocation are
  // fatal rather than another silent last-wins content loss.
  const uniqueDecreeRows = Array.from(new Map(decreeRows.map(r => [r.id, r])).values());
  const uniquePageRows = Array.from(new Map(pageRows.map(r => [r.id, r])).values());
  if (uniquePageRows.length !== pageRows.length) {
    throw new Error("decree page identity collision after allocation");
  }

  const decStats: SeedStats = { table: "decrees_circulars", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "decrees_circulars", uniqueDecreeRows, dryRun, decStats, errors, drySeedExporter);
  allStats.push(decStats);

  const pageStats: SeedStats = { table: "decree_pages", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "decree_pages", uniquePageRows, dryRun, pageStats, errors, drySeedExporter);
  allStats.push(pageStats);

  return allStats;
}

// ══════════════════════════════════════════════════════════════════════════════
// Seed: PRECEDENTS
// ══════════════════════════════════════════════════════════════════════════════

export async function seedPrecedents(
  client: NonNullable<typeof supabaseClient>,
  data: Record<string, unknown>,
  dryRun: boolean,
  errors: string[],
  clean: boolean,
  drySeedExporter?: DrySeedJsonlExporter,
): Promise<SeedStats[]> {
  const allStats: SeedStats[] = [];
  const collections = (data.collections || []) as any[];
  const courtPrecs = (data.court_precedents || []) as any[];

  // The parser retains unnamed <details> content in unparsed_details, but
  // principles has no rights-safe column for it. Never count a live seed as
  // successful while silently discarding that text. Check the private-storage
  // contract before --clean or any upsert; dry-run exports the exact RPC rows.
  const unseededDetails = findUnseededPrecedentDetails(data);
  if (unseededDetails.length > 0 && !dryRun) {
    if (typeof (client as { rpc?: unknown }).rpc !== "function") {
      throw new Error("private precedent storage contract unavailable before public writes");
    }
    const { data, error } = await client.rpc("private_precedent_storage_contract");
    const contract = Array.isArray(data) ? data[0] : data;
    const row = contract && typeof contract === "object"
      ? contract as Record<string, unknown>
      : null;
    if (error || row?.version !== PRIVATE_PRECEDENT_STORAGE_VERSION || row?.max_batch !== 100
      || row?.hash !== "sha256" || row?.read_rpc !== false) {
      throw new Error(
        `private precedent storage contract unavailable or mismatched before public writes${error ? `: ${error}` : ""}`,
      );
    }
  }

  console.log(`\n⚖️  Seeding ${collections.length} collections + ${courtPrecs.length} precedents...\n`);

  if (clean && !dryRun) {
    console.log("    🧹 Cleaning precedents tables (delete before insert)...");
    for (const t of ["principle_paragraphs", "principles", "judicial_collections"]) {
      const { error } = await client.delete(t, {});
      if (error) {
        console.error(`    ✗ clean ${t}: ${error}`);
        errors.push(`clean ${t}: ${error}`);
      }
    }
  }

  const collRows: Record<string, unknown>[] = [];
  const principleRows: Record<string, unknown>[] = [];
  const paragraphRows: Record<string, unknown>[] = [];
  // Audit-only projection. These rows must never be passed to a public table
  // or FTS while the private persistence/rights contract remains unverified.
  const privateDetailRows: Record<string, unknown>[] = [];
  const collectionId = (coll: Record<string, unknown>): string =>
    String(coll.id || coll.slug).substring(0, 100);
  const legacyCollectionPrincipleId = (collId: string, pr: Record<string, unknown>, pri: number): string =>
    `${collId}__pr-${pr.number ?? pri}`.substring(0, 150);
  const legacyStandalonePrincipleId = (prec: Record<string, unknown>): string =>
    String(prec.slug || prec.id).substring(0, 150);

  // Allocate before emitting either parent or child rows. The same resolved id
  // is used by principle_paragraphs.principle_id, so no child can remain
  // attached to a dropped/overwritten predecessor.
  const legacyPrincipleIds = [
    ...collections.flatMap((coll) => {
      const collId = collectionId(coll as Record<string, unknown>);
      return ((coll.principles || []) as Record<string, unknown>[])
        .map((pr, pri) => legacyCollectionPrincipleId(collId, pr, pri));
    }),
    ...courtPrecs.map((prec) => legacyStandalonePrincipleId(prec as Record<string, unknown>)),
  ];
  const resolvedPrincipleIds = resolvePrecedentPrincipleIds(legacyPrincipleIds);
  let principleIdCursor = 0;

  // ── Collections for standalone court precedents ──────────────────────────
  // Previously EVERY standalone ruling was attached to one hardcoded row
  // labelled court "المحكمة التجارية" / track "commercial" — regardless of which
  // court actually issued it. Rulings of the Supreme Court, the Board of
  // Grievances, labour courts and quasi-judicial committees were all published
  // under the Commercial Court's name. ("commercial" was not even a valid track.)
  //
  // Now one collection is derived per (track, court) actually present in the
  // data, so a ruling is only ever filed under the body that issued it.
  const precedentGroupKey = (p: Record<string, unknown>): string => {
    const track = String(p.track || "unknown");
    const court = String(p.court || p.court_type || "").trim();
    return `${track}::${court}`;
  };

  const precGroups = new Map<string, Record<string, unknown>[]>();
  for (const p of courtPrecs) {
    const k = precedentGroupKey(p as Record<string, unknown>);
    const list = precGroups.get(k);
    if (list) list.push(p as Record<string, unknown>);
    else precGroups.set(k, [p as Record<string, unknown>]);
  }

  /** Deterministic, stable collection id for a (track, court) pair. */
  const groupCollectionId = (key: string): string =>
    `prec-${toUuid(key)}`.substring(0, 100);

  for (const [key, members] of precGroups) {
    const [track, court] = key.split("::");
    collRows.push({
      id: groupCollectionId(key),
      // No court name in the source means we do not know which body issued it.
      // Saying so is correct; naming a court would be a fabrication.
      title: court || "أحكام وسوابق — جهة غير محددة",
      court: court || null,
      year_hijri: null,
      part: 1,
      source_id: "moj",
      track: track.substring(0, 50),
      description: court
        ? `مجموعة الأحكام والسوابق الصادرة عن ${court}`
        : "أحكام وسوابق لم تُحدَّد جهة إصدارها في المصدر",
      ruling_count: members.length,
      free: true,
      progress: 100,
    });
  }

  for (let collectionIndex = 0; collectionIndex < collections.length; collectionIndex++) {
    const coll = collections[collectionIndex];
    const collId = collectionId(coll as Record<string, unknown>);

    collRows.push({
      id: collId,
      title: coll.title || "",
      court: coll.court || "",
      year_hijri: safeInt(coll.year_hijri, null),
      part: coll.part || 1,
      source_id: coll.source_id || "",
      // `track` is DERIVED by the parser (lib/court.ts), not read from source —
      // no source file has ever carried a `track` field, which is why this
      // column was empty for 94 of 95 collections in production.
      track: String(coll.track || "unknown").substring(0, 50),
      description: coll.description || "",
      ruling_count: coll.total_principles || 0,
      free: coll.free !== false,
      progress: 100,
      // Grouping/display label only (e.g. all volumes of one year's ministry
      // collection) — never the row's identity. See parse-precedents.ts
      // parsePrecedentContainer for why id/slug must never be this value.
      series_id: coll.series_id ? String(coll.series_id).substring(0, 150) : null,
      // Previously dropped entirely even though parsePrincipleCollection()
      // already returns the full source frontmatter here (see ب-88 sibling
      // finding, 06 §"إصلاحات مصاحبة بالسيدر" item 5).
      metadata: coll.metadata || {},
    });

    const principles = (coll.principles || []) as any[];
    for (let pri = 0; pri < principles.length; pri++) {
      const pr = principles[pri];
      const prId = resolvedPrincipleIds[principleIdCursor++];

      if (typeof pr.unparsed_details === "string" && pr.unparsed_details.trim()) {
        privateDetailRows.push({
          principle_id: prId,
          collection_id: collId,
          source_locator: `collections[${collectionIndex}].principles[${pri}]`,
          body: pr.unparsed_details,
          body_sha256: crypto.createHash("sha256").update(pr.unparsed_details, "utf8").digest("hex"),
          review_state: "unverified",
        });
      }

      principleRows.push({
        id: prId,
        collection_id: collId,
        principle_number: String(pr.number || "").substring(0, 50),
        issuing_body: pr.issuing_body || "",
        session_date: pr.session_date || "",
        decision_number: pr.decision_number || "",
        reference: pr.reference || "",
        text: pr.text || "",
        ruling_basis: "",
        facts: pr.details?.facts || "",
        reasons: pr.details?.reasons || "",
        ruling: pr.details?.ruling || "",
        year_hijri: safeInt(pr.year_hijri, null),
        // Source position, not the printed ruling number. Printed values may be
        // zero, null, repeated, or non-sequential; this narrow pass leaves
        // `principle_number` untouched while `pri` makes detail first-N deterministic.
        order_index: pri,
        // Parser already extracts these from bracketed text (parse-precedents.ts
        // parsePrincipleCollection) — only the seeder was dropping them.
        classification_keywords: pr.classification_keywords || [],
        // ب-139 (corrected): confirmed by direct read of the 3 known-flagged
        // source files that `needs_human_review` is a CONTAINER/file-level
        // frontmatter flag (one per volume), never a per-PRINCIPLE_START or
        // per-ARTICLE_START JSON key — no source file has ever carried it at
        // that level. The original per-principle read here (`pr.needs_human_
        // review`) was always false and is why the seeder dry-run showed 0
        // flagged precedents despite 3 real flagged files. Fixed: propagate
        // the collection's own flag to every principle unbundled from it.
        needs_human_review: Boolean(coll.needs_human_review),
        review_reason: coll.needs_human_review
          ? String(coll.review_reason || "").trim() ||
            "(بلا سبب مسجَّل بالمصدر — العلم موجود بالفرونت-ماتر بلا review_reason)"
          : null,
      });

      const subs = (pr.sub_principles || []) as any[];

      for (let si = 0; si < subs.length; si++) {
        paragraphRows.push({
          // principle_paragraphs.id is `uuid`; principle_id (→ principles.id, text) stays.
          id: toUuid(`${prId}__sub-${si}`),
          principle_id: prId,
          letter: subs[si].letter || "",
          text: subs[si].text || "",
          keywords: subs[si].keywords || [],
          order_index: si,
        });
      }
    }
  }

  for (let pi = 0; pi < courtPrecs.length; pi++) {
    const prec = courtPrecs[pi];
    const precId = resolvedPrincipleIds[principleIdCursor++];

    if (typeof prec.unparsed_details === "string" && prec.unparsed_details.trim()) {
      privateDetailRows.push({
        principle_id: precId,
        collection_id: groupCollectionId(precedentGroupKey(prec as Record<string, unknown>)),
        source_locator: `court_precedents[${pi}]`,
        body: prec.unparsed_details,
        body_sha256: crypto.createHash("sha256").update(prec.unparsed_details, "utf8").digest("hex"),
        review_state: "unverified",
      });
    }

    principleRows.push({
      id: precId,
      // Its own court's collection, not the single fabricated commercial one.
      collection_id: groupCollectionId(precedentGroupKey(prec as Record<string, unknown>)),
      principle_number: String(prec.ruling_number || "").substring(0, 50),
      issuing_body: prec.court || prec.court_type || "",
      session_date: prec.date || "",
      decision_number: prec.case_number || "",
      reference: prec.subject || "",
      text: prec.summary || prec.preamble || "",
      ruling_basis: prec.summary_brief || "",
      facts: prec.facts || "",
      reasons: prec.reasons || "",
      ruling: prec.ruling || "",
      year_hijri: safeInt(prec.year, null),
      order_index: pi,
      // parseCourtPrecedent() already extracts these (meta.hashtags/body
      // #tags, meta.is_redacted, full frontmatter) — only the seeder dropped
      // them (ب-88 sibling finding).
      hashtags: prec.hashtags || [],
      is_redacted: Boolean(prec.is_redacted),
      metadata: prec.metadata || {},
      // ب-139: same convention as lawRows/decreeRows above.
      needs_human_review: Boolean(prec.needs_human_review),
      review_reason: prec.needs_human_review
        ? String(prec.review_reason || "").trim() ||
          "(بلا سبب مسجَّل بالمصدر — العلم موجود بالفرونت-ماتر بلا review_reason)"
        : null,
    });
  }

  if (principleIdCursor !== resolvedPrincipleIds.length) {
    throw new Error(`principle id allocation mismatch: used ${principleIdCursor}, allocated ${resolvedPrincipleIds.length}`);
  }
  if (privateDetailRows.length !== unseededDetails.length) {
    throw new Error(`private precedent audit projection mismatch: ${privateDetailRows.length} rows for ${unseededDetails.length} unparsed_details block(s)`);
  }
  // The exporter enforces a fresh directory outside the pack and mode 0600.
  // In dry mode it is an exact inspection projection; in live mode the same
  // rows cross only the service-role RPC into the non-exposed private schema.
  if (dryRun) drySeedExporter?.write("private_precedent_details", privateDetailRows);

  // Deduplicate
  const uniqueCollRows = Array.from(new Map(collRows.map(r => [r.id, r])).values());
  const uniquePrincipleRows = Array.from(new Map(principleRows.map(r => [r.id, r])).values());
  const uniqueParagraphRows = Array.from(new Map(paragraphRows.map(r => [r.id, r])).values());
  if (uniquePrincipleRows.length !== principleRows.length) {
    throw new Error(`principle id collision after allocation: ${principleRows.length - uniquePrincipleRows.length} row(s)`);
  }

  const collStats: SeedStats = { table: "judicial_collections", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "judicial_collections", uniqueCollRows, dryRun, collStats, errors, drySeedExporter);
  allStats.push(collStats);

  const prStats: SeedStats = { table: "principles", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "principles", uniquePrincipleRows, dryRun, prStats, errors, drySeedExporter);
  allStats.push(prStats);

  if (uniqueParagraphRows.length > 0) {
    const paraStats: SeedStats = { table: "principle_paragraphs", inserted: 0, skipped: 0, errors: 0 };
    await batchUpsert(client, "principle_paragraphs", uniqueParagraphRows, dryRun, paraStats, errors, drySeedExporter);
    allStats.push(paraStats);
  }

  if (privateDetailRows.length > 0) {
    const privateStats: SeedStats = {
      table: "private_precedent_details", inserted: 0, skipped: 0, errors: 0,
    };
    if (dryRun) {
      privateStats.inserted = privateDetailRows.length;
      console.log(`    [DRY RUN] Would store ${privateDetailRows.length} private judicial row(s) through the service-role RPC`);
    } else {
      for (let i = 0; i < privateDetailRows.length; i += 100) {
        const batch = privateDetailRows.slice(i, i + 100);
        const { data, error } = await client.rpc("store_private_precedent_details", { p_rows: batch });
        const stored = typeof data === "number" ? data : Number(data);
        if (error || stored !== batch.length) {
          privateStats.errors += batch.length;
          errors.push(`store_private_precedent_details: ${error || `expected ${batch.length}, got ${String(data)}`}`);
          throw new Error(
            "private precedent persistence failed after public principle upsert; live seed is incomplete and must be retried after repair.",
          );
        }
        privateStats.inserted += stored;
      }
    }
    allStats.push(privateStats);
  }

  return allStats;
}

// ══════════════════════════════════════════════════════════════════════════════
// Seed: FEQH
// ══════════════════════════════════════════════════════════════════════════════

async function seedFeqh(
  client: NonNullable<typeof supabaseClient>,
  data: Record<string, unknown>,
  dryRun: boolean,
  errors: string[],
  clean: boolean,
  drySeedExporter?: DrySeedJsonlExporter,
): Promise<SeedStats[]> {
  const allStats: SeedStats[] = [];
  const books = (data.books || []) as any[];

  console.log(`\n📖 Seeding ${books.length} feqh books...\n`);

  if (clean && !dryRun) {
    console.log("    🧹 Cleaning feqh tables (delete before insert)...");
    for (const t of ["feqh_blocks", "feqh_sections", "feqh_chapters", "feqh_books"]) {
      const { error } = await client.delete(t, {});
      if (error) {
        console.error(`    ✗ clean ${t}: ${error}`);
        errors.push(`clean ${t}: ${error}`);
      }
    }
  }

  const bookRows: Record<string, unknown>[] = [];
  const chapterRows: Record<string, unknown>[] = [];
  const sectionRows: Record<string, unknown>[] = [];
  const blockRows: Record<string, unknown>[] = [];

  for (const book of books) {
    const bookId = String(book.id || book.slug).substring(0, 100);
    // Book-global reading position for the paywall.
    //
    // order_index was the page index WITHIN a section (`pi`). Almost every
    // section holds a single page, so 119,353 of 119,392 blocks were 0 — and
    // the paywall test in api/library/books/[slug]/route.ts is
    // `order_index >= freeLimit`, which `0 >= 5` never satisfies. Every paid
    // feqh book was therefore fully readable by anonymous visitors.
    //
    // One counter across the whole book makes the index mean "how far into the
    // book is this block", which is what the paywall assumes.
    let bookBlockOrder = 0;
    if (bookId.includes("EXTRACTION_REPORT")) continue;

    bookRows.push({
      id: bookId,
      title: book.title || "",
      author: book.author || "",
      school: book.school || "",
      type: (book.type || "sharia").substring(0, 30),
      category: (book.category || "").substring(0, 100),
      description: book.description || "",
      investigator: book.investigator || "",
      total_volumes: book.total_volumes || 1,
      total_pages: book.total_pages || 0,
    });

    const chapters = (book.chapters || []) as any[];
    for (let ci = 0; ci < chapters.length; ci++) {
      const ch = chapters[ci];
      const chId = toUuid(`${bookId}__fc-${ci}`); // feqh_chapters.id is `uuid`

      chapterRows.push({
        id: chId,
        book_id: bookId,
        title: ch.title || "",
        volume_number: safeInt(ch.pages?.[0]?.volume ?? ch.sections?.[0]?.pages?.[0]?.volume, 1),
        order_index: ci,
      });

      // Direct pages under chapter
      const directPages = (ch.pages || []) as any[];
      if (directPages.length > 0) {
        const dummySecId = toUuid(`${chId}__fs-general`); // feqh_sections.id is `uuid`
        sectionRows.push({
          id: dummySecId,
          chapter_id: chId,
          title: "عام",
          order_index: 999,
        });

        for (let pi = 0; pi < directPages.length; pi++) {
          const pg = directPages[pi];
          blockRows.push({
            id: `${dummySecId}__blk-${pi}`.substring(0, 150),
            section_id: dummySecId,
            topic: ch.title || "",
            // null volume means the source states none — do not invent 1.
            volume_number: safeInt(pg.volume, null),
            page_number: safeInt(pg.page_number, null),
            // Verbatim locator tokens, so a non-numeric one ("مقدمة", "7-1",
            // "None") is shown as the source wrote it, not coerced to a number.
            page_label: pg.page_label ?? null,
            volume_label: pg.volume_label ?? null,
            // ب-126: true only for the genuine no-locator-available fallback —
            // never for a heading that fell mid-page (that reuses the real page's
            // own identity now, see parse-feqh.ts flushPage()).
            is_synthetic_page: pg.is_synthetic_page === true,
            matn: pg.text || "",
            sharh: null,
            hashiyah: {},
            order_index: bookBlockOrder++,
            // Denormalised owning book, so the reader can page a book in
            // reading order with one indexed scan. Without it the route must
            // reach the book through section -> chapter -> book; the old
            // section_id IN(...) form built a URL so long that 138 of 144
            // books returned 400 and rendered completely empty.
            book_id: bookId,
          });
        }
      }

      // Sections under chapter
      const sections = (ch.sections || []) as any[];
      for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        const secId = toUuid(`${chId}__fs-${si}`); // feqh_sections.id is `uuid`

        sectionRows.push({
          id: secId,
          chapter_id: chId,
          title: sec.title || "",
          order_index: si,
        });

        const secPages = (sec.pages || []) as any[];
        for (let pi = 0; pi < secPages.length; pi++) {
          const pg = secPages[pi];
          blockRows.push({
            id: `${secId}__blk-${pi}`.substring(0, 150),
            section_id: secId,
            topic: sec.title || "",
            // null volume means the source states none — do not invent 1.
            volume_number: safeInt(pg.volume, null),
            page_number: safeInt(pg.page_number, null),
            // Verbatim locator tokens, so a non-numeric one ("مقدمة", "7-1",
            // "None") is shown as the source wrote it, not coerced to a number.
            page_label: pg.page_label ?? null,
            volume_label: pg.volume_label ?? null,
            // ب-126: true only for the genuine no-locator-available fallback —
            // never for a heading that fell mid-page (that reuses the real page's
            // own identity now, see parse-feqh.ts flushPage()).
            is_synthetic_page: pg.is_synthetic_page === true,
            matn: pg.text || "",
            sharh: null,
            hashiyah: {},
            order_index: bookBlockOrder++,
            // Denormalised owning book, so the reader can page a book in
            // reading order with one indexed scan. Without it the route must
            // reach the book through section -> chapter -> book; the old
            // section_id IN(...) form built a URL so long that 138 of 144
            // books returned 400 and rendered completely empty.
            book_id: bookId,
          });
        }
      }
    }
  }

  // Deduplicate
  const uniqueBookRows = Array.from(new Map(bookRows.map(r => [r.id, r])).values());
  const uniqueChapterRows = Array.from(new Map(chapterRows.map(r => [r.id, r])).values());
  const uniqueSectionRows = Array.from(new Map(sectionRows.map(r => [r.id, r])).values());
  const uniqueBlockRows = Array.from(new Map(blockRows.map(r => [r.id, r])).values());

  const bookStats: SeedStats = { table: "feqh_books", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "feqh_books", uniqueBookRows, dryRun, bookStats, errors, drySeedExporter);
  allStats.push(bookStats);

  const chStats: SeedStats = { table: "feqh_chapters", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "feqh_chapters", uniqueChapterRows, dryRun, chStats, errors, drySeedExporter);
  allStats.push(chStats);

  if (uniqueSectionRows.length > 0) {
    const secStats: SeedStats = { table: "feqh_sections", inserted: 0, skipped: 0, errors: 0 };
    await batchUpsert(client, "feqh_sections", uniqueSectionRows, dryRun, secStats, errors, drySeedExporter);
    allStats.push(secStats);
  }

  if (uniqueBlockRows.length > 0) {
    const blockStats: SeedStats = { table: "feqh_blocks", inserted: 0, skipped: 0, errors: 0 };
    await batchUpsert(client, "feqh_blocks", uniqueBlockRows, dryRun, blockStats, errors, drySeedExporter);
    allStats.push(blockStats);
  }

  return allStats;
}

// ══════════════════════════════════════════════════════════════════════════════
// Main seeder orchestrator
// ══════════════════════════════════════════════════════════════════════════════

export async function seedLibrary(options: {
  dir: string;
  dryRun: boolean;
  types?: ContentType[];
  clean?: boolean;
  /** Fresh, external-only directory for a JSONL representation of dry rows. */
  drySeedJsonlDir?: string;
  /** Required for every live caller, including imports that bypass the CLI. */
  approvedManifestPath?: string;
  confirmHost?: string;
  confirmSchema?: string;
}): Promise<SeedResult> {
  // A parser preflight cannot make destructive deletion safe. Keep this guard
  // here too, so direct programmatic callers cannot bypass the CLI refusal.
  if (!options.dryRun && options.clean) {
    throw new Error("Live --clean is disabled: this test package never deletes existing library rows.");
  }
  if (!options.dryRun) {
    if (!options.approvedManifestPath || !options.confirmHost || !options.confirmSchema) {
      throw new Error("Live seeding requires an approved manifest and confirmed host/schema even through the imported API.");
    }
    assertLiveSeedPreflight({
      dir: path.resolve(options.dir),
      approvedManifestPath: options.approvedManifestPath,
      types: options.types,
      projectRoot: path.resolve(__dirname, ".."),
    });
  }
  const startedAt = new Date();
  const allStats: SeedStats[] = [];
  const errors: string[] = [];
  if (options.drySeedJsonlDir && !options.dryRun) {
    throw new Error("Dry-seed JSONL export is permitted only with dryRun: true.");
  }
  const drySeedExporter = options.drySeedJsonlDir
    ? createDrySeedJsonlExporter(options.drySeedJsonlDir, path.resolve(__dirname, ".."))
    : undefined;
  // ب-139: council-mandated (Codex, 2026-08-22) — needs_human_review is now
  // written to the database (see the companion migration), but is EXPLICITLY
  // not used to exclude anything from seeding: an unknown fraction of the
  // 337 flagged files are stale (issue fixed elsewhere without clearing the
  // flag). Printing this report on every run — instead of requiring someone
  // to remember to query for it — is the safeguard against the flag going
  // invisible for a second time, this time behind "you'd have to think to
  // look for it" instead of "it was never wired at all."
  const reviewFlagged: Array<{ table: string; id: string; reason: string }> = [];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!options.dryRun && (!supabaseUrl || !supabaseKey)) {
    throw new Error("Live seeding requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  if (!options.dryRun) {
    let actualHost = "";
    try { actualHost = new URL(supabaseUrl!).hostname; } catch { /* rejected below */ }
    if (actualHost !== options.confirmHost || LIBRARY_SCHEMA !== options.confirmSchema) {
      throw new Error("Live target does not match confirmed host/schema; refusing all writes.");
    }
  }

  const client = options.dryRun
    ? createSupabaseClient("http://dry-run", "dry-run-key")
    : createSupabaseClient(supabaseUrl!, supabaseKey!);

  const targetTypes = options.types || ["laws", "decrees", "precedents", "feqh"];

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║       🏛️  Nzamy Legal Library — Seeder          ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`  Mode:   ${options.dryRun ? "🔍 DRY RUN (no writes)" : "✍️  LIVE INSERT"}`);
  console.log(`  Dir:    ${options.dir}`);
  console.log(`  Types:  ${targetTypes.join(", ")}`);
  console.log(`  Clean:  ${options.clean ? "yes (delete before insert)" : "no"}\n`);
  if (drySeedExporter) console.log(`  JSONL:  ${drySeedExporter.outputDir} (fresh dry-only audit output)\n`);

  const fileMap: Record<ContentType, string> = {
    laws: "laws.json",
    decrees: "decrees.json",
    precedents: "precedents.json",
    feqh: "feqh.json",
  };

  for (const type of targetTypes) {
    const filePath = path.join(path.resolve(options.dir), fileMap[type]);

    if (!fs.existsSync(filePath)) {
      console.log(`  ⏭  Skipping ${type} — ${fileMap[type]} not found`);
      continue;
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Processing: ${type.toUpperCase()}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    let stats: SeedStats[] = [];

    switch (type) {
      case "laws":
        stats = await seedLaws(client, data, options.dryRun, errors, options.clean ?? false, drySeedExporter);
        break;
      case "decrees":
        stats = await seedDecrees(client, data, options.dryRun, errors, options.clean ?? false, drySeedExporter);
        break;
      case "precedents":
        stats = await seedPrecedents(client, data, options.dryRun, errors, options.clean ?? false, drySeedExporter);
        break;
      case "feqh":
        stats = await seedFeqh(client, data, options.dryRun, errors, options.clean ?? false, drySeedExporter);
        break;
    }

    allStats.push(...stats);

    // ب-139: scan the SOURCE data directly, independent of row-building —
    // this must keep working even if a future refactor changes how rows are
    // assembled inside seedLaws/seedDecrees/seedPrecedents.
    const flagOf = (o: Record<string, unknown>): boolean =>
      o.needsHumanReview === true || o.needs_human_review === true;
    const reasonOf = (o: Record<string, unknown>): string =>
      String(o.reviewReason ?? o.review_reason ?? "").trim() || "(بلا سبب مسجَّل)";
    if (type === "laws") {
      for (const law of (data.laws || []) as Record<string, unknown>[]) {
        if (flagOf(law)) reviewFlagged.push({ table: "laws", id: String(law.slug || law.id || ""), reason: reasonOf(law) });
      }
    } else if (type === "decrees") {
      for (const dec of (data.decrees || []) as Record<string, unknown>[]) {
        if (flagOf(dec)) reviewFlagged.push({ table: "decrees_circulars", id: String(dec.id || ""), reason: reasonOf(dec) });
      }
    } else if (type === "precedents") {
      for (const coll of (data.collections || []) as Record<string, unknown>[]) {
        // ب-139 (corrected): the flag lives on the CONTAINER (coll), never on
        // individual principles — see the matching fix + rationale in
        // seedPrecedents' principleRows.push above. A collection-level flag
        // is reported once per unbundled principle so the report's id column
        // stays queryable the same way the "principles" table now is.
        const collFlagged = flagOf(coll);
        const collReason = reasonOf(coll);
        for (const pr of (coll.principles || []) as Record<string, unknown>[]) {
          if (collFlagged) {
            reviewFlagged.push({
              table: "principles",
              id: `${String(coll.id || coll.slug || "")}__pr-${String(pr.number ?? "")}`,
              reason: collReason,
            });
          }
        }
      }
      for (const prec of (data.court_precedents || []) as Record<string, unknown>[]) {
        if (flagOf(prec)) reviewFlagged.push({ table: "principles", id: String(prec.slug || prec.id || ""), reason: reasonOf(prec) });
      }
    }
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║                 📊 Seed Summary                 ║");
  console.log("╠══════════════════════════════════════════════════╣");

  let totalInserted = 0;
  let totalErrors = 0;

  for (const s of allStats) {
    const status = s.errors > 0 ? "⚠" : "✓";
    console.log(
      `  ${status} ${s.table.padEnd(25)} inserted: ${String(s.inserted).padStart(6)}  errors: ${s.errors}`
    );
    totalInserted += s.inserted;
    totalErrors += s.errors;
  }

  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`  Total inserted: ${totalInserted}`);
  console.log(`  Row write errors:     ${totalErrors}`);
  console.log(`  Blocking diagnostics: ${errors.length}`);
  console.log(`  Duration:       ${(durationMs / 1000).toFixed(1)}s`);
  console.log("╚══════════════════════════════════════════════════╝\n");

  // ب-139: mandatory, not opt-in (council requirement, Codex 2026-08-22) —
  // printed on every run regardless of dry-run/live, so this is never the
  // kind of thing someone has to remember to go check.
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   ⚠️  needs_human_review — INTERNAL AUDIT ONLY   ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`  ${reviewFlagged.length} flagged record(s) this run.`);
  console.log(`  A dry seed is NOT publication acceptance. Flags may be stale`);
  console.log(`  or substantive; classify each against source evidence before`);
  console.log(`  declaring this library or its user-facing output ready.`);
  console.log("╚══════════════════════════════════════════════════╝");
  // An inspection snapshot must not mutate its parser-input directory. The
  // normal dry-run keeps the historical report location; the explicit JSONL
  // mode directs every generated audit artefact to its fresh external folder.
  const auditOutputDir = drySeedExporter?.outputDir ?? path.resolve(options.dir);
  const reviewReportPath = path.join(auditOutputDir, "needs-human-review-report.json");
  try {
    fs.writeFileSync(
      reviewReportPath,
      JSON.stringify({ generated_at: finishedAt.toISOString(), count: reviewFlagged.length, items: reviewFlagged }, null, 2),
      "utf-8",
    );
    console.log(`  Full list (comparable across runs): ${reviewReportPath}\n`);
  } catch (e) {
    console.error(`  ⚠ could not write needs_human_review report: ${(e as Error).message}\n`);
  }

  if (errors.length > 0) {
    console.log("📝 Errors:\n");
    for (const err of errors.slice(0, 20)) {
      console.log(`  • ${err}`);
    }
    if (errors.length > 20) {
      console.log(`  ... and ${errors.length - 20} more\n`);
    }
  }

  return {
    dry_run: options.dryRun,
    ...(drySeedExporter ? {
      dry_seed_jsonl_dir: drySeedExporter.outputDir,
      dry_seed_row_counts: { ...drySeedExporter.rowCounts },
    } : {}),
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: durationMs,
    stats: allStats,
    errors,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const usage = [
    "Usage:",
    "  npx tsx scripts/seed-library.ts --dir <parsed-output> --dry-run [--type <type>]",
    "  npx tsx scripts/seed-library.ts --dir <parsed-output> --dry-run --dry-seed-jsonl-dir <fresh-absolute-external-dir> [--type <type>]",
    "  npx tsx scripts/seed-library.ts --dir <parsed-output> --apply-live --approved-manifest <absolute-independent-contract> --confirm-host <hostname> --confirm-schema <schema> [--type <type>]",
    "  Add --preflight-only to verify live inputs offline and exit before credentials or DB (not publication acceptance).",
    "  Live --clean and --allow-clean are disabled in this test package.",
    "  --help only prints this message; no mode is selected implicitly.",
  ].join("\n");
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    process.exit(0);
  }

  const dirIdx = args.indexOf("--dir");
  const typeIdx = args.indexOf("--type");
  const hostIdx = args.indexOf("--confirm-host");
  const schemaIdx = args.indexOf("--confirm-schema");
  const drySeedJsonlDirIdx = args.indexOf("--dry-seed-jsonl-dir");
  const approvedManifestIdx = args.indexOf("--approved-manifest");
  const dryRun = args.includes("--dry-run");
  const applyLive = args.includes("--apply-live");
  const preflightOnly = args.includes("--preflight-only");
  const clean = args.includes("--clean");
  const allowClean = args.includes("--allow-clean");
  const valueAt = (index: number) => index >= 0 && args[index + 1] && !args[index + 1].startsWith("-")
    ? args[index + 1] : null;
  const dir = valueAt(dirIdx);
  const confirmHost = valueAt(hostIdx);
  const confirmSchema = valueAt(schemaIdx);
  const drySeedJsonlDir = valueAt(drySeedJsonlDirIdx);
  const approvedManifest = valueAt(approvedManifestIdx);

  const allowedFlags = new Set(["--dir", "--type", "--dry-run", "--apply-live", "--clean", "--allow-clean", "--confirm-host", "--confirm-schema", "--dry-seed-jsonl-dir", "--approved-manifest", "--preflight-only"]);
  const valueFlags = new Set(["--dir", "--type", "--confirm-host", "--confirm-schema", "--dry-seed-jsonl-dir", "--approved-manifest"]);
  for (let i = 0; i < args.length; i++) {
    if (!allowedFlags.has(args[i])) {
      console.error(`Unknown argument: ${args[i]}\n${usage}`);
      process.exit(2);
    }
    if (valueFlags.has(args[i])) {
      if (!valueAt(i)) {
        console.error(`Missing value for ${args[i]}\n${usage}`);
        process.exit(2);
      }
      i++;
    }
  }
  if (dryRun === applyLive || !dir) {
    console.error(`Select exactly one mode and an explicit --dir.\n${usage}`);
    process.exit(2);
  }
  if (applyLive && (clean || allowClean)) {
    console.error("Live --clean/--allow-clean is disabled: refusing deletion before credentials or DB.");
    process.exit(2);
  }
  if (applyLive && (!confirmHost || !confirmSchema || !approvedManifest)) {
    console.error(`Live mode requires --approved-manifest and matching --confirm-host/--confirm-schema.\n${usage}`);
    process.exit(2);
  }
  if (applyLive && drySeedJsonlDir) {
    console.error(`--dry-seed-jsonl-dir is dry-run only; refusing a live invocation.\n${usage}`);
    process.exit(2);
  }
  if (dryRun && (confirmHost || confirmSchema || allowClean || approvedManifest || preflightOnly)) {
    console.error(`Live confirmation flags cannot accompany --dry-run.\n${usage}`);
    process.exit(2);
  }

  let types: ContentType[] | undefined;
  if (typeIdx >= 0) {
    types = [args[typeIdx + 1] as ContentType];
    if (!["laws", "decrees", "precedents", "feqh"].includes(types[0])) {
      console.error(`Unknown content type: ${types[0]}\n${usage}`);
      process.exit(2);
    }
  }

  // The old CLI loaded credentials before inspecting --help and treated any
  // unrecognised invocation as LIVE. Load them only after an explicit live
  // mode, an output directory, and confirmation arguments have passed.
  if (applyLive) {
    try {
      assertLiveSeedPreflight({
        dir: path.resolve(dir),
        approvedManifestPath: approvedManifest!,
        types,
        projectRoot: path.resolve(__dirname, ".."),
      });
    } catch (error) {
      console.error((error as Error).message);
      process.exit(2);
    }
    if (preflightOnly) {
      console.log("Live-input preflight passed offline. No credentials loaded and no DB call made; this is not publication acceptance.");
      process.exit(0);
    }
    const envPath = path.resolve(__dirname, "..", ".env.local");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      for (const line of envContent.split(/\r?\n/)) {
        const m = line.match(/^([^#=\s]+)\s*=\s*(.*)/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
        }
      }
    }
    let actualHost = "";
    try { actualHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname; } catch { /* rejected below */ }
    if (actualHost !== confirmHost || LIBRARY_SCHEMA !== confirmSchema) {
      console.error("Live target does not match --confirm-host and --confirm-schema; refusing all writes.");
      process.exit(2);
    }
    console.log(`  📋 Confirmed live target ${actualHost}, schema ${LIBRARY_SCHEMA}`);
  }

  seedLibrary({ dir: path.resolve(dir), dryRun, types, clean, drySeedJsonlDir: drySeedJsonlDir ?? undefined,
    approvedManifestPath: approvedManifest ?? undefined, confirmHost: confirmHost ?? undefined,
    confirmSchema: confirmSchema ?? undefined })
    .then((result) => {
      const logDir = result.dry_seed_jsonl_dir ?? path.resolve(dir);
      fs.mkdirSync(logDir, { recursive: true });
      const logFile = path.join(logDir, "seed-result.json");
      fs.writeFileSync(logFile, JSON.stringify(result, null, 2), "utf-8");
      console.log(`📁 Result log written to: ${logFile}`);

      if (result.errors.length > 0) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error("❌ Fatal error:", err);
      process.exit(1);
    });
}
