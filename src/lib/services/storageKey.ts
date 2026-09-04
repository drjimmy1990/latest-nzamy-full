/**
 * storageKey.ts — building an object key for the `documents` bucket.
 * ─────────────────────────────────────────────────────────
 * The key travels inside an HTTP header on the way to S3 and headers are
 * ASCII-only, so an Arabic or spaced filename makes Supabase reject the upload
 * outright. The original name (Arabic and all) is stored in the row; only the
 * KEY is stripped. Same algorithm documentService.ts has used since 2026-06;
 * lifted here so contract versions cannot drift from it.
 *
 * Keys stay under `{userId}/…` — the folder convention every storage policy on
 * this bucket keys on (20260628_documents_upload.sql).
 */

export function safeStorageFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const rawBase = dot > 0 ? name.slice(0, dot) : name;
  const rawExt = dot > 0 ? name.slice(dot + 1) : "";
  const asciiBase = rawBase
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  const asciiExt = rawExt.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return (asciiBase || "file") + (asciiExt ? `.${asciiExt}` : "");
}

/** `{userId}/contracts/{contractId}/{stamp}-{safeName}` */
export function contractVersionStorageKey(userId: string, contractId: string, fileName: string, stamp: number): string {
  const safeContract = contractId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${userId}/contracts/${safeContract}/${stamp}-${safeStorageFileName(fileName)}`;
}
