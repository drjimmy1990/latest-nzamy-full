import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inlineKindOf, openableLink, probeObjectHead, PROBE_BYTES, servedType } from "./inlineSafety.ts";

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string) => new TextEncoder().encode(s);
const PDF = ascii("%PDF-1.7\n");
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50);
const GIF = ascii("GIF89a....");

test("servedType drops parameters and case", () => {
  assert.equal(servedType("Image/PNG; foo=bar"), "image/png");
  assert.equal(servedType(null), "");
});

test("inline only when the served type and the bytes agree", () => {
  assert.equal(inlineKindOf("application/pdf", PDF), "pdf");
  assert.equal(inlineKindOf("image/png", PNG), "image");
  assert.equal(inlineKindOf("image/jpeg", JPEG), "image");
  assert.equal(inlineKindOf("image/jpg", JPEG), "image");
  assert.equal(inlineKindOf("image/webp", WEBP), "image");
  assert.equal(inlineKindOf("image/gif", GIF), "image");
});

test("never inline: page types, mismatches, empty answers", () => {
  assert.equal(inlineKindOf("text/html", PDF), null, "PDF bytes served as HTML would run as a page");
  assert.equal(inlineKindOf("image/svg+xml", ascii("<svg ")), null);
  assert.equal(inlineKindOf("application/xhtml+xml", ascii("<html")), null);
  assert.equal(inlineKindOf("text/plain", ascii("hello")), null);
  assert.equal(inlineKindOf("application/octet-stream", PDF), null);
  assert.equal(inlineKindOf("application/pdf", ascii("<html>")), null, "a PDF type over other bytes");
  assert.equal(inlineKindOf("image/png", JPEG), null);
  assert.equal(inlineKindOf("image/webp", bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20)), null, "RIFF but not WEBP");
  assert.equal(inlineKindOf("image/gif", ascii("GIF8xa")), null);
  assert.equal(inlineKindOf("application/pdf", new Uint8Array()), null);
  assert.equal(inlineKindOf("", PDF), null);
});

test("probeObjectHead sends a range, reads the type and only the first bytes", async () => {
  let sent: RequestInit | undefined;
  const big = new Uint8Array(1024 * 1024).fill(0x41);
  big.set(PDF);
  const r = await probeObjectHead("https://s/x", async (_u, init) => {
    sent = init;
    return new Response(big, { headers: { "content-type": "application/pdf" } });
  });
  assert.equal(new Headers(sent?.headers).get("range"), `bytes=0-${PROBE_BYTES - 1}`);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.contentType, "application/pdf");
    assert.equal(r.head.byteLength, PROBE_BYTES, "a server that ignores the range is still read for PROBE_BYTES only");
    assert.equal(inlineKindOf(r.contentType, r.head), "pdf");
  }
});

test("probeObjectHead fails closed: an error status, a thrown fetch", async () => {
  assert.deepEqual(await probeObjectHead("https://s/x", async () => new Response("no", { status: 403 })), { ok: false });
  assert.deepEqual(await probeObjectHead("https://s/x", async () => { throw new Error("net"); }), { ok: false });
});

test("a short object is read whole", async () => {
  const r = await probeObjectHead("https://s/x", async () => new Response(bytes(0xff, 0xd8, 0xff), { status: 206, headers: { "content-type": "image/jpeg" } }));
  assert.ok(r.ok && r.head.byteLength === 3 && inlineKindOf(r.contentType, r.head) === "image");
});

test("openableLink: the inline link for a real PDF / image, else a download link", async () => {
  const pdfServer = async () => new Response(PDF, { headers: { "content-type": "application/pdf" } });
  const htmlServer = async () => new Response("<html>", { headers: { "content-type": "text/html" } });
  let downloads = 0;
  const signDownload = async () => { downloads++; return { data: { signedUrl: "https://s/x?download=" }, error: null }; };
  assert.equal(await openableLink("https://s/x", signDownload, pdfServer), "https://s/x");
  assert.equal(downloads, 0, "no second link for a real PDF");
  assert.equal(await openableLink("https://s/x", signDownload, htmlServer), "https://s/x?download=");
  assert.equal(await openableLink("https://s/x", signDownload, async () => new Response("", { status: 500 })), "https://s/x?download=", "a failed probe is a download, never inline");
  assert.equal(await openableLink("https://s/x", async () => ({ data: null, error: { message: "x" } }), htmlServer), null);
});

test("the routes that hand a stored document to a browser go through the check", () => {
  const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");
  for (const f of [
    "src/app/api/v1/share/[token]/verify/route.ts",
    "src/app/api/v1/service-requests/[id]/attachments/[attachmentId]/route.ts",
    "src/app/api/v1/service-requests/[id]/deliverable/route.ts",
    "src/app/api/v1/client/contracts/[id]/versions/[vid]/url/route.ts",
  ]) {
    const src = read(f);
    const sign = src.indexOf('createSignedUrl(');
    const check = src.indexOf("await openableLink(signed.signedUrl, () =>");
    assert.ok(sign > -1 && check > sign, `${f}: the signed link is checked`);
    assert.match(src.slice(check), /createSignedUrl\([^)]*, 300, \{ download: true \}\)/, `${f}: the fallback is a download`);
    assert.ok(!/url: signed\.signedUrl/.test(src), `${f}: the unchecked link is never answered`);
  }
  const preview = read("src/lib/attachments/previewServe.ts");
  assert.ok(preview.indexOf("probeObjectHead(signed.data.signedUrl, clients.fetch)") > preview.indexOf("createSignedUrl(path, SIGNED_URL_SECONDS)"));
});
