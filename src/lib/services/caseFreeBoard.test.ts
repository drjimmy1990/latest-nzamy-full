/**
 * caseFreeBoard.test.ts — owner ١٨٩ (ب), batch l13: the free board «لوحة» of a
 * case — the save check, the client, and the wiring that only shows in source.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/services/caseFreeBoard.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkFreeBoard, FREE_BOARD_LIMITS, newFreeBoardId } from "./caseFreeBoard.ts";
import { _resetFreeBoardVersions, getFreeBoard, saveFreeBoard } from "./caseFreeBoardService.ts";
import { GraphSaveError } from "./caseGraphAutosave.ts";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const card = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: "عنوان", text: "نص", color: "sky", x: 10, y: 20, ...extra });

// ── the save check ───────────────────────────────────────────────────────────
test("a valid board passes unchanged; positions are rounded and kept on the board", () => {
  const r = checkFreeBoard({ cards: [card("c-1", { x: 10.6, y: -99999 }), card("c-2")], links: [{ id: "l-1", from: "c-1", to: "c-2" }] });
  assert.ok(r.ok);
  assert.deepEqual(r.board.cards[0], { id: "c-1", title: "عنوان", text: "نص", color: "sky", x: 11, y: -FREE_BOARD_LIMITS.coord });
  assert.equal(r.board.links.length, 1);
});

test("refused: not two lists, too many cards, bad or repeated ids, unknown colour, long text, bad position", () => {
  assert.equal(checkFreeBoard(null).ok, false);
  assert.equal(checkFreeBoard({ cards: [] }).ok, false);
  assert.equal(checkFreeBoard({ cards: {}, links: [] }).ok, false);
  const many = Array.from({ length: FREE_BOARD_LIMITS.cards + 1 }, (_, i) => card(`c-${i}`));
  assert.equal(checkFreeBoard({ cards: many, links: [] }).ok, false);
  assert.equal(checkFreeBoard({ cards: [card("bad id!")], links: [] }).ok, false);
  assert.equal(checkFreeBoard({ cards: [card("c-1"), card("c-1")], links: [] }).ok, false);
  assert.equal(checkFreeBoard({ cards: [card("c-1", { color: "red" })], links: [] }).ok, false);
  assert.equal(checkFreeBoard({ cards: [card("c-1", { title: "x".repeat(FREE_BOARD_LIMITS.title + 1) })], links: [] }).ok, false);
  assert.equal(checkFreeBoard({ cards: [card("c-1", { text: "x".repeat(FREE_BOARD_LIMITS.text + 1) })], links: [] }).ok, false);
  assert.equal(checkFreeBoard({ cards: [card("c-1", { x: "1" })], links: [] }).ok, false);
  assert.equal(checkFreeBoard({ cards: [card("c-1", { y: Number.NaN })], links: [] }).ok, false);
  const r = checkFreeBoard({ cards: [card("c-1", { color: "red" })], links: [] });
  assert.ok(!r.ok && /لون/.test(r.error), "the refusal says why, in Arabic");
});

test("lines to a missing card, to the same card, repeated (either way) or with a bad id are dropped", () => {
  const r = checkFreeBoard({
    cards: [card("a"), card("b"), card("c")],
    links: [
      { id: "l1", from: "a", to: "b" },
      { id: "l2", from: "b", to: "a" },   // same pair, other way
      { id: "l3", from: "a", to: "a" },   // self
      { id: "l4", from: "a", to: "zz" },  // missing card
      { id: "bad id", from: "b", to: "c" },
      { id: "l1", from: "b", to: "c" },   // repeated id
      { id: "l5", from: "c", to: "b" },
    ],
  });
  assert.ok(r.ok);
  assert.deepEqual(r.board.links.map((l) => l.id), ["l1", "l5"]);
});

test("a board over the byte cap is refused with a plain Arabic reason (never sent, never retried)", async () => {
  // 240 cards × 2,000 Arabic letters ≈ 960 KB of UTF-8 — under the card and text caps, over the board cap.
  const big = Array.from({ length: 240 }, (_, i) => card(`c-${i}`, { text: "ع".repeat(FREE_BOARD_LIMITS.text) }));
  const r = checkFreeBoard({ cards: big, links: [] });
  assert.ok(!r.ok && /امتلأت اللوحة/.test(r.error));
  assert.ok(!r.ok && !/[0-9]/.test(r.error));
  _resetFreeBoardVersions();
  const seen: Seen[] = [];
  const f = fakeFetch([{ status: 200, body: { data: null } }], seen);
  await getFreeBoard("SR-big", f);
  await assert.rejects(saveFreeBoard("SR-big", { cards: big as never, links: [] }, f),
    (e: unknown) => e instanceof GraphSaveError && e.kind === "fatal" && /امتلأت/.test(e.message));
  assert.equal(seen.length, 1, "only the read went out");
});

test("limit messages use Arabic digits", () => {
  const r = checkFreeBoard({ cards: [card("c-1", { title: "x".repeat(FREE_BOARD_LIMITS.title + 1) })], links: [] });
  assert.ok(!r.ok && r.error.includes("١٢٠") && !/[0-9]/.test(r.error));
});

test("new ids pass the id rule", () => {
  const r = checkFreeBoard({ cards: [card(newFreeBoardId("c")), card(newFreeBoardId("c"))], links: [] });
  assert.ok(r.ok);
});

// ── the client ───────────────────────────────────────────────────────────────
type Seen = { url: string; method: string; body?: string };
function fakeFetch(answers: Array<{ status: number; body: unknown }>, seen: Seen[]): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    seen.push({ url, method: String(init?.method ?? "GET"), body: init?.body as string | undefined });
    const a = answers.shift() ?? { status: 500, body: {} };
    return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body } as Response;
  }) as unknown as typeof fetch;
}
const EMPTY = { cards: [], links: [] };

test("a save before any read is refused locally — an unread board is never written", async () => {
  _resetFreeBoardVersions();
  const seen: Seen[] = [];
  await assert.rejects(saveFreeBoard("SR-1", EMPTY, fakeFetch([], seen)), (e: unknown) => e instanceof GraphSaveError && e.kind === "fatal");
  assert.equal(seen.length, 0);
});

test("read null → save with baseUpdatedAt null → next save carries the returned version", async () => {
  _resetFreeBoardVersions();
  const seen: Seen[] = [];
  const f = fakeFetch([
    { status: 200, body: { data: null } },
    { status: 200, body: { success: true, updatedAt: "2026-11-23T10:00:00.123456+00:00" } },
    { status: 200, body: { success: true, updatedAt: "2026-11-23T10:00:05.000001+00:00" } },
  ], seen);
  assert.equal(await getFreeBoard("SR/1", f), null);
  assert.equal(seen[0].url, "/api/v1/lawyer/case-board/SR%2F1");
  await saveFreeBoard("SR/1", EMPTY, f);
  assert.equal(JSON.parse(seen[1].body!).baseUpdatedAt, null);
  await saveFreeBoard("SR/1", EMPTY, f);
  assert.equal(JSON.parse(seen[2].body!).baseUpdatedAt, "2026-11-23T10:00:00.123456+00:00", "the exact string, microseconds kept");
});

test("a failed read throws (the board must not open for editing)", async () => {
  _resetFreeBoardVersions();
  await assert.rejects(getFreeBoard("SR-2", fakeFetch([{ status: 404, body: { error: "x" } }], [])), /x/);
  await assert.rejects(getFreeBoard("SR-2", fakeFetch([{ status: 500, body: {} }], [])));
});

test("409: the same board on the server is not a conflict; a different one is", async () => {
  _resetFreeBoardVersions();
  const board = { cards: [{ id: "a", title: "t", text: "", color: "amber" as const, x: 0, y: 0 }], links: [] };
  const same = fakeFetch([
    { status: 200, body: { data: null } },
    { status: 409, body: { code: "board_conflict" } },
    { status: 200, body: { data: { ...board, updatedAt: "v2" } } },
  ], []);
  await getFreeBoard("SR-3", same);
  await saveFreeBoard("SR-3", board, same);

  _resetFreeBoardVersions();
  const other = fakeFetch([
    { status: 200, body: { data: null } },
    { status: 409, body: { error: "تغيّرت", code: "board_conflict" } },
    { status: 200, body: { data: { cards: [], links: [], updatedAt: "v9" } } },
  ], []);
  await getFreeBoard("SR-4", other);
  await assert.rejects(saveFreeBoard("SR-4", board, other), (e: unknown) => e instanceof GraphSaveError && e.kind === "conflict");
});

test("network errors and 5xx retry; 4xx refusals stop", async () => {
  _resetFreeBoardVersions();
  const f = fakeFetch([{ status: 200, body: { data: null } }, { status: 503, body: {} }, { status: 400, body: { error: "صيغة" } }], []);
  await getFreeBoard("SR-5", f);
  await assert.rejects(saveFreeBoard("SR-5", EMPTY, f), (e: unknown) => e instanceof GraphSaveError && e.kind === "retryable");
  await assert.rejects(saveFreeBoard("SR-5", EMPTY, f), (e: unknown) => e instanceof GraphSaveError && e.kind === "fatal");
});

// ── wiring ───────────────────────────────────────────────────────────────────
const route = read("src/app/api/v1/lawyer/case-board/[caseId]/route.ts");
const board = read("src/components/dashboard/caseBoard/CaseFreeBoard.tsx");
const lawyer = read("src/app/dashboard/lawyer/cases/[id]/page.tsx");
const firm = read("src/app/dashboard/firm/cases/[id]/page.tsx");
const mig = read("supabase/migrations/20261203_60_case_free_board.sql");

test("the route asks the case's rule, uses the caller's RLS client, checks every save", () => {
  // D-52 (l16): a firm member reaches it too (assertCaseWorker); the case rule still decides
  assert.match(route, /assertCaseWorker\(\)/);
  assert.equal((route.match(/rpc\("case_board_open"/g) ?? []).length, 1);
  assert.equal((route.match(/await canOpen\(supabase, caseId\)/g) ?? []).length, 2, "GET and PUT both ask");
  assert.match(route, /const checked = checkFreeBoard\(body\)/);
  assert.doesNotMatch(route, /createAdminClient|service_role|SERVICE_ROLE|upsert\(/);
  assert.match(route, /\.eq\("updated_at", baseUpdatedAt\)/, "compare-and-set on the version");
  assert.equal((route.match(/code === "23514"\) return NextResponse\.json\(TOO_BIG, \{ status: 400 \}\)/g) ?? []).length, 2,
    "a database size refusal is a 400 with a reason (update and insert), never a retryable 500");
  assert.doesNotMatch(route, /caseId required|must be a string/, "no English text reaches the lawyer");
});

test("the board: no AI, no sample content, an honest empty state, saved only after a read", () => {
  assert.doesNotMatch(board, /askCanvas|_graph-ai-card|aiToolPrice|CaseGraphOverlays|from "@\/lib\/ai/);
  assert.doesNotMatch(board, /MOCK_|SAMPLE_|DEMO_/);
  assert.match(board, /اللوحة فارغة/);
  assert.match(board, /if \(phase !== "ready"\) return;\s*const ctl = new GraphAutosave/);
  assert.match(board, /void ctl\.dispose\(\)/, "leaving the tab sends what is unsaved");
  assert.match(board, /from "@xyflow\/react"/);
});

test("lawyer + firm case files: «لوحة» sits beside «خريطة القضية», the map untouched", () => {
  assert.match(lawyer, /\{ id: "graph",\s+label: "خريطة القضية", icon: Graph, group: "file" \},\n.*\n\s+\{ id: "board",\s+label: "لوحة",\s+icon: NotePencil, group: "file" \}/);
  assert.match(lawyer, /activeTab === "board" && \(\s*<div[^>]*>\s*<CaseFreeBoard caseId=\{id\} isDark=\{isDark\} \/>/);
  assert.match(lawyer, /<CaseGraphView key=\{`\$\{graphBoard \?\? "main"\}:\$\{graphBoardRev\}`\}/, "the map is still mounted as before");
  assert.match(firm, /"canvas" \| "board"/);
  assert.match(firm, /\{ id: "board",\s+label: "لوحة",\s+icon: NotePencil \}/);
  assert.match(firm, /activeTab === "canvas" && \(\s*<LegalCanvas caseId=\{id\} \/>/);
  assert.match(firm, /<CaseFreeBoard caseId=\{id\} isDark=\{isDark\} \/>/);
});

test("the migration: invoker rule with both halves, no delete grant, ends with the verify notice + summary", () => {
  assert.match(mig, /security invoker/);
  assert.match(mig, /exists \(select 1 from public\.service_requests sr where sr\.id = p_request\)\s*and coalesce\(public\.is_case_worker\(p_request\), false\)/);
  assert.doesNotMatch(mig, /grant (select, )?insert, update, delete/i);
  assert.match(mig, /raise notice '20261203_60 verify: OK'/);
  assert.match(mig, /select '20261203_60 [^']+' as migration, true;\s*$/);
});
