import type { createClient } from '@/lib/supabase/server';
import { normalizeSearch } from '../../../../utils/normalizeArabic.ts';
import { groupBookVolumes, volumesCountLabel, type VolumeRow } from '../../../../lib/library/bookVolumes.ts';

type LibraryClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Fiqh books whose TITLE carries the query (owner test 2026-10-03: searching
 * «إعلام الموقعين» listed principles and other books' blocks, never the book).
 *
 * The fiqh full-text search runs over `feqh_blocks` text, so a book is only
 * found through passages that quote its name. library.feqh_books is small
 * (185 rows), so its titles are read once and matched here: hamza / ة‑ه /
 * ى‑ي folded (normalizeSearch), harakat and tatweel ignored, every query word
 * present in the title. A multi-volume series is one hit (bookVolumes), the
 * way the catalogue shows it; its slug is the first volume in reading order.
 */

export interface BookTitleHit {
  /** feqh_books.id of the volume to open (the first volume of a series). */
  slug: string;
  /** The book's title — the series title for a multi-volume book. */
  title: string;
  author: string;
  volumeCount: number;
  /** «٤ مجلدات»-style label, or null for a single book. */
  volumesLabel: string | null;
}

const HARAKAT_TATWEEL = /[ً-ْٰـ]/g;

function fold(text: string): string {
  return normalizeSearch(String(text ?? '').replace(HARAKAT_TATWEEL, ''))
    .replace(/[«»"'()\[\]،,.:؛\-—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Query words worth matching: at least one must have 3+ letters. */
function queryWords(rawQuery: string): string[] {
  const words = fold(rawQuery).split(' ').filter((w) => w.length >= 2);
  return words.some((w) => w.length >= 3) ? words : [];
}

function rank(title: string, phrase: string): number {
  if (title === phrase) return 0;
  if (title.startsWith(phrase)) return 1;
  if (title.includes(phrase)) return 2;
  return 3; // every word present, not as one phrase
}

export function matchBookTitles(rows: readonly VolumeRow[], rawQuery: string, max = 5): BookTitleHit[] {
  const words = queryWords(rawQuery);
  if (words.length === 0 || max <= 0) return [];
  const phrase = words.join(' ');

  const scored: Array<{ hit: BookTitleHit; score: number; order: number }> = [];
  groupBookVolumes(rows).forEach((entry, order) => {
    const title = entry.kind === 'series' ? entry.title : entry.book.title;
    const folded = fold(title);
    if (!words.every((w) => folded.includes(w))) return;
    const first = entry.kind === 'series' ? entry.volumes[0] : entry.book;
    const count = entry.kind === 'series' ? entry.count : 1;
    scored.push({
      hit: {
        slug: first.id,
        title: title.trim(),
        author: String((entry.kind === 'series' ? entry.author : entry.book.author) ?? '').trim(),
        volumeCount: count,
        volumesLabel: count > 1 ? volumesCountLabel(count) : null,
      },
      score: rank(folded, phrase),
      order,
    });
  });
  scored.sort((a, b) => a.score - b.score || a.order - b.order);
  return scored.slice(0, max).map((s) => s.hit);
}

/** Above the 185 books of 2026-10; one read covers the whole table. */
const BOOK_TITLE_ROWS_MAX = 1000;

/**
 * Reads every book title (the catalogue columns are public) and matches them.
 * `error` is the read error, if any; `hits` is then empty.
 */
export async function fetchBookTitleHits(
  supabase: LibraryClient,
  rawQuery: string,
  max: number,
  signal?: AbortSignal,
): Promise<{ hits: BookTitleHit[]; error: unknown }> {
  if (max <= 0 || queryWords(rawQuery).length === 0) return { hits: [], error: null };
  let q = supabase
    .schema('library')
    .from('feqh_books')
    .select('id, title, author, total_volumes')
    .order('id')
    .limit(BOOK_TITLE_ROWS_MAX);
  if (signal) q = q.abortSignal(signal);
  try {
    const { data, error } = await q;
    if (error) return { hits: [], error };
    return { hits: matchBookTitles((data ?? []) as VolumeRow[], rawQuery, max), error: null };
  } catch (error) {
    // Never fail the whole search/autocomplete over the book titles.
    return { hits: [], error };
  }
}
