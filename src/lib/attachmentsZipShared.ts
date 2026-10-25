/**
 * attachmentsZipShared.ts — the half of the «تحميل الكل (ZIP)» feature (owner
 * answer ٢٥٦, plan D3) that both the browser and the server need: the scope
 * names, the route URL, and the two caps.
 *
 * Pure on purpose — no `@/` import, no fflate — so a client component can
 * import it without pulling the zip writer into the browser bundle, and
 * `node --test` can import it directly. The server half (names, visibility
 * filters, the stream itself) lives in attachmentsZip.ts.
 *
 * SCOPES — what `id` means for each, and which existing route's access rule
 * the ZIP reuses (see src/app/api/v1/attachments/zip/route.ts):
 *   case            a service_requests id (the lawyer / firm / client case file)
 *   request         a service_requests id (the client's order follow-up page)
 *   consultation    a service_requests id (the request a consultation was born
 *                   from — both consultation pages already hold it)
 *     → all three: the gate of GET /api/v1/service-requests/[id]/attachments/[attachmentId]
 *       and the list of GET /api/v1/service-requests/[id]; they differ only in
 *       the archive's name.
 *   contract        a contracts id, lawyer / firm side
 *     → GET /api/v1/lawyer/contracts/[id]/versions/[vid]/url
 *   client_contract a contracts id, the client's own share
 *     → GET /api/v1/client/contracts/[id]/versions/[vid]/url
 */

export const ZIP_SCOPES = ["case", "request", "consultation", "contract", "client_contract"] as const;
export type ZipScope = (typeof ZIP_SCOPES)[number];

export function isZipScope(value: unknown): value is ZipScope {
  return typeof value === "string" && (ZIP_SCOPES as readonly string[]).includes(value);
}

export const ZIP_ROUTE = "/api/v1/attachments/zip";

/** At most this many files in one archive. */
export const ZIP_MAX_FILES = 200;
/**
 * At most this many bytes of file content in one archive (500 MB). Also keeps
 * every archive far below the 4 GB a plain (non-ZIP64) zip can describe, which
 * is all fflate's streaming writer produces.
 */
export const ZIP_MAX_BYTES = 500 * 1024 * 1024;
/** The button shows only from this many visible files up (owner ٢٥٦: «تعدد المرفقات»). */
export const ZIP_MIN_FILES_FOR_BUTTON = 2;

export const ZIP_TOO_MANY_AR =
  "عدد المرفقات أكبر من الحد المسموح للتحميل المجمّع (٢٠٠ ملف). حمّل الملفات كلًّا على حدة.";
export const ZIP_TOO_LARGE_AR =
  "حجم المرفقات أكبر من الحد المسموح للتحميل المجمّع (٥٠٠ ميغابايت). حمّل الملفات كلًّا على حدة.";

/** The one URL every «تحميل الكل (ZIP)» button points at. */
export function zipHref(scope: ZipScope, id: string): string {
  return `${ZIP_ROUTE}?scope=${scope}&id=${encodeURIComponent(id)}`;
}

export type ZipCapsVerdict =
  | { ok: true; knownBytes: number }
  | { ok: false; reason: "too_many" | "too_large"; message: string };

/**
 * The caps, checked against the listed sizes BEFORE anything is streamed. A
 * null / missing / nonsense size counts as 0 here — `size_bytes` is nullable on
 * both tables — so the server also counts bytes while streaming
 * (attachmentsZip.ts) and stops past ZIP_MAX_BYTES.
 */
export function checkZipCaps(sizes: ReadonlyArray<number | null | undefined>): ZipCapsVerdict {
  if (sizes.length > ZIP_MAX_FILES) {
    return { ok: false, reason: "too_many", message: ZIP_TOO_MANY_AR };
  }
  let knownBytes = 0;
  for (const s of sizes) {
    if (typeof s === "number" && Number.isFinite(s) && s > 0) knownBytes += s;
  }
  if (knownBytes > ZIP_MAX_BYTES) {
    return { ok: false, reason: "too_large", message: ZIP_TOO_LARGE_AR };
  }
  return { ok: true, knownBytes };
}
