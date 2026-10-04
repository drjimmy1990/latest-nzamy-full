import assert from "node:assert/strict";
import test from "node:test";
import {
  entityMembershipKindForPath,
  isAllowedByTypeOrMembership,
  mergeMembershipReads,
  type ActiveEntityMemberships,
  type EntityMembershipSummary,
  type MembershipReads,
} from "./entityMembership.ts";

const memberships: ActiveEntityMemberships = {
  firm: { entityId: "firm-1", entityName: "مكتب الاختبار", role: "lawyer" },
  business: { entityId: "business-1", entityName: "شركة الاختبار", role: "legal_staff" },
};

test("only the matching entity dashboard has a membership requirement", () => {
  assert.equal(entityMembershipKindForPath("/dashboard/firm/cases"), "firm");
  assert.equal(entityMembershipKindForPath("/dashboard/business/team"), "business");
  assert.equal(entityMembershipKindForPath("/dashboard/client/services"), "business");
  assert.equal(entityMembershipKindForPath("/dashboard/client/requests/new"), "business");
  assert.equal(entityMembershipKindForPath("/dashboard/client/consultation/new"), "business");
  assert.equal(entityMembershipKindForPath("/dashboard/client/cases"), null);
  assert.equal(entityMembershipKindForPath("/dashboard/lawyer"), null);
  assert.equal(entityMembershipKindForPath("/settings"), null);
});

test("an active firm membership opens only the firm dashboard", () => {
  assert.equal(isAllowedByTypeOrMembership("lawyer", ["firm"], { firm: memberships.firm }), true);
  assert.equal(isAllowedByTypeOrMembership("lawyer", ["corporate"], { firm: memberships.firm }), false);
  assert.equal(isAllowedByTypeOrMembership("lawyer", ["admin"], { firm: memberships.firm }), false);
});

test("an active business membership opens only the business dashboard", () => {
  assert.equal(isAllowedByTypeOrMembership("individual", ["corporate"], { business: memberships.business }), true);
  assert.equal(isAllowedByTypeOrMembership("individual", ["firm"], { business: memberships.business }), false);
});

test("ordinary type access and the admin bypass are unchanged", () => {
  assert.equal(isAllowedByTypeOrMembership("firm", ["firm"], {}), true);
  assert.equal(isAllowedByTypeOrMembership("corporate", ["corporate"], {}), true);
  assert.equal(isAllowedByTypeOrMembership("admin", ["firm"], {}), true);
  assert.equal(isAllowedByTypeOrMembership(null, ["firm"], memberships), true);
  assert.equal(isAllowedByTypeOrMembership(null, ["lawyer"], memberships), false);
});

// ── mergeMembershipReads (WP-6 B-8) ─────────────────────────────────────────

const FIRM_MEMBER: EntityMembershipSummary = { entityId: "firm-1", entityName: "مكتب السند", role: "partner" };
const OWNED_FIRM: EntityMembershipSummary = { entityId: "firm-1", entityName: "مكتب السند", role: "managing_partner" };
const BIZ_MEMBER: EntityMembershipSummary = { entityId: "biz-1", entityName: "شركة البناء", role: "legal_manager" };
const OWNED_BIZ: EntityMembershipSummary = { entityId: "biz-1", entityName: "شركة البناء", role: "owner" };

const none = { summary: null, failed: false };
const failed = { summary: null, failed: true };
const ok = (summary: EntityMembershipSummary) => ({ summary, failed: false });

const reads = (over: Partial<MembershipReads> = {}): MembershipReads => ({
  firmMember: none,
  ownedFirm: none,
  businessMember: none,
  ownedBusiness: none,
  ...over,
});

test("four clean reads with no rows is 'found' with nothing — not 'unavailable'", () => {
  assert.deepEqual(mergeMembershipReads(reads()), { status: "found", memberships: {}, degraded: false });
});

test("`degraded` marks a partial answer, so deny-by-default can tell it from 'no role'", () => {
  // WP-6 B-9 pairs with this: an owner whose business_profiles read failed has
  // no businessRole, and must not be silently treated as having no permissions.
  const cleanAll = mergeMembershipReads(reads());
  assert.equal(cleanAll.status === "found" && cleanAll.degraded, false);
  for (const key of ["firmMember", "ownedFirm", "businessMember", "ownedBusiness"] as const) {
    const r = mergeMembershipReads(reads({ [key]: failed }));
    assert.equal(r.status, "found", key);
    if (r.status === "found") assert.equal(r.degraded, true, key);
  }
  const clean = mergeMembershipReads(reads({ ownedBusiness: ok(OWNED_BIZ) }));
  assert.equal(clean.status === "found" && clean.degraded, false);
  assert.equal(clean.status === "found" && Boolean(clean.memberships.business), true);
});

test("a membership row outranks the owned-profile fallback for the same entity", () => {
  const r = mergeMembershipReads(reads({ businessMember: ok(BIZ_MEMBER), ownedBusiness: ok(OWNED_BIZ) }));
  assert.equal(r.status, "found");
  if (r.status === "found") assert.deepEqual(r.memberships.business, BIZ_MEMBER);
});

test("an owner keeps their company when ONLY the business_members read failed", () => {
  // This is the 42P17 case (UAT-TEAM-001): a recursive business_members policy
  // threw and used to take the successfully-read business_profiles row with it,
  // throwing the owner out of /dashboard/business on a cold load.
  const r = mergeMembershipReads(reads({ businessMember: failed, ownedBusiness: ok(OWNED_BIZ) }));
  assert.equal(r.status, "found");
  if (r.status === "found") assert.deepEqual(r.memberships.business, OWNED_BIZ);
});

test("a failed business read never touches the firm answer, and the reverse", () => {
  const r = mergeMembershipReads(reads({
    firmMember: ok(FIRM_MEMBER),
    businessMember: failed,
    ownedBusiness: failed,
  }));
  assert.equal(r.status, "found");
  if (r.status === "found") {
    assert.deepEqual(r.memberships.firm, FIRM_MEMBER);
    assert.equal(r.memberships.business, undefined);
  }

  const r2 = mergeMembershipReads(reads({
    firmMember: failed,
    ownedFirm: failed,
    ownedBusiness: ok(OWNED_BIZ),
  }));
  assert.equal(r2.status, "found");
  if (r2.status === "found") {
    assert.equal(r2.memberships.firm, undefined);
    assert.deepEqual(r2.memberships.business, OWNED_BIZ);
  }
});

test("'unavailable' only when EVERY read failed", () => {
  assert.deepEqual(
    mergeMembershipReads({ firmMember: failed, ownedFirm: failed, businessMember: failed, ownedBusiness: failed }),
    { status: "unavailable" },
  );
  // Any single success is an answer.
  for (const key of ["firmMember", "ownedFirm", "businessMember", "ownedBusiness"] as const) {
    const all: MembershipReads = {
      firmMember: failed,
      ownedFirm: failed,
      businessMember: failed,
      ownedBusiness: failed,
    };
    const summary = key === "firmMember" ? FIRM_MEMBER
      : key === "ownedFirm" ? OWNED_FIRM
      : key === "businessMember" ? BIZ_MEMBER
      : OWNED_BIZ;
    assert.equal(mergeMembershipReads({ ...all, [key]: ok(summary) }).status, "found", key);
  }
});

test("a summary from a FAILED read is ignored, not used", () => {
  const r = mergeMembershipReads(reads({ ownedBusiness: { summary: OWNED_BIZ, failed: true } }));
  assert.equal(r.status, "found");
  if (r.status === "found") assert.equal(r.memberships.business, undefined);
});

test("the merged memberships still drive the dashboard guard the same way", () => {
  const r = mergeMembershipReads(reads({ ownedBusiness: ok(OWNED_BIZ) }));
  assert.equal(r.status, "found");
  if (r.status === "found") {
    // A lawyer who owns a company may open /dashboard/business — membership is
    // additive and never rewrites user_type.
    assert.equal(isAllowedByTypeOrMembership("lawyer", ["corporate", "admin"], r.memberships), true);
    assert.equal(isAllowedByTypeOrMembership("lawyer", ["firm"], r.memberships), false);
  }
});
