import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTRACT_VERSION_ERRORS,
  CONTRACT_VERSION_MAX_BYTES,
  CONTRACT_VERSION_MIME,
  fileExtension,
  precheckContractVersionFile,
  sniffContractVersion,
  uploadThenRegister,
  validateContractVersionFile,
} from "./contractVersionFile.ts";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const DOC = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
const TXT = new TextEncoder().encode("TEST-CODEX synthetic text file, 54 bytes long......");

test("the owner's sample: a small TXT is refused whatever it is named", () => {
  for (const name of ["sample.txt", "sample.pdf", "sample.docx"]) {
    const r = validateContractVersionFile({ name, size: 54, head: TXT.subarray(0, 8) });
    assert.equal(r.ok, false, name);
  }
  const asTxt = validateContractVersionFile({ name: "sample.txt", size: 54, head: TXT });
  assert.equal(asTxt.ok === false && asTxt.error, CONTRACT_VERSION_ERRORS.badExtension);
  const renamed = validateContractVersionFile({ name: "sample.pdf", size: 54, head: TXT });
  assert.equal(renamed.ok === false && renamed.error, CONTRACT_VERSION_ERRORS.badContent);
});

test("PDF, DOC and DOCX are accepted by content, and the stored type comes from the content", () => {
  assert.deepEqual(validateContractVersionFile({ name: "a.pdf", size: 1000, head: PDF }),
    { ok: true, kind: "pdf", contentType: CONTRACT_VERSION_MIME.pdf });
  assert.deepEqual(validateContractVersionFile({ name: "a.DOC", size: 1000, head: DOC }),
    { ok: true, kind: "doc", contentType: CONTRACT_VERSION_MIME.doc });
  assert.deepEqual(validateContractVersionFile({ name: "عقد.docx", size: 1000, head: ZIP }),
    { ok: true, kind: "docx", contentType: CONTRACT_VERSION_MIME.docx });
});

test("an extension that disagrees with the content is refused", () => {
  const r = validateContractVersionFile({ name: "a.docx", size: 1000, head: PDF });
  assert.equal(r.ok === false && r.error, CONTRACT_VERSION_ERRORS.mismatch);
  const z = validateContractVersionFile({ name: "a.pdf", size: 1000, head: ZIP });
  assert.equal(z.ok === false && z.error, CONTRACT_VERSION_ERRORS.mismatch);
});

test("size: empty refused, 20 MB accepted, one byte more is 413", () => {
  assert.equal(validateContractVersionFile({ name: "a.pdf", size: 0, head: PDF }).ok, false);
  assert.equal(validateContractVersionFile({ name: "a.pdf", size: CONTRACT_VERSION_MAX_BYTES, head: PDF }).ok, true);
  const big = validateContractVersionFile({ name: "a.pdf", size: CONTRACT_VERSION_MAX_BYTES + 1, head: PDF });
  assert.equal(big.ok, false);
  assert.equal(big.ok === false && big.status, 413);
  assert.match(CONTRACT_VERSION_ERRORS.tooLarge, /٢٠ ميجابايت/);
});

test("a head too short to hold a signature is not a match", () => {
  assert.equal(sniffContractVersion(new Uint8Array([0x25, 0x50])), null);
  assert.equal(sniffContractVersion(new Uint8Array(0)), null);
});

test("precheck answers size and name without bytes", () => {
  assert.equal(precheckContractVersionFile({ name: "a.pdf", size: 10 }), null);
  assert.equal(precheckContractVersionFile({ name: "a.txt", size: 10 }), CONTRACT_VERSION_ERRORS.badExtension);
  assert.equal(precheckContractVersionFile({ name: "a.pdf", size: CONTRACT_VERSION_MAX_BYTES + 1 }), CONTRACT_VERSION_ERRORS.tooLarge);
  assert.equal(precheckContractVersionFile({ name: "noext", size: 10 }), CONTRACT_VERSION_ERRORS.badExtension);
});

test("fileExtension: last dot of the last path segment, lower-cased", () => {
  assert.equal(fileExtension("a.b.PDF"), "pdf");
  assert.equal(fileExtension("dir.x/file"), "");
  assert.equal(fileExtension(".pdf"), "");
});

// ── The cleanup (kept from before, now testable) ───────────────────────────

test("cleanup runs when registration fails, and the error still reaches the caller", async () => {
  const calls: string[] = [];
  await assert.rejects(
    uploadThenRegister({
      upload: async () => { calls.push("upload"); },
      register: async () => { calls.push("register"); throw new Error("الخادم رفض"); },
      remove: async () => { calls.push("remove"); },
    }),
    /الخادم رفض/,
  );
  assert.deepEqual(calls, ["upload", "register", "remove"]);
});

test("a failing remove does not hide the registration error", async () => {
  await assert.rejects(
    uploadThenRegister({
      upload: async () => undefined,
      register: async () => { throw new Error("register failed"); },
      remove: async () => { throw new Error("remove failed"); },
    }),
    /register failed/,
  );
});

test("no cleanup on success, and none when the upload itself failed", async () => {
  let removed = 0;
  const ok = await uploadThenRegister({
    upload: async () => undefined,
    register: async () => "v1",
    remove: async () => { removed += 1; },
  });
  assert.equal(ok, "v1");
  await assert.rejects(uploadThenRegister({
    upload: async () => { throw new Error("upload failed"); },
    register: async () => "never",
    remove: async () => { removed += 1; },
  }), /upload failed/);
  assert.equal(removed, 0);
});
