import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CLIENT_FORBIDDEN_COLUMNS,
  CLIENT_HEARING_COLUMNS,
  CLIENT_STAGE_COLUMNS,
  buildClientCaseSummary,
  pickNextHearing,
  toClientHearing,
  type ClientHearingRow,
  type ClientStageRow,
} from "./clientCaseSummary.ts";

const hearing = (over: Partial<ClientHearingRow>): ClientHearingRow => ({
  id: "h1", case_request_id: "c1", kind: "judicial", hearing_date: "2026-10-20",
  hearing_time: "09:30:00", court_name: "المحكمة التجارية بالرياض", location: "", status: "scheduled", ...over,
});
const stage = (over: Partial<ClientStageRow>): ClientStageRow => ({
  id: "s1", case_request_id: "c1", degree: "first_instance", court_name: "المحكمة التجارية",
  opened_on: "2026-01-10", closed_on: null, outcome: null, position: 1, created_at: "2026-01-10T00:00:00Z", ...over,
});

test("the client projection never names an internal column", () => {
  const cols = (list: string) => list.split(",").map((c) => c.trim());
  for (const forbidden of CLIENT_FORBIDDEN_COLUMNS) {
    assert.ok(!cols(CLIENT_HEARING_COLUMNS).includes(forbidden), `hearings: ${forbidden}`);
    assert.ok(!cols(CLIENT_STAGE_COLUMNS).includes(forbidden), `case_stages: ${forbidden}`);
  }
  assert.ok(!CLIENT_HEARING_COLUMNS.includes("*"));
  assert.ok(!CLIENT_STAGE_COLUMNS.includes("*"));
});

test("the summary route reads only the fixed projection, after an RLS read of the case", () => {
  const src = readFileSync(new URL("../app/api/v1/client/cases/[id]/summary/route.ts", import.meta.url), "utf8");
  // RLS first: the session client proves the caller may see the case.
  const rlsRead = src.indexOf('.from("service_requests")');
  const serviceClient = src.indexOf("await createServiceClient()");
  assert.ok(rlsRead > 0 && serviceClient > rlsRead, "the service client must come after the RLS read");
  // The two lawyer tables are read only through the constants.
  assert.match(src, /\.from\("hearings"\)\s*\r?\n\s*\.select\(CLIENT_HEARING_COLUMNS\)/);
  assert.match(src, /\.from\("case_stages"\)\s*\r?\n\s*\.select\(CLIENT_STAGE_COLUMNS\)/);
  assert.match(src, /\.in\("kind", \[\.\.\.CLIENT_VISIBLE_HEARING_KINDS\]\)/);
  // Only the client side of the case: the requester or an active member of
  // its company. A verified lawyer browsing unassigned requests, the assignee
  // and the assignee's firm can read the row under RLS but get a 404 here.
  assert.ok(src.includes("let isClientSide = caseRow.requester_user_id === user.id;"));
  assert.match(src, /rpc\("is_active_business_member", \{\s*p_business: caseRow\.business_id,/);
  assert.ok(src.includes("if (!isClientSide) return NextResponse.json({ error: AR.notFound }, { status: 404 });"));
  assert.ok(src.indexOf("if (!isClientSide)") < serviceClient, "the client-side check must come before the service client");
  // …and the note tables are never touched.
  assert.doesNotMatch(src, /\.from\("(case_notes|consultation_notes)"\)|select\("\*"\)/);
});

test("internal and diary hearing kinds are dropped even if a row slips through", () => {
  const s = buildClientCaseSummary(
    [hearing({ id: "a", kind: "internal" }), hearing({ id: "b", kind: "deadline" }), hearing({ id: "c" })],
    [],
    "2026-10-17",
  );
  assert.deepEqual(s.hearings.map((h) => h.id), ["c"]);
});

test("next hearing: today counts (Riyadh date strings), past and non-scheduled do not", () => {
  const hs = [
    hearing({ id: "past", hearing_date: "2026-10-16" }),
    hearing({ id: "today-late", hearing_date: "2026-10-17", hearing_time: "13:00:00" }),
    hearing({ id: "today-early", hearing_date: "2026-10-17", hearing_time: "08:00:00" }),
    hearing({ id: "cancelled", hearing_date: "2026-10-17", hearing_time: "07:00:00", status: "cancelled" }),
  ].map(toClientHearing);
  assert.equal(pickNextHearing(hs, "2026-10-17")?.id, "today-early");
  assert.equal(pickNextHearing(hs, "2026-10-18"), null);
});

test("current stage is the latest degree; the final ruling exists only once it is decided", () => {
  const open = buildClientCaseSummary(
    [],
    [stage({ id: "s1", outcome: "won", closed_on: "2026-05-01" }), stage({ id: "s2", degree: "appeal", position: 2, outcome: null })],
    "2026-10-17",
  );
  assert.equal(open.currentStage?.degree, "استئناف");
  assert.equal(open.finalRuling, null);
  assert.deepEqual(open.stages.map((s) => s.id), ["s1", "s2"]);
  assert.equal(open.stages[0].outcomeLabel, "صدر الحكم لصالحك");

  const decided = buildClientCaseSummary(
    [],
    [stage({ id: "s1", outcome: "won" }), stage({ id: "s2", degree: "appeal", position: 2, outcome: "partial", closed_on: "2026-09-30" })],
    "2026-10-17",
  );
  assert.equal(decided.finalRuling?.outcomeLabel, "صدر الحكم لصالحك جزئياً");
  assert.equal(decided.finalRuling?.closedOn, "2026-09-30");

  const pending = buildClientCaseSummary([], [stage({ outcome: "pending" })], "2026-10-17");
  assert.equal(pending.finalRuling, null);
});

test("the place is the court, else the location; the time loses its seconds", () => {
  const h = toClientHearing(hearing({ court_name: "  ", location: "عن بُعد عبر ناجز" }));
  assert.equal(h.place, "عن بُعد عبر ناجز");
  assert.equal(h.time, "09:30");
  assert.equal(h.kindLabel, "جلسة قضائية");
});
