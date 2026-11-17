import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildConsultationLinkPatch, convertConsultation, planClientCard, cardNameFrom, GENERIC_CLIENT_NAME,
  type ConvertDeps,
} from "./convertConsultationCore.ts";

/**
 * A fake database with the two facts that matter: the cases carrying
 * source_consultation_id (UNIQUE) and the consultation's link column.
 */
function fakeDb(opts: {
  existingCase?: string | null;
  linkFails?: number;
  lookupFails?: boolean;
  insertCode?: string;
  /** a concurrent request inserts this case just before ours */
  raceCase?: string;
} = {}) {
  const state = {
    cases: opts.existingCase ? [opts.existingCase] : ([] as string[]),
    linked: null as string | null,
    inserts: 0,
    linkFailuresLeft: opts.linkFails ?? 0,
  };
  const deps = (newCaseId: string): ConvertDeps => ({
    findExistingCaseId: async () =>
      opts.lookupFails ? { id: null, failed: true } : { id: state.cases[0] ?? null, failed: false },
    insertCase: async () => {
      state.inserts += 1;
      if (opts.raceCase && state.cases.length === 0) state.cases.push(opts.raceCase);
      if (opts.insertCode) return { ok: false, code: opts.insertCode };
      if (state.cases.length > 0) return { ok: false, code: "23505" };
      state.cases.push(newCaseId);
      return { ok: true };
    },
    linkConsultation: async (caseId) => {
      if (state.linkFailuresLeft > 0) { state.linkFailuresLeft -= 1; return false; }
      state.linked = caseId;
      return true;
    },
  });
  return { state, deps };
}

test("CODE-F13: a clean conversion creates the case and links it", async () => {
  const db = fakeDb();
  const out = await convertConsultation({ linkedCaseId: null, newCaseId: "case-1" }, db.deps("case-1"));
  assert.deepEqual(out, { kind: "created", caseRequestId: "case-1" });
  assert.equal(db.state.linked, "case-1");
  assert.equal(db.state.inserts, 1);
});

test("CODE-F13: a failed link is reported, not a 200 — and the retry repairs it with no second case", async () => {
  const db = fakeDb({ linkFails: 1 });
  const first = await convertConsultation({ linkedCaseId: null, newCaseId: "case-1" }, db.deps("case-1"));
  assert.deepEqual(first, { kind: "link_failed", caseRequestId: "case-1" });
  assert.equal(db.state.linked, null);

  // The retry generates a fresh id, but must land on the case already made.
  const retry = await convertConsultation({ linkedCaseId: db.state.linked, newCaseId: "case-2" }, db.deps("case-2"));
  assert.deepEqual(retry, { kind: "repaired", caseRequestId: "case-1" });
  assert.equal(db.state.linked, "case-1");
  assert.equal(db.state.inserts, 1, "no second insert attempted");
  assert.deepEqual(db.state.cases, ["case-1"]);
});

test("CODE-F13: an orphan left by the old code (case exists, consultation unlinked) is repaired", async () => {
  const db = fakeDb({ existingCase: "old-case" });
  const out = await convertConsultation({ linkedCaseId: null, newCaseId: "case-9" }, db.deps("case-9"));
  assert.deepEqual(out, { kind: "repaired", caseRequestId: "old-case" });
  assert.equal(db.state.linked, "old-case");
  assert.equal(db.state.inserts, 0);
});

test("CODE-F13: a 23505 from a concurrent double click looks the case up and links it", async () => {
  const db = fakeDb({ raceCase: "other-request-case" });
  const out = await convertConsultation({ linkedCaseId: null, newCaseId: "mine" }, db.deps("mine"));
  assert.deepEqual(out, { kind: "repaired", caseRequestId: "other-request-case" });
  assert.equal(db.state.linked, "other-request-case");
});

test("CODE-F13: a consultation already linked keeps the existing 409 answer", async () => {
  const db = fakeDb({ existingCase: "c" });
  const out = await convertConsultation({ linkedCaseId: "c", newCaseId: "x" }, db.deps("x"));
  assert.deepEqual(out, { kind: "already_converted", caseRequestId: "c" });
  assert.equal(db.state.inserts, 0);
});

test("CODE-F13: an unreadable lookup writes nothing; other insert errors pass their code through", async () => {
  const blind = fakeDb({ lookupFails: true });
  assert.deepEqual(
    await convertConsultation({ linkedCaseId: null, newCaseId: "x" }, blind.deps("x")),
    { kind: "lookup_failed" },
  );
  assert.equal(blind.state.inserts, 0);

  const fk = fakeDb({ insertCode: "23503" });
  assert.deepEqual(
    await convertConsultation({ linkedCaseId: null, newCaseId: "x" }, fk.deps("x")),
    { kind: "insert_failed", code: "23503" },
  );
});

test("CODE-F13: a 23505 with no case to be found stays a conflict, never a guess", async () => {
  const deps: ConvertDeps = {
    findExistingCaseId: async () => ({ id: null, failed: false }),
    insertCase: async () => ({ ok: false, code: "23505" }),
    linkConsultation: async () => true,
  };
  assert.deepEqual(await convertConsultation({ linkedCaseId: null, newCaseId: "x" }, deps), { kind: "conflict_unresolved" });
});

test("a throwing link write counts as not linked", async () => {
  const deps: ConvertDeps = {
    findExistingCaseId: async () => ({ id: null, failed: false }),
    insertCase: async () => ({ ok: true }),
    linkConsultation: async () => { throw new Error("network"); },
  };
  assert.deepEqual(await convertConsultation({ linkedCaseId: null, newCaseId: "x" }, deps), { kind: "link_failed", caseRequestId: "x" });
});

test("the link patch: finished statuses stay, open ones complete, ended_at only when missing", () => {
  const now = "2026-10-30T10:00:00.000Z";
  assert.deepEqual(buildConsultationLinkPatch({ status: "scheduled", ended_at: null }, "c1", now), {
    converted_case_request_id: "c1", outcome: "converted_to_case", status: "completed", ended_at: now,
  });
  assert.deepEqual(buildConsultationLinkPatch({ status: "completed", ended_at: "2026-10-01T00:00:00Z" }, "c1", now), {
    converted_case_request_id: "c1", outcome: "converted_to_case", status: "completed",
  });
  assert.equal(buildConsultationLinkPatch({ status: "cancelled", ended_at: null }, "c1", now).status, "cancelled");
});

test("CODE-F13 wiring: the route confirms the link with a row back and runs through the core", () => {
  const src = readFileSync(new URL("./route.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /convertConsultation\(/);
  assert.match(src, /buildConsultationLinkPatch\(/);
  assert.match(src, /\.eq\("source_consultation_id", id\)/);
  // the link write must come back with a row — an RLS 0-row update is a failure
  assert.match(src, /\.update\(buildConsultationLinkPatch\([\s\S]*?\.select\("id"\)[\s\S]*?\.maybeSingle\(\)/);
  assert.match(src, /link_failed/);
});

// ── N01-1: the client card a converted case belongs to ──────────────────────

test("N01-1 plan: a consultation that names its card keeps it, whatever else is true", () => {
  assert.deepEqual(
    planClientCard({ lawyerClientId: "card-1", requesterUserId: "client-1", callerId: "lawyer-1" }),
    { kind: "keep", lawyerClientId: "card-1" },
  );
});

test("N01-1 plan: a platform requester with no card is found-or-created", () => {
  assert.deepEqual(
    planClientCard({ lawyerClientId: null, requesterUserId: "client-1", callerId: "lawyer-1" }),
    { kind: "find_or_create", clientUserId: "client-1" },
  );
});

test("N01-1 plan: no requester, or the caller's own account, files no card", () => {
  assert.deepEqual(planClientCard({ lawyerClientId: null, requesterUserId: null, callerId: "lawyer-1" }), { kind: "none" });
  assert.deepEqual(planClientCard({ lawyerClientId: null, requesterUserId: "lawyer-1", callerId: "lawyer-1" }), { kind: "none" });
});

test("N01-1 card name: a real name only — never blank, never the generic placeholder", () => {
  assert.equal(cardNameFrom("  أحمد العتيبي "), "أحمد العتيبي");
  assert.equal(cardNameFrom(GENERIC_CLIENT_NAME), null);
  assert.equal(cardNameFrom("   "), null);
  assert.equal(cardNameFrom(undefined), null);
  assert.equal(cardNameFrom(null), null);
});

test("N01-1 link patch: carries lawyer_client_id only when one is given", () => {
  const now = "2026-11-17T10:00:00.000Z";
  assert.equal(buildConsultationLinkPatch({ status: "scheduled", ended_at: null }, "c1", now, "card-9").lawyer_client_id, "card-9");
  assert.equal("lawyer_client_id" in buildConsultationLinkPatch({ status: "scheduled", ended_at: null }, "c1", now, null), false);
  assert.equal("lawyer_client_id" in buildConsultationLinkPatch({ status: "scheduled", ended_at: null }, "c1", now), false);
});

test("N01-1 wiring: the card is resolved before the case insert, which carries it", () => {
  const src = readFileSync(new URL("./route.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const resolveAt = src.indexOf("await resolveClientCard(");
  const insertAt = src.indexOf("insertCase: async () =>");
  assert.ok(resolveAt > 0 && insertAt > resolveAt, "resolveClientCard must run before insertCase");
  assert.match(src, /\.\.\.\(cardId \? \{ lawyer_client_id: cardId \} : \{\}\),/);
  // the card is written on the caller's RLS client, never the service client
  assert.match(src, /await supabase\s*\.from\("lawyer_clients"\)\s*\.insert\(/);
  assert.doesNotMatch(src, /service\s*\.from\("lawyer_clients"\)/);
  // its firm is the caller's own active membership
  assert.match(src, /\.from\("firm_members"\)\s*\.select\("firm_id"\)\s*\.eq\("user_id", callerId\)\s*\.eq\("status", "active"\)/);
});
