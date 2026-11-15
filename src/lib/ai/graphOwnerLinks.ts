/**
 * graphOwnerLinks.ts — the owner's own links (src/lib/library/ownerLinks.ts)
 * as graph links:
 *
 *   superseded_by / repealed_by T  →  SUPERSEDES_LAW  T → this law (this law repealed)
 *   supersedes / repeals T         →  SUPERSEDES_LAW  this law → T
 *   affects T + article numbers    →  AMENDS_ARTICLE  this decree (or law) → each article of T
 *   affects T without numbers, related T: kept in the library, no graph link
 *     (no law-to-law link is walked by the retrieve).
 *
 * SUPERSEDES_LAW is not walked by the retrieve itself: it tells the vector
 * pass where a repealed article's replacement lives (REPLACED_BY, 20261116_10);
 * 20261118_10 makes that pass redo the repealed articles whose successors
 * changed. AMENDS_ARTICLE is walked at hop 1.
 *
 * Resolution is strict, the same rule as the repeal clauses: a stated slug,
 * registry id or BOE guid that names exactly one law; else the title, when
 * exactly one library law carries it — or exactly one of those carries the
 * decree number the owner wrote («م/53»). Anything else is counted, not guessed.
 *
 * Pure, so the parser can tally the owner's links against its own laws with
 * the same rules the watchdog applies.
 */
import { parseOwnerLinks, type OwnerLink } from "../library/ownerLinks.ts";
import {
  findArticleMentions,
  normalizeArabicKey,
  titleCore,
  type GraphEdgePayload,
  type LawIndexEntry,
  type LawIndexMap,
} from "./graphBuilder.ts";

/** What resolution needs of a law (a parsed law at parse time, a LawIndexEntry in the watchdog). */
export interface OwnerLinkLaw {
  slug: string;
  title: string;
  status?: string | null;
  instrumentId?: string | null;
  lawGuid?: string | null;
  issuingInstrument?: string | null;
}

export interface OwnerLinkIndex<T extends OwnerLinkLaw> {
  bySlug: Map<string, T>;
  byId: Map<string, T[]>;
  byGuid: Map<string, T[]>;
  byCore: Map<string, T[]>;
}

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
};

export function buildOwnerLinkIndex<T extends OwnerLinkLaw>(laws: Iterable<T>): OwnerLinkIndex<T> {
  const idx: OwnerLinkIndex<T> = { bySlug: new Map(), byId: new Map(), byGuid: new Map(), byCore: new Map() };
  for (const law of laws) {
    idx.bySlug.set(law.slug, law);
    if (law.instrumentId) push(idx.byId, law.instrumentId.trim().toUpperCase(), law);
    if (law.lawGuid) push(idx.byGuid, law.lawGuid.trim().toLowerCase(), law);
    const core = titleCore(law.title);
    if (core) push(idx.byCore, core, law);
  }
  return idx;
}

export const isRepealedLaw = (l: { status?: string | null }) => (l.status ?? "").toLowerCase() === "repealed";

/** Decree number tokens a name states: «م/53», «أ/111», «رقم (1550)» → "م 53", "ا 111", "1550". */
export function decreeTokens(text: string): string[] {
  const t = text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const out = new Set<string>();
  for (const m of t.matchAll(/(?:^|[\s(])([أإامق])\s*\/\s*(\d{1,5})/gu)) out.add(`${normalizeArabicKey(m[1])} ${m[2]}`);
  for (const m of t.matchAll(/رقم\s*\(?\s*(\d{1,6})\s*\)?/gu)) out.add(m[1]);
  return [...out];
}

function instrumentTokens(law: OwnerLinkLaw): Set<string> {
  return new Set(decreeTokens(law.issuingInstrument ?? ""));
}

/** «نظام التنفيذ (المرسوم الملكي رقم م/53 وتاريخ …)» → the title core «نظام التنفيذ». */
export function ownerNameCore(name: string): string {
  return titleCore(name.replace(/\([^()]*\)/g, " ").replace(/\s+و?لائحت[هة]\s+التنفيذي[هة]\s*$/u, " "));
}

export type OwnerLinkResolution<T> =
  | { law: T; how: "slug" | "id" | "guid" | "title" | "title+decree" }
  | { law: null; why: "not_found" | "ambiguous" };

/**
 * The one law a link names, or why there is none. `prefer` breaks a title tie
 * by status (the old law of a repeal is the repealed copy, the new one is not)
 * only when that leaves exactly one.
 */
export function resolveOwnerLinkTarget<T extends OwnerLinkLaw>(
  link: OwnerLink,
  idx: OwnerLinkIndex<T>,
  prefer: "repealed" | "in_force" | null,
): OwnerLinkResolution<T> {
  const one = (list: T[] | undefined) => (list && list.length === 1 ? list[0] : list && list.length > 1 ? "ambiguous" : null);
  let ambiguous = false;
  if (link.slug) {
    const hit = idx.bySlug.get(link.slug);
    if (hit) return { law: hit, how: "slug" };
  }
  if (link.id) {
    const hit = one(idx.byId.get(link.id.trim().toUpperCase()));
    if (hit === "ambiguous") ambiguous = true;
    else if (hit) return { law: hit, how: "id" };
  }
  if (link.guid) {
    const hit = one(idx.byGuid.get(link.guid.toLowerCase()));
    if (hit === "ambiguous") ambiguous = true;
    else if (hit) return { law: hit, how: "guid" };
  }
  if (link.name) {
    const core = ownerNameCore(link.name);
    const candidates = core ? idx.byCore.get(core) ?? [] : [];
    if (candidates.length === 1) return { law: candidates[0], how: "title" };
    if (candidates.length > 1) {
      const tokens = decreeTokens(link.name);
      if (tokens.length) {
        const byDecree = candidates.filter((c) => {
          const own = instrumentTokens(c);
          return tokens.some((t) => own.has(t));
        });
        if (byDecree.length === 1) return { law: byDecree[0], how: "title+decree" };
      }
      if (prefer) {
        const pick = candidates.filter((c) => (prefer === "repealed") === isRepealedLaw(c));
        if (pick.length === 1) return { law: pick[0], how: "title" };
      }
      ambiguous = true;
    }
  }
  return { law: null, why: ambiguous ? "ambiguous" : "not_found" };
}

/**
 * The article numbers an `affects` entry states. Only plain numbers and
 * article phrases read whole («46», «المادة الثالثة», «المادتين 5 و6»);
 * «23 مكرر», «الفقرة (ب) من أولاً», «تعديل اسم الضوابط» are not numbers.
 */
export function ownerArticleNumbers(texts: readonly string[] | undefined): { numbers: number[]; unparsed: number } {
  const numbers: number[] = [];
  let unparsed = 0;
  for (const raw of texts ?? []) {
    const t = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).trim();
    let got: number[] = [];
    if (/^\d{1,4}$/.test(t)) got = [Number(t)];
    else {
      const phrase = /^(?:ال)?(?:م[اآ]د|مواد)/u.test(t) ? t : `المادة ${t}`;
      const mentions = findArticleMentions(phrase);
      // The whole text must be the mention: nothing after the last number but punctuation.
      if (mentions.length === 1 && phrase.slice(mentions[0].end).replace(/[\s.,،:؛)]+/gu, "") === "") got = mentions[0].numbers;
    }
    if (got.length === 0) unparsed++;
    for (const n of got) if (n > 0 && !numbers.includes(n)) numbers.push(n);
  }
  return { numbers, unparsed };
}

export interface OwnerLinkStats {
  links: number;
  edges: number;
  resolved: Record<string, number>;
  notFound: number;
  ambiguous: number;
  /** superseded_by / repealed_by on a law the library does not mark repealed. */
  stillInForce: number;
  /** A repealed law stated as replacing one in force, or a link to itself. */
  contradictory: number;
  /** `affects` with no article number (the instrument affects the law as a whole). */
  lawLevel: number;
  articlesNotInLaw: number;
  related: number;
  /** Links on a decree other than `affects` (decrees are not law nodes). */
  decreeOther: number;
}

export function newOwnerLinkStats(): OwnerLinkStats {
  return {
    links: 0, edges: 0, resolved: {}, notFound: 0, ambiguous: 0, stillInForce: 0, contradictory: 0,
    lawLevel: 0, articlesNotInLaw: 0, related: 0, decreeOther: 0,
  };
}

export function formatOwnerLinkStats(s: OwnerLinkStats): string {
  const how = Object.entries(s.resolved).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
  return (
    `owner links: ${s.links} read, ${s.edges} graph links; resolved by ${how}; ` +
    `not found ${s.notFound}, ambiguous ${s.ambiguous}, still in force ${s.stillInForce}, contradictory ${s.contradictory}, ` +
    `law-level ${s.lawLevel}, articles not in the law ${s.articlesNotInLaw}, related ${s.related}, decree non-amendment ${s.decreeOther}`
  );
}

const EVIDENCE_MAX = 180;
/** Evidence names the library's own title of the target, never the owner's wording (which may carry a note). */
const evidence = (label: string, target: { title: string }) => `${label}: ${target.title}`.slice(0, EVIDENCE_MAX);

export type OwnerLinkSource = { kind: "law"; law: LawIndexEntry } | { kind: "decree"; nodeKey: string };

/**
 * The graph links one document's owner links make. `raw` is the stored
 * `owner_links` value. Counts every outcome into `stats`.
 */
export function ownerLinkEdges(
  source: OwnerLinkSource,
  raw: unknown,
  lawMap: LawIndexMap,
  idx: OwnerLinkIndex<LawIndexEntry>,
  stats: OwnerLinkStats = newOwnerLinkStats(),
): GraphEdgePayload[] {
  const out = new Map<string, GraphEdgePayload>();
  const add = (e: GraphEdgePayload) => {
    const k = `${e.source_key}|${e.target_key}|${e.edge_type}`;
    if (!out.has(k)) out.set(k, e);
  };
  for (const link of parseOwnerLinks(raw)) {
    stats.links++;
    if (link.kind === "related") {
      stats.related++;
      continue;
    }
    if (source.kind === "decree" && link.kind !== "affects") {
      stats.decreeOther++;
      continue;
    }
    const prefer =
      link.kind === "supersedes" || link.kind === "repeals" ? "repealed" : link.kind === "affects" ? null : "in_force";
    const r = resolveOwnerLinkTarget(link, idx, prefer);
    if (!r.law) {
      if (r.why === "ambiguous") stats.ambiguous++;
      else stats.notFound++;
      continue;
    }
    const target = lawMap.get(r.law.slug) ?? r.law;
    const self = source.kind === "law" ? source.law : null;
    if (self && target.slug === self.slug) {
      stats.contradictory++;
      continue;
    }
    stats.resolved[r.how] = (stats.resolved[r.how] ?? 0) + 1;

    if (link.kind === "affects") {
      const { numbers } = ownerArticleNumbers(link.articles);
      if (numbers.length === 0) {
        stats.lawLevel++;
        continue;
      }
      const sourceKey = source.kind === "decree" ? source.nodeKey : source.law.rootNodeKey;
      if (!sourceKey) continue;
      for (const n of numbers) {
        const articleKey = target.articleKeyByNumber.get(n);
        if (!articleKey) {
          stats.articlesNotInLaw++;
          continue;
        }
        if (articleKey === sourceKey) continue;
        add({
          source_key: sourceKey,
          target_key: articleKey,
          edge_type: "AMENDS_ARTICLE",
          origin: "auto_watchdog",
          weight: 1.2,
          evidence: evidence(`بيانات المكتبة: يعدّل المادة ${n} من`, target),
          metadata: { source: "owner_links" },
        });
      }
      continue;
    }

    // Supersession: both ends must be law nodes.
    if (!self) continue;
    const newer = link.kind === "superseded_by" || link.kind === "repealed_by" ? target : self;
    const older = newer === target ? self : target;
    // Whichever side wrote it, the replaced law must be repealed in the
    // library: a law still in force was not replaced (and its repealed
    // articles must not look for their replacement in the other law first).
    if (!isRepealedLaw(older)) {
      stats.stillInForce++;
      continue;
    }
    if (!newer.lawNodeKey || !older.lawNodeKey) continue;
    add({
      source_key: newer.lawNodeKey,
      target_key: older.lawNodeKey,
      edge_type: "SUPERSEDES_LAW",
      origin: "auto_watchdog",
      weight: 1.0,
      evidence: evidence("بيانات المكتبة: يحل محل", older),
      metadata: { source: "owner_links" },
    });
  }
  stats.edges += out.size;
  return [...out.values()];
}
