import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_SECTIONS_SHOWN,
  PROFILE_VISIBILITY_COLUMNS,
  profileVisibilityFrom,
  applyProfileVisibility,
} from "./profileVisibility.ts";

test("the column list is the three switches of 20261025_50", () => {
  assert.equal(PROFILE_VISIBILITY_COLUMNS, "show_services, show_education, show_courts");
});

test("a read error (42703 before the migration) shows every section — the column default", async () => {
  const v = await profileVisibilityFrom(Promise.resolve({ data: null, error: { code: "42703", message: "column does not exist" } }), "t");
  assert.deepEqual(v, ALL_SECTIONS_SHOWN);
  const thrown = await profileVisibilityFrom(Promise.reject(new Error("boom")), "t");
  assert.deepEqual(thrown, ALL_SECTIONS_SHOWN);
  const none = await profileVisibilityFrom(Promise.resolve({ data: null, error: null }), "t");
  assert.deepEqual(none, ALL_SECTIONS_SHOWN);
});

test("only an explicit false hides a section", async () => {
  const v = await profileVisibilityFrom(
    Promise.resolve({ data: { show_services: false, show_education: true, show_courts: null }, error: null }),
    "t",
  );
  assert.deepEqual(v, { services: false, education: true, courts: true });
});

test("applyProfileVisibility empties a hidden section and removes the raw column from the embed", () => {
  const lp: Record<string, unknown> = { education: [{ degree: "ماجستير" }], courts: ["general"], bio_ar: "x" };
  const row: Record<string, unknown> = {
    education: [{ degree: "ماجستير" }],
    courts: ["general"],
    services: [{ id: "s" }],
    reviews: [{ id: "r" }],
    lawyer_profiles: lp,
  };
  applyProfileVisibility(row, lp, { services: false, education: false, courts: true });
  assert.deepEqual(row.services, []);
  assert.deepEqual(row.education, []);
  assert.deepEqual(row.courts, ["general"]);
  assert.equal("education" in lp, false, "the embedded column is gone too");
  assert.deepEqual(lp.courts, ["general"]);
  assert.deepEqual(row.reviews, [{ id: "r" }], "reviews cannot be hidden");
  assert.deepEqual(row.hiddenSections, ["services", "education"]);
});

test("nothing hidden: the row is left exactly as it was", () => {
  const lp = { education: [], courts: [] };
  const row: Record<string, unknown> = { services: null, education: [], courts: [], lawyer_profiles: lp };
  applyProfileVisibility(row, lp, ALL_SECTIONS_SHOWN);
  assert.equal(row.services, null, "a failed services read stays null (not an empty list)");
  assert.equal("hiddenSections" in row, false);
});
