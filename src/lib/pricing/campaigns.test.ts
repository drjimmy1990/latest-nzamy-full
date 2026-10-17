import assert from "node:assert/strict";
import test from "node:test";
import { activeCampaign, CAMPAIGNS, riyadhDay, type Campaign } from "./campaigns.ts";

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
