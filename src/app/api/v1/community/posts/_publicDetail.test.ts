import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { publicDetail } from "./_feed.ts";

test("the public question page carries no author ids, no metadata and no profile slug (owner ٤٢: names hidden), for the post or its answers", () => {
  const out = publicDetail({
    id: "p1", title: "t", author_id: "u1", metadata: { ip: "x" }, reviewed_at: "2026-11-19",
    answers: [{ id: "a1", body: "b", author_id: "u2", metadata: {}, lawyerSlug: "s", verifiedOffice: true }],
  });
  assert.deepEqual(out, { id: "p1", title: "t", answers: [{ id: "a1", body: "b", verifiedOffice: true }] });
});

test("the detail route answers 404 only for a missing row, 500 for a failed read, and returns publicDetail", () => {
  const src = readFileSync(new URL("./[id]/route.ts", import.meta.url), "utf8");
  assert.match(src, /if \(error\.code === "PGRST116"\) \{\s*return NextResponse\.json\(\{ error: "هذا السؤال غير موجود" \}, \{ status: 404 \}\);/);
  assert.match(src, /return NextResponse\.json\(\{ error: "تعذّر تحميل السؤال" \}, \{ status: 500 \}\);/);
  assert.match(src, /data: publicDetail\(cleanDetail\(/);
});

test("the question page never carries search_fts — the index of the UNREDACTED text", () => {
  const out = publicDetail({
    id: "p1", search_fts: "'0501234567':5 'اتصل':4", isMine: false,
    answers: [{ id: "a1", body: "b", search_fts: "x" }],
  });
  assert.equal("search_fts" in out, false);
  assert.equal("search_fts" in (out.answers as Record<string, unknown>[])[0], false);
  assert.equal(out.isMine, false, "reader state passes through");
});
