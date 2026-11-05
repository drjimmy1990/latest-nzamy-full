/**
 * fileTextToken.test.ts — the signed link n8n fetches extracted text from, and
 * the one handler behind it. These are the link's security proofs: the token
 * expires, it is bound to its file and owner, a bad one reveals nothing, the
 * handler reads only the AI files area, and no text or token reaches a log.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/fileTextToken.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import {
  AI_FILES_BUCKET,
  FILE_TEXT_TTL_MS,
  signFileTextToken,
  storagePathInOwnFolder,
  verifyFileTextToken,
  type FileTextClaim,
} from "./fileTextToken.ts";
import { serveFileText } from "./fileTextServe.ts";
import { TEXT_FILE_MAX_CHARS } from "./textExtract.ts";
import { isProtectedApiPath } from "../auth/routeAccess.ts";
import { SIGNED_URL_SECONDS } from "./aiFiles.ts";

const SECRET = "test-secret-not-a-real-key";
const NOW = 1_800_000_000_000;
const FUTURE = NOW + 60_000;
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RUN = "11111111-2222-4333-8444-555555555555";

const fileClaim = (over: Partial<{ a: string; u: string; e: number }> = {}): FileTextClaim => ({ a: "37", u: OWNER, e: FUTURE, ...over });
const pasteClaim = (over: Partial<{ r: string; f: string; u: string; e: number }> = {}): FileTextClaim => ({ r: RUN, f: "memo_text", u: OWNER, e: FUTURE, ...over });

// ── the token ────────────────────────────────────────────────────────────────

test("round trip: both claim shapes come back the same", () => {
  for (const claim of [fileClaim(), pasteClaim()]) {
    assert.deepEqual(verifyFileTextToken(signFileTextToken(claim, SECRET), SECRET, NOW), claim);
  }
});

test("the token is safe in a URL path", () => {
  assert.match(signFileTextToken(pasteClaim(), SECRET), /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
});

test("a token with its last character changed is refused, whichever character replaces it", () => {
  const token = signFileTextToken(fileClaim(), SECRET);
  const last = token.at(-1);
  // Every replacement, because base64url's last character has spare bits: a
  // check on the decoded bytes would accept some of these.
  for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_") {
    if (c === last) continue;
    assert.equal(verifyFileTextToken(token.slice(0, -1) + c, SECRET, NOW), null, c);
  }
});

test("a changed payload is refused, so the file and the owner cannot be swapped", () => {
  const [, sig] = signFileTextToken(fileClaim(), SECRET).split(".");
  const swappedFile = Buffer.from(JSON.stringify(fileClaim({ a: "38" }))).toString("base64url");
  const swappedOwner = Buffer.from(JSON.stringify(fileClaim({ u: OTHER }))).toString("base64url");
  const longer = Buffer.from(JSON.stringify(fileClaim({ e: FUTURE + FILE_TEXT_TTL_MS }))).toString("base64url");
  for (const payload of [swappedFile, swappedOwner, longer]) {
    assert.equal(verifyFileTextToken(`${payload}.${sig}`, SECRET, NOW), null);
  }
});

test("an expired token is refused, at the instant of expiry too", () => {
  const now = NOW;
  assert.equal(verifyFileTextToken(signFileTextToken(fileClaim({ e: now - 1 }), SECRET), SECRET, now), null);
  assert.equal(verifyFileTextToken(signFileTextToken(fileClaim({ e: now }), SECRET), SECRET, now), null);
  assert.ok(verifyFileTextToken(signFileTextToken(fileClaim({ e: now + 1 }), SECRET), SECRET, now));
});

test("another secret is refused; an empty secret neither signs nor verifies", () => {
  const token = signFileTextToken(fileClaim(), SECRET);
  assert.equal(verifyFileTextToken(token, "another-secret", NOW), null);
  assert.equal(verifyFileTextToken(token, "", NOW), null);
  assert.throws(() => signFileTextToken(fileClaim(), ""));
});

test("garbage is refused without a throw", () => {
  for (const bad of ["abc", "", ".", "a.b", "a.b.c", "é.é", "x".repeat(10_000), `${"a".repeat(50)}.${"b".repeat(43)}`]) {
    assert.equal(verifyFileTextToken(bad, SECRET, NOW), null, bad.slice(0, 20));
  }
  assert.equal(verifyFileTextToken(null as never, SECRET, NOW), null);
});

test("a correctly signed payload of the wrong shape is refused", () => {
  const signRaw = (o: unknown) => signFileTextToken(o as FileTextClaim, SECRET);
  for (const bad of [
    { u: OWNER, e: FUTURE },
    { a: "37", e: FUTURE },
    { a: "37", u: OWNER },
    { a: "", u: OWNER, e: FUTURE },
    { a: 37, u: OWNER, e: FUTURE },
    { a: "37", u: "", e: FUTURE },
    { a: "37", u: OWNER, e: "soon" },
    { a: "37", u: OWNER, e: 1.5 + FUTURE },
    { r: RUN, u: OWNER, e: FUTURE },
    { a: "37", r: RUN, f: "memo_text", u: OWNER, e: FUTURE },
    { a: "37", u: OWNER, e: FUTURE, extra: 1 },
    [],
    "text",
  ]) {
    assert.equal(verifyFileTextToken(signRaw(bad), SECRET, NOW), null, JSON.stringify(bad));
  }
});

test("the link lives as long as a storage signed URL", () => {
  assert.equal(FILE_TEXT_TTL_MS, SIGNED_URL_SECONDS * 1000);
  assert.equal(FILE_TEXT_TTL_MS, 15 * 60 * 1000);
});

test("storagePathInOwnFolder: the owner's folder only", () => {
  assert.equal(storagePathInOwnFolder(`${OWNER}/1700-memo.docx`, OWNER), true);
  assert.equal(storagePathInOwnFolder(`${OWNER}/a/b.docx`, OWNER), true);
  for (const bad of [
    `${OTHER}/1700-memo.docx`,
    `${OWNER}/../${OTHER}/x.docx`,
    `${OWNER}/./x.docx`,
    `${OWNER}//x.docx`,
    `${OWNER}/`,
    OWNER,
    `/${OWNER}/x.docx`,
    `${OWNER}x/y.docx`,
    "",
    null,
  ]) {
    assert.equal(storagePathInOwnFolder(bad as string, OWNER), false, String(bad));
  }
});

// ── the handler ──────────────────────────────────────────────────────────────

interface Row {
  id: string;
  owner_user_id: string;
  deleted_at: string | null;
  file_name: string | null;
  storage_path: string | null;
  mime_type: string | null;
}

interface RunRow {
  id: string;
  user_id: string;
  tool: string;
  status: string;
  input: unknown;
}

function fakeAdmin(rows: Row[], runs: RunRow[], objects: Record<string, Uint8Array>, opts: { readError?: boolean; throwOnRead?: boolean } = {}) {
  const buckets: string[] = [];
  const paths: string[] = [];
  const admin = {
    from(table: string) {
      const eqs: Record<string, unknown> = {};
      const isNull: string[] = [];
      const chain = {
        select: () => chain,
        eq: (c: string, v: unknown) => ((eqs[c] = v), chain),
        is: (c: string) => (isNull.push(c), chain),
        maybeSingle: async () => {
          if (opts.throwOnRead) throw new Error("boom");
          if (opts.readError) return { data: null, error: { code: "XX000", message: "down" } };
          if (table === "attachments") {
            const hit = rows.find(
              (r) => r.id === eqs.id && r.owner_user_id === eqs.owner_user_id && (!isNull.includes("deleted_at") || r.deleted_at === null),
            );
            return { data: hit ?? null, error: null };
          }
          if (table === "ai_runs") {
            const hit = runs.find((r) => r.id === eqs.id && r.user_id === eqs.user_id);
            return { data: hit ?? null, error: null };
          }
          throw new Error(`the handler read ${table}`);
        },
      };
      return chain;
    },
    storage: {
      from(bucket: string) {
        buckets.push(bucket);
        return {
          download: async (path: string) => {
            paths.push(path);
            return objects[path] ? { data: new Blob([objects[path] as BlobPart]), error: null } : { data: null, error: { message: "not found" } };
          },
        };
      },
    },
  };
  return { admin: admin as never, buckets, paths };
}

const docx = (text: string) => zipSync({ "word/document.xml": strToU8(`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`) });
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const SECRET_TEXT = "نص سري للاختبار";
const path = (name: string, owner = OWNER) => `${owner}/${name}`;

const row = (over: Partial<Row> = {}): Row => ({
  id: "37",
  owner_user_id: OWNER,
  deleted_at: null,
  file_name: "مذكرة.docx",
  storage_path: path("1-memo.docx"),
  mime_type: DOCX_MIME,
  ...over,
});
const runRow = (over: Partial<RunRow> = {}): RunRow => ({
  id: RUN,
  user_id: OWNER,
  tool: "brief-check",
  status: "running",
  input: { client_capacity: "مدعٍ", memo_text: SECRET_TEXT },
  ...over,
});
const OBJECTS = { [path("1-memo.docx")]: docx(SECRET_TEXT) };
const serve = (token: string, fake: { admin: never }, secret: string | undefined = SECRET, now = NOW) =>
  serveFileText(fake.admin, token, { secret, now });

test("a file claim: the owner's .docx comes back as text, from the documents bucket", async () => {
  const fake = fakeAdmin([row()], [], OBJECTS);
  assert.deepEqual(await serve(signFileTextToken(fileClaim(), SECRET), fake), { status: 200, text: SECRET_TEXT });
  assert.deepEqual(fake.buckets, [AI_FILES_BUCKET]);
  assert.equal(AI_FILES_BUCKET, "documents");
});

test("a pasted claim: the run's own field comes back", async () => {
  const fake = fakeAdmin([], [runRow()], {});
  assert.deepEqual(await serve(signFileTextToken(pasteClaim(), SECRET), fake), { status: 200, text: SECRET_TEXT });
  assert.deepEqual(fake.buckets, [], "no storage read");
});

test("no secret configured: 503, and nothing is read", async () => {
  let touched = false;
  const admin = new Proxy({}, { get: () => ((touched = true), () => ({})) }) as never;
  for (const secret of [undefined, ""]) {
    assert.deepEqual(await serveFileText(admin, "a.b", { secret, now: NOW }), { status: 503 });
  }
  assert.equal(touched, false);
});

test("every refusal is the same 404: nothing tells one reason from another", async () => {
  const objects = { ...OBJECTS, [path("pdf.pdf")]: strToU8("%PDF"), [path("old.doc")]: strToU8("x"), [path("broken.docx")]: new Uint8Array([1, 2, 3]) };
  const cases: Array<[string, Row[], RunRow[], string]> = [
    ["bad signature", [row()], [], signFileTextToken(fileClaim(), "another-secret")],
    ["garbage", [row()], [], "abc"],
    ["expired", [row()], [], signFileTextToken(fileClaim({ e: NOW - 1 }), SECRET)],
    ["no such file", [], [], signFileTextToken(fileClaim(), SECRET)],
    ["another owner's file", [row({ owner_user_id: OTHER })], [], signFileTextToken(fileClaim(), SECRET)],
    ["a token for another owner", [row()], [], signFileTextToken(fileClaim({ u: OTHER }), SECRET)],
    ["a token for another file", [row()], [], signFileTextToken(fileClaim({ a: "38" }), SECRET)],
    ["a file in the bin", [row({ deleted_at: "2026-11-01T00:00:00Z" })], [], signFileTextToken(fileClaim(), SECRET)],
    ["a path in another's folder", [row({ storage_path: path("1-memo.docx", OTHER) })], [], signFileTextToken(fileClaim(), SECRET)],
    ["a traversal path", [row({ storage_path: `${OWNER}/../${OTHER}/1-memo.docx` })], [], signFileTextToken(fileClaim(), SECRET)],
    ["no storage path", [row({ storage_path: null })], [], signFileTextToken(fileClaim(), SECRET)],
    ["a PDF is not text", [row({ mime_type: "application/pdf", storage_path: path("pdf.pdf") })], [], signFileTextToken(fileClaim(), SECRET)],
    ["an old .doc", [row({ mime_type: "application/msword", storage_path: path("old.doc") })], [], signFileTextToken(fileClaim(), SECRET)],
    ["a broken .docx", [row({ storage_path: path("broken.docx") })], [], signFileTextToken(fileClaim(), SECRET)],
    ["a missing object", [row({ storage_path: path("gone.docx") })], [], signFileTextToken(fileClaim(), SECRET)],
    ["no such run", [], [], signFileTextToken(pasteClaim(), SECRET)],
    ["another user's run", [], [runRow({ user_id: OTHER })], signFileTextToken(pasteClaim(), SECRET)],
    ["a finished run", [], [runRow({ status: "succeeded" })], signFileTextToken(pasteClaim(), SECRET)],
    ["a failed run", [], [runRow({ status: "failed" })], signFileTextToken(pasteClaim(), SECRET)],
    ["a field the tool does not paste", [], [runRow({ input: { client_capacity: "سر", memo_text: "م" } })], signFileTextToken(pasteClaim({ f: "client_capacity" }), SECRET)],
    ["wargaming's memo_text is not its pasted field", [], [runRow({ tool: "wargaming", input: { memo_text: "سر", docs_text: "م" } })], signFileTextToken(pasteClaim({ f: "memo_text" }), SECRET)],
    ["a tool with no paste", [], [runRow({ tool: "quick-answer", input: { memo_text: "سر" } })], signFileTextToken(pasteClaim(), SECRET)],
    ["an unknown tool", [], [runRow({ tool: "nope" })], signFileTextToken(pasteClaim(), SECRET)],
    ["an inherited key", [], [runRow({ input: {} })], signFileTextToken(pasteClaim({ f: "constructor" }), SECRET)],
    ["an empty field", [], [runRow({ input: { memo_text: "" } })], signFileTextToken(pasteClaim(), SECRET)],
    ["a non-text field", [], [runRow({ input: { memo_text: { x: 1 } } })], signFileTextToken(pasteClaim(), SECRET)],
    ["input cleared by retention", [], [runRow({ input: null })], signFileTextToken(pasteClaim(), SECRET)],
  ];
  for (const [name, rows, runs, token] of cases) {
    const reply = await serve(token, fakeAdmin(rows, runs, objects));
    assert.deepEqual(reply, { status: 404 }, name);
  }
});

test("a bad token reads nothing at all", async () => {
  const fake = fakeAdmin([row()], [runRow()], OBJECTS);
  const reads: string[] = [];
  const spied = new Proxy(fake.admin as object, {
    get(target, prop, recv) {
      reads.push(String(prop));
      return Reflect.get(target, prop, recv);
    },
  }) as never;
  await serveFileText(spied, signFileTextToken(fileClaim({ e: NOW - 1 }), SECRET), { secret: SECRET, now: NOW });
  await serveFileText(spied, "abc", { secret: SECRET, now: NOW });
  assert.deepEqual(reads, []);
});

test("a read that fails or throws is the same 404", async () => {
  const token = signFileTextToken(fileClaim(), SECRET);
  const logged = muteConsole();
  try {
    assert.deepEqual(await serve(token, fakeAdmin([row()], [], OBJECTS, { readError: true })), { status: 404 });
    assert.deepEqual(await serve(token, fakeAdmin([row()], [], OBJECTS, { throwOnRead: true })), { status: 404 });
  } finally {
    logged.restore();
  }
});

test("the body is capped: a long pasted field is cut at TEXT_FILE_MAX_CHARS", async () => {
  const long = "س".repeat(TEXT_FILE_MAX_CHARS + 5000);
  const fake = fakeAdmin([], [runRow({ input: { memo_text: long } })], {});
  const reply = await serve(signFileTextToken(pasteClaim(), SECRET), fake);
  assert.equal(reply.status, 200);
  assert.equal((reply as { text: string }).text.length, TEXT_FILE_MAX_CHARS);
});

test("a zip bomb through the link is refused, not inflated without limit", async () => {
  const bomb = zipSync({ "word/document.xml": strToU8(" ".repeat(21 * 1024 * 1024)) });
  const fake = fakeAdmin([row()], [], { [path("1-memo.docx")]: bomb });
  assert.deepEqual(await serve(signFileTextToken(fileClaim(), SECRET), fake), { status: 404 });
});

function muteConsole() {
  const seen: string[] = [];
  const originals = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  for (const m of ["log", "info", "warn", "error", "debug"] as const) {
    console[m] = (...args: unknown[]) => void seen.push(args.map((a) => (a instanceof Error ? `${a.name} ${a.message}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  }
  return { seen, restore: () => Object.assign(console, originals) };
}

test("no text and no token reaches a log, on success or on any failure", async () => {
  const goodFile = signFileTextToken(fileClaim(), SECRET);
  const goodPaste = signFileTextToken(pasteClaim(), SECRET);
  const logged = muteConsole();
  try {
    await serve(goodFile, fakeAdmin([row()], [], OBJECTS));
    await serve(goodPaste, fakeAdmin([], [runRow()], {}));
    await serve(goodFile, fakeAdmin([row({ storage_path: path("gone.docx") })], [], OBJECTS));
    await serve(goodFile, fakeAdmin([row()], [], { [path("1-memo.docx")]: new Uint8Array([1, 2, 3]) }));
    await serve(goodFile, fakeAdmin([row()], [], OBJECTS, { readError: true }));
    await serve(goodFile, fakeAdmin([row()], [], OBJECTS, { throwOnRead: true }));
    await serve(goodPaste, fakeAdmin([], [runRow({ status: "failed" })], {}));
    await serve("abc", fakeAdmin([], [], {}));
  } finally {
    logged.restore();
  }
  const all = logged.seen.join("\n");
  assert.ok(!all.includes(SECRET_TEXT), "no extracted or pasted text in a log");
  assert.ok(!all.includes(goodFile) && !all.includes(goodPaste), "no token in a log");
  assert.ok(!all.includes(SECRET), "no secret in a log");
});

// ── the route ────────────────────────────────────────────────────────────────

test("the route: thin, server-only, never cached, and outside every session gate", () => {
  const route = readFileSync(join(process.cwd(), "src", "app", "api", "v1", "ai", "file-text", "[token]", "route.ts"), "utf8");
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /process\.env\.NZAMY_AI_KEY/);
  assert.match(route, /serveFileText\(/);
  assert.match(route, /private, no-store/);
  assert.match(route, /text\/plain; charset=utf-8/);
  assert.match(route, /nosniff/);
  assert.equal(isProtectedApiPath("/api/v1/ai/file-text/abc.def"), false, "n8n has no session");
});
