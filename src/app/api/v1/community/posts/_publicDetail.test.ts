import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { publicDetail } from "./_feed.ts";

test("the public question page carries no author ids and no metadata, for the post or its answers", () => {
  const out = publicDetail({
    id: "p1", title: "t", author_id: "u1", metadata: { ip: "x" },
    answers: [{ id: "a1", body: "b", author_id: "u2", metadata: {}, lawyerSlug: "s" }],
  });
  assert.deepEqual(out, { id: "p1", title: "t", answers: [{ id: "a1", body: "b", lawyerSlug: "s" }] });
});

test("the detail route answers 404 only for a missing row, 500 for a failed read, and returns publicDetail", () => {
  const src = readFileSync(new URL("./[id]/route.ts", import.meta.url), "utf8");
  assert.match(src, /if \(error\.code === "PGRST116"\) \{\s*return NextResponse\.json\(\{ error: "هذا السؤال غير موجود" \}, \{ status: 404 \}\);/);
  assert.match(src, /return NextResponse\.json\(\{ error: "تعذّر تحميل السؤال" \}, \{ status: 500 \}\);/);
  assert.match(src, /data: publicDetail\(cleanDetail\(/);
});
