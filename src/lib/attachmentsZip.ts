/**
 * attachmentsZip.ts — the server half of «تحميل الكل (ZIP)» (owner answer
 * ٢٥٦, plan D3): entry names, the visibility filters, the archive's name and
 * headers, and the streaming zip writer.
 *
 * Pure — no `@/` or `next/` import — so `node --test` loads it directly; the
 * route (src/app/api/v1/attachments/zip/route.ts) is the thin adapter that
 * runs the queries and hands this module rows and a byte source.
 *
 * WRITER — fflate's `Zip` with `ZipPassThrough` entries (stored, not
 * deflated: the files are PDFs, images and Office documents that are already
 * compressed, so deflating them buys almost nothing and costs CPU). One file
 * is read at a time and each chunk leaves as soon as fflate frames it; the
 * archive is never held whole. fflate sets the UTF-8 flag (general-purpose
 * bit 11) on every entry whose name is not plain ASCII, which is what makes an
 * Arabic name open correctly in Windows Explorer and macOS Archive Utility.
 */

import { Zip, ZipPassThrough } from "fflate";
import { ZIP_MAX_BYTES, type ZipScope } from "./attachmentsZipShared.ts";
import { orderReference } from "./services/orderReference.ts";
import { isPathInOwnerFolder } from "./storagePathOwnership.ts";

// ─── entry names ──────────────────────────────────────────────────────────────

export const ZIP_FALLBACK_NAME = "مستند";
export const ZIP_FAILURES_NAME = "ملفات_تعذر_تحميلها.txt";
const MAX_NAME_CHARS = 120;
const MAX_EXT_CHARS = 10;

// Control characters, and the bidi embedding / override / isolate marks — the
// latter can make «fdp.exe» display as «exe.pdf» (RTLO spoofing).
const STRIP_CHARS = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/g;
// Characters Windows refuses in a file name.
const WINDOWS_FORBIDDEN = /[<>:"|?*]/g;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function splitExt(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { base: name, ext: "" };
  const ext = name.slice(dot);
  if (ext.length > MAX_EXT_CHARS + 1 || ext.length < 2) return { base: name, ext: "" };
  return { base: name.slice(0, dot), ext };
}

/**
 * One file's name inside the archive: never a path (no `../`, no folders, no
 * drive letter or leading `/`), nothing Windows refuses, Arabic kept as is
 * (NFC-normalised so the same name typed two ways is one name), at most
 * MAX_NAME_CHARS characters with the extension kept, «مستند» when nothing
 * usable is left.
 */
export function sanitizeZipEntryName(raw: unknown): string {
  let name = typeof raw === "string" ? raw : "";
  name = name.normalize("NFC").replace(STRIP_CHARS, "");
  // The last path segment only — both separators, whatever the uploader's OS.
  const segments = name.split(/[\\/]+/).filter((s) => s.trim() !== "");
  name = segments.length ? segments[segments.length - 1] : "";
  name = name.replace(WINDOWS_FORBIDDEN, "_").replace(/\s+/g, " ").trim();
  // No leading dots (".." / hidden files) and no trailing dots or spaces
  // (Windows drops them silently, which breaks de-duplication).
  name = name.replace(/^\.+/, "").replace(/[. ]+$/, "").trim();
  if (!name) return ZIP_FALLBACK_NAME;

  const split = splitExt(name);
  const ext = split.ext;
  let base = split.base;
  if (WINDOWS_RESERVED.test(base.trim())) base = `_${base}`;

  const chars = Array.from(base); // code points, so a surrogate pair is never cut
  const room = Math.max(1, MAX_NAME_CHARS - Array.from(ext).length);
  if (chars.length > room) base = chars.slice(0, room).join("").trim();
  if (!base) base = ZIP_FALLBACK_NAME;
  return `${base}${ext}`;
}

/**
 * Same order in, same order out; a repeated name gets « (2)», « (3)» … before
 * its extension. Compared case-insensitively, because Windows and macOS file
 * systems are, and two entries that differ only in case overwrite each other
 * on extraction.
 */
export function dedupeZipNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    if (used.has(candidate.toLowerCase())) {
      const { base, ext } = splitExt(name);
      let n = 2;
      do {
        candidate = `${base} (${n})${ext}`;
        n += 1;
      } while (used.has(candidate.toLowerCase()));
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

// ─── the archive's own name and headers ──────────────────────────────────────

const ARCHIVE_LABEL: Record<ZipScope, string> = {
  case: "مرفقات_القضية",
  request: "مرفقات_الطلب",
  consultation: "مرفقات_الاستشارة",
  contract: "نسخ_العقد",
  client_contract: "نسخ_العقد",
};

/** «مرفقات_القضية_ORD-8F14E4.zip» — the reference a person reads aloud, never a raw uuid. */
export function archiveFileName(scope: ZipScope, id: string): string {
  const ref = (orderReference(id) || "").replace(/[^A-Za-z0-9-]/g, "");
  return ref ? `${ARCHIVE_LABEL[scope]}_${ref}.zip` : `${ARCHIVE_LABEL[scope]}.zip`;
}

/** RFC 5987 value: encodeURIComponent leaves `'()*` alone, the header grammar does not. */
function rfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * `attachment; filename="attachments.zip"; filename*=UTF-8''…` — the ASCII
 * fallback first for old clients, the Arabic name for everyone else.
 */
export function zipContentDisposition(fileName: string): string {
  return `attachment; filename="attachments.zip"; filename*=UTF-8''${rfc5987(fileName)}`;
}

export const ZIP_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "application/zip",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  // nginx in front of production buffers a proxied response by default, which
  // would hold the whole archive in memory before the first byte left.
  "X-Accel-Buffering": "no",
};

// ─── visibility filters ──────────────────────────────────────────────────────

/** One file the archive will carry. */
export interface ZipSourceFile {
  name: string;
  storagePath: string;
  size: number | null;
}

export interface AttachmentRowLike {
  request_id?: unknown;
  owner_user_id?: unknown;
  file_name?: unknown;
  storage_path?: unknown;
  size_bytes?: unknown;
  deleted_at?: unknown;
}

function sizeOf(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * The attachments of ONE request that may go into its ZIP. The route's query
 * already filters `request_id = id` and `deleted_at is null` (the list rule of
 * GET /api/v1/service-requests/[id]); this repeats both checks on the rows
 * themselves, so a query edited later — or the supervisors' «archived case
 * documents» SELECT policy (20261025_51), which returns binned rows to an
 * RLS read without that filter — can never put an archived document, a vault
 * document (request_id null) or another request's file into the archive.
 *
 * And the file must sit in its uploader's own folder (`owner_user_id/…`,
 * storagePathOwnership.ts): the bytes are read with the service role, and a
 * row written before 20261026_65 could point anywhere — that is the
 * cross-user download the security review found. Such a row is left out.
 */
export function visibleRequestFiles(rows: readonly AttachmentRowLike[] | null | undefined, requestId: string): ZipSourceFile[] {
  const out: ZipSourceFile[] = [];
  for (const row of rows ?? []) {
    if (!row || row.request_id !== requestId) continue;
    if (row.deleted_at !== null && row.deleted_at !== undefined) continue;
    if (!isPathInOwnerFolder(row.storage_path, row.owner_user_id)) continue;
    out.push({
      name: typeof row.file_name === "string" ? row.file_name : "",
      storagePath: row.storage_path,
      size: sizeOf(row.size_bytes),
    });
  }
  return out;
}

export interface ContractVersionRowLike {
  contract_id?: unknown;
  uploaded_by?: unknown;
  version_no?: unknown;
  file_name?: unknown;
  storage_path?: unknown;
  size_bytes?: unknown;
}

/**
 * The file versions of ONE contract, newest first as the screens list them,
 * each prefixed «النسخة n - » so two versions that share a file name stay
 * apart and in order. Bound to `contractId` row by row, the same binding the
 * two per-version URL routes apply (`row.contract_id !== id` → 404 there),
 * and — like visibleRequestFiles — only a file in its uploader's own folder
 * (`uploaded_by/…`).
 */
export function visibleContractFiles(rows: readonly ContractVersionRowLike[] | null | undefined, contractId: string): ZipSourceFile[] {
  const out: ZipSourceFile[] = [];
  for (const row of rows ?? []) {
    if (!row || row.contract_id !== contractId) continue;
    if (!isPathInOwnerFolder(row.storage_path, row.uploaded_by)) continue;
    const fileName = sanitizeZipEntryName(row.file_name);
    const n = typeof row.version_no === "number" ? row.version_no : null;
    out.push({
      name: n !== null ? `النسخة ${n} - ${fileName}` : fileName,
      storagePath: row.storage_path,
      size: sizeOf(row.size_bytes),
    });
  }
  return out;
}

// ─── the stream ──────────────────────────────────────────────────────────────

/** Thrown into the stream when the running byte count passes the cap. */
export class ZipTooLargeError extends Error {
  constructor() {
    super("zip_too_large");
    this.name = "ZipTooLargeError";
  }
}

/** A file's bytes: a stream (preferred), the whole thing, or null when it cannot be read. */
export type ZipByteSource = ReadableStream<Uint8Array> | Uint8Array | null;

export interface ZipStreamOptions {
  maxBytes?: number;
  signal?: AbortSignal;
  /** Called once per file that could not be read (logging only). */
  onFileError?: (file: ZipSourceFile, err: unknown) => void;
  /**
   * Called exactly once when the stream is done with: closed, errored or
   * cancelled by the reader. The route frees its in-flight slot here.
   */
  onSettled?: () => void;
}

/**
 * The archive as a pull-driven ReadableStream: each `pull` does one unit of
 * work (open the next file, or move one chunk of the current one) until fflate
 * has output to hand over, so a slow reader slows the storage reads too.
 *
 * A file that cannot be opened, or breaks off half-way, does NOT kill the
 * archive — the headers are long gone by then and the person would get
 * nothing. It is skipped (a broken-off one is closed short) and named in a
 * small «ملفات_تعذر_تحميلها.txt» at the end — a count and the names the
 * person already saw on the page, never a storage path. Passing `maxBytes` is the one
 * failure that does end the stream with an error: the caps were checked on the
 * listed sizes before the response started, and only a file whose size was
 * missing or wrong can get here.
 */
export function buildZipStream(
  files: readonly ZipSourceFile[],
  open: (file: ZipSourceFile) => Promise<ZipByteSource>,
  options: ZipStreamOptions = {},
): ReadableStream<Uint8Array> {
  const maxBytes = options.maxBytes ?? ZIP_MAX_BYTES;
  const names = dedupeZipNames([...files.map((f) => sanitizeZipEntryName(f.name)), ZIP_FAILURES_NAME]);
  const failuresName = names.pop() as string;

  let pending: Uint8Array[] = [];
  let finished = false;
  let zipError: Error | null = null;
  const zip = new Zip((err, chunk, final) => {
    if (err) {
      zipError = err;
      return;
    }
    if (chunk && chunk.length) pending.push(chunk);
    if (final) finished = true;
  });

  const failures: string[] = [];
  let index = 0;
  let total = 0;
  let ended = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let entry: ZipPassThrough | null = null;

  const count = (n: number) => {
    total += n;
    if (total > maxBytes) throw new ZipTooLargeError();
  };

  const closeEntry = () => {
    entry?.push(new Uint8Array(0), true);
    entry = null;
    reader = null;
    index += 1;
  };

  async function step(): Promise<void> {
    if (reader && entry) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        options.onFileError?.(files[index], err);
        failures.push(`${names[index]} — انقطع أثناء التحميل`);
        closeEntry();
        return;
      }
      if (chunk.done) {
        closeEntry();
        return;
      }
      count(chunk.value.length);
      entry.push(chunk.value, false);
      return;
    }

    if (index < files.length) {
      let source: ZipByteSource = null;
      try {
        source = await open(files[index]);
      } catch (err) {
        options.onFileError?.(files[index], err);
        source = null;
      }
      if (!source) {
        failures.push(names[index]);
        index += 1;
        return;
      }
      entry = new ZipPassThrough(names[index]);
      zip.add(entry);
      if (source instanceof Uint8Array) {
        count(source.length);
        entry.push(source, true);
        entry = null;
        index += 1;
        return;
      }
      reader = source.getReader();
      return;
    }

    if (!ended) {
      ended = true;
      if (failures.length) {
        const text =
          `﻿تعذّر تحميل ${failures.length} من ${files.length} ملفات وقت إنشاء هذا الملف المضغوط. حمّلها من الصفحة كلًّا على حدة:\r\n\r\n` +
          failures.map((f) => `- ${f}`).join("\r\n") +
          "\r\n";
        const note = new ZipPassThrough(failuresName);
        zip.add(note);
        note.push(new TextEncoder().encode(text), true);
      }
      zip.end();
    }
  }

  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    try {
      options.onSettled?.();
    } catch {
      /* the hook must not break the stream */
    }
  };

  const cleanup = () => {
    try {
      reader?.cancel().catch(() => {});
    } catch {
      /* already released */
    }
    reader = null;
    try {
      zip.terminate();
    } catch {
      /* already ended */
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (pending.length === 0 && !finished) {
          if (options.signal?.aborted) throw new Error("aborted");
          await step();
          if (zipError) throw zipError;
        }
        const out = pending;
        pending = [];
        for (const c of out) controller.enqueue(c);
        if (finished && pending.length === 0) {
          controller.close();
          settle();
        }
      } catch (err) {
        cleanup();
        controller.error(err);
        settle();
      }
    },
    cancel() {
      cleanup();
      settle();
    },
  });
}

// ─── in-flight cap ───────────────────────────────────────────────────────────

/** At most this many archives stream at once for one account, per server process. */
export const ZIP_MAX_IN_FLIGHT_PER_USER = 2;

export const ZIP_BUSY_AR =
  "يجري تجهيز ملفين مضغوطين لك الآن. انتظر حتى يكتمل أحدهما ثم حاول مرة أخرى.";

/**
 * A per-key counter of archives being streamed. `acquire` answers a release
 * function (idempotent — calling it twice frees one slot, once) or null when
 * the key already holds `max` slots. Per process, like the rate limiter in
 * src/proxy.ts: it bounds what one account can make one server hold open,
 * not a cluster-wide quota.
 */
export function createInFlightLimiter(max: number) {
  const counts = new Map<string, number>();
  return {
    acquire(key: string): (() => void) | null {
      const n = counts.get(key) ?? 0;
      if (n >= max) return null;
      counts.set(key, n + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const left = (counts.get(key) ?? 1) - 1;
        if (left <= 0) counts.delete(key);
        else counts.set(key, left);
      };
    },
    inFlight(key: string): number {
      return counts.get(key) ?? 0;
    },
  };
}
