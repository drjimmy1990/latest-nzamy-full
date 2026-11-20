/**
 * caseBoardsService.test.ts — T18-P1-32 (batch l11): the board switcher on the
 * existing canvas_boards table and routes.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/services/caseBoardsService.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { asCaseBoard, createCaseBoard, deleteCaseBoard, listCaseBoards, renameCaseBoard } from "./caseBoardsService.ts";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const CASE = "cccccccc-dddd-4eee-8fff-000000000001";
const BOARD = "bbbbbbbb-dddd-4eee-8fff-000000000002";

function fakeFetch(status: number, body: unknown, seen: Array<{ url: string; method: string; body?: string }> = []): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    seen.push({ url, method: String(init?.method), body: init?.body as string | undefined });
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
}

test("list / create / rename / delete call the existing routes with the right verbs", async () => {
  const seen: Array<{ url: string; method: string; body?: string }> = [];
  const list = await listCaseBoards(CASE, fakeFetch(200, { data: [{ id: BOARD, name: "الدفوع", updatedAt: "t", createdAt: "c", isOwn: true }, { id: 5 }] }, seen));
  assert.deepEqual(list, { ok: true, value: [{ id: BOARD, name: "الدفوع", updatedAt: "t", createdAt: "c", isOwn: true }] });
  await createCaseBoard(CASE, "الوقائع", fakeFetch(201, { data: { id: BOARD, name: "الوقائع" } }, seen));
  await renameCaseBoard(CASE, BOARD, "الوقائع ٢", fakeFetch(200, { data: { id: BOARD, name: "الوقائع ٢" } }, seen));
  await deleteCaseBoard(CASE, BOARD, fakeFetch(200, { success: true }, seen));
  assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`), [
    `GET /api/v1/lawyer/case-graph/${CASE}/boards`,
    `POST /api/v1/lawyer/case-graph/${CASE}/boards`,
    `PATCH /api/v1/lawyer/case-graph/${CASE}/boards/${BOARD}`,
    `DELETE /api/v1/lawyer/case-graph/${CASE}/boards/${BOARD}`,
  ]);
  assert.equal(seen[1].body, JSON.stringify({ name: "الوقائع" }));
});

test("the server's own message comes back; a broken answer or network is a plain failure, never a throw", async () => {
  assert.deepEqual(await createCaseBoard(CASE, "x", fakeFetch(409, { error: "توجد لوحة بهذا الاسم في هذه القضية" })), { ok: false, error: "توجد لوحة بهذا الاسم في هذه القضية" });
  assert.deepEqual(await deleteCaseBoard(CASE, BOARD, fakeFetch(404, { error: "يحذف اللوحة منشئها فقط" })), { ok: false, error: "يحذف اللوحة منشئها فقط" });
  assert.equal((await listCaseBoards(CASE, fakeFetch(200, { data: "x" }))).ok, false);
  const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  assert.equal((await renameCaseBoard(CASE, BOARD, "x", down)).ok, false);
  assert.equal(asCaseBoard({ id: BOARD, name: "ن" })?.isOwn, false);
});

test("the map loads and saves the chosen board; the default board is unchanged; both case files mount the switcher", () => {
  const svc = read("src/lib/services/caseGraphService.ts");
  assert.match(svc, /return boardId \? `\$\{base\}\/boards\/\$\{encodeURIComponent\(boardId\)\}` : base;/);
  assert.match(svc, /return boardId \? `\$\{caseId\}::\$\{boardId\}` : caseId;/, "each board has its own save queue and version");
  const view = read("src/app/dashboard/business/kanban/CaseGraphView.tsx");
  assert.match(view, /getCaseGraph\(caseId, boardRef\.current\)/);
  assert.match(view, /saveCaseGraph\(caseId, p, boardRef\.current\)/);
  assert.match(view, /nzamy:case-graph-draft:\$\{userId\}:\$\{caseId\}\$\{boardId \? `:\$\{boardId\}` : ""\}/, "a board's unsaved draft is its own");
  const lawyer = read("src/app/dashboard/lawyer/cases/[id]/page.tsx");
  assert.equal(lawyer.match(/key=\{`\$\{graphBoard \?\? "main"\}:\$\{graphBoardRev\}`\}[^\n]*boardId=\{graphBoard\}/g)?.length, 2, "inline and fullscreen show the same board");
  assert.match(lawyer, /<CaseBoardSwitcher caseId=\{id\}/);
  const firm = read("src/app/dashboard/firm/cases/[id]/LegalCanvas.tsx");
  assert.match(firm, /<CaseBoardSwitcher caseId=\{caseId\}/);
  assert.match(firm, /boardId=\{board\}/);
  const sw = read("src/app/dashboard/business/kanban/CaseBoardSwitcher.tsx");
  assert.match(sw, /<option value="">اللوحة الرئيسية<\/option>/);
  assert.match(sw, /current\?\.isOwn && \(/, "delete is offered to the board's creator only");
  assert.match(sw, /if \(isDemoMode\) return null;/);
});
