import type { createClient } from '@/lib/supabase/server';
import { normalizeSearch } from '../../../../utils/normalizeArabic.ts';

type LibraryClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Judicial collections whose TITLE, COURT, YEAR or DESCRIPTION carries the
 * query (owner report 2026-10-25: searching «المبادئ والقرارات» returned zero
 * collections even though browsing «المبادئ والسوابق» listed them on screen).
 *
 * `POST /api/library/search` previously searched `library.principles` FTS only
 * and `src/app/laws/page.tsx` forced `filteredCollections = []` during search.
 * `library.judicial_collections` is a small public catalogue table (all columns
 * except `metadata` are on the 20261004_01 anon allow-list), so reading the
 * allowed columns once and matching in JS avoids PostgREST filter pitfalls,
 * supports full Arabic + bidirectional numeral folding (٠-٩ ↔ 0-9), and
 * honours active `track` / `source` / `year` / `court` filters.
 */

export interface JudicialCollectionRow {
  id: string;
  title: string;
  court?: string | null;
  year_hijri?: number | string | null;
  part?: number | string | null;
  source_id?: string | null;
  track?: string | null;
  description?: string | null;
  ruling_count?: number | null;
  free?: boolean | null;
  progress?: number | null;
}

export interface CollectionTitleHit {
  id: string;
  title: string;
  court: string;
  year_hijri: number | string | null;
  part: number | string | null;
  source_id: string | null;
  track: string;
  description: string;
  ruling_count: number;
  free: boolean;
  progress: number;
}

export interface CollectionTitleMatchOptions {
  track?: string;
  source?: string;
  year?: number | string;
  court?: string;
  max?: number;
}

const HARAKAT_TATWEEL = /[ً-ْٰـ]/g;
const CLITIC_PREFIXES = ['وال', 'بال', 'كال', 'فال', 'لل', 'ال', 'و', 'ف', 'ب', 'ل'] as const;

function fold(text: string): string {
  return normalizeSearch(String(text ?? '').replace(HARAKAT_TATWEEL, ''))
    .replace(/["*+/\\]/g, ' ')
    .replace(/[«»"'()\[\]،,.:؛\-—–]/g, ' ')
    // Detach Hijri suffix «هـ» from 3–4 digit years («1443ه» → «1443») so year queries match.
    .replace(/(^|\s)(\d{3,4})ه(?=\s|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function queryWords(rawQuery: string): string[] {
  // Strip negated segments (-term / -"phrase") before extracting positive words.
  const withoutNegated = String(rawQuery ?? '')
    .replace(/-\s*"[^"]*"/g, ' ')
    .replace(/(?:^|\s)-\S+/g, ' ');
  const words = fold(withoutNegated).split(' ').filter((w) => w.length >= 2);
  return words.some((w) => w.length >= 3) ? words : [];
}

function wordForms(word: string): string[] {
  const forms = [word];
  for (const p of CLITIC_PREFIXES) {
    if (word.startsWith(p) && word.length - p.length >= 3) {
      const stripped = word.slice(p.length);
      if (!forms.includes(stripped)) forms.push(stripped);
    }
  }
  return forms;
}

function collectionWordMatches(haystackWord: string, qWord: string): boolean {
  if (haystackWord === qWord) return true;
  const hForms = wordForms(haystackWord);
  const qForms = wordForms(qWord);
  return qForms.some((qf) => hForms.includes(qf));
}

function allWordsMatch(haystackWords: readonly string[], qWords: readonly string[]): boolean {
  return qWords.every((qw) => haystackWords.some((hw) => collectionWordMatches(hw, qw)));
}

function scoreCollection(
  row: JudicialCollectionRow,
  qWords: readonly string[],
  phrase: string,
): number | null {
  const title = fold(row.title ?? '');
  if (!title) return null;
  const court = fold(row.court ?? '');
  const year = row.year_hijri != null ? fold(String(row.year_hijri)) : '';
  const part = row.part != null ? fold(String(row.part)) : '';
  const desc = fold(row.description ?? '');

  if (title === phrase) return 0;
  if (title.startsWith(phrase)) return 1;
  if (title.includes(phrase)) return 2;

  const titleWords = title.split(' ').filter(Boolean);
  if (allWordsMatch(titleWords, qWords)) return 3;

  const metaWords = [title, court, year, part].filter(Boolean).join(' ').split(' ').filter(Boolean);
  if (allWordsMatch(metaWords, qWords)) return 4;

  const fullWords = [title, court, year, part, desc].filter(Boolean).join(' ').split(' ').filter(Boolean);
  if (allWordsMatch(fullWords, qWords)) return 5;

  return null;
}

export function matchCollectionTitles(
  rows: readonly JudicialCollectionRow[],
  rawQuery: string,
  opts: CollectionTitleMatchOptions = {},
): CollectionTitleHit[] {
  const max = opts.max ?? 6;
  const qWords = queryWords(rawQuery);
  if (qWords.length === 0 || max <= 0) return [];
  const phrase = qWords.join(' ');
  const yearFilter = opts.year != null && String(opts.year).trim() !== ''
    ? fold(String(opts.year))
    : null;
  const courtFilter = opts.court ? fold(opts.court) : null;

  const scored: Array<{ hit: CollectionTitleHit; score: number; order: number }> = [];
  rows.forEach((row, order) => {
    if (!row || !row.id || !row.title) return;
    if (opts.track && row.track !== opts.track) return;
    if (opts.source && row.source_id !== opts.source) return;
    if (yearFilter && fold(String(row.year_hijri ?? '')) !== yearFilter) return;
    if (courtFilter && fold(row.court ?? '') !== courtFilter) return;

    const matched = scoreCollection(row, qWords, phrase);
    if (matched === null) return;

    scored.push({
      hit: {
        id: String(row.id),
        title: String(row.title).trim(),
        court: String(row.court ?? '').trim(),
        year_hijri: row.year_hijri ?? null,
        part: row.part ?? null,
        source_id: row.source_id ?? null,
        track: String(row.track || 'ordinary'),
        description: String(row.description ?? '').trim(),
        ruling_count: typeof row.ruling_count === 'number' ? row.ruling_count : 0,
        free: Boolean(row.free ?? true),
        progress: typeof row.progress === 'number' ? row.progress : 0,
      },
      score: matched,
      order,
    });
  });

  scored.sort((a, b) => a.score - b.score || a.hit.title.length - b.hit.title.length || a.order - b.order);
  return scored.slice(0, max).map((s) => s.hit);
}

const COLLECTION_TITLE_ROWS_MAX = 500;
const COLLECTION_TITLE_COLUMNS =
  'id, title, court, year_hijri, part, source_id, track, description, ruling_count, free, progress';

/**
 * Reads judicial collection catalogue rows (public allow-list columns only) and
 * matches them against `rawQuery`. Never fails the whole search on error.
 */
export async function fetchCollectionTitleHits(
  supabase: LibraryClient,
  rawQuery: string,
  opts: CollectionTitleMatchOptions & { signal?: AbortSignal } = {},
): Promise<{ hits: CollectionTitleHit[]; error: unknown }> {
  const max = opts.max ?? 6;
  if (max <= 0 || queryWords(rawQuery).length === 0) return { hits: [], error: null };

  let q = supabase
    .schema('library')
    .from('judicial_collections')
    .select(COLLECTION_TITLE_COLUMNS)
    .order('id')
    .limit(COLLECTION_TITLE_ROWS_MAX);
  if (opts.signal) q = q.abortSignal(opts.signal);

  try {
    const { data, error } = await q;
    if (error) return { hits: [], error };
    return {
      hits: matchCollectionTitles((data ?? []) as JudicialCollectionRow[], rawQuery, opts),
      error: null,
    };
  } catch (error) {
    return { hits: [], error };
  }
}
