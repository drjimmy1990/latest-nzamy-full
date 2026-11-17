/**
 * najizSearch — the search and the Najiz breadcrumb of «دليل ناجز» on
 * /ai/procedures (owner package 13 Nov, N06-6..10).
 *
 * Search: the page's one grammar (src/lib/search/multiColorSearch.ts — space
 * or `+` = AND, `/` = OR, `"…"` = phrase, `-word` = excluded, `word*` =
 * prefix) with its Arabic folding (أ/إ/آ = ا، ة = ه، ى = ي، tashkeel and
 * tatweel ignored, Arabic-Indic digits = Latin, «ال» optional), plus a small
 * synonyms list (najizSynonyms.ts). A typed term that belongs to a synonym
 * group matches a row holding ANY word of the group; the group's words are
 * highlighted in the typed term's colour. The synonyms widen ONE term — the
 * AND / OR shape of the query is unchanged («طلاق نفقة» = (طلاق or خلع or …)
 * AND نفقة). Excluded terms stay literal.
 *
 * Rows: every one of the 243 types, searched on its name, its description,
 * its class title and its court title — so a court or a class name finds its
 * types, and the filter and the highlight read the same text.
 *
 * Pure, relative imports only: `node --test` loads it directly.
 */
import {
  parseHighlightQuery,
  termPatternSource,
  type HighlightTerm,
  type ParsedHighlightQuery,
} from "../search/multiColorSearch.ts";
import { normalizeSearch, splitArticlePrefix, stripTashkeel } from "../../utils/normalizeArabic.ts";
import type { NajizClass, NajizCourt, NajizType } from "./najizClassifications.ts";

export type NajizSynonymGroups = readonly (readonly string[])[];

const MARKS = /[ً-ْٰـ]/g;

/**
 * The comparison key of a word or phrase: tashkeel and tatweel dropped, each
 * word's article dropped («الإيجار» → «إيجار»), then folded (أ/إ/آ → ا، ة → ه،
 * ى → ي، digits → Latin). «الإيجار» and «ايجار» share one key.
 */
export function najizKey(text: string): string {
  return stripTashkeel(String(text ?? ""))
    .replace(MARKS, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => normalizeSearch(splitArticlePrefix(w)?.base ?? w))
    .join(" ");
}

/** The synonym group `label` belongs to (by key), or null. */
export function synonymGroupOf(label: string, groups: NajizSynonymGroups): readonly string[] | null {
  const key = najizKey(label);
  if (!key) return null;
  return groups.find((g) => g.some((w) => najizKey(w) === key)) ?? null;
}

export interface ExpandedNajizQuery {
  parsed: ParsedHighlightQuery;
  /** Per parsed term: the terms any of which satisfies it (the term itself, or its synonym group). */
  alternatives: HighlightTerm[][];
  /** Every alternative, each in its source term's colour — for <Hl terms>. */
  highlightTerms: HighlightTerm[];
  /** Terms the synonyms widened: what was typed and the other words searched. */
  widened: { label: string; synonyms: string[] }[];
}

export function expandNajizQuery(query: string, groups: NajizSynonymGroups): ExpandedNajizQuery {
  const parsed = parseHighlightQuery(query);
  const widened: ExpandedNajizQuery["widened"] = [];
  const alternatives = parsed.terms.map((term) => {
    const group = synonymGroupOf(term.label, groups);
    if (!group) return [term];
    const ownKey = najizKey(term.label);
    const others = group.filter((w) => najizKey(w) !== ownKey);
    widened.push({ label: term.label, synonyms: [...others] });
    // The typed word is searched without its article too («الإيجار» finds «عقد إيجار»).
    const own = splitArticlePrefix(term.label.trim())?.base ?? term.label;
    return [own, ...others].map((label) => ({ label, kind: term.kind, color: term.color }));
  });
  return { parsed, alternatives, highlightTerms: alternatives.flat(), widened };
}

const regexOf = (term: Pick<HighlightTerm, "label" | "kind">): RegExp | null => {
  const source = termPatternSource(term);
  return source ? new RegExp(source, "iu") : null;
};

/** A row matcher for an expanded query (an empty query matches everything). */
export function compileNajizMatcher(expanded: ExpandedNajizQuery): (fields: ReadonlyArray<string | null | undefined>) => boolean {
  const excluded = expanded.parsed.excluded.map(regexOf).filter((re): re is RegExp => re !== null);
  const included = expanded.alternatives.map((alts) => alts.map(regexOf).filter((re): re is RegExp => re !== null));
  const groups = expanded.parsed.groups;
  return (fields) => {
    const hay = fields.filter((f): f is string => typeof f === "string" && f.length > 0).join("\n");
    if (excluded.some((re) => re.test(hay))) return false;
    if (groups.length === 0) return true;
    const hits = included.map((res) => res.some((re) => re.test(hay)));
    return groups.some((group) => group.every((i) => hits[i]));
  };
}

export interface NajizTypeRow {
  court: NajizCourt;
  klass: NajizClass;
  type: NajizType;
}

/** The text one type row is searched (and highlighted) on. */
export const najizRowFields = (r: NajizTypeRow): string[] => [r.type.name, r.type.description, r.klass.title, r.court.title];

export function najizRows(courts: readonly NajizCourt[]): NajizTypeRow[] {
  return courts.flatMap((court) => court.classes.flatMap((klass) => klass.types.map((type) => ({ court, klass, type }))));
}

export interface NajizSearchResult extends ExpandedNajizQuery {
  hits: NajizTypeRow[];
}

/** The types that match `query`, in the guide's order. */
export function searchNajiz(rows: readonly NajizTypeRow[], query: string, groups: NajizSynonymGroups): NajizSearchResult {
  const expanded = expandNajizQuery(query, groups);
  if (expanded.parsed.groups.length === 0 && expanded.parsed.excluded.length === 0) return { ...expanded, hits: [] };
  const match = compileNajizMatcher(expanded);
  return { ...expanded, hits: rows.filter((r) => match(najizRowFields(r))) };
}

/** Hits grouped by class, in order: one header per court › class. */
export function groupHitsByClass(hits: readonly NajizTypeRow[]): { court: NajizCourt; klass: NajizClass; rows: NajizTypeRow[] }[] {
  const out: { court: NajizCourt; klass: NajizClass; rows: NajizTypeRow[] }[] = [];
  for (const r of hits) {
    const last = out[out.length - 1];
    if (last && last.court.no === r.court.no && last.klass.no === r.klass.no) last.rows.push(r);
    else out.push({ court: r.court, klass: r.klass, rows: [r] });
  }
  return out;
}

/** «›» — U+203A is bidi-mirrored, so in Arabic text it points the reading way. */
export const NAJIZ_BREADCRUMB_SEPARATOR = " › ";

export interface NajizBreadcrumb {
  /** [court, class, type] — the three najiz fields «تصنيف الدعوى الرئيسي / الفرعي / نوع الدعوى». */
  parts: [string, string, string];
  /** The three joined, for the copy button. */
  text: string;
}

const tidy = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim();

/** The Najiz path of one type: المحكمة › التصنيف › النوع, titles as the guide states them. */
export function najizBreadcrumb(
  court: Pick<NajizCourt, "title">,
  klass: Pick<NajizClass, "title">,
  type: Pick<NajizType, "name">,
): NajizBreadcrumb {
  const parts: [string, string, string] = [tidy(court.title), tidy(klass.title), tidy(type.name)];
  return { parts, text: parts.filter(Boolean).join(NAJIZ_BREADCRUMB_SEPARATOR) };
}
