/**
 * inlineSafety.ts — may a stored file of the `documents` bucket be shown INSIDE
 * a browser (an <iframe>, an <img>, a new tab), or only handed over as a
 * download? Batch l13 vault (owner Q167).
 *
 * The bucket has no type list and the uploader's browser declares the type the
 * Storage server later serves the file with; the row's `mime_type` is written by
 * the client too. Neither proves what the bytes are, and a signed link opened
 * inline is served from the Storage host with that declared type. So before a
 * route hands out an inline link it reads the first bytes of the object through
 * a short signed link and checks BOTH what the server will send (the
 * Content-Type of the answer) and the file's signature: a PDF that says
 * application/pdf, or a PNG / JPEG / WebP / GIF that says so. Anything else is
 * a download (or no preview).
 *
 * The link is the caller's: never logged here. Pure: the fetch can be handed
 * in, so `node --test` runs it.
 */

export type InlineKind = "pdf" | "image";

/** How many leading bytes the probe reads — enough for every signature below. */
export const PROBE_BYTES = 16;

function startsWith(b: Uint8Array, sig: number[], at = 0): boolean {
  if (b.length < at + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[at + i] !== sig[i]) return false;
  return true;
}

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const GIF = [0x47, 0x49, 0x46, 0x38]; // GIF8 (7a / 9a)

/** The served type, lower-cased, parameters dropped ("Image/PNG; x=1" → "image/png"). */
export function servedType(contentType: string | null | undefined): string {
  return String(contentType ?? "").split(";")[0].trim().toLowerCase();
}

/**
 * "pdf" or "image" when the served type AND the bytes agree on one of the types
 * a browser shows without running anything; null otherwise (HTML, SVG, XML,
 * text, a mismatch, an empty answer).
 */
export function inlineKindOf(contentType: string | null | undefined, head: Uint8Array): InlineKind | null {
  const t = servedType(contentType);
  if (t === "application/pdf") return startsWith(head, PDF) ? "pdf" : null;
  if (t === "image/png") return startsWith(head, PNG) ? "image" : null;
  if (t === "image/jpeg" || t === "image/jpg") return startsWith(head, JPEG) ? "image" : null;
  if (t === "image/webp") return startsWith(head, RIFF) && startsWith(head, WEBP, 8) ? "image" : null;
  if (t === "image/gif") return startsWith(head, GIF) && (head[4] === 0x37 || head[4] === 0x39) && head[5] === 0x61 ? "image" : null;
  return null;
}

/**
 * The link a "download / open" button may hand out: the inline link when the
 * stored object is a PDF or an image served as one, else a download link from
 * `signDownload` (Content-Disposition: attachment) — also when the probe could
 * not read the object. Null when the download link could not be signed.
 */
export async function openableLink(
  inlineUrl: string,
  signDownload: () => Promise<{ data: { signedUrl: string } | null; error: unknown }>,
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<string | null> {
  const probe = await probeObjectHead(inlineUrl, fetchImpl);
  if (probe.ok && inlineKindOf(probe.contentType, probe.head)) return inlineUrl;
  const signed = await signDownload();
  return !signed.error && signed.data?.signedUrl ? signed.data.signedUrl : null;
}

export type ProbeResult = { ok: true; contentType: string; head: Uint8Array } | { ok: false };

/**
 * Reads the served Content-Type and at most `maxBytes` leading bytes of a signed
 * link (a Range request; if the server ignores the range, the read still stops
 * after `maxBytes`). Never throws.
 */
export async function probeObjectHead(
  url: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (u, init) => fetch(u, init),
  maxBytes: number = PROBE_BYTES,
): Promise<ProbeResult> {
  const controller = new AbortController();
  try {
    const res = await fetchImpl(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Range: `bytes=0-${maxBytes - 1}` },
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      controller.abort();
      return { ok: false };
    }
    const contentType = res.headers.get("content-type") ?? "";
    const out = new Uint8Array(maxBytes);
    let got = 0;
    if (res.body) {
      const reader = res.body.getReader();
      while (got < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        const take = Math.min(value.byteLength, maxBytes - got);
        out.set(value.subarray(0, take), got);
        got += take;
      }
      await reader.cancel().catch(() => {});
    }
    controller.abort();
    return { ok: true, contentType, head: out.subarray(0, got) };
  } catch {
    return { ok: false };
  }
}
