import test from "node:test";
import assert from "node:assert/strict";
import {
  hearingCandidates,
  stageCandidates,
  documentCandidates,
  partyCandidates,
  refKey,
  existingRefKeys,
  candidatesToNodes,
  type ImportCandidate,
} from "./_graph-import.ts";

test("hearings become event cards that point at the hearing row", () => {
  const hearings = [
    { id: "h1", title: "جلسة مرافعة", type: "hearing", caseRequestId: "c", date: "2026-11-02", time: "09:30", location: "المحكمة العامة", urgency: "normal", status: "scheduled" },
  ];
  const [c] = hearingCandidates(hearings);
  assert.deepEqual(c.ref, { ref_type: "hearing", ref_id: "h1", label: "جلسة مرافعة" });
  assert.equal(c.type, "event");
  assert.match(c.desc, /2026-11-02/);
  assert.match(c.desc, /09:30/);
  assert.match(c.desc, /المحكمة العامة/);
});

test("stages, documents and parties", () => {
  const stages = [
    { id: "s1", caseRequestId: "c", degree: "استئناف", courtName: "محكمة الاستئناف", courtCaseNo: "123", openedOn: "2026-01-01", closedOn: null, outcome: null, position: 1, createdAt: "", updatedAt: "" },
  ];
  const [s] = stageCandidates(stages);
  assert.equal(s.ref.ref_type, "stage");
  assert.match(s.title, /استئناف/);
  assert.match(s.desc, /123/);

  const docs = [{ id: "77", name: "لائحة.pdf", file_size: 10, storage_path: "p", created_at: "2026-10-01T00:00:00Z" }];
  const [d] = documentCandidates(docs);
  assert.deepEqual(d.ref, { ref_type: "document", ref_id: "77", label: "لائحة.pdf" });
  assert.equal(d.type, "doc");
  assert.ok(!JSON.stringify(d).includes("\"p\""), "the storage path is not copied into the board");

  const ps = partyCandidates([
    { key: "client:c1", name: "شركة الأفق", role: "client" },
    { key: "opponent:x", name: "مؤسسة النور", role: "opponent" },
  ]);
  assert.deepEqual(ps.map((p) => [p.type, p.title, p.desc]), [["person", "شركة الأفق", "الموكّل"], ["person", "مؤسسة النور", "الطرف الآخر"]]);
});

test("refs already on the board are recognised, so an import never duplicates", () => {
  const keys = existingRefKeys([
    { id: "n1", type: "event", title: "", desc: "", pos: { x: 0, y: 0 }, author: { name: "", color: "", role: "" }, ref: { ref_type: "hearing", ref_id: "h1", label: "" } },
    { id: "n2", type: "custom", title: "", desc: "", pos: { x: 0, y: 0 }, author: { name: "", color: "", role: "" } },
  ]);
  assert.equal(keys.has(refKey({ ref_type: "hearing", ref_id: "h1", label: "x" })), true);
  assert.equal(keys.size, 1);
});

test("candidatesToNodes lays the new cards on a grid below the board and skips existing refs", () => {
  const cands: ImportCandidate[] = [
    { ref: { ref_type: "hearing", ref_id: "h1", label: "a" }, type: "event", title: "a", desc: "" },
    { ref: { ref_type: "hearing", ref_id: "h2", label: "b" }, type: "event", title: "b", desc: "" },
    { ref: { ref_type: "document", ref_id: "9", label: "c" }, type: "doc", title: "c", desc: "" },
  ];
  const existing = [{ id: "n1", type: "event" as const, title: "", desc: "", pos: { x: 100, y: 300 }, author: { name: "", color: "", role: "" }, ref: { ref_type: "hearing" as const, ref_id: "h1", label: "" } }];
  let i = 0;
  const nodes = candidatesToNodes(cands, existing, () => `id${i++}`);
  assert.deepEqual(nodes.map((n) => n.ref?.ref_id), ["h2", "9"]);
  assert.ok(nodes.every((n) => n.pos.y > 300), "below every existing card");
  assert.notDeepEqual(nodes[0].pos, nodes[1].pos);
  assert.equal(nodes[0].meta, "مستورد من ملف القضية");
});
