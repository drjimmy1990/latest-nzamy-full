import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toClientCase,
  toClientCases,
  activeCasesPhraseAr,
  toArabicDigits,
  formatArabicDate,
  toClientDocumentRows,
} from "./clientDashboardCards.ts";
// The ORIGINAL of the status wording this module keeps a copy of. Imported
// here and nowhere in the module itself: the copy exists so the mapper stays
// clear of the fetch layer, and this test is what stops the copy from drifting.
import { ORDER_STATUS_AR } from "./serviceOrders.ts";

const ID = "8f14e45f-ceea-467a-9575-1a5b3d8f0e11";

/** A row shaped like what `select(...)` on service_requests actually returns. */
function row(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    title: "مراجعة عقد عمل",
    status: "pending_assignment",
    metadata: { serviceTitleAr: "صياغة عقد" },
    created_at: "2026-04-12T09:30:00.000Z",
    ...over,
  };
}

// ─── The crash ────────────────────────────────────────────────────────────────

test("every status the summary route queries yields a tone STATUS_COLOR defines", () => {
  // These three are the exact values in the route's `.in("status", [...])`.
  // The old code cast the raw row and read STATUS_COLOR[undefined].bg, which
  // threw for every client who had ever placed an order.
  for (const status of ["pending_assignment", "assigned", "in_review"]) {
    const c = toClientCase(row({ status }));
    assert.ok(c, `expected a card for ${status}`);
    assert.ok(["amber", "blue", "green", "zinc"].includes(c.statusColor));
    assert.ok(c.statusLabel.length > 0, "a badge must never render empty");
  }
});

test("an unknown status says so instead of guessing at one", () => {
  const c = toClientCase(row({ status: "on_the_moon" }));
  assert.ok(c);
  assert.equal(c.status, "unknown");
  assert.equal(c.statusColor, "zinc");
  assert.equal(c.statusLabel, "الحالة غير معروفة");
});

test("a status naming an Object.prototype member does not produce an empty badge", () => {
  // `STATUS_AR["constructor"]` is truthy but has no `.label`; a plain lookup
  // would have put a blank status pill on the client's dashboard.
  for (const status of ["constructor", "toString", "__proto__"]) {
    const c = toClientCase(row({ status }));
    assert.ok(c);
    assert.equal(c.status, "unknown");
    assert.equal(c.statusLabel, "الحالة غير معروفة");
  }
});

test("null or missing metadata does not throw and leaves no service label", () => {
  for (const metadata of [null, undefined, "not-an-object", 42, []]) {
    const c = toClientCase(row({ metadata }));
    assert.ok(c, `expected a card for metadata=${JSON.stringify(metadata)}`);
    assert.equal(c.serviceLabel, null);
    assert.equal(c.title, "مراجعة عقد عمل");
  }
});

test("a blank title falls back to the service, then to honest wording", () => {
  assert.equal(toClientCase(row({ title: "   " }))?.title, "صياغة عقد");
  assert.equal(toClientCase(row({ title: "", metadata: {} }))?.title, "طلب دون عنوان");
});

test("the service label is not printed twice when it stands in for the title", () => {
  // CaseCard renders the title and the service chip one above the other.
  const c = toClientCase(row({ title: "" }));
  assert.equal(c?.title, "صياغة عقد");
  assert.equal(c?.serviceLabel, null);
  // With a title of its own, the chip stays.
  assert.equal(toClientCase(row())?.serviceLabel, "صياغة عقد");
});

// ─── Rows that cannot make a working card ─────────────────────────────────────

test("a row with no id is dropped rather than rendered as a dead card", () => {
  // The card is a Link to /dashboard/client/cases/<id>; with no id it points
  // at a route that does not exist, and two such rows share a React key.
  for (const bad of [row({ id: "" }), row({ id: null }), row({ id: 7 }), null, "x", []]) {
    assert.equal(toClientCase(bad), null);
  }
});

test("a row whose id yields no reference is dropped, not shown with a blank one", () => {
  // The second way a row can fail to produce a reference: `orderReference`
  // strips hyphens before slicing, so «---» is a non-empty id that survives the
  // id guard and still returns "". The card used to render «رقم الطلب: » with
  // nothing after it — the empty field the id guard exists to prevent, reached
  // by a different door. No uuid looks like this; the test is here because the
  // `caseNo` docblock promises the row is dropped and it has to be true.
  for (const id of ["---", "-", "--------"]) {
    assert.equal(toClientCase(row({ id })), null, id);
  }
});

test("toClientCases keeps order and silently skips the unusable rows", () => {
  const cases = toClientCases([
    row({ id: ID, title: "الأول" }),
    null,
    row({ id: "", title: "بلا معرّف" }),
    row({ id: "aa11bb22-0000-4000-8000-000000000000", title: "الثاني" }),
  ]);
  assert.deepEqual(cases.map((c) => c.title), ["الأول", "الثاني"]);
  assert.equal(toClientCases(null).length, 0);
  assert.equal(toClientCases({ rows: [] }).length, 0);
});

test("the case number is the shared order reference, never a new scheme", () => {
  assert.equal(toClientCase(row())?.caseNo, "ORD-8F14E4");
});

// ─── Fields the row cannot prove ──────────────────────────────────────────────

test("nothing the schema does not have is ever put on a card", () => {
  // The module header's central claim: a `service_requests` row carries no
  // lawyer name, no progress percentage and no urgency flag, so nothing here
  // produces one. The card this replaced showed all three — a named lawyer, a
  // filled progress bar and an «عاجل» flag — for every client, off a row that
  // has none of those columns.
  //
  // The row below carries them anyway, which is the case that matters: it is
  // what a widened schema, a joined view or a demo fixture looks like. A future
  // `{ ...row }` in the mapper would pass every other test in this file and
  // start printing them.
  const card = toClientCase(
    row({
      lawyer: "أ. سارة العتيبي",
      lawyer_name: "أ. سارة العتيبي",
      progress: 65,
      urgency: "urgent",
      urgent: true,
      assigned_to: "b2c3d4e5-0000-4000-8000-000000000000",
      internalNotes: "الموكل صعب",
      nextHearing: "2026-05-01",
    }),
  );
  assert.ok(card);
  assert.deepEqual(Object.keys(card).sort(), [
    "caseNo",
    "createdAtLabel",
    "id",
    "serviceLabel",
    "status",
    "statusColor",
    "statusLabel",
    "title",
  ]);
});

test("metadata the row happens to carry does not become a field either", () => {
  // `metadata` is free-form jsonb and is where a plausible-looking value is
  // most likely to arrive from. Only `serviceTitleAr` is read out of it.
  const card = toClientCase(
    row({ metadata: { serviceTitleAr: "صياغة عقد", progress: 80, lawyerName: "أ. سارة", internalNotes: "خاص" } }),
  );
  assert.ok(card);
  assert.equal(card.serviceLabel, "صياغة عقد");
  assert.equal(Object.keys(card).length, 8);
});

// ─── The copied status vocabulary ─────────────────────────────────────────────

test("the status wording here still matches ORDER_STATUS_AR word for word", () => {
  // STATUS_AR in the module under test is a hand copy of ORDER_STATUS_AR, kept
  // so this file stays clear of the fetch layer. The KEY SET is fixed by the
  // type, but the LABELS are not: reword «جاهز» to «مكتمل» on one side and the
  // client's dashboard and their order page describe the same order
  // differently, with nothing failing anywhere.
  for (const [status, entry] of Object.entries(ORDER_STATUS_AR)) {
    const card = toClientCase(row({ status }));
    assert.ok(card, status);
    assert.equal(card.statusLabel, entry.label, status);
    // A status the vocabulary defines must never fall through to «unknown».
    assert.equal(card.status, status);
  }
});

test("the tones are this dashboard's own and are always ones STATUS_COLOR defines", () => {
  // Deliberately NOT asserted equal to ORDER_STATUS_AR's tones: `emerald`
  // there is `green` here, because these keys name entries in STATUS_COLOR
  // (src/app/dashboard/client/_data.ts), not Tailwind palettes.
  for (const status of Object.keys(ORDER_STATUS_AR)) {
    const card = toClientCase(row({ status }));
    assert.ok(card);
    assert.ok(["amber", "blue", "green", "zinc"].includes(card.statusColor), `${status} → ${card.statusColor}`);
  }
});

// ─── Dates ────────────────────────────────────────────────────────────────────

test("a real timestamp becomes an Arabic date", () => {
  // 09:30 UTC is the same calendar day in every real timezone offset.
  assert.equal(formatArabicDate("2026-04-12T09:30:00.000Z"), "١٢ أبريل ٢٠٢٦");
});

test("an unparseable date renders nothing, never «Invalid Date»", () => {
  for (const bad of ["", "   ", "not-a-date", null, undefined, 0, {}]) {
    assert.equal(formatArabicDate(bad), null);
  }
  assert.equal(toClientCase(row({ created_at: "nonsense" }))?.createdAtLabel, null);
});

// ─── Arabic number agreement ──────────────────────────────────────────────────

test("the welcome line disappears at zero", () => {
  for (const n of [0, -1, -20, NaN, Infinity]) {
    assert.equal(activeCasesPhraseAr(n), null);
  }
});

test("singular, dual and plural each get their own agreement", () => {
  assert.equal(activeCasesPhraseAr(1), "قضية نشطة واحدة");
  assert.equal(activeCasesPhraseAr(2), "قضيتان نشطتان");
  assert.equal(activeCasesPhraseAr(3), "٣ قضايا نشطة");
  assert.equal(activeCasesPhraseAr(10), "١٠ قضايا نشطة");
  // 11 and up take the SINGULAR (the tamyiz), not the plural — the mistake a
  // naive "one vs many" rule would make.
  assert.equal(activeCasesPhraseAr(11), "١١ قضية نشطة");
  assert.equal(activeCasesPhraseAr(25), "٢٥ قضية نشطة");
});

test("no phrase ever leaks a Western digit", () => {
  for (let n = 1; n <= 120; n++) {
    const phrase = activeCasesPhraseAr(n);
    assert.ok(phrase);
    assert.ok(!/[0-9]/.test(phrase), `Western digits in: ${phrase}`);
  }
});

test("toArabicDigits converts by table and floors nonsense to zero", () => {
  assert.equal(toArabicDigits(0), "٠");
  assert.equal(toArabicDigits(2026), "٢٠٢٦");
  assert.equal(toArabicDigits(-4), "٠");
  assert.equal(toArabicDigits(NaN), "٠");
  assert.equal(toArabicDigits(3.9), "٣");
});

// ─── Documents ────────────────────────────────────────────────────────────────

const DOC = {
  id: "d1",
  file_name: "عقد التوظيف.pdf",
  request_id: null,
  created_at: "2026-04-12T09:30:00.000Z",
};

test("a document with no order shows no order reference", () => {
  const [r] = toClientDocumentRows([DOC], 3);
  assert.equal(r.orderRef, null);
  assert.equal(r.name, "عقد التوظيف.pdf");
  assert.equal(r.format, "pdf");
  assert.equal(r.formatLabel, "PDF");
  assert.equal(r.dateLabel, "١٢ أبريل ٢٠٢٦");
});

test("a document attached to an order shows that order's shared reference", () => {
  const [r] = toClientDocumentRows([{ ...DOC, request_id: ID }], 3);
  assert.equal(r.orderRef, "ORD-8F14E4");
});

test("formats are read off the filename and unknown ones are not invented", () => {
  const rows = toClientDocumentRows(
    [
      { ...DOC, id: "a", file_name: "مذكرة.docx" },
      { ...DOC, id: "b", file_name: "صورة الهوية.JPG" },
      { ...DOC, id: "c", file_name: "archive.tar.gz" },
      { ...DOC, id: "d", file_name: "بدون-امتداد" },
    ],
    10,
  );
  assert.deepEqual(rows.map((r) => r.formatLabel), ["Word", "صورة", "ملف", "ملف"]);
});

test("rows with no id or no name are skipped, and the limit is respected", () => {
  const rows = toClientDocumentRows(
    [
      { ...DOC, id: "" },
      { ...DOC, id: "a", file_name: "  " },
      { ...DOC, id: "b" },
      { ...DOC, id: "c" },
      { ...DOC, id: "d" },
    ],
    2,
  );
  assert.deepEqual(rows.map((r) => r.id), ["b", "c"]);
  assert.equal(toClientDocumentRows(null, 3).length, 0);
  assert.equal(toClientDocumentRows([DOC], 0).length, 0);
});
