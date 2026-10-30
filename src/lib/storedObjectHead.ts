/**
 * storedObjectHead.ts — read the first bytes and the true size of an object
 * already in a Supabase Storage bucket, without pulling the whole file
 * through the route.
 *
 * Why: contract version bytes go browser → Storage directly
 * (contractsService.uploadContractVersionFile), so the registration route
 * never sees them. To check a file by CONTENT (LIVE-F40) the route asks
 * Storage for the first bytes with an HTTP Range request on a short-lived
 * signed URL, and takes the size from `Content-Range` — the size Storage
 * holds, not the `sizeBytes` the caller claims. A server that ignores Range
 * and answers 200 is read only up to `bytes`, then the stream is cancelled.
 * If signing is not possible the object is downloaded instead (the bucket
 * caps objects at 100 MB).
 *
 * `storage.info()` is avoided on purpose: the self-hosted Storage version may
 * not serve /object/info.
 */

export type StoredHead =
  | { ok: true; size: number; head: Uint8Array }
  | { ok: false; reason: "missing" | "unreadable" };

// "bytes 0-15/54" → 54; "bytes */54" (an unsatisfiable range) → 54;
// a "*" total or anything else → null.
export function totalFromContentRange(header: string | null): number | null {
  if (!header) return null;
  const m = /\/(\d+)\s*$/.exec(header.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** Read at most `max` bytes from a body stream, then cancel the rest. */
async function readUpTo(body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const out = new Uint8Array(max);
  let filled = 0;
  try {
    while (filled < max) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const take = Math.min(value.length, max - filled);
      out.set(value.subarray(0, take), filled);
      filled += take;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return out.subarray(0, filled);
}

/** The slice of the Storage client this needs — so tests can pass a fake. */
export interface HeadStorage {
  createSignedUrl(path: string, expiresIn: number): PromiseLike<{ data: { signedUrl: string } | null; error: unknown }>;
  download(path: string): PromiseLike<{ data: Blob | null; error: unknown }>;
}

export async function readStoredObjectHead(
  bucket: HeadStorage,
  path: string,
  bytes = 16,
  fetchImpl: typeof fetch = fetch,
): Promise<StoredHead> {
  const { data: signed, error: signError } = await bucket.createSignedUrl(path, 60);
  if (!signError && signed?.signedUrl) {
    try {
      const res = await fetchImpl(signed.signedUrl, { headers: { Range: `bytes=0-${bytes - 1}` }, cache: "no-store" });
      if (res.status === 404 || res.status === 400) {
        await res.body?.cancel().catch(() => undefined);
        return { ok: false, reason: "missing" };
      }
      if (res.status === 206) {
        const size = totalFromContentRange(res.headers.get("content-range"));
        const head = await readUpTo(res.body, bytes);
        if (size !== null) return { ok: true, size, head };
      } else if (res.status === 200) {
        const length = Number(res.headers.get("content-length"));
        const head = await readUpTo(res.body, bytes);
        if (Number.isSafeInteger(length) && length >= 0) return { ok: true, size: length, head };
      } else if (res.status === 416) {
        // Range not satisfiable: the object exists and is empty.
        const size = totalFromContentRange(res.headers.get("content-range"));
        await res.body?.cancel().catch(() => undefined);
        if (size === 0) return { ok: true, size: 0, head: new Uint8Array(0) };
      } else {
        await res.body?.cancel().catch(() => undefined);
      }
    } catch {
      // fall through to the download path
    }
  }

  const { data: blob, error: downloadError } = await bucket.download(path);
  if (downloadError || !blob) return { ok: false, reason: downloadError ? "missing" : "unreadable" };
  const head = new Uint8Array(await blob.slice(0, bytes).arrayBuffer());
  return { ok: true, size: blob.size, head };
}
