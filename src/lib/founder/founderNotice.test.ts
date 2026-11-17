import assert from "node:assert/strict";
import test from "node:test";
import { founderNoticeView, type FounderNoticeInput, type FounderNoticeView } from "./founderNotice.ts";
import type { PhaseView } from "./founderWindow.ts";

const view = (phase: PhaseView["phase"], over: Partial<PhaseView> = {}): PhaseView => ({
  phase,
  targetMs: null,
  remainingMs: phase === "pre" ? 26 * 3_600_000 : null,
  seatsLeft: phase === "live" ? 842 : null,
  seatsTotal: 1096,
  ...over,
});

/** The card's fields, or null for "none" (keeps the assertions free of narrowing). */
const card = (v: FounderNoticeView) => (v.kind === "none" ? null : v);

const input = (over: Partial<FounderNoticeInput> = {}): FounderNoticeInput => ({
  userLoading: false,
  userType: "lawyer",
  practiceKind: "advocate",
  membership: { member: false },
  view: view("pre"),
  inviteShown: false,
  dismissed: new Set(),
  ...over,
});

test("before the opening: a countdown card linking to /founder, no purchase", () => {
  const v = founderNoticeView(input());
  assert.equal(v.kind, "countdown");
  assert.equal(card(v)?.href, "/founder");
  assert.match(card(v)?.text ?? "", /يفتح التسجيل .* بعد يوم وساعتين/);
});

test("during the campaign: a join card with the server's seats", () => {
  const v = founderNoticeView(input({ view: view("live") }));
  assert.equal(v.kind, "join");
  assert.equal(card(v)?.text, "التسجيل مفتوح الآن — بقي ٨٤٢ مقعدًا.");
  const noSeats = founderNoticeView(input({ view: view("live", { seatsLeft: null }) }));
  assert.equal(card(noSeats)?.text, "التسجيل مفتوح الآن، والمقاعد محدودة.");
});

test("nothing after the campaign, or while it is paused/full/unknown", () => {
  for (const p of ["ended", "sold_out", "paused", "opening", "loading", "error", "unconfigured"] as const) {
    assert.equal(founderNoticeView(input({ view: view(p) })).kind, "none", p);
  }
});

test("nothing for non-lawyers, consultants, members, unknown membership, or while loading", () => {
  assert.equal(founderNoticeView(input({ userType: "client" })).kind, "none");
  assert.equal(founderNoticeView(input({ practiceKind: "consultant" })).kind, "none");
  assert.equal(founderNoticeView(input({ membership: { member: true } })).kind, "none");
  assert.equal(founderNoticeView(input({ membership: null })).kind, "none");
  assert.equal(founderNoticeView(input({ membership: undefined })).kind, "none");
  assert.equal(founderNoticeView(input({ userLoading: true })).kind, "none");
});

test("dismissal is per phase; the join card steps aside for the existing invite", () => {
  assert.equal(founderNoticeView(input({ dismissed: new Set(["pre"]) })).kind, "none");
  assert.equal(founderNoticeView(input({ dismissed: new Set(["pre"]), view: view("live") })).kind, "join");
  assert.equal(founderNoticeView(input({ view: view("live"), inviteShown: true })).kind, "none");
});
