import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { previewKindOf } from "./previewKind.ts";
import { previewAttachment, PREVIEW_TEXT_MAX_CHARS, type PreviewClients } from "./previewServe.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

test("previewKindOf: PDF, images, Word and text; nothing else", () => {
  assert.equal(previewKindOf("application/pdf", "x"), "pdf");
  assert.equal(previewKindOf("APPLICATION/PDF", "x"), "pdf");
  assert.equal(previewKindOf("image/webp", "p"), "image");
  for (const m of ["image/png", "image/jpeg", "image/jpg", "image/gif"]) assert.equal(previewKindOf(m, "p"), "image", m);
  assert.equal(previewKindOf("", "a.MD"), "text");
  assert.equal(previewKindOf("text/plain", "n"), "text");
  assert.equal(previewKindOf("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "n"), "text");
  assert.equal(previewKindOf("application/msword", "a.doc"), "none");
  assert.equal(previewKindOf("", "a.doc"), "none");
  assert.equal(previewKindOf(null, null), "none");
});

test("previewKindOf: nothing a browser would run as a page is ever shown as a file", () => {
  assert.equal(previewKindOf("image/svg+xml", "a.svg"), "none");
  assert.equal(previewKindOf("text/html", "a.html"), "none");
  assert.equal(previewKindOf("text/html", "a.pdf"), "none");
});

interface Row {
  id: number;
  file_name: string | null;
  mime_type: string | null;
  storage_path: string | null;
  size_bytes: number | null;
  deleted_at: string | null;
  owner_user_id: string | null;
  folder_owner_id: string | null;
}

const PDF_ROW: Row = {
  id: 7,
  file_name: "عقد.pdf",
  mime_type: "application/pdf",
  storage_path: `${OWNER}/1-عقد.pdf`,
  size_bytes: 100,
  deleted_at: null,
  owner_user_id: OWNER,
  folder_owner_id: OWNER,
};

function clients(row: Row | null, opts: { readError?: boolean; signError?: boolean; download?: Uint8Array | null } = {}) {
  const calls = { signed: [] as Array<{ bucket: string; path: string; seconds: number }>, downloaded: [] as string[], selected: [] as string[], eq: [] as unknown[][] };
  const session = {
    from(table: string) {
      assert.equal(table, "attachments");
      return {
        select(cols: string) {
          calls.selected.push(cols);
          return {
            eq(col: string, val: unknown) {
              calls.eq.push([col, val]);
              return {
                maybeSingle: async () => (opts.readError ? { data: null, error: { code: "XX000" } } : { data: row, error: null }),
              };
            },
          };
        },
      };
    },
  };
  const admin = {
    storage: {
      from(bucket: string) {
        return {
          createSignedUrl: async (path: string, seconds: number) => {
            calls.signed.push({ bucket, path, seconds });
            return opts.signError ? { data: null, error: { message: "x" } } : { data: { signedUrl: "https://s/signed" }, error: null };
          },
          download: async (path: string) => {
            calls.downloaded.push(path);
            const bytes = opts.download;
            return bytes ? { data: new Blob([bytes as BlobPart]), error: null } : { data: null, error: { message: "x" } };
          },
        };
      },
    },
  };
  return { deps: { session, admin } as unknown as PreviewClients, calls };
}

const encode = (s: string) => new TextEncoder().encode(s);

test("a PDF the reader's session can see gets a five-minute link", async () => {
  const { deps, calls } = clients(PDF_ROW);
  const r = await previewAttachment(deps, "7");
  assert.deepEqual(r, { status: 200, body: { kind: "pdf", name: "عقد.pdf", url: "https://s/signed" } });
  assert.deepEqual(calls.signed, [{ bucket: "documents", path: PDF_ROW.storage_path, seconds: 300 }]);
  assert.deepEqual(calls.eq, [["id", "7"]], "the row comes through the session's RLS, by id alone");
});

test("no new reveal: every refusal is the same 404, and signs and downloads nothing", async () => {
  const refused: Array<[string, Row | null, Record<string, unknown>]> = [
    ["no row: RLS hid it, or it does not exist", null, {}],
    ["in the bin: the supervisors' archive policy can show such a row", { ...PDF_ROW, deleted_at: "2026-11-01T00:00:00Z" }, {}],
    ["a row pointing into someone else's folder", { ...PDF_ROW, storage_path: `${OTHER}/1-سر.pdf` }, {}],
    ["a planted row with no folder_owner_id, outside its writer's folder", { ...PDF_ROW, folder_owner_id: null, storage_path: `${OTHER}/1-سر.pdf` }, {}],
    ["a path climbing out of the folder", { ...PDF_ROW, storage_path: `${OWNER}/../${OTHER}/1.pdf` }, {}],
    ["no path at all", { ...PDF_ROW, storage_path: null }, {}],
    ["no owner at all", { ...PDF_ROW, owner_user_id: null, folder_owner_id: null }, {}],
    ["a failed read", PDF_ROW, { readError: true }],
  ];
  for (const [what, row, opts] of refused) {
    const { deps, calls } = clients(row, opts);
    const r = await previewAttachment(deps, "7");
    assert.equal(r.status, 404, what);
    assert.deepEqual(calls.signed, [], what);
    assert.deepEqual(calls.downloaded, [], what);
  }
});

test("a bad id is refused before any read", async () => {
  for (const id of ["abc", "1;drop", "", "1.5", "-1"]) {
    const { deps, calls } = clients(PDF_ROW);
    assert.equal((await previewAttachment(deps, id)).status, 404, id);
    assert.deepEqual(calls.selected, [], id);
  }
});

test("a document moved to the firm owner stays readable from the folder it was written in", async () => {
  const moved = { ...PDF_ROW, owner_user_id: OTHER, folder_owner_id: OWNER };
  const { deps, calls } = clients(moved);
  assert.equal((await previewAttachment(deps, "7")).status, 200);
  assert.equal(calls.signed.length, 1);
});

test("a text file comes back as text, cut at 20,000 characters and marked", async () => {
  const row = { ...PDF_ROW, file_name: "m.txt", mime_type: "text/plain", storage_path: `${OWNER}/1-m.txt` };
  const short = clients(row, { download: encode("نص قصير") });
  assert.deepEqual(await previewAttachment(short.deps, "7"), { status: 200, body: { kind: "text", name: "m.txt", text: "نص قصير", truncated: false } });
  assert.deepEqual(short.calls.signed, [], "a text file gets no link");

  const long = clients(row, { download: encode("ن".repeat(PREVIEW_TEXT_MAX_CHARS + 1)) });
  const r = await previewAttachment(long.deps, "7");
  assert.equal(r.status, 200);
  if (r.status === 200 && r.body.kind === "text") {
    assert.equal(r.body.text.length, PREVIEW_TEXT_MAX_CHARS);
    assert.equal(r.body.truncated, true);
  } else assert.fail("expected text");
});

test("a text file over the size cap is not downloaded", async () => {
  const row = { ...PDF_ROW, file_name: "m.txt", mime_type: "text/plain", size_bytes: 23 * 1024 * 1024 };
  const { deps, calls } = clients(row, { download: encode("x") });
  assert.deepEqual(await previewAttachment(deps, "7"), { status: 200, body: { kind: "none", name: "m.txt", reason: "too_large" } });
  assert.deepEqual(calls.downloaded, []);
});

test("a file that cannot be read says so, with no fake preview", async () => {
  const row = { ...PDF_ROW, file_name: "m.docx", mime_type: "", storage_path: `${OWNER}/1-m.docx` };
  const { deps } = clients(row, { download: encode("not a zip") });
  assert.deepEqual(await previewAttachment(deps, "7"), { status: 200, body: { kind: "none", name: "m.docx", reason: "unreadable" } });
});

test("a .doc or an unknown kind answers none, and touches no storage", async () => {
  const row = { ...PDF_ROW, file_name: "a.doc", mime_type: "application/msword" };
  const { deps, calls } = clients(row);
  assert.deepEqual(await previewAttachment(deps, "7"), { status: 200, body: { kind: "none", name: "a.doc" } });
  assert.deepEqual(calls.signed, []);
  assert.deepEqual(calls.downloaded, []);
});

test("storage trouble is an error, not an empty preview", async () => {
  assert.equal((await previewAttachment(clients(PDF_ROW, { signError: true }).deps, "7")).status, 503);
  const row = { ...PDF_ROW, file_name: "m.txt", mime_type: "text/plain" };
  assert.equal((await previewAttachment(clients(row, { download: null }).deps, "7")).status, 503);
});

test("no file text reaches the logs", async () => {
  const seen: string[] = [];
  const original = { error: console.error, log: console.log, warn: console.warn };
  const spy = (...a: unknown[]) => { seen.push(a.map(String).join(" ")); };
  console.error = spy; console.log = spy; console.warn = spy;
  try {
    const row = { ...PDF_ROW, file_name: "سري.txt", mime_type: "text/plain" };
    await previewAttachment(clients(row, { download: encode("نص سري جداً") }).deps, "7");
    await previewAttachment(clients({ ...row, file_name: "سري.docx", mime_type: "" }, { download: encode("نص سري جداً") }).deps, "7");
    await previewAttachment(clients(row, { download: null }).deps, "7");
  } finally {
    Object.assign(console, original);
  }
  assert.equal(seen.some((l) => l.includes("سري")), false);
});

test("the modal renders the reply's kind: it pulls no extraction code into a page's bundle", () => {
  const src = readFileSync(new URL("../../components/attachments/AttachmentPreviewModal.tsx", import.meta.url), "utf8");
  assert.equal(/from "[^"]*(previewKind|textExtract|aiFiles)/.test(src), false);
  assert.match(src, /import type \{ PreviewBody \} from "@\/lib\/attachments\/previewServe"/);
  assert.match(src, /role="dialog" aria-modal="true"/);
});

test("the route gives the session client to RLS and never reads the row with the service client", () => {
  const src = readFileSync(new URL("../../app/api/v1/documents/[id]/preview/route.ts", import.meta.url), "utf8");
  assert.match(src, /requireApiUser\(session/);
  assert.match(src, /previewAttachment\(\{ session, admin: await createServiceClient\(\) \}, id\)/);
  assert.match(src, /"Cache-Control": "private, no-store"/);
});
