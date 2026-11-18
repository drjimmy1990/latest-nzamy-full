import assert from "node:assert/strict";
import test from "node:test";
import { founderCta, FOUNDER_CONSULTANT_NOTE, FOUNDER_PAUSED_TEXT } from "../pricing/founderCard.ts";
import { founderJoinButton, JOIN_LABELS, preLabel } from "./joinButton.ts";

const lawyerCta = (practiceKind: "advocate" | "consultant") =>
  founderCta({
    sessionLoading: false,
    signedIn: true,
    userType: "lawyer",
    practiceKind,
    verification: "verified",
    member: false,
    gateway: { disabled: false, provider: "moyasar" },
  });

const base = { remainingMs: null, userType: "lawyer", practiceKind: "advocate", cta: lawyerCta("advocate") };

test("only the live phase can sell; every other phase is locked with its own words", () => {
  const cases: Array<[Parameters<typeof founderJoinButton>[0]["phase"], string]> = [
    ["loading", JOIN_LABELS.loading],
    ["error", JOIN_LABELS.error],
    ["unconfigured", JOIN_LABELS.unconfigured],
    ["opening", JOIN_LABELS.opening],
    ["ended", "انتهى العرض"],
    ["sold_out", "اكتملت المقاعد"],
    ["paused", FOUNDER_PAUSED_TEXT],
  ];
  for (const [phase, label] of cases) {
    const b = founderJoinButton({ ...base, phase });
    assert.equal(b.kind, "locked", phase);
    assert.equal(b.kind === "locked" && b.label, label, phase);
  }
});

test("pre: «يفتح التسجيل بعد …»", () => {
  const b = founderJoinButton({ ...base, phase: "pre", remainingMs: 2 * 86_400_000 + 3 * 3_600_000 });
  assert.equal(b.kind === "locked" && b.label, "يفتح التسجيل بعد يومين و٣ ساعات");
  assert.equal(preLabel(null), "يفتح التسجيل قريبًا");
});

test("live: an advocate gets founderCta's checkout", () => {
  const b = founderJoinButton({ ...base, phase: "live" });
  assert.equal(b.kind, "cta");
  assert.equal(b.kind === "cta" && b.cta.kind, "checkout");
});

test("live: a consultant is locked out, and the consultant note never reaches the page", () => {
  const cta = lawyerCta("consultant");
  assert.equal(cta.note, FOUNDER_CONSULTANT_NOTE, "founderCta still carries it (pricing card)");
  const b = founderJoinButton({ ...base, practiceKind: "consultant", cta, phase: "live" });
  assert.deepEqual(b, { kind: "locked", reason: "advocate_only", label: "هذه الباقة للمحامي المرخّص للترافع فقط" });
});

test("live: a guest gets the sign-in CTA (note stripped)", () => {
  const cta = founderCta({
    sessionLoading: false,
    signedIn: false,
    userType: null,
    practiceKind: null,
    verification: "unknown",
    member: "unknown",
    gateway: { disabled: false, provider: "moyasar" },
  });
  const b = founderJoinButton({ ...base, userType: null, practiceKind: null, cta, phase: "live" });
  assert.equal(b.kind === "cta" && b.cta.kind, "guest");
  assert.equal(b.kind === "cta" && b.cta.note, null);
});

test("live (l7, decision 1): a pending lawyer may buy, and the owner's sentence reaches the page", () => {
  const cta = founderCta({
    sessionLoading: false,
    signedIn: true,
    userType: "lawyer",
    practiceKind: "advocate",
    verification: "pending",
    member: false,
    gateway: { disabled: false, provider: "moyasar" },
  });
  const b = founderJoinButton({ ...base, cta, phase: "live" });
  assert.equal(b.kind === "cta" && b.cta.kind, "checkout");
  assert.equal(b.kind === "cta" && b.cta.note, "تُفعَّل الباقة بعد توثيق رخصتك، وإن لم تُوثَّق يُردّ المبلغ كاملاً.");
});
