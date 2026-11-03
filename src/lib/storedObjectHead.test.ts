import test from "node:test";
import assert from "node:assert/strict";
import { readStoredObjectHead, totalFromContentRange, type HeadStorage } from "./storedObjectHead.ts";

const BYTES = new TextEncoder().encode("%PDF-1.7 and the rest of a document");

function bucket(opts: { sign?: boolean; download?: Uint8Array | null } = {}): HeadStorage & { downloads: number } {
  const b = {
    downloads: 0,
    async createSignedUrl() {
      return opts.sign === false
        ? { data: null, error: new Error("no signing") }
        : { data: { signedUrl: "https://storage.test/signed" }, error: null };
    },
    async download() {
      b.downloads += 1;
      return opts.download ? { data: new Blob([opts.download as BlobPart]), error: null } : { data: null, error: new Error("not found") };
    },
  };
  return b;
}

const fetchWith = (status: number, body: Uint8Array | null, headers: Record<string, string>) =>
  (async () => new Response(body as BodyInit | null, { status, headers })) as unknown as typeof fetch;

test("Content-Range total", () => {
  assert.equal(totalFromContentRange("bytes 0-15/54"), 54);
  assert.equal(totalFromContentRange("bytes */0"), 0);
  assert.equal(totalFromContentRange("bytes 0-15/*"), null);
  assert.equal(totalFromContentRange(null), null);
});

test("206: head from the body, size from Content-Range — not from the caller", async () => {
  const r = await readStoredObjectHead(bucket(), "u/contracts/c/1-a.pdf", 16,
    fetchWith(206, BYTES.subarray(0, 16), { "content-range": `bytes 0-15/${BYTES.length}` }));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.size, BYTES.length);
    assert.deepEqual([...r.head.subarray(0, 5)], [...BYTES.subarray(0, 5)]);
  }
});

test("200 (Range ignored): reads only the first bytes, size from Content-Length", async () => {
  const r = await readStoredObjectHead(bucket(), "p", 8,
    fetchWith(200, BYTES, { "content-length": String(BYTES.length) }));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.size, BYTES.length);
    assert.equal(r.head.length, 8);
  }
});

test("404 means the object is missing", async () => {
  const r = await readStoredObjectHead(bucket(), "p", 16, fetchWith(404, null, {}));
  assert.deepEqual(r, { ok: false, reason: "missing" });
});

test("no signing → falls back to a download", async () => {
  const b = bucket({ sign: false, download: BYTES });
  const r = await readStoredObjectHead(b, "p", 16, fetchWith(500, null, {}));
  assert.equal(b.downloads, 1);
  assert.equal(r.ok && r.size, BYTES.length);
});

test("a network error → falls back to a download; nothing there → missing", async () => {
  const throwing = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  const r = await readStoredObjectHead(bucket({ download: null }), "p", 16, throwing);
  assert.deepEqual(r, { ok: false, reason: "missing" });
});
