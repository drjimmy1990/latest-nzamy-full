/**
 * S5-B10: a screen reader announces a change inside a live region that already
 * exists, so a role="status" element mounts before its message and stays. The
 * .tsx files cannot load under `node --test`, so this reads them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(`../../app/${rel}`, import.meta.url), "utf8");

test("live regions are mounted before their message", () => {
  const activity = read("dashboard/lawyer/activity/page.tsx");
  assert.doesNotMatch(activity, /\{activeCardLabel\s*&&\s*\([\s\S]{0,900}role="status"/);
  assert.match(activity, /role="status"[^>]*>\{activeCardLabel \?/);

  const panel = read("dashboard/admin/security/LibraryActivityPanel.tsx");
  assert.doesNotMatch(panel, /\{notice && \(\s*<div\s+role="status"/);
  assert.match(panel, /<div role="status"[^>]*>\s*\{notice && \(/);

  const graph = read("dashboard/business/kanban/CaseGraphView.tsx");
  assert.doesNotMatch(graph, /\{aiCard\.note && \(\s*<span role="status"/);
  assert.match(graph, /<span role="status"[\s\S]{0,300}>\s*\{aiCard\.note\}\s*<\/span>/);
});

test("an empty live region stays in the accessibility tree: visually hidden, never display:none", () => {
  for (const rel of ["dashboard/lawyer/activity/page.tsx", "dashboard/admin/security/LibraryActivityPanel.tsx", "dashboard/business/kanban/CaseGraphView.tsx"]) {
    const src = read(rel);
    for (const m of src.matchAll(/role="status"[^>]*>/g)) {
      assert.doesNotMatch(m[0], /\bhidden\b|\bcontents\b/, `${rel}: ${m[0]}`);
    }
  }
});
