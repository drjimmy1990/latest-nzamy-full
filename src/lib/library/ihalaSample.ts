/**
 * ihalaSample.ts — the pure half of scripts/library-ihala-sample.mjs (owner
 * N12 / file 02 [56] #38, batch l12): «التحقق من أعداد "الإحالة" على 50 مادة
 * وإبلاغ المالك ووسم الآلي غير المراجَع».
 *
 * The script picks 50 articles that carry «إحالة» links (CITES_ARTICLE),
 * spread over laws, and for each one writes: how many links the graph holds
 * (out / in), how many the reader's box shows after the library check, how
 * many are automatic and unreviewed (the «رابط آلي» tag), how many times the
 * article's own text names another article («المادة (5)», «المادتين»…), and the
 * linked titles with a short evidence line, so his team can tick each one.
 *
 * Read-only by design: nothing here touches a database or the network.
 */

/** A deterministic PRNG (mulberry32): the same seed picks the same sample. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SampleCandidate {
  lawSlug: string;
  articleId: string;
  /** CITES_ARTICLE links of the article (out + in). */
  total: number;
}

/**
 * `n` articles, at most `perLaw` from one law, spread over small, medium and
 * large link counts (a third each when there are enough), the same for the
 * same seed.
 */
export function pickSample(candidates: readonly SampleCandidate[], n = 50, seed = 20261121, perLaw = 2): SampleCandidate[] {
  const rand = rng(seed);
  const pool = [...candidates].filter((c) => c.total > 0 && c.lawSlug && c.articleId);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const band = (c: SampleCandidate) => (c.total <= 2 ? 0 : c.total <= 8 ? 1 : 2);
  const want = [Math.ceil(n / 3), Math.ceil(n / 3), n - 2 * Math.ceil(n / 3)];
  const perLawCount = new Map<string, number>();
  const picked: SampleCandidate[] = [];
  const take = (c: SampleCandidate) => {
    picked.push(c);
    perLawCount.set(c.lawSlug, (perLawCount.get(c.lawSlug) ?? 0) + 1);
  };
  for (const c of pool) {
    if (picked.length >= n) break;
    const b = band(c);
    if (want[b] <= 0 || (perLawCount.get(c.lawSlug) ?? 0) >= perLaw) continue;
    want[b]--;
    take(c);
  }
  // Not enough in some band: fill from the rest, the per-law cap still holding.
  for (const c of pool) {
    if (picked.length >= n) break;
    if (picked.includes(c) || (perLawCount.get(c.lawSlug) ?? 0) >= perLaw) continue;
    take(c);
  }
  return picked;
}

/**
 * How many times an article's text names an article: «المادة (5)», «المادة
 * الخامسة», «المادتين (3) و(4)» counts 2, «المواد (1-3)» counts 1 (a range is
 * one mention — the reader links each article it can pin). A rough yardstick
 * beside the graph's count, not a parser.
 */
export function countArticleMentions(text: string): number {
  const t = String(text ?? "");
  let n = 0;
  n += (t.match(/(?:ال|بال|لل|وال|فال)?مادة\s*(?:\(\s*[0-9٠-٩]+|[0-9٠-٩]+|ال[ء-ي]{3,})/gu) ?? []).length;
  n += 2 * (t.match(/(?:ال|بال|لل|وال)?مادت(?:ين|ان)/gu) ?? []).length;
  n += (t.match(/(?:ال|بال|لل|وال)?مواد\s*\(?\s*[0-9٠-٩]/gu) ?? []).length;
  return n;
}

export interface SampleLink {
  key: string;
  title: string;
  /** The other article's law (the reader drops a link whose law is gone). */
  lawSlug: string;
  direction: "out" | "in";
  origin: string;
  fromOwnerFile: boolean;
  evidence: string;
}

/** graph_rag_explore_neighborhood(article, 1, [CITES_ARTICLE]) → the article's «إحالة» links. */
export function sampleLinks(raw: unknown, articleId: string): { found: boolean; out: number; in: number; links: SampleLink[] } {
  const empty = { found: false, out: 0, in: 0, links: [] as SampleLink[] };
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as { found?: unknown; nodes?: unknown; edges?: unknown; center_edge_counts?: unknown };
  if (r.found !== true) return empty;
  const center = `article:${articleId}`;
  const titles = new Map<string, string>();
  const laws = new Map<string, string>();
  for (const n of Array.isArray(r.nodes) ? (r.nodes as Array<{ node_key?: unknown; title?: unknown; law_slug?: unknown }>) : []) {
    if (typeof n?.node_key !== "string") continue;
    titles.set(n.node_key, typeof n.title === "string" ? n.title : "");
    laws.set(n.node_key, typeof n.law_slug === "string" ? n.law_slug : "");
  }
  const links: SampleLink[] = [];
  for (const e of Array.isArray(r.edges) ? (r.edges as Array<Record<string, unknown>>) : []) {
    if (e?.edge_type !== "CITES_ARTICLE") continue;
    const direction = e.source === center ? "out" : e.target === center ? "in" : null;
    if (!direction) continue;
    const key = String(direction === "out" ? e.target : e.source);
    const md = (e.metadata && typeof e.metadata === "object" ? e.metadata : {}) as { source?: unknown };
    links.push({
      key,
      title: (titles.get(key) ?? key).slice(0, 120),
      lawSlug: laws.get(key) ?? "",
      direction,
      origin: typeof e.origin === "string" ? e.origin : "",
      fromOwnerFile: md.source === "owner_links" || md.source === "owner_edges",
      evidence: String(e.evidence ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
    });
  }
  const c = (r.center_edge_counts && typeof r.center_edge_counts === "object" ? r.center_edge_counts : {}) as Record<string, { out?: unknown; in?: unknown }>;
  const cnt = c.CITES_ARTICLE ?? {};
  return {
    found: true,
    out: Number.isInteger(cnt.out) ? (cnt.out as number) : links.filter((l) => l.direction === "out").length,
    in: Number.isInteger(cnt.in) ? (cnt.in as number) : links.filter((l) => l.direction === "in").length,
    links,
  };
}

export interface SampleRow {
  lawSlug: string;
  lawTitle: string;
  articleId: string;
  articleLabel: string;
  graphOut: number;
  graphIn: number;
  /** What the reader's box shows for «إحالة» after the library check (rows gone are dropped / shown as their law). */
  shown: number;
  automatic: number;
  mentions: number;
  links: SampleLink[];
}

/** A link the reader tags «رابط آلي» (graphLinkTypes.isUnreviewedAutoLink, for CITES_ARTICLE). */
export function isAutomatic(l: Pick<SampleLink, "origin" | "fromOwnerFile">): boolean {
  return l.origin === "auto_watchdog" && !l.fromOwnerFile;
}

const tsvCell = (v: unknown) => String(v ?? "").replace(/[\t\r\n]+/g, " ");

/** The owner's report: Markdown in Arabic, one table row per article, then each article's links to tick. */
export function formatSampleReport(rows: readonly SampleRow[], meta: { date: string; seed: number }): { md: string; tsv: string } {
  const sum = (f: (r: SampleRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  const md: string[] = [];
  md.push(`# فحص عيّنة «الإحالة» — ${rows.length} مادة (${meta.date})`, "");
  md.push(
    "كيف تُقرأ: «في الجراف» عدد روابط «الإحالة» المسجّلة للمادة (صادرة / واردة)، و«في المربع» ما يظهر للقارئ بعد التحقق من وجود المادة الأخرى في المكتبة، و«آلي غير مراجَع» ما استخرجه النظام من النص ويظهر عليه وسم «رابط آلي»، و«ذِكر في النص» عدد المرات التي يذكر فيها نص المادة مادةً أخرى (تقدير تقريبي للمقارنة). تحت الجدول روابط كل مادة لفريق المكتبة: يُوضع ✓ أمام الصحيح و✗ أمام الخطأ.",
    "",
  );
  md.push(
    `الإجمالي: في الجراف ${sum((r) => r.graphOut + r.graphIn)} رابطاً، في المربع ${sum((r) => r.shown)}، آلي غير مراجَع ${sum((r) => r.automatic)}، ذِكر في النص ${sum((r) => r.mentions)}. البذرة ${meta.seed} (تعيد العيّنة نفسها).`,
    "",
  );
  md.push("| # | النظام | المادة | في الجراف (صادرة/واردة) | في المربع | آلي غير مراجَع | ذِكر في النص |", "|---|---|---|---|---|---|---|");
  rows.forEach((r, i) => {
    md.push(`| ${i + 1} | ${r.lawTitle.replace(/\|/g, "/")} | ${r.articleLabel.replace(/\|/g, "/")} | ${r.graphOut}/${r.graphIn} | ${r.shown} | ${r.automatic} | ${r.mentions} |`);
  });
  md.push("");
  rows.forEach((r, i) => {
    md.push(`## ${i + 1}. ${r.lawTitle} — ${r.articleLabel}`, "");
    if (r.links.length === 0) md.push("لا روابط «إحالة» لهذه المادة.", "");
    for (const l of r.links) {
      const dir = l.direction === "out" ? "تحيل إليها هذه المادة" : "مادة تحيل إليها";
      const tag = isAutomatic(l) ? " · رابط آلي" : "";
      md.push(`- [ ] ${l.title} (${dir}${tag})${l.evidence ? ` — «${l.evidence}»` : ""}`);
    }
    md.push("");
  });
  const head = ["law_slug", "law_title", "article_id", "article", "graph_out", "graph_in", "shown", "automatic", "text_mentions"];
  const tsv = [head.join("\t"), ...rows.map((r) => [r.lawSlug, r.lawTitle, r.articleId, r.articleLabel, r.graphOut, r.graphIn, r.shown, r.automatic, r.mentions].map(tsvCell).join("\t"))].join("\n") + "\n";
  return { md: md.join("\n"), tsv };
}
