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

function createSupabaseClient(url: string, key: string) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "Content-Profile": "library",
    "Accept-Profile": "library",
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
  const laws = (data.laws || []) as any[];

  console.log(`\n🏛️  Seeding ${laws.length} laws...\n`);

  const lawRows: Record<string, unknown>[] = [];
  const chapterRows: Record<string, unknown>[] = [];
  const articleRows: Record<string, unknown>[] = [];
  const amendmentRows: Record<string, unknown>[] = [];

  for (const law of laws) {
    const lawId = String(law.slug || law.id);
    if (lawId.includes("EXTRACTION_REPORT")) continue;

    lawRows.push({
      slug: lawId,
      title: law.title,
      title_en: law.title_en || "",
      type: (law.type || "نظام").substring(0, 50),
      description: law.description || law.title || "",
      section_code: law.section_code || "",
      section_name: law.section_name || "",
      issuing_body: law.issuing_body || "",
      issuing_instrument: law.issuance_decree || "",
      issue_date_hijri: law.issuance_date || "",
      total_articles: law.total_articles || 0,
      preamble: law.preamble || "",
      has_merged_regulation: law.has_executive_reg || false,
      status: (law.law_status || "active").substring(0, 30),
    });

    const chapters = (law.chapters || []) as any[];
    for (const ch of chapters) {
      const chapterId = crypto.randomUUID();
      chapterRows.push({
        id: chapterId,
        law_slug: lawId.substring(0, 200),
        number: ch.number || 0,
        title: ch.title || "",
        order_index: ch.number || 0,
      });

      const articles = (ch.articles || []) as any[];
      for (const art of articles) {
        const artId = `${lawId}__art-${art.number || crypto.randomUUID().substring(0, 8)}`.substring(0, 150);

        const regs = (art.regulations || []) as any[];
        const amends = (art.amendments || []) as any[];

        articleRows.push({
          id: artId,
          law_slug: lawId.substring(0, 200),
          chapter_id: chapterId,
          number: String(art.number || "0").substring(0, 20),
          number_text: (art.number_text || "").substring(0, 50),
          title: art.title || "",
          status: (art.status || "active").substring(0, 30),
          text: art.text || "",
          free: art.free !== false,
          executive_reg_text: regs.map(r => r.text || "").join("\n\n") || null,
          executive_reg_ref: regs.map(r => r.ref || "").join(", ") || null,
          instrument: regs[0]?.instrument || null,
          order_index: parseInt(art.number) || 0,
        });

        for (let ai = 0; ai < amends.length; ai++) {
          amendmentRows.push({
            id: crypto.randomUUID(),
            article_id: artId,
            date: (amends[ai].date || "").substring(0, 30),
            source: amends[ai].decree || "",
            type: (amends[ai].type || "تعديل").substring(0, 50),
            summary: amends[ai].summary || "",
            full_text: amends[ai].original_text || null,
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

  const lawStats: SeedStats = { table: "laws", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "laws", uniqueLawRows, dryRun, lawStats, errors);
  allStats.push(lawStats);

  const chStats: SeedStats = { table: "chapters", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "chapters", uniqueChapterRows, dryRun, chStats, errors);
  allStats.push(chStats);

  const artStats: SeedStats = { table: "articles", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "articles", uniqueArticleRows, dryRun, artStats, errors);
  allStats.push(artStats);

  if (uniqueAmendmentRows.length > 0) {
    const amdStats: SeedStats = { table: "article_amendments", inserted: 0, skipped: 0, errors: 0 };
    await batchUpsert(client, "article_amendments", uniqueAmendmentRows, dryRun, amdStats, errors);
    allStats.push(amdStats);
  }

  return allStats;
}

// ══════════════════════════════════════════════════════════════════════════════
// Seed: DECREES
// ═══════════════════════════════════════════════════════════════════════════

async function seedDecrees(
  client: NonNullable<typeof supabaseClient>,
  data: Record<string, unknown>,
  dryRun: boolean,
  errors: string[]
): Promise<SeedStats[]> {
  const allStats: SeedStats[] = [];
  const decrees = (data.decrees || []) as any[];

  console.log(`\n📋 Seeding ${decrees.length} decrees...\n`);

  const decreeRows: Record<string, unknown>[] = [];
  const pageRows: Record<string, unknown>[] = [];

  const uuidMap = new Map<string, string>();
  const getUuid = (id: string): string => {
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
      return id.toLowerCase();
    }
    if (uuidMap.has(id)) {
      return uuidMap.get(id)!;
    }
    const newUuid = crypto.randomUUID();
    uuidMap.set(id, newUuid);
    return newUuid;
  };

  for (const dec of decrees) {
    const rawId = String(dec.id || dec.slug);
    if (rawId.includes("EXTRACTION_REPORT")) continue;

    const decId = getUuid(rawId);

    decreeRows.push({
      id: decId,
      title: dec.title || "",
      type: (dec.type || "cabinet").substring(0, 30),
      issuer: dec.issuer || "",
      ref: dec.ref || "",
      date: dec.date || "",
      summary: dec.summary || "",
      summary_brief: dec.summary_brief || "",
      category: (dec.cat || "").substring(0, 100),
      preamble: dec.preamble || "",
      hashtags: dec.hashtags || [],
      official_url: dec.official_url || "",
    });

    const arts = (dec.articles || []) as any[];

    for (const art of arts) {
      pageRows.push({
        id: crypto.randomUUID(),
        decree_id: decId,
        page_number: art.number || 0,
        content: art.text || "",
      });
    }
  }

  // Deduplicate
  const uniqueDecreeRows = Array.from(new Map(decreeRows.map(r => [r.id, r])).values());
  const uniquePageRows = Array.from(new Map(pageRows.map(r => [r.id, r])).values());

  const decStats: SeedStats = { table: "decrees_circulars", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "decrees_circulars", uniqueDecreeRows, dryRun, decStats, errors);
  allStats.push(decStats);

  const pageStats: SeedStats = { table: "decree_pages", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "decree_pages", uniquePageRows, dryRun, pageStats, errors);
  allStats.push(pageStats);

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
  const collections = (data.collections || []) as any[];
  const courtPrecs = (data.court_precedents || []) as any[];

  console.log(`\n⚖️  Seeding ${collections.length} collections + ${courtPrecs.length} precedents...\n`);

  const collRows: Record<string, unknown>[] = [];
  const principleRows: Record<string, unknown>[] = [];
  const paragraphRows: Record<string, unknown>[] = [];

  // Default collection for isolated court precedents
  if (courtPrecs.length > 0) {
    collRows.push({
      id: "court-precedents-collection",
      title: "السوابق والأحكام القضائية",
      court: "المحكمة التجارية",
      year_hijri: null,
      part: 1,
      source_id: "moj",
      track: "commercial",
      description: "مجموعة الأحكام والسوابق التجارية",
      ruling_count: courtPrecs.length,
      free: true,
      progress: 100,
    });
  }

  for (const coll of collections) {
    const collId = String(coll.id || coll.slug).substring(0, 100);

    collRows.push({
      id: collId,
      title: coll.title || "",
      court: coll.court || "",
      year_hijri: coll.year_hijri || null,
      part: coll.part || 1,
      source_id: coll.source_id || "",
      track: (coll.track || "").substring(0, 50),
      description: coll.description || "",
      ruling_count: coll.total_principles || 0,
      free: coll.free !== false,
      progress: 100,
    });

    const principles = (coll.principles || []) as any[];
    for (const pr of principles) {
      const prId = `${collId}__pr-${pr.number || crypto.randomUUID().substring(0, 8)}`.substring(0, 150);

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
        year_hijri: pr.year_hijri || null,
        order_index: pr.number || 0,
      });

      const subs = (pr.sub_principles || []) as any[];

      for (let si = 0; si < subs.length; si++) {
        paragraphRows.push({
          id: crypto.randomUUID(),
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
    const precId = String(prec.slug || prec.id).substring(0, 150);

    principleRows.push({
      id: precId,
      collection_id: "court-precedents-collection",
      principle_number: String(prec.ruling_number || "").substring(0, 50),
      issuing_body: prec.court_type || "",
      session_date: prec.date || "",
      decision_number: prec.case_number || "",
      reference: prec.subject || "",
      text: prec.summary || prec.preamble || "",
      ruling_basis: prec.summary_brief || "",
      facts: prec.facts || "",
      reasons: prec.reasons || "",
      ruling: prec.ruling || "",
      year_hijri: parseInt(String(prec.year)) || null,
      order_index: pi,
    });
  }

  // Deduplicate
  const uniqueCollRows = Array.from(new Map(collRows.map(r => [r.id, r])).values());
  const uniquePrincipleRows = Array.from(new Map(principleRows.map(r => [r.id, r])).values());
  const uniqueParagraphRows = Array.from(new Map(paragraphRows.map(r => [r.id, r])).values());

  const collStats: SeedStats = { table: "judicial_collections", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "judicial_collections", uniqueCollRows, dryRun, collStats, errors);
  allStats.push(collStats);

  const prStats: SeedStats = { table: "principles", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "principles", uniquePrincipleRows, dryRun, prStats, errors);
  allStats.push(prStats);

  if (uniqueParagraphRows.length > 0) {
    const paraStats: SeedStats = { table: "principle_paragraphs", inserted: 0, skipped: 0, errors: 0 };
    await batchUpsert(client, "principle_paragraphs", uniqueParagraphRows, dryRun, paraStats, errors);
    allStats.push(paraStats);
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
  const books = (data.books || []) as any[];

  console.log(`\n📖 Seeding ${books.length} feqh books...\n`);

  const bookRows: Record<string, unknown>[] = [];
  const chapterRows: Record<string, unknown>[] = [];
  const sectionRows: Record<string, unknown>[] = [];
  const blockRows: Record<string, unknown>[] = [];

  for (const book of books) {
    const bookId = String(book.id || book.slug).substring(0, 100);
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
      const chId = crypto.randomUUID();

      chapterRows.push({
        id: chId,
        book_id: bookId,
        title: ch.title || "",
        volume_number: ch.pages?.[0]?.volume || ch.sections?.[0]?.pages?.[0]?.volume || 1,
        order_index: ci,
      });

      // Direct pages under chapter
      const directPages = (ch.pages || []) as any[];
      if (directPages.length > 0) {
        const dummySecId = crypto.randomUUID();
        sectionRows.push({
          id: dummySecId,
          chapter_id: chId,
          title: "عام",
          order_index: 999,
        });

        for (let pi = 0; pi < directPages.length; pi++) {
          const pg = directPages[pi];
          blockRows.push({
            id: `${bookId}__block-${crypto.randomUUID().substring(0, 8)}`.substring(0, 150),
            section_id: dummySecId,
            topic: ch.title || "",
            volume_number: pg.volume || 1,
            page_number: pg.page_number || 0,
            matn: pg.text || "",
            sharh: null,
            hashiyah: {},
            order_index: pi,
          });
        }
      }

      // Sections under chapter
      const sections = (ch.sections || []) as any[];
      for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        const secId = crypto.randomUUID();

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
            id: `${bookId}__block-${crypto.randomUUID().substring(0, 8)}`.substring(0, 150),
            section_id: secId,
            topic: sec.title || "",
            volume_number: pg.volume || 1,
            page_number: pg.page_number || 0,
            matn: pg.text || "",
            sharh: null,
            hashiyah: {},
            order_index: pi,
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
  await batchUpsert(client, "feqh_books", uniqueBookRows, dryRun, bookStats, errors);
  allStats.push(bookStats);

  const chStats: SeedStats = { table: "feqh_chapters", inserted: 0, skipped: 0, errors: 0 };
  await batchUpsert(client, "feqh_chapters", uniqueChapterRows, dryRun, chStats, errors);
  allStats.push(chStats);

  if (uniqueSectionRows.length > 0) {
    const secStats: SeedStats = { table: "feqh_sections", inserted: 0, skipped: 0, errors: 0 };
    await batchUpsert(client, "feqh_sections", uniqueSectionRows, dryRun, secStats, errors);
    allStats.push(secStats);
  }

  if (uniqueBlockRows.length > 0) {
    const blockStats: SeedStats = { table: "feqh_blocks", inserted: 0, skipped: 0, errors: 0 };
    await batchUpsert(client, "feqh_blocks", uniqueBlockRows, dryRun, blockStats, errors);
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
}): Promise<SeedResult> {
  const startedAt = new Date();
  const allStats: SeedStats[] = [];
  const errors: string[] = [];

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

if (require.main === module) {
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
