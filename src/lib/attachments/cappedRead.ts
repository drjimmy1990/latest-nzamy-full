/**
 * cappedRead.ts — read a stored object through its signed link, stopping once more
 * than `maxBytes` has arrived.
 *
 * `attachments.size_bytes` is written by the client and the bucket allows 100 MB, so
 * a recorded size proves nothing, and Storage's download() holds the whole object in
 * memory before anyone can count it. This counts the stream and lets go past the cap.
 *
 * The link is the caller's: it is never logged here, and the caller decides whether
 * it goes any further. Pure: the fetch can be handed in, so `node --test` runs it.
 */

/** How long a link used only for this read lives. */
export const READ_LINK_SECONDS = 60;

export type CappedRead = { ok: true; bytes: Uint8Array } | { ok: false; reason: "too_large" | "failed" };

const TOO_LARGE: CappedRead = { ok: false, reason: "too_large" };
const FAILED: CappedRead = { ok: false, reason: "failed" };

export async function readCapped(
  url: string,
  maxBytes: number,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (u, init) => fetch(u, init),
): Promise<CappedRead> {
  const controller = new AbortController();
  /** The cancel reaches the body's source; the abort ends the request. Neither may throw from here. */
  const letGo = async (res: Response) => {
    await res.body?.cancel().catch(() => {});
    controller.abort();
  };
  try {
    const res = await fetchImpl(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) {
      await letGo(res);
      return FAILED;
    }
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      await letGo(res);
      return TOO_LARGE;
    }
    if (!res.body) return { ok: true, bytes: new Uint8Array() };

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        controller.abort();
        return TOO_LARGE;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.byteLength;
    }
    return { ok: true, bytes };
  } catch {
    return FAILED;
  }
}
