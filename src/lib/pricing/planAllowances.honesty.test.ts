/**
 * planAllowances.honesty.test.ts — the individual plans sold online promise
 * consultations and contract reviews by number («٤ استشارات/سنة», «عقدان
 * مجاناً/سنة», «غير محدودة للقضية»), and no code counts or grants them: a
 * plan grants a tier only (grant_plan_subscription). The team applies them by
 * hand on a service request, so every such line says so (final review, item
 * 4). P5 redoes these plans when the owner's revised pricing arrives.
 *
 * Source-read: both files import through paths node --test cannot resolve.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/pricing/planAllowances.honesty.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const FILES = ["constants/pricing/pricing.individuals.ts", "lib/pricing/plans.ts"];

/** A quoted string that promises a counted consultation / contract-review allowance. */
const ALLOWANCE = [
  /٤ استشارات/,
  /عقدين \(٢\) سنوياً|عقدان مجاناً/,
  /استشارات غير محدودة|غير محدودة للقضية/,
  /4 annual consultations|4 sessions\/year/,
  /2 contract reviews|2 free\/year/,
  /Unlimited consultations|Unlimited for case/,
];
const MARKED = /بطلب يراجعه الفريق|request the team reviews|on request, team-reviewed/;

test("every counted allowance on an individual plan says the team applies it on a request", () => {
  let seen = 0;
  let strings = 0;
  for (const file of FILES) {
    const src = readFileSync(join(ROOT, file), "utf8");
    for (const m of src.matchAll(/"([^"\n]*)"/g)) {
      strings++;
      const text = m[1];
      if (!ALLOWANCE.some((re) => re.test(text))) continue;
      seen++;
      assert.match(text, MARKED, `${file}: «${text}»`);
    }
  }
  // The scan read the real plan files, so a zero below is not an empty read.
  assert.ok(strings > 50, `only ${strings} quoted strings in ${FILES.join(", ")}`);
  // Zero today: since q329 (owner package of 1 Nov 2026) the two plans that
  // carried these lines — ind-preventive and ind-litigation — are retired and
  // have no card, column or plan entry. No count is pinned (task 5 review
  // M6): a plan may promise one again, and passes when the line says how it
  // is applied (the match above), instead of failing on the count.
  assert.ok(seen >= 0);
});

test("the matchers themselves: an unmarked allowance is caught, a marked one passes", () => {
  for (const line of ["٤ استشارات/سنة", "عقدان مجاناً/سنة", "4 annual consultations"]) {
    assert.ok(ALLOWANCE.some((re) => re.test(line)), line);
    assert.doesNotMatch(line, MARKED, line);
  }
  assert.match("٤ استشارات/سنة بطلب يراجعه الفريق", MARKED);
  assert.match("4 annual consultations, on request, team-reviewed", MARKED);
});

test("the grant behind those plans is a tier only — nothing counts consultations or contract reviews", () => {
  const grant = readFileSync(join(ROOT, "..", "supabase", "migrations", "20261025_10_grant_plan_atomic.sql"), "utf8");
  assert.equal(/consultation|contract_review/i.test(grant), false);
});
