/**
 * runVisibility.test.ts — who sees a stored AI run's output now that "review"
 * mode is retired (Wave 1 Task 3, R4; fix round 1).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/runVisibility.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeDb } from "../payments/fakeDb.test-helper.ts";
import { runForViewer, staffMaySeeRunOutput, viewerIsAdmin } from "./runVisibility.ts";

const RUN = "11111111-2222-4333-8444-555555555555";
const APP = join(import.meta.dirname, "../../app");

test("runForViewer: a stored review row is hidden from its owner, never from an admin", () => {
  const row = { id: RUN, status: "review", output: { text: "x" }, citations: [{ sid: "s1" }] };
  assert.deepEqual(runForViewer(row, false), { ...row, output: null, citations: [] });
  assert.equal(runForViewer(row, true), row);
  const done = { ...row, status: "succeeded" };
  assert.equal(runForViewer(done, false), done);
});

test("viewerIsAdmin: only a read that says admin is an admin; every failure is closed", async () => {
  const answer = (r: { data?: unknown; error?: { code: string; message: string } }) =>
    fakeDb((q) => (q.table === "profiles" ? r : {})).client;
  assert.equal(await viewerIsAdmin(answer({ data: { user_type: "admin" } }), "u-1"), true);
  assert.equal(await viewerIsAdmin(answer({ data: { user_type: "lawyer" } }), "u-1"), false);
  assert.equal(await viewerIsAdmin(answer({ data: null }), "u-1"), false, "no profile row");
  assert.equal(
    await viewerIsAdmin(answer({ data: { user_type: "admin" }, error: { code: "XX000", message: "down" } }), "u-1"),
    false,
    "a read error is not an admin, whatever data came back",
  );
  const throwing = { from: () => { throw new Error("boom"); } } as never;
  assert.equal(await viewerIsAdmin(throwing, "u-1"), false, "a throw is not an admin");
  const { client, log } = fakeDb(() => ({ data: { user_type: "admin" } }));
  await viewerIsAdmin(client, "u-9");
  assert.deepEqual(log[0].filters, [["eq", "id", "u-9"]], "the viewer's own profile is read");
});

test("staffMaySeeRunOutput: review + settings.write (super_admin) only", () => {
  assert.equal(staffMaySeeRunOutput("review", "super_admin"), true);
  for (const status of ["succeeded", "failed", "running", undefined]) {
    assert.equal(staffMaySeeRunOutput(status, "super_admin"), false, String(status));
  }
  // Read-only roles: the route's gate answers 403 first; the rule says no as well.
  assert.equal(staffMaySeeRunOutput("review", "operations"), false);
  assert.equal(staffMaySeeRunOutput("review", "auditor"), false);
  assert.equal(staffMaySeeRunOutput("review", null), false);
});

test("admin ai-runs/[id]: settings.write gate before the read, output only through the rule", () => {
  const src = readFileSync(join(APP, "api/v1/admin/ai-runs/[id]/route.ts"), "utf8");
  const gateAt = src.indexOf('await requireStaff("settings.write")');
  const readAt = src.indexOf('.from("ai_runs")');
  assert.ok(gateAt > -1, "the super-admin gate is missing");
  assert.ok(readAt > gateAt, "the gate runs before the read");
  assert.ok(src.includes("createServiceClient()"));
  assert.ok(src.includes("staffMaySeeRunOutput(meta.status, gate.role)"), "output rides only on the pure rule");
  assert.doesNotMatch(src, /export async function (POST|PATCH|PUT|DELETE)/, "read-only route");
  for (const path of ["api/v1/ai/runs/route.ts", "api/v1/ai/runs/[id]/route.ts"]) {
    const user = readFileSync(join(APP, path), "utf8");
    assert.ok(user.includes("viewerIsAdmin(supabase, auth.user.id)"), `${path}: the shared fail-closed read`);
    assert.ok(user.includes("runForViewer("), path);
  }
});
