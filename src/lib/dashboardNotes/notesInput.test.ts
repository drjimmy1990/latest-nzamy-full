import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_NOTE_BODY,
  NOTE_COLORS,
  firmForCaselessNote,
  noteDbError,
  parseNoteCreate,
  parseNotePatch,
  sortNotes,
  toDashboardNoteDto,
  type DashboardNoteRow,
} from "./notesInput.ts";

test("the five colours of owner §٤٧ ٣, the same list the table's CHECK holds", () => {
  assert.deepEqual([...NOTE_COLORS], ["amber", "emerald", "sky", "rose", "violet"]);
});

test("create: defaults, trimming and every refusal", () => {
  assert.deepEqual(parseNoteCreate({ body: "  اتصل بالموكل  " }), {
    ok: true,
    value: { body: "اتصل بالموكل", color: "amber", pinned: false, visibility: "private", caseRequestId: null },
  });
  const full = parseNoteCreate({ body: "x", color: "rose", pinned: true, visibility: "case_team", caseRequestId: " REQ-1 " });
  assert.deepEqual(full, { ok: true, value: { body: "x", color: "rose", pinned: true, visibility: "case_team", caseRequestId: "REQ-1" } });
  assert.equal(parseNoteCreate({ body: "   " }).ok, false, "blank");
  assert.equal(parseNoteCreate({}).ok, false, "missing body");
  assert.equal(parseNoteCreate(null).ok, false);
  assert.equal(parseNoteCreate({ body: "م".repeat(MAX_NOTE_BODY) }).ok, true, "exactly the limit");
  assert.equal(parseNoteCreate({ body: "م".repeat(MAX_NOTE_BODY + 1) }).ok, false, "one over");
  assert.equal(parseNoteCreate({ body: "x", color: "black" }).ok, false);
  assert.equal(parseNoteCreate({ body: "x", visibility: "public" }).ok, false);
  assert.equal(parseNoteCreate({ body: "x", visibility: "case_team" }).ok, false, "a case_team note needs a case");
  assert.equal(parseNoteCreate({ body: "x", caseRequestId: 7 }).ok, false);
  assert.equal(parseNoteCreate({ body: "x", caseRequestId: "a".repeat(201) }).ok, false);
  assert.equal(parseNoteCreate({ body: "x", pinned: "yes" }).ok && (parseNoteCreate({ body: "x", pinned: "yes" }) as { value: { pinned: boolean } }).value.pinned, false, "only true pins");
});

test("create ignores fields it does not know (no author or firm from the client)", () => {
  const r = parseNoteCreate({ body: "x", author_user_id: "someone", firmId: "f", firm_id: "f" });
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.value).sort(), ["body", "caseRequestId", "color", "pinned", "visibility"]);
});

test("patch: only the fields present; unlinking a case is null", () => {
  assert.deepEqual(parseNotePatch({ pinned: true }), { ok: true, value: { pinned: true } });
  assert.deepEqual(parseNotePatch({ caseRequestId: null }), { ok: true, value: { caseRequestId: null } });
  assert.deepEqual(parseNotePatch({ color: "sky", body: " b " }), { ok: true, value: { color: "sky", body: "b" } });
  assert.equal(parseNotePatch({}).ok, false);
  assert.equal(parseNotePatch({ author_user_id: "x" }).ok, false, "an unknown field alone is nothing to edit");
  assert.equal(parseNotePatch({ pinned: "true" }).ok, false);
  assert.equal(parseNotePatch({ body: "" }).ok, false);
  assert.equal(parseNotePatch([]).ok, false);
});

test("a firm note without a case: exactly one active firm, or a refusal — never a guess", () => {
  assert.deepEqual(firmForCaselessNote(["f1"]), { firmId: "f1" });
  assert.deepEqual(firmForCaselessNote(["f1", "f1"]), { firmId: "f1" });
  assert.ok("error" in firmForCaselessNote([]));
  assert.ok("error" in firmForCaselessNote(["f1", "f2"]));
});

const row = (over: Partial<DashboardNoteRow> = {}): DashboardNoteRow => ({
  id: "n1", author_user_id: "u1", firm_id: null, case_request_id: null, body: "b", color: "emerald",
  pinned: false, visibility: "private", created_at: "2026-10-25T08:00:00Z", updated_at: "2026-10-25T08:00:00Z", ...over,
});

test("DTO: own vs a colleague's note, the case title from either embed shape, unknown values fall back", () => {
  const mine = toDashboardNoteDto(row({ case_request_id: "R1", service_requests: { title: " قضية " } }), "u1", null);
  assert.equal(mine.mine, true);
  assert.equal(mine.authorName, "أنت");
  assert.equal(mine.caseTitle, "قضية");
  const theirs = toDashboardNoteDto(row({ service_requests: [{ title: "ق" }], visibility: "firm" }), "u2", "سارة");
  assert.equal(theirs.mine, false);
  assert.equal(theirs.authorName, "سارة");
  assert.equal(theirs.caseTitle, "ق");
  const odd = toDashboardNoteDto(row({ color: "black", visibility: "weird", service_requests: null }), "u2", null);
  assert.equal(odd.color, "amber");
  assert.equal(odd.visibility, "private");
  assert.equal(odd.caseTitle, null);
  assert.equal(odd.authorName, "زميل");
  assert.deepEqual(Object.keys(mine).sort(), [
    "authorName", "body", "caseRequestId", "caseTitle", "color", "createdAt", "id", "mine", "pinned", "updatedAt", "visibility",
  ], "no author id or firm id leaves the route");
});

test("sort: pinned first, then the latest edit", () => {
  const notes = [
    { id: "a", pinned: false, updatedAt: "2026-10-25T10:00:00Z" },
    { id: "b", pinned: true, updatedAt: "2026-10-20T10:00:00Z" },
    { id: "c", pinned: false, updatedAt: "2026-10-26T10:00:00Z" },
    { id: "d", pinned: true, updatedAt: "2026-10-24T10:00:00Z" },
  ];
  assert.deepEqual(sortNotes(notes).map((n) => n.id), ["d", "b", "c", "a"]);
});

test("database errors map to screen copy", () => {
  assert.equal(noteDbError({ code: "42501" }).status, 403);
  assert.equal(noteDbError({ code: "23514" }).status, 400);
  assert.equal(noteDbError({ code: "23503" }).status, 400);
  assert.equal(noteDbError(null).status, 500);
});
