/**
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/app/api/v1/lawyer/case-graph/[caseId]/boards/_boards.test.ts"
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { boardWriteError, checkBoardName, isBoardId, toBoardDto, BOARD_NAME_MAX } from "./_boards.ts";

test("names: trimmed, collapsed, 1–80 characters", () => {
  assert.deepEqual(checkBoardName("  خريطة   الأطراف "), { ok: true, name: "خريطة الأطراف" });
  assert.equal(checkBoardName("   ").ok, false);
  assert.equal(checkBoardName(5).ok, false);
  assert.equal(checkBoardName("س".repeat(BOARD_NAME_MAX)).ok, true);
  assert.equal(checkBoardName("س".repeat(BOARD_NAME_MAX + 1)).ok, false);
});

test("ids are uuids; database answers map to the route's", () => {
  assert.ok(isBoardId("0f000000-0000-0000-0000-0000000000a1"));
  assert.ok(!isBoardId("x'; drop"));
  assert.equal(boardWriteError({ code: "23505" }).code, "board_name_taken");
  assert.equal(boardWriteError({ code: "P0001", message: "canvas_boards: at most 20 boards per case" }).code, "board_limit");
  assert.equal(boardWriteError({ code: "42501" }).status, 403);
  assert.equal(boardWriteError({ code: "XX000" }).status, 500);
  assert.deepEqual(toBoardDto({ id: "b", case_request_id: "c", name: "n", updated_at: "u", created_at: "c1", owner_user_id: "me" }, "me").isOwn, true);
});

test("the routes run on the caller's RLS client, never the service role, and keep the default board's roles", () => {
  const dir = join(process.cwd(), "src/app/api/v1/lawyer/case-graph/[caseId]/boards");
  for (const f of ["route.ts", "[boardId]/route.ts"]) {
    const src = readFileSync(join(dir, f), "utf8");
    assert.ok(!src.includes("createServiceClient"), f);
    assert.ok(src.includes(`assertRole(["lawyer", "firm", "corporate"])`), f);
    assert.ok(src.includes(`.from("canvas_boards")`), f);
  }
  assert.ok(readFileSync(join(dir, "[boardId]/route.ts"), "utf8").includes(`.eq("updated_at", body.baseUpdatedAt)`), "compare-and-set");
});
