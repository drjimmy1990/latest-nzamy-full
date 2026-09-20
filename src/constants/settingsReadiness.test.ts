/**
 * settingsReadiness.test.ts — the settings role policy, asserted against the
 * source rather than by importing it.
 *
 * `settingsReadiness.ts` imports `@/hooks/useUser` for its `UserSession` type,
 * and `@/`-aliased imports are not resolvable outside the Next.js bundler, so
 * `node --test` cannot load the module. The same technique the API route tests
 * in this repo use applies: read the file and assert on what it says. Every
 * assertion here is about a LITERAL LIST, which is exactly the kind of thing
 * source assertions are good for.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./settingsReadiness.ts", import.meta.url), "utf8");

function block(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `«${startMarker}» not found in settingsReadiness.ts`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `«${endMarker}» not found after «${startMarker}»`);
  return source.slice(start, end);
}

test("CORPORATE_INVITE_ROLES offers all EIGHT invitable business_members roles", () => {
  // The role CHECK is nine values (20260603_phase1_002_entities.sql:303-307);
  // `owner` is written by the ensure_business_owner_membership trigger from
  // business_profiles.owner_user_id and is not invitable.
  // compliance_officer and seconded were missing until WP-6 B-5, although
  // isCorporateComplianceManager branches on the first and the team page
  // renders labels for both.
  const roles = block("const CORPORATE_INVITE_ROLES", "];");
  for (const value of [
    "legal_manager",
    "legal_staff",
    "compliance_officer",
    "seconded",
    "department_head",
    "hr_manager",
    "finance_manager",
    "employee",
  ]) {
    assert.match(roles, new RegExp(`value: "${value}"`), `CORPORATE_INVITE_ROLES is missing ${value}`);
  }
  assert.doesNotMatch(roles, /value: "owner"/);
  assert.equal((roles.match(/value: "/g) ?? []).length, 8);
});

test("every corporate invite role carries an Arabic label", () => {
  const roles = block("const CORPORATE_INVITE_ROLES", "];");
  for (const line of roles.split("\n")) {
    if (!line.includes('value: "')) continue;
    assert.match(line, /label: "[^"]*[؀-ۿ][^"]*"/, line.trim());
  }
});

test("seatPolicy is still never populated by any branch", () => {
  // Five invented seat counters lived there — «مقاعد الشركة ١٢/٢٥» was shown
  // to every corporate account in the country as its own live figure. Nothing
  // counts seats; there is no seat table and no plan quota in the schema.
  assert.doesNotMatch(source, /seatPolicy: \{/);
});

// ── WP-6 B-9: the corporate role predicates deny by default ────────────────

test("no corporate predicate defaults an unknown role to «owner» any more", () => {
  // `role ?? "owner"` meant a corporate account whose membership read had
  // failed — the whole 42P17 population of UAT-TEAM-001 — was treated as the
  // company owner and shown entity, team, billing and compliance settings.
  const predicates = block("function isCorporateEntityManager", "export function getSettingsRolePolicy");
  assert.doesNotMatch(predicates, /role \?\? "owner"/);
  for (const fn of [
    "isCorporateEntityManager",
    "isCorporateBillingManager",
    "isCorporateComplianceManager",
  ]) {
    const body = predicates.slice(predicates.indexOf(`function ${fn}`));
    assert.match(
      body.slice(0, body.indexOf("}")),
      /return role \? \[[^\]]*\]\.includes\(role\) : false;/,
      `${fn} must deny an unknown role`,
    );
  }
});

test("the corporate branch says WHY a permission is denied when the role was unreadable", () => {
  const corporate = block('if (userType === "corporate")', 'if (userType === "micro")');
  assert.match(corporate, /const roleUnavailable = !businessRole && membershipState !== undefined && membershipState !== "ok";/);
  assert.match(corporate, /roleUnavailable,/);
  // …and it is NOT raised for an account that simply holds no entity role.
  assert.doesNotMatch(corporate, /roleUnavailable = !businessRole;/);
});

test("the policy type carries the flag, so a screen can render the reason", () => {
  assert.match(source, /roleUnavailable\?: boolean;/);
});
