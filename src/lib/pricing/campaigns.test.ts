import assert from "node:assert/strict";
import test from "node:test";
import {
  activeCampaign,
  campaignFromApi,
  CAMPAIGNS,
  founderCampaignFromSetting,
  founderCampaignSettingIssue,
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

test("founder campaign: shows on the first and the last day, both included, with the owner's copy", () => {
  for (const today of ["2026-10-25", "2027-01-25"]) {
    const c = founderCampaignFromSetting(SEEDED, today);
    assert.ok(c, today);
    assert.equal(c.startsOn, "2026-10-25");
    assert.equal(c.endsOn, "2027-01-25");
    assert.equal(c.badgeAr, "فترة المحامي المؤسس");
    assert.equal(c.messageAr, "سجّل الآن واحصل على ٣ أشهر من المكتبة القانونية مجاناً وشارة المؤسس");
    assert.equal(c.ctaAr, "سجّل محامياً");
    assert.equal(c.ctaHref, "/register/provider?type=lawyer");
    assert.equal(c.id, "founder-2026-10-25");
  }
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
