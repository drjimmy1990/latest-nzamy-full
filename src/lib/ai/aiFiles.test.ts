/**
 * aiFiles.test.ts — the files a wave-3 tool reads: the caller's own vault rows
 * only, the types the model opens, the byte and page caps, an unreadable PDF
 * refused, and a signed link per file. Every refusal here happens before the
 * charge.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/aiFiles.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { countPages, FILE_COPY, parseFileIds, resolveAiFiles, SIGNED_URL_SECONDS } from "./aiFiles.ts";
import { READ_LINK_SECONDS } from "../attachments/cappedRead.ts";
import { FILE_TEXT_TTL_MS, verifyFileTextToken } from "./fileTextToken.ts";
import { aiTextFilesConfig } from "./textFilesConfig.ts";
import { TEXT_CHARS_PER_PAGE, TEXT_FILE_MAX_CHARS } from "./textExtract.ts";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RULES = { max: 5, maxPages: 30, maxBytes: 22 * 1024 * 1024 };

async function pdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return doc.save();
}

type Row = { id: string | number; file_name: string; storage_path: string; mime_type: string; size_bytes: number };

// A read goes through a signed link and a streaming fetch (cappedRead.ts), so this
// file's fetch serves the fake bucket. Each fake's link names its own objects.
const BUCKETS = new Map<string, Record<string, Uint8Array>>();
globalThis.fetch = (async (url: string) => {
  const u = new URL(url);
  const path = u.pathname.split("/documents/")[1];
  const bytes = BUCKETS.get(u.searchParams.get("fake") ?? "")?.[path];
  return bytes ? new Response(bytes as BodyInit) : new Response("not found", { status: 404 });
}) as typeof fetch;

/** The service client: `attachments` reads and the `documents` bucket. */
function fakeAdmin(rows: Row[], objects: Record<string, Uint8Array>) {
  const fake = String(BUCKETS.size);
  BUCKETS.set(fake, objects);
  const reads: Array<Array<[string, string, unknown]>> = [];
  const signed: Array<[string, number]> = [];
  const admin = {
    from(table: string) {
      assert.equal(table, "attachments");
      const filters: Array<[string, string, unknown]> = [];
      reads.push(filters);
      const chain = {
        select: () => chain,
        in: (c: string, v: unknown) => (filters.push(["in", c, v]), chain),
        eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), chain),
        is: (c: string, v: unknown) => {
          filters.push(["is", c, v]);
          const ids = filters.find((f) => f[0] === "in")![2] as string[];
          const owner = filters.find((f) => f[1] === "owner_user_id")![2];
          // PostgREST matches `in.(37,38)` against a bigint column from strings.
          return Promise.resolve({ data: owner === "u-1" ? rows.filter((r) => ids.includes(String(r.id))) : [], error: null });
        },
      };
      return chain;
    },
    storage: {
      from(bucket: string) {
        assert.equal(bucket, "documents");
        return {
          createSignedUrl: async (path: string, seconds: number) => {
            signed.push([path, seconds]);
            return { data: { signedUrl: `https://auth.example/storage/v1/object/sign/documents/${path}?token=t&fake=${fake}` }, error: null };
          },
        };
      },
    },
  };
  return { admin, reads, signed };
}

const row = (id: string | number, mime: string, size = 1000, name = "مذكرة.pdf"): Row => ({ id, file_name: name, storage_path: `u-1/${id}.bin`, mime_type: mime, size_bytes: size });

test("countPages: a PDF's pages, one for an image, null for a broken PDF", async () => {
  assert.equal(await countPages(await pdf(3), "pdf"), 3);
  assert.equal(await countPages(new Uint8Array([1, 2, 3]), "image"), 1);
  assert.equal(await countPages(new TextEncoder().encode("%PDF-1.7 not really"), "pdf"), null);
});

test("parseFileIds: the vault's numeric ids (bigserial, a JSON number), as strings", () => {
  // The owner's live test (29 Oct): a PDF and a PNG «جاهز» were refused with
  // «أرفق ملفاً واحداً على الأقل» because only UUIDs were taken.
  assert.deepEqual(parseFileIds([37, 38], 5), ["37", "38"]);
  assert.deepEqual(parseFileIds(["39", 40], 5), ["39", "40"]);
  assert.equal(parseFileIds([37, "37"], 5), null, "one file twice");
  for (const bad of [0, -1, 1.5, "0", "01", "1e3", " ", null, {}, Number.MAX_SAFE_INTEGER + 2]) {
    assert.equal(parseFileIds([bad], 5), null, String(bad));
  }
  assert.equal(parseFileIds([1, 2, 3], 2), "too_many");
});

test("parseFileIds: 1..max distinct UUIDs", () => {
  assert.deepEqual(parseFileIds([A.toUpperCase(), B], 5), [A, B]);
  assert.equal(parseFileIds([], 5), null);
  assert.equal(parseFileIds(["../x"], 5), null);
  assert.equal(parseFileIds([A, A], 5), null, "a repeated id is not two files");
  assert.equal(parseFileIds([A, B], 1), "too_many");
});

test("the caller's own files are counted and signed; the total pages come back", async () => {
  const { admin, reads, signed } = fakeAdmin([row(A, "application/pdf"), row(B, "image/jpeg", 500, "صورة.jpg")], {
    [`u-1/${A}.bin`]: await pdf(4),
    [`u-1/${B}.bin`]: new Uint8Array([9, 9]),
  });
  const now = new Date("2026-10-28T10:00:00Z");
  const got = await resolveAiFiles(admin as never, "u-1", [A, B], RULES, now);
  assert.ok(got.ok);
  assert.equal(got.pages, 5);
  assert.deepEqual(got.files.map((f) => [f.id, f.pages, f.mime]), [[A, 4, "application/pdf"], [B, 1, "image/jpeg"]]);
  assert.equal(got.files[0].url_expires_at, new Date(now.getTime() + SIGNED_URL_SECONDS * 1000).toISOString());
  assert.deepEqual(signed.map((s) => s[1]), [900, 900]);
  // Own rows only, out of the bin.
  assert.deepEqual(reads[0].slice(1), [["eq", "owner_user_id", "u-1"], ["is", "deleted_at", null]]);
});

test("numeric vault rows as prod returns them: a PDF and a PNG both read, ids sent on as strings", async () => {
  const { admin } = fakeAdmin([row(37, "application/pdf"), row(38, "image/png", 500, "صورة.png")], {
    "u-1/37.bin": await pdf(2),
    "u-1/38.bin": new Uint8Array([9]),
  });
  const got = await resolveAiFiles(admin as never, "u-1", [37, 38], RULES);
  assert.ok(got.ok, JSON.stringify(got));
  assert.equal(got.pages, 3);
  assert.deepEqual(got.files.map((f) => f.id), ["37", "38"]);
});

test("someone else's file, or one not found, is refused without saying whose it is", async () => {
  const { admin } = fakeAdmin([row(A, "application/pdf")], {});
  const other = await resolveAiFiles(admin as never, "u-2", [A], RULES);
  assert.deepEqual(other, { ok: false, error: FILE_COPY.missing, code: "file_not_found" });
  const missing = await resolveAiFiles(admin as never, "u-1", [A, B], RULES);
  assert.equal(missing.ok ? "" : missing.code, "file_not_found");
});

test("flag off: a Word file, too many bytes, too many pages and an encrypted-or-broken PDF are refused", async () => {
  const word = await resolveAiFiles(fakeAdmin([row(A, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")], {}).admin as never, "u-1", [A], RULES);
  assert.equal(word.ok ? "" : word.code, "file_type");

  const big = await resolveAiFiles(fakeAdmin([row(A, "application/pdf", 23 * 1024 * 1024)], {}).admin as never, "u-1", [A], RULES);
  assert.equal(big.ok ? "" : big.code, "files_too_large");

  const long = await resolveAiFiles(
    fakeAdmin([row(A, "application/pdf"), row(B, "application/pdf")], { [`u-1/${A}.bin`]: await pdf(20), [`u-1/${B}.bin`]: await pdf(11) }).admin as never,
    "u-1",
    [A, B],
    RULES,
  );
  assert.equal(long.ok ? "" : long.code, "too_many_pages");

  const broken = await resolveAiFiles(fakeAdmin([row(A, "application/pdf")], { [`u-1/${A}.bin`]: new TextEncoder().encode("junk") }).admin as never, "u-1", [A], RULES);
  assert.equal(broken.ok ? "" : broken.code, "file_unreadable");

  const none = await resolveAiFiles(fakeAdmin([], {}).admin as never, "u-1", undefined, RULES);
  assert.equal(none.ok ? "" : none.code, "no_files");
});

// ── B3: text kinds, behind NZAMY_AI_TEXT_FILES ──────────────────────────────

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const SECRET = "test-secret-not-a-real-key";
const TEXT_ON = { textFiles: { secret: SECRET, baseUrl: "https://site.test" } };
const NOW = new Date("2026-11-05T10:00:00Z");
const docx = (text: string) => zipSync({ "word/document.xml": strToU8(`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`) });
const on = (admin: unknown, ids: unknown[], rules = RULES) => resolveAiFiles(admin as never, "u-1", ids, rules, NOW, TEXT_ON);

test("B3: a docx becomes a text/plain file when text files are on", async () => {
  const { admin, signed } = fakeAdmin([row(37, DOCX, 1000, "مذكرة.docx")], { "u-1/37.bin": docx("نص المذكرة") });
  const got = await on(admin, [37]);
  assert.ok(got.ok, JSON.stringify(got));
  assert.equal(got.pages, 1);
  const [f] = got.files;
  assert.equal(f.mime, "text/plain");
  assert.equal(f.pages, 1);
  assert.equal(f.name, "مذكرة.docx");
  assert.equal(f.bytes, new TextEncoder().encode("نص المذكرة").length);
  assert.ok(f.url.startsWith("https://site.test/api/v1/ai/file-text/"));
  assert.equal(f.url_expires_at, new Date(NOW.getTime() + FILE_TEXT_TTL_MS).toISOString());
  assert.deepEqual(signed.map((s) => s[1]), [READ_LINK_SECONDS], "only the short link this check read through");
  assert.ok(!f.url.includes("/object/sign/"), "no storage link leaves: n8n fetches the text, not the .docx");
});

test("B3: the link is bound to this file and owner, and expires with url_expires_at", async () => {
  const { admin } = fakeAdmin([row(37, DOCX)], { "u-1/37.bin": docx("نص") });
  const got = await on(admin, [37]);
  assert.ok(got.ok);
  const token = got.files[0].url.split("/").at(-1)!;
  const expiry = NOW.getTime() + FILE_TEXT_TTL_MS;
  assert.deepEqual(verifyFileTextToken(token, SECRET, NOW.getTime()), { a: "37", u: "u-1", e: expiry });
  assert.equal(verifyFileTextToken(token, SECRET, expiry), null);
  assert.equal(verifyFileTextToken(token, "another", NOW.getTime()), null);
});

test("B3: the same docx with the flag off is refused, before any download", async () => {
  const objects = { "u-1/37.bin": docx("نص") };
  for (const [mime, name] of [[DOCX, "a.docx"], ["text/plain", "a.txt"], ["", "a.md"], ["application/msword", "a.doc"]]) {
    const got = await resolveAiFiles(fakeAdmin([row(37, mime, 1000, name)], objects).admin as never, "u-1", [37], RULES);
    assert.deepEqual(got, { ok: false, error: FILE_COPY.type, code: "file_type" }, name);
  }
});

test("B3: .doc is refused with its own copy", async () => {
  const got = await on(fakeAdmin([row(37, "application/msword", 1000, "x.doc")], {}).admin, [37]);
  assert.deepEqual(got, { ok: false, error: FILE_COPY.doc, code: "file_type_doc" });
});

test("B3: a .md stored as octet-stream is read by its extension", async () => {
  const got = await on(fakeAdmin([row(37, "application/octet-stream", 10, "n.md")], { "u-1/37.bin": strToU8("# نص") }).admin, [37]);
  assert.ok(got.ok, JSON.stringify(got));
  assert.equal(got.files[0].mime, "text/plain");
});

test("B3: a row with no mime at all goes by its extension with the flag on, and is refused with it off", async () => {
  const rows = [{ ...row(37, "", 10, "n.txt"), mime_type: null as unknown as string }];
  const objects = { "u-1/37.bin": strToU8("نص") };
  assert.equal((await on(fakeAdmin(rows, objects).admin, [37])).ok, true);
  const off = await resolveAiFiles(fakeAdmin(rows, objects).admin as never, "u-1", [37], RULES);
  assert.equal(off.ok ? "" : off.code, "file_type");
});

test("B3: an unsupported type names what is accepted when the flag is on", async () => {
  const got = await on(fakeAdmin([row(37, "application/zip", 10, "a.zip")], {}).admin, [37]);
  assert.deepEqual(got, { ok: false, error: FILE_COPY.typeWithText, code: "file_type" });
  assert.match(FILE_COPY.typeWithText, /\.docx/);
  assert.doesNotMatch(FILE_COPY.type, /Word/, "the flag-off copy offers no Word");
});

test("B3: a broken .docx, an empty text and a binary named .txt are refused before the charge", async () => {
  for (const [mime, name, bytes] of [
    [DOCX, "a.docx", new Uint8Array([1, 2, 3])],
    ["text/plain", "a.txt", strToU8("   ")],
    ["text/plain", "a.txt", new Uint8Array([0x4d, 0x00, 0x5a])],
  ] as Array<[string, string, Uint8Array]>) {
    const got = await on(fakeAdmin([row(37, mime, 10, name)], { "u-1/37.bin": bytes }).admin, [37]);
    assert.deepEqual(got, { ok: false, error: FILE_COPY.unreadableText, code: "file_unreadable" }, name);
  }
});

test("B3: a zip bomb is refused as too large", async () => {
  const bomb = zipSync({ "word/document.xml": strToU8(" ".repeat(21 * 1024 * 1024)) });
  const got = await on(fakeAdmin([row(37, DOCX)], { "u-1/37.bin": bomb }).admin, [37]);
  assert.deepEqual(got, { ok: false, error: FILE_COPY.textTooLong, code: "files_too_large" });
});

test("B3: a text kind's row outside the owner's folder is not read", async () => {
  const hijacked = { ...row(37, "text/plain", 10, "a.txt"), storage_path: "u-2/secret.txt" };
  const got = await on(fakeAdmin([hijacked], { "u-2/secret.txt": strToU8("سر") }).admin, [37]);
  assert.deepEqual(got, { ok: false, error: FILE_COPY.missing, code: "file_not_found" });
});

test("B3: pages come from the text, and the cap applies", async () => {
  const text = "س".repeat(TEXT_CHARS_PER_PAGE * 2 + 1);
  const got = await on(fakeAdmin([row(37, "text/plain", 10, "a.txt")], { "u-1/37.bin": strToU8(text) }).admin, [37]);
  assert.ok(got.ok);
  assert.equal(got.pages, 3);
  const long = "س".repeat(TEXT_CHARS_PER_PAGE * 30 + 1);
  const over = await on(fakeAdmin([row(37, "text/plain", 10, "a.txt")], { "u-1/37.bin": strToU8(long) }).admin, [37]);
  assert.equal(over.ok ? "" : over.code, "too_many_pages");
});

test("٤٣٩: a vocalised .txt of 30 counted pages passes as 30 pages — the marks are not counted", async () => {
  const text = "\u0633\u064E".repeat(TEXT_CHARS_PER_PAGE * 30);
  assert.equal(text.length, TEXT_CHARS_PER_PAGE * 60);
  const got = await on(fakeAdmin([row(37, "text/plain", 10, "a.txt")], { "u-1/37.bin": strToU8(text) }).admin, [37]);
  assert.ok(got.ok, JSON.stringify(got).slice(0, 300));
  assert.equal(got.pages, 30);
  assert.equal(got.files[0].pages, 30);
  assert.equal(got.files[0].bytes, new TextEncoder().encode(text).length, "the original text, marks included, is what is served");
});

test("B3: a text longer than the link can serve is refused, never cut, even under a larger page cap", async () => {
  const long = "س".repeat(TEXT_FILE_MAX_CHARS + 1);
  const got = await on(fakeAdmin([row(37, "text/plain", 10, "a.txt")], { "u-1/37.bin": strToU8(long) }).admin, [37], { ...RULES, maxPages: 500 });
  assert.deepEqual(got, { ok: false, error: FILE_COPY.textTooLong, code: "files_too_large" });
});

test("B3: the recorded and the real byte caps cover text kinds too", async () => {
  const big = await on(fakeAdmin([row(37, "text/plain", 23 * 1024 * 1024, "a.txt")], {}).admin, [37]);
  assert.equal(big.ok ? "" : big.code, "files_too_large");
  const lied = await on(fakeAdmin([row(37, "text/plain", 10, "a.txt")], { "u-1/37.bin": new Uint8Array(10) }).admin, [37], { ...RULES, maxBytes: 5 });
  assert.equal(lied.ok ? "" : lied.code, "files_too_large");
});

test("B3: a PDF with the flag on is unchanged, and pages add up across kinds", async () => {
  const { admin, signed } = fakeAdmin([row(A, "application/pdf"), row(37, DOCX)], { [`u-1/${A}.bin`]: await pdf(4), "u-1/37.bin": docx("نص") });
  const got = await on(admin, [A, 37]);
  assert.ok(got.ok, JSON.stringify(got));
  assert.equal(got.pages, 5);
  assert.deepEqual(got.files.map((f) => f.mime), ["application/pdf", "text/plain"]);
  assert.deepEqual(signed.map((s) => s[1]), [SIGNED_URL_SECONDS, READ_LINK_SECONDS], "each file is signed once");
  assert.ok(got.files[0].url.includes("/object/sign/"), "the PDF alone hands on a storage link");
  assert.ok(!got.files[1].url.includes("/object/sign/"));
});

test("aiTextFilesConfig: on only with the flag, the key and an https site", () => {
  const good = { NZAMY_AI_TEXT_FILES: "on", NZAMY_AI_KEY: SECRET, NEXT_PUBLIC_SITE_URL: " https://site.test/ " };
  assert.deepEqual(aiTextFilesConfig(good), { secret: SECRET, baseUrl: "https://site.test" });
  for (const bad of [
    {},
    { ...good, NZAMY_AI_TEXT_FILES: undefined },
    { ...good, NZAMY_AI_TEXT_FILES: "off" },
    { ...good, NZAMY_AI_TEXT_FILES: "true" },
    { ...good, NZAMY_AI_TEXT_FILES: "ON" },
    { ...good, NZAMY_AI_KEY: undefined },
    { ...good, NZAMY_AI_KEY: "" },
    { ...good, NEXT_PUBLIC_SITE_URL: undefined },
    { ...good, NEXT_PUBLIC_SITE_URL: "http://site.test" },
  ]) {
    assert.equal(aiTextFilesConfig(bad), null, JSON.stringify(bad));
  }
});

test("the runs route: the text option comes only from aiTextFilesConfig", () => {
  const route = readFileSync(join(process.cwd(), "src", "app", "api", "v1", "ai", "runs", "route.ts"), "utf8");
  assert.match(route, /aiTextFilesConfig\(\{/);
  assert.match(route, /process\.env\.NZAMY_AI_TEXT_FILES/);
  assert.match(route, /resolveAiFiles\(admin, userId, fileIds, rules, new Date\(\), textFiles \? \{ textFiles \} : \{\}\)/);
});

test("a size lie: an object larger than its recorded size is refused by what arrives, not held in full", async () => {
  const chunk = 1024;
  let pulls = 0;
  let cancelled = false;
  const lying = new ReadableStream<Uint8Array>({
    pull(c) {
      pulls += 1;
      c.enqueue(new Uint8Array(chunk));
    },
    cancel() {
      cancelled = true;
    },
  }, { highWaterMark: 0 });
  const { admin } = fakeAdmin([row(A, "application/pdf", 10)], {});
  const got = await resolveAiFiles(admin as never, "u-1", [A], { ...RULES, maxBytes: 10 * chunk }, NOW, {
    fetch: (async () => new Response(lying)) as never,
  });
  assert.deepEqual(got, { ok: false, error: FILE_COPY.size(0), code: "files_too_large" });
  assert.ok(pulls <= 12, `pulled ${pulls} chunks for a cap of 10`);
  assert.equal(cancelled, true);
});

test("a size lie across files: the cap on each read is what is left of the run's budget", async () => {
  const first = await pdf(1);
  const second = new Uint8Array(first.length + 10);
  const rules = { ...RULES, maxBytes: first.length + 5 };
  const { admin } = fakeAdmin([row(A, "application/pdf", 1), row(B, "image/png", 1)], { [`u-1/${A}.bin`]: first, [`u-1/${B}.bin`]: second });
  const got = await resolveAiFiles(admin as never, "u-1", [A, B], rules);
  assert.equal(got.ok ? "" : got.code, "files_too_large");
});

test("an object gone from the bucket is the same «missing» answer a failed download was", async () => {
  const { admin } = fakeAdmin([row(A, "application/pdf")], {});
  assert.deepEqual(await resolveAiFiles(admin as never, "u-1", [A], RULES), { ok: false, error: FILE_COPY.missing, code: "file_not_found" });
});

test("a .docx past the text cap keeps today's refusal, whichever way the walk ended", async () => {
  const objects = { "u-1/37.bin": docx("س".repeat(500_000)) };
  const got = await on(fakeAdmin([row(37, DOCX)], objects).admin, [37]);
  assert.deepEqual(got, { ok: false, error: FILE_COPY.pages(RULES.maxPages), code: "too_many_pages" });
});
