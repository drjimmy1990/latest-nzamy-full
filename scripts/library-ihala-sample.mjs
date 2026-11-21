#!/usr/bin/env node
/**
 * scripts/library-ihala-sample.mjs — the 50-article «إحالة» sample for the
 * owner (N12 / file 02 [56] #38, batch l12; pure half:
 * src/lib/library/ihalaSample.ts, tested).
 *
 * READ-ONLY: it calls two read functions (graph_rag_law_article_links,
 * graph_rag_explore_neighborhood) and selects from library.laws / articles. It
 * writes nothing to any database; it writes two files into --out.
 *
 *   node --env-file=.env.local scripts/library-ihala-sample.mjs --out <new empty folder> [--n 50] [--seed 20261121] [--laws 120]
 *
 *   --out    a folder for ihala-sample-<date>.md (the owner's Arabic report,
 *            one checkbox per link) and ihala-sample-<date>.tsv
 *   --n      articles in the sample (default 50, at most 200)
 *   --seed   the same seed gives the same sample (default 20261121)
 *   --laws   how many laws to scan for candidates (default 120, newest first)
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
 * environment, and migration 20261202_30 (the law-wide links read).
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  if (String(warning).includes("Module type of file")) return;
  return emitWarning.call(process, warning, ...rest);
};
const { pickSample, sampleLinks, countArticleMentions, isAutomatic, formatSampleReport } = await import("../src/lib/library/ihalaSample.ts");

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
if (args.includes("--help") || !opt("out")) {
  console.error("usage: node --env-file=.env.local scripts/library-ihala-sample.mjs --out <new empty folder> [--n 50] [--seed 20261121] [--laws 120]");
  process.exit(2);
}
const OUT = path.resolve(opt("out"));
const N = Math.min(Math.max(Number(opt("n", "50")) || 50, 1), 200);
const SEED = Number(opt("seed", "20261121")) || 20261121;
const LAWS = Math.min(Math.max(Number(opt("laws", "120")) || 120, 5), 1000);

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!/^https?:\/\//.test(URL_) || !KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (run with --env-file=.env.local)");
  process.exit(2);
}
if (fs.existsSync(OUT) && fs.readdirSync(OUT).length > 0) {
  console.error(`❌ --out must be a new or empty folder: ${OUT}`);
  process.exit(2);
}
const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const lib = db.schema("library");

// 1. candidates: articles with «إحالة» links, from the newest laws
const { data: laws, error: lawsError } = await lib.from("laws").select("slug, title").order("updated_at", { ascending: false }).limit(LAWS);
if (lawsError) {
  console.error("❌ library.laws:", lawsError.code ?? lawsError.message);
  process.exit(1);
}
const lawTitle = new Map((laws ?? []).map((l) => [l.slug, l.title]));
const candidates = [];
for (const l of laws ?? []) {
  const { data, error } = await db.rpc("graph_rag_law_article_links", { p_law_slug: l.slug, p_per_type: 1, p_types: ["CITES_ARTICLE"] });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      console.error("❌ graph_rag_law_article_links is missing: run migration 20261202_30 first");
      process.exit(1);
    }
    console.error(`  skip ${l.slug}: ${error.code ?? error.message}`);
    continue;
  }
  for (const a of data?.articles ?? []) {
    const total = (a.links ?? []).reduce((n, g) => n + (Number.isInteger(g.n) ? g.n : 0), 0);
    if (total > 0) candidates.push({ lawSlug: l.slug, articleId: a.id, total });
  }
}
const sample = pickSample(candidates, N, SEED);
console.log(`candidates: ${candidates.length} articles with «إحالة» links in ${laws?.length ?? 0} laws; sample: ${sample.length}`);

// 2. each sampled article: its links, the library check, its own text
const rows = [];
for (const c of sample) {
  const { data, error } = await db.rpc("graph_rag_explore_neighborhood", { p_node_key: `article:${c.articleId}`, p_depth: 1, p_edge_types: ["CITES_ARTICLE"], p_limit: 200 });
  if (error) {
    console.error(`  skip ${c.articleId}: ${error.code ?? error.message}`);
    continue;
  }
  const s = sampleLinks(data, c.articleId);
  const { data: art } = await lib.from("articles").select("id, number, text").eq("id", c.articleId).maybeSingle();
  const otherLaws = [...new Set(s.links.map((l) => l.lawSlug).filter(Boolean))];
  const { data: live } = otherLaws.length ? await lib.from("laws").select("slug").in("slug", otherLaws) : { data: [] };
  const liveLaws = new Set((live ?? []).map((x) => x.slug));
  rows.push({
    lawSlug: c.lawSlug,
    lawTitle: lawTitle.get(c.lawSlug) ?? c.lawSlug,
    articleId: c.articleId,
    articleLabel: art?.number ? `المادة ${art.number}` : c.articleId,
    graphOut: s.out,
    graphIn: s.in,
    shown: s.links.filter((l) => liveLaws.has(l.lawSlug)).length,
    automatic: s.links.filter(isAutomatic).length,
    mentions: countArticleMentions(art?.text ?? ""),
    links: s.links,
  });
}

// 3. the report
const date = new Date().toISOString().slice(0, 10);
const { md, tsv } = formatSampleReport(rows, { date, seed: SEED });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, `ihala-sample-${date}.md`), md, "utf8");
fs.writeFileSync(path.join(OUT, `ihala-sample-${date}.tsv`), tsv, "utf8");
console.log(`written: ${path.join(OUT, `ihala-sample-${date}.md`)} and .tsv (${rows.length} articles)`);
