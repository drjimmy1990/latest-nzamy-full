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
 *   1. laws          → law_chapters → law_articles → law_regulations → law_amendments
 *   2. decrees       → decree_articles
 *   3. precedent_collections → judicial_principles → principle_sub_items
 *      court_precedents
 *   4. feqh_books    → feqh_chapters → feqh_sections → feqh_pages
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL    — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   — Service role key (bypasses RLS)
 *
 * Usage:
 *   npx ts-node scripts/seed-library.ts --dir ./output
 *   npx ts-node scripts/seed-library.ts --dir ./output --dry-run
 *   npx ts-node scripts/seed-library.ts --dir ./output --type laws
 *   npx ts-node scripts/seed-library.ts --dir ./output --type laws --clean
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as fs from "fs";
import * as path from "path";

// ══════════════════════════════════════════════════════════════════════════════
// Types — Imported from parser output shapes
// ══════════════════════════════════════════════════════════════════════════════

// We use generic Record<string,unknown> for Supabase row payloads
// to avoid coupling to specific parser interfaces at runtime.

type ContentType = "laws" | "decrees" | "precedents" | "feqh";

interface SeedStats {
  table: string;
  inserted: number;
  skipped: number;
  errors: number;
}

interface SeedResult {
  dry_run: boolean;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  stats: SeedStats[];
  errors: string[];
}

// ══════════════════════════════════════════════════════════════════════════════
// Supabase Client
// ══════════════════════════════════════════════════════════════════════════════

// Dynamic import to avoid top-level import issues with ts-node
let supabaseClient: ReturnType<typeof createSupabaseClient> | null = null;

function createSupabaseClient(url: string, key: string) {
  // Use REST API directly — works with any Node version, no dependency issues
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation,resolution=merge-duplicates",
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

      const prefer = options?.onConflict
        ? `return=representation,resolution=merge-duplicates`
        : `return=representation`;

      try {
        const resp = await fetch(`${url}/rest/v1/${table}`, {
          method: "POST",
          headers: { ...headers, Prefer: prefer },
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
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Batch upsert helper
// ══════════════════════════════════════════════════════════════════════════════

const BATCH_SIZE = 100;

async function batchUpsert(
  client: NonNullable<typeof supabaseClient>,
  table: string,
  rows: Record<string, unknown>[],
  dryRun: boolean,
  stats: SeedStats,
  errors: string[]
): Promise<void> {
  if (rows.length === 0) return;

  if (dryRun) {
    console.log(`    [DRY RUN] Would insert ${rows.length} rows into ${table}`);
    stats.inserted += rows.length;
    return;
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const progress = Math.min(i + BATCH_SIZE, rows.length);

    process.stdout.write(
      `    → ${table}: ${progress}/${rows.length} rows\r`
    );

    const { error } = await client.upsert(table, batch);
    if (error) {
      console.error(`\n    ✗ Error inserting batch into ${table}: ${error}`);
      errors.push(`${table} batch ${i}-${progress}: ${error}`);
      stats.errors += batch.length;
    } else {
      stats.inserted += batch.length;
    }
  }

  console.log(`    ✓ ${table}: ${stats.inserted} rows inserted`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Seed: LAWS
// ══════════════════════════════════════════════════════════════════════════════

async function seedLaws(
  client: NonNullable<typeof supabaseClient>,
  data: Record<string, unknown>,
  dryRun: boolean,
  errors: string[]
): Promise<SeedStats[]> {
  const allStats: SeedStats[] = [];
  const laws = (data.laws || []) as Record<string, unknown>[];

  console.log(`\n🏛️  Seeding ${laws.length} laws...\n`);

  // Table: laws
  const lawRows: Record<string, unknown>[] = [];
  const chapterRows: Record<string, unknown>[] = [];
  const articleRows: Record<string, unknown>[] = [];
  const regulationRows: Record<string, unknown>[] = [];
  const amendmentRows: Record<string, unknown>[] = [];

  for (const law of laws) {
    const lawId = String(law.slug || law.id);

    lawRows.push({
      id: lawId,
      slug: law.slug,
      title: law.title,
      title_en: law.title_en || "",
      type: law.type || "نظام",
      section_code: law.section_code || "",
      section_name: law.section_name || "",
      issuing_body: law.issuing_body || "",
      issuance_decree: law.issuance_decree || "",
      issuance_date: law.issuance_date || "",
      total_articles: law.total_articles || 0,
      has_executive_reg: law.has_executive_reg || false,
      regulation_decree: law.regulation_decree || "",
      preamble: law.preamble || "",
      regulation_preamble: law.regulation_preamble || "",
      law_status: law.law_status || "active",
      source: law.source || "",
      boe_url: law.boe_url || "",
      variant: law.variant || "boe",
      metadata: law.metadata || {},
    });

    const chapters = (law.chapters || []) as Record<string, unknown>[];
    for (const ch of chapters) {
      const chapterId = `${lawId}__ch-${ch.number || 0}`;
      chapterRows.push({
        id: chapterId,
        law_id: lawId,
        number: ch.number || 0,
        title: ch.title || "",
      });

      const articles = (ch.articles || []) as Record<string, unknown>[];
      for (const art of articles) {
        const artId = `${lawId}__art-${art.number || 0}`;

        articleRows.push({
          id: artId,
          law_id: lawId,
          chapter_id: chapterId,
          article_number: String(art.number || "0"),
          article_number_text: art.number_text || "",
          title: art.title || "",
          text: art.text || "",
          status: art.status || "active",
          chapter_title: art.chapter_title || ch.title || "",
          free: art.free !== false,
          metadata: {},
        });

        // Regulations
        const regs = (art.regulations || []) as Record<string, unknown>[];
        for (let ri = 0; ri < regs.length; ri++) {
          regulationRows.push({
            id: `${artId}__reg-${ri}`,
            article_id: artId,
            instrument: regs[ri].instrument || "لائحة تنفيذية",
            reference: regs[ri].ref || "",
            text: regs[ri].text || "",
          });
        }

        // Amendments
        const amends = (art.amendments || []) as Record<string, unknown>[];
        for (let ai = 0; ai < amends.length; ai++) {
          amendmentRows.push({
            id: `${artId}__amd-${ai}`,
            article_id: artId,
            date: amends[ai].date || "",
            decree: amends[ai].decree || "",
            summary: amends[ai].summary || "",
            original_text: amends[ai].original_text || null,
          });
        }
      }
    }
  }

  // Insert in FK order
  const lawStats: SeedStats = { table: "laws", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "laws", lawRows, dryRun, lawStats, errors);
  allStats.push(lawStats);

  const chStats: SeedStats = { table: "law_chapters", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "law_chapters", chapterRows, dryRun, chStats, errors);
  allStats.push(chStats);

  const artStats: SeedStats = { table: "law_articles", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "law_articles", articleRows, dryRun, artStats, errors);
  allStats.push(artStats);

  if (regulationRows.length > 0) {
    const regStats: SeedStats = { table: "law_regulations", inserted: 0, skipped: 0, errors: 0 };
    await batchUpsert(client, "law_regulations", regulationRows, dryRun, regStats, errors);
    allStats.push(regStats);
  }

  if (amendmentRows.length > 0) {
    const amdStats: SeedStats = { table: "law_amendments", inserted: 0, skipped: 0, errors: 0 };
    await batchUpsert(client, "law_amendments", amendmentRows, dryRun, amdStats, errors);
    allStats.push(amdStats);
  }

  return allStats;
}

// ══════════════════════════════════════════════════════════════════════════════
// Seed: DECREES
// ══════════════════════════════════════════════════════════════════════════════

async function seedDecrees(
  client: NonNullable<typeof supabaseClient>,
  data: Record<string, unknown>,
  dryRun: boolean,
  errors: string[]
): Promise<SeedStats[]> {
  const allStats: SeedStats[] = [];
  const decrees = (data.decrees || []) as Record<string, unknown>[];

  console.log(`\n📋 Seeding ${decrees.length} decrees...\n`);

  const decreeRows: Record<string, unknown>[] = [];
  const articleRows: Record<string, unknown>[] = [];

  for (const dec of decrees) {
    const decId = String(dec.id || dec.slug);

    decreeRows.push({
      id: decId,
      slug: dec.slug || decId,
      title: dec.title || "",
      type: dec.type || "cabinet",
      issuer: dec.issuer || "",
      ref: dec.ref || "",
      date: dec.date || "",
      summary: dec.summary || "",
      summary_brief: dec.summary_brief || "",
      preamble: dec.preamble || "",
      cat: dec.cat || "",
      hashtags: dec.hashtags || [],
      official_url: dec.official_url || "",
      metadata: dec.metadata || {},
    });

    const arts = (dec.articles || []) as Record<string, unknown>[];
    for (const art of arts) {
      articleRows.push({
        id: `${decId}__art-${art.number || articleRows.length}`,
        decree_id: decId,
        number: art.number || 0,
        text: art.text || "",
      });
    }
  }

  const decStats: SeedStats = { table: "decrees", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "decrees", decreeRows, dryRun, decStats, errors);
  allStats.push(decStats);

  const artStats: SeedStats = { table: "decree_articles", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "decree_articles", articleRows, dryRun, artStats, errors);
  allStats.push(artStats);

  return allStats;
}

// ══════════════════════════════════════════════════════════════════════════════
// Seed: PRECEDENTS
// ══════════════════════════════════════════════════════════════════════════════

async function seedPrecedents(
  client: NonNullable<typeof supabaseClient>,
  data: Record<string, unknown>,
  dryRun: boolean,
  errors: string[]
): Promise<SeedStats[]> {
  const allStats: SeedStats[] = [];

  const collections = (data.collections || []) as Record<string, unknown>[];
  const courtPrecs = (data.court_precedents || []) as Record<string, unknown>[];

  console.log(`\n⚖️  Seeding ${collections.length} collections + ${courtPrecs.length} precedents...\n`);

  // ── Principle Collections ────────────────────────────────────────────
  const collRows: Record<string, unknown>[] = [];
  const principleRows: Record<string, unknown>[] = [];
  const subRows: Record<string, unknown>[] = [];

  for (const coll of collections) {
    const collId = String(coll.id || coll.slug);

    collRows.push({
      id: collId,
      slug: coll.slug || collId,
      title: coll.title || "",
      court: coll.court || "",
      court_type: coll.court_type || "ordinary",
      year_hijri: coll.year_hijri || 0,
      part: coll.part || 1,
      source_id: coll.source_id || "",
      total_principles: coll.total_principles || 0,
      metadata: coll.metadata || {},
    });

    const principles = (coll.principles || []) as Record<string, unknown>[];
    for (const pr of principles) {
      const prId = `${collId}__pr-${pr.number || principleRows.length}`;

      principleRows.push({
        id: prId,
        collection_id: collId,
        number: pr.number || 0,
        issuing_body: pr.issuing_body || "",
        issuing_body_abbr: pr.issuing_body_abbr || "",
        session_date: pr.session_date || "",
        case_number: pr.case_number || "",
        decision_number: pr.decision_number || "",
        source_type: pr.source_type || "",
        reference: pr.reference || "",
        text: pr.text || "",
        classification_keywords: pr.classification_keywords || [],
        details: pr.details || {},
        free: pr.free !== false,
      });

      const subs = (pr.sub_principles || []) as Record<string, unknown>[];
      for (let si = 0; si < subs.length; si++) {
        subRows.push({
          id: `${prId}__sub-${si}`,
          principle_id: prId,
          letter: subs[si].letter || "",
          keywords: subs[si].keywords || [],
          text: subs[si].text || "",
        });
      }
    }
  }

  // Insert in FK order
  const collStats: SeedStats = { table: "precedent_collections", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "precedent_collections", collRows, dryRun, collStats, errors);
  allStats.push(collStats);

  const prStats: SeedStats = { table: "judicial_principles", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "judicial_principles", principleRows, dryRun, prStats, errors);
  allStats.push(prStats);

  if (subRows.length > 0) {
    const subStats: SeedStats = { table: "principle_sub_items", inserted: 0, skipped: 0, errors: 0 };
    await batchUpsert(client, "principle_sub_items", subRows, dryRun, subStats, errors);
    allStats.push(subStats);
  }

  // ── Court Precedents ─────────────────────────────────────────────────
  const precRows: Record<string, unknown>[] = [];
  for (const prec of courtPrecs) {
    precRows.push({
      id: String(prec.id || prec.slug),
      slug: prec.slug || prec.id || "",
      title: prec.title || "",
      court: prec.court || "",
      court_type: prec.court_type || "ordinary",
      ruling_number: prec.ruling_number || "",
      case_number: prec.case_number || "",
      year: prec.year || "",
      date: prec.date || "",
      subject: prec.subject || "",
      cat: prec.cat || "",
      summary: prec.summary || "",
      summary_brief: prec.summary_brief || "",
      facts: prec.facts || "",
      reasons: prec.reasons || "",
      ruling: prec.ruling || "",
      preamble: prec.preamble || "",
      hashtags: prec.hashtags || [],
      is_redacted: prec.is_redacted || false,
      metadata: prec.metadata || {},
    });
  }

  if (precRows.length > 0) {
    const precStats: SeedStats = { table: "court_precedents", inserted: 0, skipped: 0, errors: 0 };
    await batchUpsert(client, "court_precedents", precRows, dryRun, precStats, errors);
    allStats.push(precStats);
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
  errors: string[]
): Promise<SeedStats[]> {
  const allStats: SeedStats[] = [];
  const books = (data.books || []) as Record<string, unknown>[];

  console.log(`\n📖 Seeding ${books.length} feqh books...\n`);

  const bookRows: Record<string, unknown>[] = [];
  const chapterRows: Record<string, unknown>[] = [];
  const sectionRows: Record<string, unknown>[] = [];
  const pageRows: Record<string, unknown>[] = [];

  for (const book of books) {
    const bookId = String(book.id || book.slug);

    bookRows.push({
      id: bookId,
      slug: book.slug || bookId,
      title: book.title || "",
      author: book.author || "",
      source: book.source || "المكتبة الشاملة",
      school: book.school || "",
      type: book.type || "sharia",
      category: book.category || "",
      investigator: book.investigator || "",
      publisher: book.publisher || "",
      total_volumes: book.total_volumes || 1,
      total_pages: book.total_pages || 0,
      total_chapters: book.total_chapters || 0,
      toc: book.toc || [],
      metadata: book.metadata || {},
    });

    const chapters = (book.chapters || []) as Record<string, unknown>[];
    for (let ci = 0; ci < chapters.length; ci++) {
      const ch = chapters[ci];
      const chId = `${bookId}__ch-${ci}`;

      chapterRows.push({
        id: chId,
        book_id: bookId,
        number: ci + 1,
        title: ch.title || "",
      });

      // Direct pages under chapter
      const directPages = (ch.pages || []) as Record<string, unknown>[];
      for (const pg of directPages) {
        pageRows.push({
          id: `${bookId}__p-${pg.page_number || pageRows.length}`,
          book_id: bookId,
          chapter_id: chId,
          section_id: null,
          page_number: pg.page_number || 0,
          volume: pg.volume || 1,
          text: pg.text || "",
          verses: pg.verses || [],
        });
      }

      // Sections under chapter
      const sections = (ch.sections || []) as Record<string, unknown>[];
      for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        const secId = `${chId}__sec-${si}`;

        sectionRows.push({
          id: secId,
          chapter_id: chId,
          book_id: bookId,
          number: si + 1,
          title: sec.title || "",
          level: sec.level || "bab",
        });

        const secPages = (sec.pages || []) as Record<string, unknown>[];
        for (const pg of secPages) {
          pageRows.push({
            id: `${bookId}__p-${pg.page_number || pageRows.length}`,
            book_id: bookId,
            chapter_id: chId,
            section_id: secId,
            page_number: pg.page_number || 0,
            volume: pg.volume || 1,
            text: pg.text || "",
            verses: pg.verses || [],
          });
        }
      }
    }
  }

  // Insert in FK order
  const bookStats: SeedStats = { table: "feqh_books", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "feqh_books", bookRows, dryRun, bookStats, errors);
  allStats.push(bookStats);

  const chStats: SeedStats = { table: "feqh_chapters", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "feqh_chapters", chapterRows, dryRun, chStats, errors);
  allStats.push(chStats);

  if (sectionRows.length > 0) {
    const secStats: SeedStats = { table: "feqh_sections", inserted: 0, skipped: 0, errors: 0 };
    await batchUpsert(client, "feqh_sections", sectionRows, dryRun, secStats, errors);
    allStats.push(secStats);
  }

  const pgStats: SeedStats = { table: "feqh_pages", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "feqh_pages", pageRows, dryRun, pgStats, errors);
  allStats.push(pgStats);

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
}): Promise<SeedResult> {
  const startedAt = new Date();
  const allStats: SeedStats[] = [];
  const errors: string[] = [];

  // ── Validate environment ──────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!options.dryRun && (!supabaseUrl || !supabaseKey)) {
    console.error("❌ Missing environment variables:");
    console.error("   NEXT_PUBLIC_SUPABASE_URL");
    console.error("   SUPABASE_SERVICE_ROLE_KEY");
    console.error("\n   Set them in .env.local or export them.");
    process.exit(1);
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

  // ── Process each content type ─────────────────────────────────────────
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
        stats = await seedLaws(client, data, options.dryRun, errors);
        break;
      case "decrees":
        stats = await seedDecrees(client, data, options.dryRun, errors);
        break;
      case "precedents":
        stats = await seedPrecedents(client, data, options.dryRun, errors);
        break;
      case "feqh":
        stats = await seedFeqh(client, data, options.dryRun, errors);
        break;
    }

    allStats.push(...stats);
  }

  // ── Summary ───────────────────────────────────────────────────────────
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
  console.log(`  Total errors:   ${totalErrors}`);
  console.log(`  Duration:       ${(durationMs / 1000).toFixed(1)}s`);
  console.log("╚══════════════════════════════════════════════════╝\n");

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
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: durationMs,
    stats: allStats,
    errors,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// CLI entry point
// ══════════════════════════════════════════════════════════════════════════════

if (require.main === module) {
  // Load .env.local
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split(/\r?\n/)) {
      const m = line.match(/^([^#=\s]+)\s*=\s*(.*)/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
    console.log("  📋 Loaded environment from .env.local\n");
  }

  const args = process.argv.slice(2);
  const dirIdx = args.indexOf("--dir");
  const typeIdx = args.indexOf("--type");

  const dir = dirIdx >= 0 ? args[dirIdx + 1] : args.find(a => !a.startsWith("--")) || "./output";
  const dryRun = args.includes("--dry-run");
  const clean = args.includes("--clean");

  let types: ContentType[] | undefined;
  if (typeIdx >= 0) {
    types = [args[typeIdx + 1] as ContentType];
  }

  seedLibrary({ dir: path.resolve(dir), dryRun, types, clean })
    .then((result) => {
      // Write result log
      const logDir = path.resolve(dir);
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
