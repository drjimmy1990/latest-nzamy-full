import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { currentPlanView, type CurrentPlanInput } from "./currentPlanView.ts";

const FOUNDER = {
  member: true,
  endsAt: "2027-11-02T00:00:00.000Z",
  credits: {
    drafting_work: { total: 20, remaining: 17 },
    independent_output: { total: 2, remaining: 2 },
  },
  libraryUntil: "2027-11-02T00:00:00.000Z",
};

const base: CurrentPlanInput = { userLoading: false, tier: "free", tierLabel: "مجاني", practiceKind: "advocate", founder: { member: false } };
const view = (over: Partial<CurrentPlanInput>) => currentPlanView({ ...base, ...over });

test("BUG-08: an active founder membership is the plan, even though the tier stays free", () => {
  const v = view({ founder: FOUNDER });
  assert.equal(v.kind, "founder");
  if (v.kind !== "founder") return;
  assert.equal(v.label, "باقة المحامي المؤسس");
  assert.match(v.lines[0], /^عضو مؤسس حتى /, "with its end date");
  assert.ok(v.lines.some((l) => /أعمال الصائغ: متبقٍ ١٧ من ٢٠/.test(l)), "and the works left");
  assert.equal(v.alsoTierLabel, null);
});

test("a founder who also holds a paid tier sees both", () => {
  const v = view({ founder: FOUNDER, tier: "pro", tierLabel: "المحامي المحترف" });
  assert.equal(v.kind, "founder");
  if (v.kind === "founder") assert.equal(v.alsoTierLabel, "المحامي المحترف");
});

test("no membership: the tier as before", () => {
  assert.deepEqual(view({ tier: "pro", tierLabel: "المحامي المحترف" }), { kind: "tier", label: "المحامي المحترف" });
  assert.deepEqual(view({}), { kind: "free" });
});

test("never «لا باقة فعّالة» before the founder read answers, or when it failed", () => {
  assert.deepEqual(view({ userLoading: true, founder: FOUNDER }), { kind: "loading" });
  assert.deepEqual(view({ founder: undefined }), { kind: "loading" }, "free tier, read still running");
  assert.deepEqual(view({ founder: null }), { kind: "unverifiable" }, "free tier, read failed");
  assert.deepEqual(view({ founder: { error: "x" } }), { kind: "unverifiable" }, "a body that is not an answer");
  assert.deepEqual(view({ founder: { member: true } }), { kind: "unverifiable" }, "a member reply the card cannot read");
  assert.deepEqual(view({ founder: null, tier: "pro", tierLabel: "المحامي المحترف" }), { kind: "tier", label: "المحامي المحترف" }, "a paid tier still shows");
});

const read = (rel: string) => readFileSync(join(import.meta.dirname, rel), "utf8");

test("Settings and /dashboard/billing draw the same «باقتك الحالية» card", () => {
  const tab = read("../../app/settings/components/tabs/SubscriptionTab.tsx");
  const billing = read("../../app/dashboard/billing/page.tsx");
  assert.match(tab, /<CurrentPlanCard plansHref=/);
  assert.doesNotMatch(tab, /function CurrentPlanPanel/, "no second copy of the panel");
  assert.match(billing, /<CurrentPlanCard plansHref=/);
  const card = read("./CurrentPlanCard.tsx");
  assert.match(card, /^"use client";/);
  assert.match(card, /fetch\("\/api\/v1\/membership\/founder", \{ cache: "no-store"/);
  assert.match(card, /currentPlanView\(\{/);
  assert.doesNotMatch(card, /createServiceClient|SERVICE_ROLE/);
});
