/**
 * linkCheck.test.ts — owner file 10 ب34 (batch l12): the daily broken-reference
 * check — when the admins are told, what the panel may draw, and the two
 * routes' contracts (cron secret first, staff read, never text).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/linkCheck.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { linkCheckAlertText, parseLinkCheckHistory, shouldAlertLinkCheck } from "./linkCheck.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("alert: only when something is broken and the count did not fall", () => {
  assert.equal(shouldAlertLinkCheck(0, null), false);
  assert.equal(shouldAlertLinkCheck(3, null), true, "first check");
  assert.equal(shouldAlertLinkCheck(3, 3), false, "same as yesterday: no daily repeat");
  assert.equal(shouldAlertLinkCheck(4, 3), true, "more than yesterday");
  assert.equal(shouldAlertLinkCheck(2, 3), false, "fewer: the team is fixing them");
  assert.equal(shouldAlertLinkCheck(Number.NaN, null), false);
  const t = linkCheckAlertText(12);
  assert.match(t.body, /١٢/);
  assert.equal(t.href, "/dashboard/admin/graph-explorer");
  assert.doesNotMatch(t.title + t.body, /[A-Za-z]/, "plain Arabic");
});

test("history: malformed rows and keys are dropped or zeroed", () => {
  const rows = parseLinkCheckHistory([
    {
      id: 7,
      checked_at: "2026-11-21T01:10:00Z",
      broken: 2,
      by_reason: { article_gone: 2, "bad key!": 9 },
      owner_edges: { resolved: 10, resolved_doc: 3 },
      sample: [{ node_key: "article:x", node_type: "article", title: "x".repeat(300), law_slug: "l", reason: "article_gone", links: 4 }, { title: "no key" }, null],
    },
    { id: 8 },
    null,
    "garbage",
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].by_reason, { article_gone: 2 });
  assert.equal(rows[0].sample.length, 1);
  assert.equal(rows[0].sample[0].title.length, 160);
  assert.deepEqual(parseLinkCheckHistory(null), []);
});

test("routes: the cron fails closed on its secret, tolerates the missing schema, tells the admins once", () => {
  const cron = read("../../app/api/v1/cron/library-link-check/route.ts");
  assert.match(cron, /if \(!cronSecretMatches\(request\.headers\.get\("x-cron-secret"\), process\.env\.CRON_SECRET\)\) \{\s*return NextResponse\.json\(\{ error: "unauthorized" \}, \{ status: 401 \}\);/);
  assert.match(cron, /admin\.rpc\("graph_rag_link_check_run", \{ p_sample: LINK_CHECK_SAMPLE \}\)/);
  assert.match(cron, /return NextResponse\.json\(\{ skipped: "schema_missing" \}\);/);
  assert.match(cron, /if \(shouldAlertLinkCheck\(broken, previous\)\)/);
  assert.match(cron, /library_monitor_notify_admins/);
  const admin = read("../../app/api/v1/admin/library-link-check/route.ts");
  assert.match(admin, /const gate = await requireStaff\("read"\);\s*if \(!gate\.ok\) return gate\.response;/);
  assert.match(admin, /graph_rag_link_check_history/);
  const sidebar = read("../../components/admin/graphExplorer/ExplorerSidebar.tsx");
  assert.match(sidebar, /<LivePanel \/>\s*<LinkCheckPanel \/>/, "the list sits in the explorer's status tab");
});
