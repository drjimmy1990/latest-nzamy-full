/**
 * attachmentsZip.test.ts — run with: node --test src/lib/attachmentsZip.test.ts
 *
 * The pure half of «تحميل الكل (ZIP)» (owner ٢٥٦, plan D3): entry names, the
 * caps, the visibility filters, the access predicate shared with the per-file
 * routes, the archive name / headers, and the stream itself (round-tripped
 * through fflate's own reader).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import {
  sanitizeZipEntryName,
  dedupeZipNames,
  archiveFileName,
  zipContentDisposition,
  visibleRequestFiles,
  visibleContractFiles,
  buildZipStream,
  ZipTooLargeError,
  ZIP_FALLBACK_NAME,
  ZIP_FAILURES_NAME,
  ZIP_RESPONSE_HEADERS,
  type ZipSourceFile,
} from "./attachmentsZip.ts";
import {
  checkZipCaps,
  zipHref,
  isZipScope,
  ZIP_MAX_FILES,
  ZIP_MAX_BYTES,
  ZIP_TOO_MANY_AR,
  ZIP_TOO_LARGE_AR,
} from "./attachmentsZipShared.ts";
import { mayDownloadRequestFiles } from "./requestFileAccess.ts";

// ─── names ───────────────────────────────────────────────────────────────────

test("sanitizeZipEntryName: keeps an Arabic name as is", () => {
  assert.equal(sanitizeZipEntryName("صحيفة الدعوى.pdf"), "صحيفة الدعوى.pdf");
});

test("sanitizeZipEntryName: never a path — traversal, folders, absolute and drive paths reduce to the base name", () => {
  assert.equal(sanitizeZipEntryName("../../etc/passwd"), "passwd");
  assert.equal(sanitizeZipEntryName("/abs/path/عقد.docx"), "عقد.docx");
  assert.equal(sanitizeZipEntryName("C:\\Users\\x\\حكم.pdf"), "حكم.pdf");
  assert.equal(sanitizeZipEntryName("a/b\\c/..\\d.txt"), "d.txt");
  for (const raw of ["..", "../", "/", "\\", ".", "...", "  "]) {
    assert.equal(sanitizeZipEntryName(raw), ZIP_FALLBACK_NAME, JSON.stringify(raw));
  }
});

test("sanitizeZipEntryName: no character Windows refuses, no control or bidi-override characters", () => {
  assert.equal(sanitizeZipEntryName('a<b>c:d"e|f?g*h.pdf'), "a_b_c_d_e_f_g_h.pdf");
  assert.equal(sanitizeZipEntryName("x\u0000y\u001f.pdf"), "xy.pdf");
  // RTLO spoofing: «‮fdp.exe» would display as «exe.pdf».
  assert.equal(sanitizeZipEntryName("invoice\u202Efdp.exe"), "invoicefdp.exe");
  assert.equal(sanitizeZipEntryName("trailing. . "), "trailing");
  assert.equal(sanitizeZipEntryName(".hidden.pdf"), "hidden.pdf");
});

test("sanitizeZipEntryName: reserved device names, non-strings, NFC", () => {
  assert.equal(sanitizeZipEntryName("CON.txt"), "_CON.txt");
  assert.equal(sanitizeZipEntryName("nul"), "_nul");
  assert.equal(sanitizeZipEntryName(null), ZIP_FALLBACK_NAME);
  assert.equal(sanitizeZipEntryName(42), ZIP_FALLBACK_NAME);
  assert.equal(sanitizeZipEntryName("e\u0301.pdf"), "\u00e9.pdf");
});

test("sanitizeZipEntryName: a long name is cut, its extension kept, no surrogate pair split", () => {
  const long = "ع".repeat(300) + ".pdf";
  const out = sanitizeZipEntryName(long);
  assert.ok(Array.from(out).length <= 120);
  assert.ok(out.endsWith(".pdf"));
  const emoji = "😀".repeat(200) + ".png";
  const cut = sanitizeZipEntryName(emoji);
  assert.ok(cut.endsWith(".png"));
  assert.doesNotMatch(cut, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
});

test("dedupeZipNames: « (2)» before the extension, case-insensitive, order kept", () => {
  assert.deepEqual(
    dedupeZipNames(["عقد.pdf", "عقد.pdf", "Report.PDF", "report.pdf", "عقد (2).pdf", "بدون امتداد", "بدون امتداد"]),
    ["عقد.pdf", "عقد (2).pdf", "Report.PDF", "report (2).pdf", "عقد (2) (2).pdf", "بدون امتداد", "بدون امتداد (2)"],
  );
});

// ─── caps ────────────────────────────────────────────────────────────────────

test("checkZipCaps: more than 200 files is refused with the Arabic message", () => {
  const ok = checkZipCaps(new Array(ZIP_MAX_FILES).fill(1));
  assert.equal(ok.ok, true);
  const tooMany = checkZipCaps(new Array(ZIP_MAX_FILES + 1).fill(1));
  assert.deepEqual(tooMany, { ok: false, reason: "too_many", message: ZIP_TOO_MANY_AR });
});

test("checkZipCaps: more than 500 MB of listed sizes is refused; unknown sizes count as 0", () => {
  assert.equal(checkZipCaps([ZIP_MAX_BYTES]).ok, true);
  assert.deepEqual(checkZipCaps([ZIP_MAX_BYTES, 1]), { ok: false, reason: "too_large", message: ZIP_TOO_LARGE_AR });
  assert.deepEqual(checkZipCaps([null, undefined, Number.NaN, -5, 10]), { ok: true, knownBytes: 10 });
  assert.match(ZIP_TOO_LARGE_AR, /٥٠٠/);
  assert.match(ZIP_TOO_MANY_AR, /٢٠٠/);
});

// ─── access and visibility ───────────────────────────────────────────────────

test("mayDownloadRequestFiles: requester, assignee, admin — nobody else", () => {
  const order = { requester_user_id: "client-1", assigned_to: "lawyer-1" };
  assert.equal(mayDownloadRequestFiles(order, "client-1", "client"), true);
  assert.equal(mayDownloadRequestFiles(order, "lawyer-1", "lawyer"), true);
  assert.equal(mayDownloadRequestFiles(order, "someone", "admin"), true);
  assert.equal(mayDownloadRequestFiles(order, "stranger", "client"), false);
  assert.equal(mayDownloadRequestFiles(order, "other-lawyer", "lawyer"), false);
  assert.equal(mayDownloadRequestFiles(order, "firm-owner", "firm"), false);
  // An unassigned order: null never matches a real user id.
  assert.equal(mayDownloadRequestFiles({ requester_user_id: "client-1", assigned_to: null }, "lawyer-1", "lawyer"), false);
  assert.equal(mayDownloadRequestFiles(order, "", "client"), false);
});

test("visibleRequestFiles: a client never gets an archived document, a vault document or another request's file", () => {
  const rows = [
    { request_id: "REQ-1", file_name: "صحيفة.pdf", storage_path: "u1/a.pdf", size_bytes: 10, deleted_at: null },
    { request_id: "REQ-1", file_name: "مؤرشف.pdf", storage_path: "u1/b.pdf", size_bytes: 10, deleted_at: "2026-10-20T10:00:00Z" },
    { request_id: null, file_name: "خزنة المحامي.pdf", storage_path: "l1/vault.pdf", size_bytes: 10, deleted_at: null },
    { request_id: "REQ-2", file_name: "قضية أخرى.pdf", storage_path: "u2/c.pdf", size_bytes: 10, deleted_at: null },
    { request_id: "REQ-1", file_name: "بلا مسار.pdf", storage_path: "", size_bytes: 10, deleted_at: null },
    { request_id: "REQ-1", file_name: "حكم.pdf", storage_path: "l1/d.pdf", size_bytes: "2048", deleted_at: undefined },
  ];
  assert.deepEqual(visibleRequestFiles(rows, "REQ-1"), [
    { name: "صحيفة.pdf", storagePath: "u1/a.pdf", size: 10 },
    { name: "حكم.pdf", storagePath: "l1/d.pdf", size: 2048 },
  ]);
  assert.deepEqual(visibleRequestFiles(null, "REQ-1"), []);
});

test("visibleContractFiles: bound to the contract, numbered by version", () => {
  const rows = [
    { contract_id: "C1", version_no: 2, file_name: "عقد.pdf", storage_path: "l1/v2.pdf", size_bytes: 5 },
    { contract_id: "C1", version_no: 1, file_name: "عقد.pdf", storage_path: "l1/v1.pdf", size_bytes: null },
    { contract_id: "C2", version_no: 1, file_name: "غيره.pdf", storage_path: "l2/v1.pdf", size_bytes: 5 },
  ];
  assert.deepEqual(visibleContractFiles(rows, "C1"), [
    { name: "النسخة 2 - عقد.pdf", storagePath: "l1/v2.pdf", size: 5 },
    { name: "النسخة 1 - عقد.pdf", storagePath: "l1/v1.pdf", size: null },
  ]);
});

// ─── names and headers of the archive ────────────────────────────────────────

test("archiveFileName: Arabic label + the human reference, never a raw uuid", () => {
  assert.equal(archiveFileName("case", "8f14e45f-ceea-467f-a0e6-0a1b2c3d4e5f"), "مرفقات_القضية_ORD-8F14E4.zip");
  assert.equal(archiveFileName("request", "REQ-MTJFH6ZF-B5OQ"), "مرفقات_الطلب_REQ-MTJFH6ZF-B5OQ.zip");
  assert.match(archiveFileName("consultation", "8f14e45f-ceea-467f-a0e6-0a1b2c3d4e5f"), /^مرفقات_الاستشارة_/);
  assert.match(archiveFileName("client_contract", "8f14e45f-ceea-467f-a0e6-0a1b2c3d4e5f"), /^نسخ_العقد_/);
});

test("zipContentDisposition: attachment, ASCII fallback, RFC 5987 UTF-8 name", () => {
  const h = zipContentDisposition("مرفقات_القضية_ORD-1(2).zip");
  assert.match(h, /^attachment; filename="attachments\.zip"; filename\*=UTF-8''/);
  const encoded = h.split("UTF-8''")[1];
  assert.doesNotMatch(encoded, /[()'*\s]/);
  assert.equal(decodeURIComponent(encoded), "مرفقات_القضية_ORD-1(2).zip");
  assert.equal(ZIP_RESPONSE_HEADERS["Cache-Control"], "no-store");
  assert.equal(ZIP_RESPONSE_HEADERS["Content-Type"], "application/zip");
});

test("zipHref / isZipScope: one route, the scope and an encoded id", () => {
  assert.equal(zipHref("case", "REQ-1"), "/api/v1/attachments/zip?scope=case&id=REQ-1");
  assert.equal(zipHref("contract", "a b&c"), "/api/v1/attachments/zip?scope=contract&id=a%20b%26c");
  assert.equal(isZipScope("client_contract"), true);
  assert.equal(isZipScope("documents"), false);
});

// ─── the stream ──────────────────────────────────────────────────────────────

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) c.enqueue(enc.encode(chunks[i++]));
      else c.close();
    },
  });
}

test("buildZipStream: Arabic names round-trip with the UTF-8 flag, duplicates renamed, bytes intact", async () => {
  const files: ZipSourceFile[] = [
    { name: "صحيفة الدعوى.pdf", storagePath: "a", size: null },
    { name: "../صحيفة الدعوى.pdf", storagePath: "b", size: null },
    { name: "notes.txt", storagePath: "c", size: null },
  ];
  const bytes = await collect(
    buildZipStream(files, async (f) => (f.storagePath === "c" ? new TextEncoder().encode("plain") : streamOf("part1-", f.storagePath))),
  );
  const entries = unzipSync(bytes);
  assert.deepEqual(Object.keys(entries), ["صحيفة الدعوى.pdf", "صحيفة الدعوى (2).pdf", "notes.txt"]);
  assert.equal(strFromU8(entries["صحيفة الدعوى.pdf"]), "part1-a");
  assert.equal(strFromU8(entries["صحيفة الدعوى (2).pdf"]), "part1-b");
  assert.equal(strFromU8(entries["notes.txt"]), "plain");
  // First local file header: signature PK\x03\x04, general-purpose flags at offset 6.
  assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const flags = bytes[6] | (bytes[7] << 8);
  assert.equal(flags & 0x0800, 0x0800, "UTF-8 name flag (bit 11) must be set on an Arabic entry");
});

test("buildZipStream: a file that cannot be read is skipped and listed in a note, not a broken archive", async () => {
  const files: ZipSourceFile[] = [
    { name: "موجود.pdf", storagePath: "ok", size: 2 },
    { name: "مفقود.pdf", storagePath: "missing", size: 2 },
    { name: "يرمي.pdf", storagePath: "throws", size: 2 },
  ];
  const errors: string[] = [];
  const bytes = await collect(
    buildZipStream(
      files,
      async (f) => {
        if (f.storagePath === "missing") return null;
        if (f.storagePath === "throws") throw new Error("boom");
        return new TextEncoder().encode("ok");
      },
      { onFileError: (f) => errors.push(f.storagePath) },
    ),
  );
  const entries = unzipSync(bytes);
  assert.deepEqual(Object.keys(entries), ["موجود.pdf", ZIP_FAILURES_NAME]);
  const note = strFromU8(entries[ZIP_FAILURES_NAME]);
  assert.match(note, /مفقود\.pdf/);
  assert.match(note, /يرمي\.pdf/);
  assert.deepEqual(errors, ["throws"]);
});

test("buildZipStream: no note when every file was read", async () => {
  const bytes = await collect(
    buildZipStream([{ name: "a.pdf", storagePath: "a", size: 1 }, { name: "b.pdf", storagePath: "b", size: 1 }], async () => new Uint8Array([1])),
  );
  assert.deepEqual(Object.keys(unzipSync(bytes)), ["a.pdf", "b.pdf"]);
});

test("buildZipStream: passing the byte cap while streaming errors the stream", async () => {
  const files: ZipSourceFile[] = [
    { name: "a.bin", storagePath: "a", size: null },
    { name: "b.bin", storagePath: "b", size: null },
  ];
  await assert.rejects(
    collect(buildZipStream(files, async () => new Uint8Array(600), { maxBytes: 1000 })),
    (err: unknown) => err instanceof ZipTooLargeError,
  );
});

test("buildZipStream: an aborted request stops the work", async () => {
  const ac = new AbortController();
  let opened = 0;
  const stream = buildZipStream(
    [{ name: "a", storagePath: "a", size: 1 }, { name: "b", storagePath: "b", size: 1 }],
    async () => {
      opened += 1;
      ac.abort();
      return null;
    },
    { signal: ac.signal },
  );
  await assert.rejects(collect(stream));
  assert.equal(opened, 1);
});
