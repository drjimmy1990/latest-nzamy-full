/**
 * libraryHistory.test.ts — owner L3: the library assistant's conversations
 * listed from ai_runs, own rows only (the route reads with the service role,
 * so its user filter is the access rule), grouped by conversation.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/libraryHistory.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupLibraryConversations, LIBRARY_HISTORY_COLUMNS, LIBRARY_HISTORY_SLUG } from "./libraryHistory.ts";

const C1 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const C2 = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const row = (cid: string | null, q: string, a: string, at: string, citations: unknown = []) => ({
  id: `r-${q}`,
  conversation_id: cid,
  input: { message: q, article_id: null, law_slug: "labor-law" },
  output: { reply: a },
  citations,
  created_at: at,
});

test("rows newest first → conversations newest first, turns oldest first; a pre-conversation row stands alone", () => {
  const rows = [
    row(C1, "س٣", "ج٣", "2026-11-17T10:03:00Z"),
    row(C2, "ب١", "د١", "2026-11-17T10:02:00Z"),
    row(C1, "س٢", "ج٢", "2026-11-17T10:01:00Z"),
    row(null, "قديم", "جواب قديم", "2026-11-01T10:00:00Z"),
    row(C1, "س١", "ج١", "2026-11-17T10:00:00Z"),
  ];
  const out = groupLibraryConversations(rows);
  assert.deepEqual(out.map((c) => c.conversationId), [C1, C2, null]);
  assert.deepEqual(out[0].turns.map((t) => t.question), ["س١", "س٢", "س٣"]);
  assert.equal(out[0].updatedAt, "2026-11-17T10:03:00Z");
  assert.deepEqual(out[2].turns.map((t) => t.answer), ["جواب قديم"]);
});

test("the limit counts conversations; a row with no question or answer (retention cleared it) is skipped", () => {
  const rows = [
    row(C1, "س", "ج", "2026-11-17T10:03:00Z"),
    { ...row(C2, "x", "y", "2026-11-17T10:02:00Z"), input: null },
    row(null, "ق١", "ج", "2026-11-17T10:01:00Z"),
    row(null, "ق٢", "ج", "2026-11-17T10:00:00Z"),
  ];
  const out = groupLibraryConversations(rows, 2);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((c) => c.turns[0].question), ["س", "ق١"]);
});

test("citations leave as links only (sid / kind / id / title / url), never anything else a row may hold", () => {
  const out = groupLibraryConversations([
    row(C1, "س", "ج", "2026-11-17T10:00:00Z", [
      { sid: "S1", kind: "article", id: "labor-law__art-80", title: "نظام العمل — الثمانون", url: "/laws/labor-law#labor-law__art-80", text: "نص المادة" },
      { sid: "S2", title: "بلا رابط" },
      "junk",
    ]),
  ]);
  assert.deepEqual(out[0].turns[0].citations, [
    { sid: "S1", kind: "article", id: "labor-law__art-80", title: "نظام العمل — الثمانون", url: "/laws/labor-law#labor-law__art-80" },
  ]);
});

test("the route: signed in, own rows only, this tool and law, succeeded, no hidden columns, never cached", () => {
  const src = readFileSync(new URL("../../app/api/v1/ai/library-history/route.ts", import.meta.url), "utf8");
  assert.match(src, /const auth = await requireApiUser\(supabase/);
  assert.match(src, /\.eq\("user_id", auth\.user\.id\)/);
  assert.match(src, /\.eq\("tool", LIBRARY_HISTORY_TOOL\)/);
  assert.match(src, /\.eq\("status", "succeeded"\)/);
  assert.match(src, /\.eq\("input->>law_slug", law\)/);
  assert.match(src, /"Cache-Control": "private, no-store"/);
  assert.match(src, /if \(!LIBRARY_HISTORY_SLUG\.test\(law\)\)/);
  assert.doesNotMatch(LIBRARY_HISTORY_COLUMNS, /source_ids|usage|model|user_id|\*/);
  assert.ok(LIBRARY_HISTORY_SLUG.test("labor-law"));
  assert.ok(LIBRARY_HISTORY_SLUG.test("نظام-العمل"));
  for (const bad of ["", "a b", "../x", "x".repeat(201), "a,b", "a)"]) assert.ok(!LIBRARY_HISTORY_SLUG.test(bad), bad);
});
