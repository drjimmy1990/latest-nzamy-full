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
  return (await readToolStatus(tool, fetchImpl, wait)).usable;
}

/**
 * The whole answer: `licence` is set only when the server said the one thing
 * missing is the account's verified licence (owner س٢١٤, batch l16) — with
 * the lawyer's verification link, or null for a firm. Same doubt rule: any
 * other reply reads as not usable, with no licence reason.
 */
export interface ToolStatusAnswer {
  usable: boolean;
  licence: { verifyHref: string | null } | null;
}

export async function readToolStatus(
  tool: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (url, init) => fetch(url, init),
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<ToolStatusAnswer> {
  const no: ToolStatusAnswer = { usable: false, licence: null };
  try {
    let res = await fetchImpl(toolStatusUrl(tool), { cache: "no-store" });
    if (res.status === 429) {
      await wait(waitAfter429(res));
      res = await fetchImpl(toolStatusUrl(tool), { cache: "no-store" });
    }
    if (res.status !== 200) return no;
    const body = (await res.json()) as { usable?: unknown; reason?: unknown; verifyHref?: unknown } | null;
    if (body?.usable === true) return { usable: true, licence: null };
    if (body?.reason === "licence") {
      // Only a same-site path is ever followed from here.
      const href = typeof body.verifyHref === "string" && /^\/(?!\/)[a-z0-9/_-]*$/i.test(body.verifyHref) ? body.verifyHref : null;
      return { usable: false, licence: { verifyHref: href } };
    }
    return no;
  } catch {
    return no;
  }
}
