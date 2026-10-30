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
import { PDFDocument } from "pdf-lib";
import { countPages, FILE_COPY, parseFileIds, resolveAiFiles, SIGNED_URL_SECONDS } from "./aiFiles.ts";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RULES = { max: 5, maxPages: 30, maxBytes: 22 * 1024 * 1024 };

async function pdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return doc.save();
}

type Row = { id: string | number; file_name: string; storage_path: string; mime_type: string; size_bytes: number };

/** The service client: `attachments` reads and the `documents` bucket. */
function fakeAdmin(rows: Row[], objects: Record<string, Uint8Array>) {
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
          download: async (path: string) =>
            objects[path] ? { data: new Blob([objects[path] as BlobPart]), error: null } : { data: null, error: { message: "not found" } },
          createSignedUrl: async (path: string, seconds: number) => {
            signed.push([path, seconds]);
            return { data: { signedUrl: `https://auth.example/storage/v1/object/sign/documents/${path}?token=t` }, error: null };
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

test("a Word file, too many bytes, too many pages and an encrypted-or-broken PDF are refused", async () => {
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
