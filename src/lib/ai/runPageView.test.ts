/**
 * runPageView.test.ts — what /ai/runs/[id] shows for each stored status, plus
 * the source checks that keep the page behind the proxy and behind the route's
 * visibility rules (runVisibility.ts).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/runPageView.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RUN_HELD_MESSAGE_AR, runPageView, runStatusLabelAr } from "./runPageView.ts";
import { runForViewer } from "./runVisibility.ts";

test("succeeded: the output's blocks", () => {
  assert.deepEqual(runPageView({ status: "succeeded", output: { summary: "س" } }), {
    kind: "output",
    blocks: [{ heading: "الخلاصة", paragraphs: ["س"], items: [] }],
    message: null,
  });
});

test("succeeded with no stored output (the 90-day retention cleared it): says so, not a blank page", () => {
  const v = runPageView({ status: "succeeded", output: null });
  assert.equal(v.kind, "output");
  assert.deepEqual(v.blocks, []);
  assert.equal(v.message, "لم يعد ناتج هذا الطلب محفوظاً");
});

test("a legacy review row: held for its owner, with the exact copy and no promise of an alert (R30)", () => {
  // The output the route would return to the owner, through the real rule.
  const owner = runForViewer({ status: "review", output: { summary: "سر" }, citations: [] }, false);
  const v = runPageView(owner);
  assert.equal(v.kind, "held");
  assert.equal(v.message, "هذه النتيجة محجوبة بانتظار قرار فريق نظامي");
  assert.equal(RUN_HELD_MESSAGE_AR, "هذه النتيجة محجوبة بانتظار قرار فريق نظامي");
  assert.doesNotMatch(v.message ?? "", /تنبيه/);
  assert.deepEqual(v.blocks, [], "the held output never reaches the page's blocks");
});

test("a legacy review row seen by an admin: the rule keeps the output (للأدمن: يظهر الناتج دائماً)", () => {
  const admin = runForViewer({ status: "review", output: { summary: "سر" }, citations: [] }, true);
  const v = runPageView(admin);
  assert.equal(v.kind, "held");
  assert.deepEqual(v.blocks, [{ heading: "الخلاصة", paragraphs: ["سر"], items: [] }]);
});

test("failed: the refund message follows refunded_at, and an uncharged credit run claims no refund", () => {
  const refunded = runPageView({ status: "failed", error_code: "model_error", refunded_at: "2026-11-05T00:00:00Z" });
  assert.deepEqual(refunded, { kind: "failed", blocks: [], message: "تعذّر إكمال الطلب، وأُعيدت نقاطك" });
  const uncharged = runPageView({ status: "failed", error_code: "model_error", refunded_at: null });
  assert.equal(uncharged.message, "تعذّر إكمال الطلب");
});

test("failed: never renders an output even if one is stored", () => {
  assert.deepEqual(runPageView({ status: "failed", output: { summary: "س" } }).blocks, []);
});

test("running, and an unknown status: no output shown", () => {
  assert.equal(runPageView({ status: "running", output: { summary: "س" } }).kind, "running");
  assert.deepEqual(runPageView({ status: "running", output: { summary: "س" } }).blocks, []);
  assert.equal(runPageView({ status: "نوع جديد", output: { summary: "س" } }).kind, "running");
});

test("runStatusLabelAr: each stored status has a label", () => {
  for (const s of ["running", "review", "succeeded", "failed"]) assert.ok(runStatusLabelAr(s).length > 0, s);
});

test("/ai/runs is a protected page prefix (R29): a signed-out visitor reaches the login page", () => {
  const proxy = readFileSync(join(process.cwd(), "src", "proxy.ts"), "utf8");
  const list = /const PROTECTED = \[([\s\S]*?)\];/.exec(proxy);
  assert.ok(list);
  assert.match(list[1], /"\/ai\/runs"/);
});

test("the page reads the run only through the route that applies runVisibility", () => {
  const page = readFileSync(join(process.cwd(), "src", "app", "ai", "runs", "[id]", "page.tsx"), "utf8");
  assert.match(page, /\/api\/v1\/ai\/runs\/\$\{/);
  assert.doesNotMatch(page, /supabase/i, "never reads ai_runs from the browser client");
  assert.doesNotMatch(page, /سيصلك تنبيه/, "no alert exists (R30)");
});
