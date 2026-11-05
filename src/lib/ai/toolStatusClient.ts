/**
 * toolStatusClient.ts — a screen's reading of GET /api/v1/ai/tool-status.
 *
 * Only a 200 whose body says `usable: true` is a yes. A refusal, a frozen account's
 * 403, a limit, a broken reply or a network error all read as "not usable", so a
 * screen never shows a tool's price or form on a doubt (q296, R31).
 *
 * Pure (the fetch is handed in), so `node --test` runs it. The hook is useToolUsable.
 */

export function toolStatusUrl(tool: string): string {
  return `/api/v1/ai/tool-status?tool=${encodeURIComponent(tool)}`;
}

export async function readToolUsable(
  tool: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (url, init) => fetch(url, init),
): Promise<boolean> {
  try {
    const res = await fetchImpl(toolStatusUrl(tool), { cache: "no-store" });
    if (res.status !== 200) return false;
    const body = (await res.json()) as { usable?: unknown } | null;
    return body?.usable === true;
  } catch {
    return false;
  }
}
