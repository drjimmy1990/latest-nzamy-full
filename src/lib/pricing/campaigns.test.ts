import assert from "node:assert/strict";
import test from "node:test";
import {
  activeCampaign,
  campaignFromApi,
  CAMPAIGNS,
  FOUNDER_CAMPAIGN_COPY,
  FOUNDER_MEMBERSHIP_ON_SALE,
  founderCampaignFromSetting,
  founderCampaignSettingIssue,
  founderCapacityLiteralIssue,
  founderOfferCampaign,
  founderSummaryFromRpc,
  mergeFounderCampaignSetting,
  riyadhDay,
  type Campaign,
} from "./campaigns.ts";

const c = (id: string, startsOn: string, endsOn: string): Campaign => ({
  id, startsOn, endsOn, badgeAr: "ب", messageAr: "م", ctaAr: "ز", ctaHref: "/pricing",
});

test("no campaign is live until the owner dates one (owner ١٧٩ / ٢١٨)", () => {
  assert.equal(CAMPAIGNS.length, 0);
  assert.equal(activeCampaign(new Date("2026-10-17T12:00:00Z")), null);
});

test("a campaign shows from its first to its last day, Riyadh time, inclusive", () => {
  const list = [c("x", "2026-11-01", "2026-11-30")];
  assert.equal(activeCampaign(new Date("2026-10-31T20:59:00Z"), list), null); // 23:59 Riyadh, 31 Oct
  assert.equal(activeCampaign(new Date("2026-10-31T21:00:00Z"), list)?.id, "x"); // 00:00 Riyadh, 1 Nov
  assert.equal(activeCampaign(new Date("2026-11-30T20:59:00Z"), list)?.id, "x"); // last minute of 30 Nov
  assert.equal(activeCampaign(new Date("2026-11-30T21:00:00Z"), list), null);
});

test("an inverted range never shows, and the earliest-ending live campaign wins", () => {
  assert.equal(activeCampaign(new Date("2026-11-10T09:00:00Z"), [c("bad", "2026-12-01", "2026-11-01")]), null);
  const list = [c("long", "2026-11-01", "2026-12-31"), c("short", "2026-11-05", "2026-11-20")];
  assert.equal(activeCampaign(new Date("2026-11-10T09:00:00Z"), list)?.id, "short");
});

test("riyadhDay is the Riyadh calendar day", () => {
  assert.equal(riyadhDay(new Date("2026-10-16T21:30:00Z")), "2026-10-17");
});

// ── The founder campaign from the admin-set dates (owner ٢١٨, dates ٢٢٥) ──

const SEEDED = { starts_on: "2026-10-25", ends_on: "2027-01-25", library_days: 90 };

test("founder campaign: null dates mean the campaign is off", () => {
  assert.equal(founderCampaignFromSetting({ starts_on: null, ends_on: null, library_days: 90 }, "2026-11-01"), null);
  assert.equal(founderCampaignFromSetting({ starts_on: "2026-10-25", ends_on: null, library_days: 90 }, "2026-11-01"), null);
  assert.equal(founderCampaignFromSetting({ starts_on: null, ends_on: "2027-01-25", library_days: 90 }, "2026-11-01"), null);
});

test("founder campaign: shows on the first and the last day, both included, with the paid-membership copy", () => {
  for (const today of ["2026-10-25", "2027-01-25"]) {
    const c = founderCampaignFromSetting(SEEDED, today);
    assert.ok(c, today);
    assert.equal(c.startsOn, "2026-10-25");
    assert.equal(c.endsOn, "2027-01-25");
    assert.equal(c.badgeAr, "عضوية المحامي المؤسس");
    assert.equal(c.messageAr, "عضوية المحامي المؤسس السنوية — مقاعد محدودة لمن يوثّق رخصته ويُتم السداد");
    assert.equal(c.ctaAr, "اعرف التفاصيل");
    assert.equal(c.ctaHref, "/pricing?audience=lawyers&campaign=founder-2026#founder-plan");
    assert.equal(c.id, "founder-2026-10-25");
  }
});

// ── Owner answers of 25 Oct (P0): no founder badge, seat or library days on a
// free signup. Until the paid founder membership exists (P3) no banner may
// promise any founder offer, and no copy may promise a signup gift. ─────────

test("founder membership is on sale in code (P3 Task 11); the dates, the pause and the seats still gate it in SQL", () => {
  assert.equal(FOUNDER_MEMBERSHIP_ON_SALE, true);
});

test("the founder banner states no seat number: capacity is admin-editable (R1)", () => {
  assert.doesNotMatch(FOUNDER_CAMPAIGN_COPY.messageAr, /[0-9٠-٩]/);
  assert.match(FOUNDER_CAMPAIGN_COPY.messageAr, /مقاعد محدودة/);
});

test("the founder copy promises no signup gift — no free library days, no badge for registering", () => {
  const all = Object.values(FOUNDER_CAMPAIGN_COPY).join(" ");
  assert.doesNotMatch(all, /سجّل|سجل الآن|مجان|٣ أشهر|3 أشهر|ثلاثة أشهر|شارة المؤسس/);
  assert.match(FOUNDER_CAMPAIGN_COPY.messageAr, /يوثّق رخصته ويُتم السداد/);
  // P3 Task 8: /pricing reads ?audience= and ?campaign= and has the #founder-plan card.
  assert.equal(FOUNDER_CAMPAIGN_COPY.ctaHref, "/pricing?audience=lawyers&campaign=founder-2026#founder-plan");
});

test("GET /api/v1/campaigns/active returns null before reading the setting while the membership is not on sale", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const route = readFileSync(join(import.meta.dirname, "../../app/api/v1/campaigns/active/route.ts"), "utf8");
  const gate = route.indexOf("if (!FOUNDER_MEMBERSHIP_ON_SALE) return answer(null);");
  assert.ok(gate > 0, "the route checks FOUNDER_MEMBERSHIP_ON_SALE");
  assert.ok(gate < route.indexOf('.from("platform_settings")'), "the gate comes before the settings read");
});

test("the admin settings page no longer says a signup earns the library days and the badge", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const page = readFileSync(join(import.meta.dirname, "../../app/dashboard/admin/settings/page.tsx"), "utf8");
  assert.doesNotMatch(page, /يسجّل بين التاريخين[^<]*يحصل على/);
  assert.match(page, /لا يمنح التسجيل المجاني/);
});

test("founder campaign: null the day before and the day after", () => {
  assert.equal(founderCampaignFromSetting(SEEDED, "2026-10-24"), null);
  assert.equal(founderCampaignFromSetting(SEEDED, "2027-01-26"), null);
});

test("founder campaign: a malformed value is null", () => {
  assert.equal(founderCampaignFromSetting(42, "2026-11-01"), null);
  assert.equal(founderCampaignFromSetting(null, "2026-11-01"), null);
  assert.equal(founderCampaignFromSetting("2026-10-25", "2026-11-01"), null);
  assert.equal(founderCampaignFromSetting([SEEDED], "2026-11-01"), null);
  assert.equal(founderCampaignFromSetting({ starts_on: "2026-10-25", library_days: 90 }, "2026-11-01"), null);
  assert.equal(founderCampaignFromSetting({ ends_on: "2027-01-25", library_days: 90 }, "2026-11-01"), null);
  assert.equal(founderCampaignFromSetting({ starts_on: "2027-01-25", ends_on: "2026-10-25" }, "2026-11-01"), null);
  assert.equal(founderCampaignFromSetting({ starts_on: "2026-10-25", ends_on: "2027-02-30" }, "2026-11-01"), null);
  assert.equal(founderCampaignFromSetting({ starts_on: "25/10/2026", ends_on: "2027-01-25" }, "2026-11-01"), null);
  assert.equal(founderCampaignFromSetting(SEEDED, "not-a-day"), null);
});

test("founder campaign: the reader is as tolerant as founder_campaign_active() — library_days and extra keys do not matter", () => {
  assert.ok(founderCampaignFromSetting({ starts_on: "2026-10-25", ends_on: "2027-01-25" }, "2026-11-01"));
  assert.ok(founderCampaignFromSetting({ ...SEEDED, library_days: "x", note: 1 }, "2026-11-01"));
});

test("the Riyadh date helper: 21:30 UTC on 24 Oct is 25 Oct in Riyadh", () => {
  assert.equal(riyadhDay(new Date("2026-10-24T21:30:00Z")), "2026-10-25");
});

test("founder_campaign admin validator: accepts the seeded value and the 'off' value", () => {
  assert.equal(founderCampaignSettingIssue(SEEDED), null);
  assert.equal(founderCampaignSettingIssue({ starts_on: null, ends_on: null, library_days: 90 }), null);
  assert.equal(founderCampaignSettingIssue({ starts_on: "2026-10-25", ends_on: "2026-10-25", library_days: 1 }), null);
  assert.equal(founderCampaignSettingIssue({ starts_on: "2026-10-25", ends_on: null, library_days: 3650 }), null);
});

test("founder_campaign admin validator: refuses a typo instead of silently turning the campaign off", () => {
  const bad: unknown[] = [
    42,
    null,
    "x",
    [SEEDED],
    { ...SEEDED, starts_on: "2026-1-25" },
    { ...SEEDED, starts_on: "2026-10-32" },
    { ...SEEDED, ends_on: "2027-02-30" },
    { ...SEEDED, ends_on: 20270125 },
    { ...SEEDED, starts_on: "2027-01-26" },        // after ends_on
    { ...SEEDED, library_days: 0 },
    { ...SEEDED, library_days: 3651 },
    { ...SEEDED, library_days: 90.5 },
    { ...SEEDED, library_days: "90" },
    { starts_on: "2026-10-25", ends_on: "2027-01-25" }, // library_days missing
    { ends_on: "2027-01-25", library_days: 90 },          // starts_on missing
    { ...SEEDED, startsOn: "2026-10-25" },                // unknown key
  ];
  for (const v of bad) {
    const issue = founderCampaignSettingIssue(v);
    assert.equal(typeof issue, "string", JSON.stringify(v));
    assert.match(issue as string, /[\u0600-\u06FF]/, "Arabic error copy");
  }
});

test("campaignFromApi: a usable campaign passes, anything else is null", () => {
  const c = founderCampaignFromSetting(SEEDED, "2026-11-01");
  assert.deepEqual(campaignFromApi({ campaign: c }), c);
  assert.equal(campaignFromApi({ campaign: null }), null);
  assert.equal(campaignFromApi(null), null);
  assert.equal(campaignFromApi({}), null);
  assert.equal(campaignFromApi({ campaign: { ...c, ctaHref: 5 } }), null);
  assert.equal(campaignFromApi({ campaign: { ...c, ctaHref: "https://evil.example" } }), null);
  assert.equal(campaignFromApi({ campaign: { ...c, ctaHref: "//evil.example" } }), null);
  assert.equal(campaignFromApi({ campaign: { ...c, ctaHref: "/\\evil.example" } }), null);
  assert.equal(campaignFromApi({ campaign: { ...c, endsOn: "2027-02-30" } }), null);
});

test("the admin settings route runs the founder_campaign validator", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const route = readFileSync(join(import.meta.dirname, "../../app/api/v1/admin/settings/route.ts"), "utf8");
  assert.match(route, /founder_campaign:\s*founderCampaignSettingIssue/);
});

// ── P3 Task 8: capacity / sale_paused (ruling R1), the seat count, the card ──

const STORED = { ...SEEDED, starts_on: "2026-11-01", capacity: 1096, sale_paused: false };

test("founder_campaign admin validator: capacity and sale_paused are optional, and accepted when well-formed", () => {
  assert.equal(founderCampaignSettingIssue(STORED), null);
  assert.equal(founderCampaignSettingIssue({ ...STORED, capacity: 1 }), null);
  assert.equal(founderCampaignSettingIssue({ ...STORED, capacity: 100000 }), null);
  assert.equal(founderCampaignSettingIssue({ ...STORED, sale_paused: true }), null);
  assert.equal(founderCampaignSettingIssue(SEEDED), null, "the SQL defaults them when absent");
});

test("founder_campaign admin validator: refuses a capacity or sale_paused the SQL would read as its default", () => {
  for (const bad of [
    { capacity: 0 },
    { capacity: -5 },
    { capacity: 100001 },
    { capacity: 50.5 },
    { capacity: "1096" },
    { capacity: null },
    { capacity: true },
    { sale_paused: "false" },
    { sale_paused: 0 },
    { sale_paused: null },
  ]) {
    const issue = founderCampaignSettingIssue({ ...STORED, ...bad });
    assert.equal(typeof issue, "string", JSON.stringify(bad));
    assert.match(issue as string, /[؀-ۿ]/);
  }
});

test("founderCapacityLiteralIssue: the posted body's capacity is a plain integer literal (R1: 50.0 refused)", () => {
  const body = (cap: string) => `{"key":"founder_campaign","value":{"starts_on":"2026-11-01","ends_on":"2027-01-25","library_days":90,"capacity":${cap}}}`;
  for (const ok of ["50", "1096", "100000", " 7 "]) assert.equal(founderCapacityLiteralIssue(body(ok)), null, ok);
  for (const bad of ["50.0", "5e1", "50E0", "-1", "1096.00"]) {
    const issue = founderCapacityLiteralIssue(body(bad));
    assert.equal(typeof issue, "string", bad);
    assert.match(issue as string, /[؀-ۿ]/);
  }
  // Not a number literal at all: left to the shape validator (which refuses it).
  assert.equal(founderCapacityLiteralIssue(body('"50"')), null);
  assert.equal(founderCapacityLiteralIssue(body("true")), null);
  // No capacity in the body: nothing to check.
  assert.equal(founderCapacityLiteralIssue('{"key":"founder_campaign","value":{"starts_on":null}}'), null);
  assert.equal(founderCapacityLiteralIssue('{"key":"founder_campaign","value":{"capacity" : 12.0}}') !== null, true);
});

test("mergeFounderCampaignSetting: a dates-only post (the settings page) keeps capacity and sale_paused", () => {
  const posted = { starts_on: "2026-11-02", ends_on: "2027-01-25", library_days: 90 };
  assert.deepEqual(mergeFounderCampaignSetting({ ...STORED, capacity: 500, sale_paused: true }, posted), {
    starts_on: "2026-11-02", ends_on: "2027-01-25", library_days: 90, capacity: 500, sale_paused: true,
  });
  // A capacity-only post keeps the dates.
  assert.deepEqual(mergeFounderCampaignSetting(STORED, { sale_paused: true }), { ...STORED, sale_paused: true });
  // Nothing stored (or a non-object): the post as it is.
  assert.deepEqual(mergeFounderCampaignSetting(null, posted), posted);
  assert.deepEqual(mergeFounderCampaignSetting("x", posted), posted);
  assert.deepEqual(mergeFounderCampaignSetting([STORED], posted), posted);
  // A non-object post is passed through untouched so the validator refuses it.
  assert.equal(mergeFounderCampaignSetting(STORED, 42), 42);
  assert.equal(mergeFounderCampaignSetting(STORED, null), null);
});

test("the admin settings route merges founder_campaign into the stored value and checks the raw capacity literal", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const route = readFileSync(join(import.meta.dirname, "../../app/api/v1/admin/settings/route.ts"), "utf8");
  assert.match(route, /await request\.text\(\)/);
  assert.match(route, /founderCapacityLiteralIssue\(raw\)/);
  const merge = route.indexOf("mergeFounderCampaignSetting(");
  assert.ok(merge > 0, "the route merges");
  assert.ok(merge < route.indexOf("const invalid = await validate("), "merge before validation");
  assert.match(route, /value: toStore/);
  assert.match(route, /after: \{ value: toStore \}/);
});

test("founderSummaryFromRpc: the founder_seat_summary() row, or null when unusable", () => {
  const row = { capacity: 1096, active: 10, reserved: 2, seats_left: 1084, sale_paused: false, on_sale: true };
  assert.deepEqual(founderSummaryFromRpc([row]), { capacity: 1096, seatsLeft: 1084, onSale: true, salePaused: false });
  assert.deepEqual(founderSummaryFromRpc(row), { capacity: 1096, seatsLeft: 1084, onSale: true, salePaused: false });
  assert.deepEqual(founderSummaryFromRpc([{ ...row, seats_left: 0, on_sale: false }]), { capacity: 1096, seatsLeft: 0, onSale: false, salePaused: false });
  // R31: a paused sale is read from the same row.
  assert.deepEqual(founderSummaryFromRpc([{ ...row, sale_paused: true, on_sale: false }]), { capacity: 1096, seatsLeft: 1084, onSale: false, salePaused: true });
  const noPaused = Object.fromEntries(Object.entries(row).filter(([k]) => k !== "sale_paused"));
  for (const bad of [null, [], [null], [{ ...row, on_sale: "true" }], [{ ...row, seats_left: -1 }], [{ ...row, capacity: 2.5 }], [{ ...row, sale_paused: "true" }], [noPaused], "x"]) {
    assert.equal(founderSummaryFromRpc(bad), null, JSON.stringify(bad));
  }
});

test("founderOfferCampaign: onSale is the code flag AND the SQL's on_sale", () => {
  const c = founderCampaignFromSetting(STORED, "2026-11-10")!;
  const summary = { capacity: 1096, seatsLeft: 9, onSale: true, salePaused: false };
  assert.deepEqual(founderOfferCampaign(c, summary, true), {
    ...c, planId: "lawyer-founder-2026", onSale: true, salePaused: false, seatsLeft: 9, capacity: 1096,
  });
  assert.equal(founderOfferCampaign(c, summary, false).onSale, false);
  assert.equal(founderOfferCampaign(c, { ...summary, onSale: false }, true).onSale, false);
  // R31: salePaused passes through (additive), next to onSale; endsOn is the setting's ends_on.
  const paused = founderOfferCampaign(c, { ...summary, onSale: false, salePaused: true }, true);
  assert.equal(paused.salePaused, true);
  assert.equal(paused.onSale, false);
  assert.equal(paused.endsOn, "2027-01-25");
});

test("campaignFromApi: the banner stays quiet when the seats are full or the sale is paused", () => {
  const c = founderCampaignFromSetting(STORED, "2026-11-10")!;
  const summary = { capacity: 1096, seatsLeft: 0, onSale: false, salePaused: false };
  assert.equal(campaignFromApi({ campaign: founderOfferCampaign(c, summary, true) }), null);
  // Paused with seats left: the SQL's on_sale is false, so the banner hides too.
  assert.equal(campaignFromApi({ campaign: founderOfferCampaign(c, { ...summary, seatsLeft: 50, salePaused: true }, true) }), null);
  const live = campaignFromApi({ campaign: founderOfferCampaign(c, { ...summary, seatsLeft: 5, onSale: true }, true) });
  assert.deepEqual(live, c, "only the banner fields come back");
});

test("GET /api/v1/campaigns/active reads founder_seat_summary() and tells a failed read apart from a closed sale", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const route = readFileSync(join(import.meta.dirname, "../../app/api/v1/campaigns/active/route.ts"), "utf8");
  assert.match(route, /\.rpc\("founder_seat_summary"\)/);
  assert.match(route, /founderOfferCampaign\(campaign, summary, FOUNDER_MEMBERSHIP_ON_SALE\)/);
  assert.match(route, /founderUnavailable: true/);
});
