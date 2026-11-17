/**
 * legislativeUpdates — «أحدث التحديثات التشريعية» on /laws from the library's
 * own data (owner TODO P1-12; replaces the invented DEMO_UPDATES list).
 *
 * The only legislative date every viewer may see is a law's «آخر تحديث
 * تشريعي», the date ALONE (owner ٣١٧ / ٣١٨): the later of latest_update's date
 * and the issue date (latestLegislativeEvent), the same key the catalogue
 * orders by (catalogue_recency_key, 20261025_40). So an item is a law's title,
 * its link and that date — never the decree, the article, what changed, or
 * whether the date is an issue or an amendment (issue_date_hijri is masked
 * for a non-subscriber, T28-22). A law with no readable date is left out, and
 * so are repealed laws (their date is not a repeal date) and the archival
 * copies (a duplicate, or a file merged into its parent law).
 */
import { latestLegislativeEvent } from "./legislativeEvent.ts";
import { lawStatusForDetail } from "../../app/laws/law-status.ts";

export const LEGISLATIVE_UPDATES_LIMIT = 8;
/** Rows read: a few more than shown, for the repealed or undated ones dropped. */
export const LEGISLATIVE_UPDATES_READ = 24;

export interface LegislativeUpdateItem {
  slug: string;
  title: string;
  /** «آخر تحديث تشريعي», Hijri, the date alone (e.g. «1447/03/12هـ»). */
  dateHijri: string;
}

const HIDDEN_STATUSES: ReadonlySet<string> = new Set(["repealed", "superseded_duplicate", "merged_into_parent"]);

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Rows read newest first (slug, title, status, issue_date_hijri, latest_update_date) → the items to show. */
export function shapeLegislativeUpdates(
  rows: ReadonlyArray<Record<string, unknown>>,
  limit: number = LEGISLATIVE_UPDATES_LIMIT,
): LegislativeUpdateItem[] {
  const items: Array<LegislativeUpdateItem & { key: number }> = [];
  for (const row of rows) {
    const slug = str(row.slug).trim();
    const title = str(row.title).trim();
    if (!slug || !title || HIDDEN_STATUSES.has(lawStatusForDetail(row.status))) continue;
    const event = latestLegislativeEvent({
      latest_update: { date_hijri: row.latest_update_date },
      issue_date_hijri: row.issue_date_hijri,
    });
    if (!event) continue;
    items.push({ slug, title, dateHijri: event.dateHijri, key: event.key });
  }
  // The database already ordered by the same key; sorting again keeps the list
  // right if a row's stored key and its dates ever disagree.
  return items
    .sort((a, b) => b.key - a.key)
    .slice(0, limit)
    .map(({ slug, title, dateHijri }) => ({ slug, title, dateHijri }));
}
