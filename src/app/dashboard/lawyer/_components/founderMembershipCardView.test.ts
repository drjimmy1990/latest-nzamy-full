import assert from "node:assert/strict";
import test from "node:test";
import { FOUNDER_CAMPAIGN_COPY } from "../../../../lib/pricing/campaigns.ts";
import { FOUNDER_CONSULTANT_NOTE, type FounderOffer } from "../../../../lib/pricing/founderCard.ts";
import {
  FOUNDER_DASHBOARD_TITLE,
  founderDashboardCardView,
  type FounderDashboardInput,
} from "./founderMembershipCardView.ts";

const MEMBER = {
  member: true,
  endsAt: "2027-11-01T20:59:00.000Z",
  credits: {
    drafting_work: { total: 6, remaining: 4 },
    independent_output: { total: 1, remaining: 1 },
  },
  libraryUntil: "2027-11-01T20:59:00.000Z",
};

const NOT_MEMBER = {
  member: false,
  endsAt: null,
  credits: { drafting_work: { total: 0, remaining: 0 }, independent_output: { total: 0, remaining: 0 } },
  libraryUntil: null,
};

const OPEN: FounderOffer = { state: "open", seatsLeft: 900, capacity: 1096 };

const base = (over: Partial<FounderDashboardInput> = {}): FounderDashboardInput => ({
  userLoading: false,
  userType: "lawyer",
  practiceKind: "advocate",
  membership: NOT_MEMBER,
  verification: "verified",
  offer: OPEN,
  priced: true,
  ...over,
});

// ── the member card ─────────────────────────────────────────────────────────

test("a member sees the brief's lines, Riyadh date, Arabic-Indic digits", () => {
  const v = founderDashboardCardView(base({ membership: MEMBER }));
  assert.equal(v.kind, "member");
  if (v.kind !== "member") return;
  assert.equal(FOUNDER_DASHBOARD_TITLE, "عضويتي المؤسسة");
  assert.equal(v.title, "عضويتي المؤسسة");
  assert.deepEqual(v.lines, [
    "عضو مؤسس حتى ١ نوفمبر ٢٠٢٧",
    "أعمال الصائغ: متبقٍ ٤ من ٦",
    "المخرج المستقل: ١ من ١",
    "المكتبة حتى ١ نوفمبر ٢٠٢٧",
    // The global constraint's only allowed form of the ERP line; it opens
    // with the brief's «إدارة المكتب: قريبًا».
    "إدارة المكتب: قريبًا — ضمن مدة العضوية المحسوبة من التفعيل",
  ]);
  assert.equal(v.note, null);
});

test("the end date is the Riyadh calendar day, not the UTC one", () => {
  // 21:30 UTC on 1 Nov is 00:30 on 2 Nov in Riyadh.
  const v = founderDashboardCardView(
    base({ membership: { ...MEMBER, endsAt: "2027-11-01T21:30:00Z", libraryUntil: null } }),
  );
  assert.equal(v.kind, "member");
  if (v.kind === "member") assert.equal(v.lines[0], "عضو مؤسس حتى ٢ نوفمبر ٢٠٢٧");
});

test("no library coverage drops the library line, never a placeholder", () => {
  const v = founderDashboardCardView(base({ membership: { ...MEMBER, libraryUntil: null } }));
  assert.equal(v.kind, "member");
  if (v.kind !== "member") return;
  assert.equal(v.lines.length, 4);
  assert.ok(!v.lines.some((l) => l.startsWith("المكتبة")));
  // An unparseable library date is dropped the same way.
  const bad = founderDashboardCardView(base({ membership: { ...MEMBER, libraryUntil: "soon" } }));
  assert.ok(bad.kind === "member" && !bad.lines.some((l) => l.startsWith("المكتبة")));
});

test("nothing left still shows the line, with ٠", () => {
  const v = founderDashboardCardView(
    base({
      membership: {
        ...MEMBER,
        credits: { drafting_work: { total: 6, remaining: 0 }, independent_output: { total: 1, remaining: 0 } },
      },
    }),
  );
  assert.ok(v.kind === "member");
  if (v.kind !== "member") return;
  assert.equal(v.lines[1], "أعمال الصائغ: متبقٍ ٠ من ٦");
  assert.equal(v.lines[2], "المخرج المستقل: ٠ من ١");
});

test("a member's card shows whatever the sale and verification state", () => {
  for (const offer of [null, { state: "closed" } as FounderOffer, { state: "unavailable" } as FounderOffer]) {
    for (const verification of ["loading", "unknown", "unverified"] as const) {
      const v = founderDashboardCardView(base({ membership: MEMBER, offer, verification, priced: false }));
      assert.equal(v.kind, "member");
    }
  }
});

test("a consultant member is told the drafter and the simulator are not his (R19)", () => {
  const v = founderDashboardCardView(base({ membership: MEMBER, practiceKind: "consultant" }));
  assert.ok(v.kind === "member");
  if (v.kind === "member") assert.equal(v.note, FOUNDER_CONSULTANT_NOTE);
});

test("a malformed member reply renders nothing, never a broken card", () => {
  const broken: unknown[] = [
    { ...MEMBER, endsAt: null },
    { ...MEMBER, endsAt: "not a date" },
    { ...MEMBER, credits: null },
    { ...MEMBER, credits: { drafting_work: { total: 6, remaining: 4 } } },
    { ...MEMBER, credits: { ...MEMBER.credits, drafting_work: { total: 6, remaining: -1 } } },
    { ...MEMBER, credits: { ...MEMBER.credits, independent_output: { total: "1", remaining: 1 } } },
    { ...MEMBER, member: "true" },
  ];
  for (const membership of broken) {
    assert.deepEqual(founderDashboardCardView(base({ membership })), { kind: "none" }, JSON.stringify(membership));
  }
});

// ── loading and failed membership reads ─────────────────────────────────────

test("membership still loading renders nothing", () => {
  assert.deepEqual(founderDashboardCardView(base({ membership: undefined })), { kind: "none" });
});

test("a failed membership read never falls through to the invite", () => {
  // 401 / 503 bodies, a network failure (null), a malformed reply.
  for (const membership of [
    { error: "تعذّر تحميل عضويتك الآن — حاول بعد قليل" },
    { error: "سجّل الدخول لعرض عضويتك" },
    null,
    "oops",
    [],
    {},
  ]) {
    assert.deepEqual(founderDashboardCardView(base({ membership })), { kind: "none" }, JSON.stringify(membership));
  }
});

// ── the invite ──────────────────────────────────────────────────────────────

test("a verified non-member lawyer, sale open: a one-line invite to the founder card", () => {
  const v = founderDashboardCardView(base());
  assert.equal(v.kind, "invite");
  if (v.kind !== "invite") return;
  assert.equal(v.href, FOUNDER_CAMPAIGN_COPY.ctaHref);
  assert.equal(v.href, "/pricing?audience=lawyers&campaign=founder-2026#founder-plan");
  assert.equal(v.linkLabel, FOUNDER_CAMPAIGN_COPY.ctaAr);
  assert.equal(v.text, "باقة المحامي المؤسس متاحة لحسابك الموثّق — المقاعد المتبقية: ٩٠٠ من ١٬٠٩٦");
  assert.ok(!v.text.includes("\n"));
});

test("each missing invite condition alone renders nothing", () => {
  const cases: [string, Partial<FounderDashboardInput>][] = [
    ["session loading", { userLoading: true }],
    ["firm", { userType: "firm" }],
    ["provider", { userType: "provider" }],
    ["admin", { userType: "admin" }],
    ["no user type", { userType: null }],
    ["unverified", { verification: "unverified" }],
    ["verification unknown", { verification: "unknown" }],
    ["verification loading", { verification: "loading" }],
    ["offer loading", { offer: null }],
    ["sale closed", { offer: { state: "closed" } }],
    ["campaign unreadable", { offer: { state: "unavailable" } }],
    ["no price", { priced: false }],
  ];
  for (const [name, over] of cases) {
    assert.deepEqual(founderDashboardCardView(base(over)), { kind: "none" }, name);
  }
});

test("the copy makes no superlative claim", () => {
  const v = founderDashboardCardView(base());
  const m = founderDashboardCardView(base({ membership: MEMBER }));
  const all = [JSON.stringify(v), JSON.stringify(m)].join(" ");
  assert.doesNotMatch(all, /الأفضل|الأوفر|الأكثر/);
});
