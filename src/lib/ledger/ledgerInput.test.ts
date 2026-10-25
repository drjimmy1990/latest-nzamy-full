import test from "node:test";
import assert from "node:assert/strict";
import {
  LEDGER_CHANNELS,
  LEDGER_CHANNEL_LABEL_AR,
  ledgerActivityTitle,
  ledgerDbError,
  ledgerPatchToRow,
  parseLedgerCreate,
  parseLedgerFilters,
  parseLedgerPatch,
  parseOccurredAt,
  toLedgerDto,
  type LedgerRow,
} from "./ledgerInput.ts";

const NOW = Date.parse("2026-10-25T12:00:00Z");

test("the five channels of owner §٤٥ axis 1, as the table's CHECK holds them", () => {
  assert.deepEqual([...LEDGER_CHANNELS], ["whatsapp", "email", "hand", "najiz", "registered_mail"]);
  assert.equal(LEDGER_CHANNEL_LABEL_AR.najiz, "منصة ناجز");
});

test("create: a complete entry, trimmed; occurredAt defaults to now", () => {
  const r = parseLedgerCreate({ caseRequestId: " R1 ", direction: "out", channel: "najiz", title: " مذكرة ", notes: " قُدّمت " }, NOW);
  assert.deepEqual(r, { ok: true, value: {
    caseRequestId: "R1", direction: "out", channel: "najiz", title: "مذكرة", notes: "قُدّمت", occurredAt: "2026-10-25T12:00:00.000Z",
  } });
  const withDate = parseLedgerCreate({ caseRequestId: "R1", direction: "in", channel: "hand", title: "t", occurredAt: "2026-10-20T09:30:00+03:00" }, NOW);
  assert.ok(withDate.ok);
  assert.equal(withDate.value.occurredAt, "2026-10-20T06:30:00.000Z");
});

test("create: every refusal", () => {
  const base = { caseRequestId: "R1", direction: "in", channel: "email", title: "t" };
  assert.equal(parseLedgerCreate({ ...base, caseRequestId: "" }, NOW).ok, false, "a case is required");
  assert.equal(parseLedgerCreate({ ...base, direction: "both" }, NOW).ok, false);
  assert.equal(parseLedgerCreate({ ...base, channel: "fax" }, NOW).ok, false);
  assert.equal(parseLedgerCreate({ ...base, title: "  " }, NOW).ok, false);
  assert.equal(parseLedgerCreate({ ...base, title: "ت".repeat(301) }, NOW).ok, false);
  assert.equal(parseLedgerCreate({ ...base, notes: "ن".repeat(4001) }, NOW).ok, false);
  assert.equal(parseLedgerCreate({ ...base, notes: 5 }, NOW).ok, false);
  assert.equal(parseLedgerCreate({ ...base, occurredAt: "yesterday" }, NOW).ok, false);
  assert.equal(parseLedgerCreate(null, NOW).ok, false);
});

test("occurredAt: up to a day of slack ahead, nothing absurd", () => {
  assert.equal(parseOccurredAt("2026-10-26T11:00:00Z", NOW).ok, true, "within a day");
  assert.equal(parseOccurredAt("2026-10-27T00:00:00Z", NOW).ok, false, "a future entry is not a record");
  assert.equal(parseOccurredAt("1980-01-01T00:00:00Z", NOW).ok, false);
  assert.equal(parseOccurredAt("", NOW).ok, false);
});

test("create never carries a firm or a writer from the client", () => {
  const r = parseLedgerCreate({ caseRequestId: "R1", direction: "in", channel: "email", title: "t", firm_id: "f", created_by: "u", firmId: "f" }, NOW);
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.value).sort(), ["caseRequestId", "channel", "direction", "notes", "occurredAt", "title"]);
});

test("patch: text fields and archive only — case and firm cannot move", () => {
  const p = parseLedgerPatch({ title: " جديد ", archived: true, caseRequestId: "R2", firm_id: "f" }, NOW);
  assert.ok(p.ok);
  assert.deepEqual(p.value, { title: "جديد", archived: true });
  assert.deepEqual(ledgerPatchToRow(p.value, "2026-10-25T12:00:00.000Z"), { title: "جديد", archived_at: "2026-10-25T12:00:00.000Z" });
  assert.deepEqual(ledgerPatchToRow({ archived: false }, "x"), { archived_at: null });
  assert.equal(parseLedgerPatch({ caseRequestId: "R2" }, NOW).ok, false, "moving a case alone is nothing to edit");
  assert.equal(parseLedgerPatch({ archived: "yes" }, NOW).ok, false);
  assert.equal(parseLedgerPatch({ direction: "up" }, NOW).ok, false);
  assert.equal(parseLedgerPatch({}, NOW).ok, false);
});

test("filters: known values kept, unknown dropped, the cursor normalised", () => {
  const q = (o: Record<string, string>) => parseLedgerFilters((k) => o[k] ?? null);
  assert.deepEqual(q({ direction: "out", channel: "najiz", caseId: "R1", archived: "1", before: "2026-10-20T09:00:00+03:00" }), {
    direction: "out", channel: "najiz", caseId: "R1", includeArchived: true, before: "2026-10-20T06:00:00.000Z",
  });
  assert.deepEqual(q({ direction: "sideways", channel: "fax", caseId: "", before: "soon" }), {
    direction: null, channel: null, caseId: null, includeArchived: false, before: null,
  });
});

const row = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  id: "e1", case_request_id: "R1", created_by: "u1", direction: "out", channel: "najiz", title: "مذكرة",
  notes: "", occurred_at: "2026-10-20T06:00:00Z", archived_at: null, created_at: "2026-10-20T06:00:00Z", ...over,
});

test("DTO: mine / a colleague's / a deleted account; no writer or firm id leaves the route", () => {
  const mine = toLedgerDto(row({ service_requests: { title: "قضية" } }), "u1", null);
  assert.equal(mine.mine, true);
  assert.equal(mine.createdByName, "أنت");
  assert.equal(mine.caseTitle, "قضية");
  assert.equal(toLedgerDto(row(), "u2", "سارة").createdByName, "سارة");
  assert.equal(toLedgerDto(row({ created_by: null }), "u2", null).createdByName, "حساب محذوف");
  assert.equal(toLedgerDto(row({ created_by: null }), "u2", null).mine, false);
  assert.equal(toLedgerDto(row({ archived_at: "2026-10-21T00:00:00Z" }), "u1", null).archived, true);
  assert.deepEqual(Object.keys(mine).sort(), [
    "archived", "caseRequestId", "caseTitle", "channel", "createdByName", "direction", "id", "mine", "notes", "occurredAt", "title",
  ]);
});

test("feed line and error mapping", () => {
  assert.equal(ledgerActivityTitle("out", "najiz", "مذكرة جوابية"), "قيد صادر: مذكرة جوابية (منصة ناجز)");
  assert.equal(ledgerActivityTitle("in", "x", ""), "قيد وارد");
  assert.equal(ledgerActivityTitle(null, null, null), "قيد في سجل الصادر والوارد");
  assert.equal(ledgerDbError({ code: "42501" }).status, 403);
  assert.equal(ledgerDbError({ code: "23514" }).status, 400);
  assert.equal(ledgerDbError(undefined).status, 500);
});

test("the form's date-time is Riyadh wall clock, both ways", async () => {
  const { riyadhLocalInputToIso, isoToRiyadhLocalInput } = await import("./ledgerInput.ts");
  assert.equal(riyadhLocalInputToIso("2026-10-25T10:00"), "2026-10-25T07:00:00.000Z");
  assert.equal(riyadhLocalInputToIso("2026-10-25T01:30"), "2026-10-24T22:30:00.000Z");
  assert.equal(riyadhLocalInputToIso("2026-10-25"), null);
  assert.equal(riyadhLocalInputToIso("2026-10-25T24:00"), null);
  assert.equal(isoToRiyadhLocalInput("2026-10-24T22:30:00.000Z"), "2026-10-25T01:30");
  assert.equal(isoToRiyadhLocalInput("nope"), "");
});
