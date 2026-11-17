import assert from "node:assert/strict";
import test from "node:test";
import {
  ageMs,
  clockOffsetMs,
  durationAr,
  founderPhase,
  nextReadDelayMs,
  parseFounderWindow,
  readFounderWindow,
  riyadhDateAr,
  splitRemaining,
  windowLineAr,
  type WindowRead,
} from "./founderWindow.ts";

const START = "2026-11-18T00:00:00+03:00";
const END = "2026-12-18T00:00:00+03:00";
const startMs = Date.parse(START);
const endMs = Date.parse(END);

const win = (over: Record<string, unknown> = {}) => ({
  state: "pre",
  startsAt: START,
  endsAtExclusive: END,
  serverNow: "2026-11-17T12:00:00+03:00",
  seatsTotal: 1096,
  seatsLeft: 1096,
  planId: "lawyer-founder-2026",
  ...over,
});
const NO_HEADERS = { date: null, age: null };

test("parseFounderWindow accepts the core builder's shape and refuses malformed ones", () => {
  assert.ok(parseFounderWindow(win()));
  assert.ok(parseFounderWindow(win({ seatsTotal: null, seatsLeft: null })));
  assert.equal(parseFounderWindow(win({ state: "open" })), null);
  assert.equal(parseFounderWindow(win({ startsAt: "soon" })), null);
  assert.equal(parseFounderWindow(win({ seatsLeft: -1 })), null);
  assert.equal(parseFounderWindow(win({ seatsLeft: "5" })), null);
  assert.equal(parseFounderWindow(win({ planId: 3 })), null);
  assert.equal(parseFounderWindow(null), null);
});

test("readFounderWindow: founderWindow null is 'unconfigured', never an ended campaign", () => {
  assert.deepEqual(readFounderWindow({ campaign: null, founderWindow: null }, NO_HEADERS), { kind: "unconfigured" });
});

test("readFounderWindow: a failed fetch, a malformed window or another plan is an error", () => {
  assert.equal(readFounderWindow(null, NO_HEADERS).kind, "error");
  assert.equal(readFounderWindow({ founderWindow: { state: "pre" } }, NO_HEADERS).kind, "error");
  assert.equal(readFounderWindow({ founderWindow: win({ planId: "other" }) }, NO_HEADERS).kind, "error");
  assert.equal(readFounderWindow({ founderWindow: win({ endsAtExclusive: START }) }, NO_HEADERS).kind, "error");
});

test("readFounderWindow ages a cached serverNow by the Age header", () => {
  const r = readFounderWindow({ founderWindow: win() }, { date: null, age: "42" });
  assert.equal(r.kind, "window");
  if (r.kind !== "window") return;
  assert.equal(r.serverNowMs, Date.parse("2026-11-17T12:00:00+03:00") + 42_000);
  assert.equal(r.source, "api");
});

test("ageMs tolerates junk and caps at a day", () => {
  assert.equal(ageMs(null), 0);
  assert.equal(ageMs("abc"), 0);
  assert.equal(ageMs("-3"), 0);
  assert.equal(ageMs(" 7 "), 7000);
  assert.equal(ageMs("999999"), 86_400_000);
});

test("fallback (pre-merge route, no founderWindow key): manifest dates + the Date header", () => {
  const before = readFounderWindow({ campaign: null }, { date: "Tue, 17 Nov 2026 09:00:00 GMT", age: null });
  assert.equal(before.kind === "window" && before.state, "pre");
  assert.equal(before.kind === "window" && before.source, "fallback");

  const openBody = {
    campaign: { onSale: true, planId: "lawyer-founder-2026", seatsLeft: 900, capacity: 1096, endsOn: "2026-12-17" },
  };
  const during = readFounderWindow(openBody, { date: "Fri, 20 Nov 2026 09:00:00 GMT", age: null });
  assert.equal(during.kind === "window" && during.state, "live");
  assert.equal(during.kind === "window" && during.seatsLeft, 900);

  // Inside the dates but not on sale: never live.
  const closed = readFounderWindow({ campaign: null }, { date: "Fri, 20 Nov 2026 09:00:00 GMT", age: null });
  assert.equal(closed.kind === "window" && closed.state, "paused");
  const full = readFounderWindow(
    { campaign: { onSale: false, salePaused: false, seatsLeft: 0, capacity: 1096 } },
    { date: "Fri, 20 Nov 2026 09:00:00 GMT", age: null },
  );
  assert.equal(full.kind === "window" && full.state, "sold_out");

  const after = readFounderWindow(openBody, { date: "Fri, 18 Dec 2026 09:00:00 GMT", age: null });
  assert.equal(after.kind === "window" && after.state, "ended");

  // No server time at all → error, never the device clock alone.
  assert.equal(readFounderWindow({ campaign: null }, NO_HEADERS).kind, "error");
  // The route's own failure flag.
  assert.equal(
    readFounderWindow({ campaign: null, founderUnavailable: true }, { date: "Fri, 20 Nov 2026 09:00:00 GMT", age: null }).kind,
    "error",
  );
  assert.equal(
    readFounderWindow({ founderUnavailable: true }, { date: "Fri, 20 Nov 2026 09:00:00 GMT", age: null }).kind,
    "error",
  );
});

test("clockOffsetMs measures against the request midpoint", () => {
  assert.equal(clockOffsetMs(10_000, 1_000, 3_000), 8_000);
});

const read = (state: string, over: Partial<Extract<WindowRead, { kind: "window" }>> = {}): WindowRead => ({
  kind: "window",
  state: state as "pre",
  startsAtMs: startMs,
  endsAtMs: endMs,
  serverNowMs: startMs - 1000,
  seatsTotal: 1096,
  seatsLeft: 1000,
  source: "api",
  ...over,
});

test("founderPhase: pre counts to the start; past the start it waits for the server (opening)", () => {
  const pre = founderPhase(read("pre"), startMs - 5000);
  assert.equal(pre.phase, "pre");
  assert.equal(pre.targetMs, startMs);
  assert.equal(pre.remainingMs, 5000);
  const opening = founderPhase(read("pre"), startMs + 1);
  assert.equal(opening.phase, "opening");
  assert.equal(opening.remainingMs, null);
});

test("founderPhase: live counts to the exclusive end and locks the moment it passes", () => {
  const live = founderPhase(read("live"), endMs - 60_000);
  assert.equal(live.phase, "live");
  assert.equal(live.targetMs, endMs);
  assert.equal(live.remainingMs, 60_000);
  assert.equal(founderPhase(read("live"), endMs).phase, "ended");
  assert.equal(founderPhase(read("live", { seatsLeft: 0 }), startMs + 10).phase, "sold_out");
});

test("founderPhase: the server's sold_out / paused / ended win", () => {
  assert.equal(founderPhase(read("sold_out"), startMs + 10).phase, "sold_out");
  assert.equal(founderPhase(read("paused"), startMs + 10).phase, "paused");
  assert.equal(founderPhase(read("ended"), startMs + 10).phase, "ended");
  assert.equal(founderPhase(undefined, 0).phase, "loading");
  assert.equal(founderPhase({ kind: "error" }, 0).phase, "error");
  assert.equal(founderPhase({ kind: "unconfigured" }, 0).phase, "unconfigured");
});

test("splitRemaining", () => {
  assert.deepEqual(splitRemaining(((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000 + 999), {
    days: 2,
    hours: 3,
    minutes: 4,
    seconds: 5,
  });
  assert.deepEqual(splitRemaining(-5), { days: 0, hours: 0, minutes: 0, seconds: 0 });
});

test("durationAr: two largest units, Arabic counted nouns", () => {
  const h = 3600_000;
  assert.equal(durationAr(3 * 24 * h + 4 * h), "٣ أيام و٤ ساعات");
  assert.equal(durationAr(24 * h + 2 * h), "يوم وساعتين");
  assert.equal(durationAr(12 * 24 * h), "١٢ يومًا");
  assert.equal(durationAr(2 * h + 5 * 60_000), "ساعتين و٥ دقائق");
  assert.equal(durationAr(45 * 60_000), "٤٥ دقيقة");
  assert.equal(durationAr(30_000), "أقل من دقيقة");
});

test("dates in Arabic, Riyadh time, last day = the one before the exclusive end", () => {
  assert.equal(riyadhDateAr(startMs), "١٨ نوفمبر ٢٠٢٦");
  assert.equal(
    windowLineAr(startMs, endMs),
    "النافذة: من ١٨ نوفمبر ٢٠٢٦ حتى ١٧ ديسمبر ٢٠٢٦ (شهر واحد فقط) أو اكتمال المقاعد.",
  );
});

test("nextReadDelayMs polls only while waiting for the opening or after an error", () => {
  assert.equal(nextReadDelayMs("opening"), 10_000);
  assert.equal(nextReadDelayMs("error"), 30_000);
  assert.equal(nextReadDelayMs("live"), null);
});
