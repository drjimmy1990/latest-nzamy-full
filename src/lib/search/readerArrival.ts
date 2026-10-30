/**
 * readerArrival — what a reader page reads from its URL when someone arrives
 * from a search (owner notes ٠٦ / ١٢):
 *
 *   /precedents/<collection>?q=<search>#<principle id>
 *   /precedents/<collection>?q=<search>&target=<principle id>
 *
 * `query` only COLOURS the document (HighlightProvider); it never filters the
 * list, so the target and its neighbours stay on the page (note ١٢ warns that
 * binding ?q= to the reader's own filter hides the target). The hash wins
 * over ?target=.
 *
 * Pure, no imports: `node --test` loads it.
 */

export interface ReaderArrival {
  /** The search to highlight, trimmed; "" when none. */
  query: string;
  /** The element id to scroll to; "" when none. */
  target: string;
}

const MAX_QUERY = 300;

function decodeHash(hash: string): string {
  const raw = hash.replace(/^#/, "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function readerArrival(search: string | null | undefined, hash: string | null | undefined): ReaderArrival {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(String(search ?? ""));
  } catch {
    params = new URLSearchParams();
  }
  const query = (params.get("q") ?? "").trim().slice(0, MAX_QUERY);
  const target = decodeHash(String(hash ?? "")) || (params.get("target") ?? "").trim();
  return { query, target };
}

/** The same URL without ?q= (the legend's ✕): other params and the hash are kept. */
export function withoutSearchQuery(href: string, param = "q"): string {
  const hashAt = href.indexOf("#");
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  const base = hashAt === -1 ? href : href.slice(0, hashAt);
  const qAt = base.indexOf("?");
  if (qAt === -1) return href;
  const params = new URLSearchParams(base.slice(qAt + 1));
  params.delete(param);
  const rest = params.toString();
  return `${base.slice(0, qAt)}${rest ? `?${rest}` : ""}${hash}`;
}
