/**
 * toolStatusClient.ts — a screen's reading of GET /api/v1/ai/tool-status.
 *
 * Only a 200 whose body says `usable: true` is a yes. A refusal, a frozen account's
 * 403, a broken reply or a network error all read as "not usable", so a screen
 * never shows a tool's price or form on a doubt (q296, R31).
 *
 * A 429 says nothing about the tool, so it gets one more ask after Retry-After. The
 * screen stays on «جارٍ التحقق…» meanwhile. A second 429 reads as "not usable" until
 * the page is opened again.
 *
 * Pure (the fetch is handed in), so `node --test` runs it. The hook is useToolUsable.
 */

export function toolStatusUrl(tool: string): string {
  return `/api/v1/ai/tool-status?tool=${encodeURIComponent(tool)}`;
}

/** The tool-status bucket's window: a longer Retry-After is not believed. */
const RETRY_AFTER_MAX_MS = 60_000;
const RETRY_AFTER_DEFAULT_MS = 1000;

function waitAfter429(res: Response): number {
  const raw = res.headers.get("retry-after") ?? "";
  return /^\d+$/.test(raw) ? Math.min(Number(raw) * 1000, RETRY_AFTER_MAX_MS) : RETRY_AFTER_DEFAULT_MS;
}

export async function readToolUsable(
  tool: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (url, init) => fetch(url, init),
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<boolean> {
  try {
    let res = await fetchImpl(toolStatusUrl(tool), { cache: "no-store" });
    if (res.status === 429) {
      await wait(waitAfter429(res));
      res = await fetchImpl(toolStatusUrl(tool), { cache: "no-store" });
    }
    if (res.status !== 200) return false;
    const body = (await res.json()) as { usable?: unknown } | null;
    return body?.usable === true;
  } catch {
    return false;
  }
}
