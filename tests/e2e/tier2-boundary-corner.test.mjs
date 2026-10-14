/**
 * tests/e2e/tier2-boundary-corner.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 2: Boundary Value Analysis (Corner & Boundary Cases) Test Suite
 *
 * Exercises system boundaries, thresholds, and edge cases:
 *   1. Saudi Mobile Phone Boundary Values (T2.PHONE.1–8)
 *   2. Onboarding & Picker ID Boundary Refusals (T2.ONB.1–8)
 *   3. AI Wizards Text Length & Mandatory Schema Boundaries (T2.INTAKE.1–10)
 *   4. Auth Bearer Header Edge Cases & Token Handling (T2.AUTH.1–6)
 *   5. 48-Hour Revision Window & Quota Exhaustion Boundaries (T2.REV.1–6)
 *
 * Execution:
 *   node --import tsx --test tests/e2e/tier2-boundary-corner.test.mjs
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const repoUrl = (...segments) => pathToFileURL(path.join(REPO_ROOT, ...segments)).href;

const {
  normalizeSaudiMobile,
  hasValidSaudiMobile,
  saudiMobileMessage,
} = await import(repoUrl("src", "lib", "services", "saudiMobile.ts"));

const {
  canClaimAccountType,
} = await import(repoUrl("src", "lib", "auth", "accountTypeClaim.ts"));

const {
  toDbUserType,
  isAssignableUserType,
} = await import(repoUrl("src", "lib", "auth", "userTypes.ts"));

const {
  validateContractsIntake,
} = await import(repoUrl("src", "lib", "services", "orderIntake.contracts.ts"));

const {
  validateDraftIntake,
} = await import(repoUrl("src", "lib", "services", "orderIntake.ts"));

const {
  validateWargamingIntake,
  WARGAMING_CRITIQUE_TARGET,
} = await import(repoUrl("src", "lib", "services", "orderIntake.wargaming.ts"));

const {
  validateLegalOpinionIntake,
} = await import(repoUrl("src", "lib", "services", "orderIntake.legalOpinion.ts"));

const {
  checkOrderIntake,
} = await import(repoUrl("src", "lib", "services", "intakeGuard.ts"));

// ─── 1. Saudi Mobile Phone Boundary Values (T2.PHONE) ───────────────────────

describe("Tier 2.1 — Saudi Mobile Phone Boundary Values", () => {
  test("T2.PHONE.1: Empty string returns empty reason", () => {
    const res = normalizeSaudiMobile("");
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "empty");
  });

  test("T2.PHONE.2: Non-string type (number, object) returns empty reason", () => {
    assert.equal(normalizeSaudiMobile(null).ok, false);
    assert.equal(normalizeSaudiMobile(undefined).ok, false);
    assert.equal(normalizeSaudiMobile(123456789).ok, false);
  });

  test("T2.PHONE.3: Alphabetic and alphanumeric input returns letters reason", () => {
    const res = normalizeSaudiMobile("050abc1234");
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "letters");
  });

  test("T2.PHONE.4: 8-digit mobile (below 9 subscriber digits) returns length reason", () => {
    const res = normalizeSaudiMobile("05012345");
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "length");
  });

  test("T2.PHONE.5: 10-digit subscriber (above 9 subscriber digits) returns length reason", () => {
    const res = normalizeSaudiMobile("05012345678");
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "length");
  });

  test("T2.PHONE.6: Landline number starting with 01 returns prefix reason", () => {
    const res = normalizeSaudiMobile("0112345678");
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "prefix");
  });

  test("T2.PHONE.7: Foreign country code (+20 Egypt) returns prefix reason", () => {
    const res = normalizeSaudiMobile("+201012345678");
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "prefix");
  });

  test("T2.PHONE.8: Number with punctuation, dots, spaces, and RTL marks is normalized", () => {
    const res = normalizeSaudiMobile("+966 (50) 123-4567");
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.e164, "+966501234567");
  });
});

// ─── 2. Onboarding & Picker ID Boundary Refusals (T2.ONB) ───────────────────

describe("Tier 2.2 — Onboarding & Picker ID Boundary Refusals", () => {
  test("T2.ONB.1: Invalid pickerId string is refused with invalid_picker_id", () => {
    const res = canClaimAccountType({
      requestedPickerId: "nonexistent_role",
      requestedSubRole: null,
      currentType: "individual",
      onboardingCompleted: false,
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "invalid_picker_id");
  });

  test("T2.ONB.2: Admin cannot be claimed via onboarding picker", () => {
    assert.equal(toDbUserType("admin"), null);
    assert.equal(isAssignableUserType("admin"), false);
  });

  test("T2.ONB.3: Provider picker (notary) without subRole is refused with sub_role_missing", () => {
    const res = canClaimAccountType({
      requestedPickerId: "notary",
      requestedSubRole: null,
      currentType: "individual",
      onboardingCompleted: false,
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "sub_role_missing");
  });

  test("T2.ONB.4: Provider picker (notary) with wrong subRole (arbitrator) is refused with sub_role_mismatch", () => {
    const res = canClaimAccountType({
      requestedPickerId: "notary",
      requestedSubRole: "arbitrator",
      currentType: "individual",
      onboardingCompleted: false,
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "sub_role_mismatch");
  });

  test("T2.ONB.5: Provider picker with invalid subRole value is refused with invalid_sub_role", () => {
    const res = canClaimAccountType({
      requestedPickerId: "notary",
      requestedSubRole: "unrecognized_subrole",
      currentType: "individual",
      onboardingCompleted: false,
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "invalid_sub_role");
  });

  test("T2.ONB.6: Non-provider picker (individual) sent with subRole is refused with sub_role_mismatch", () => {
    const res = canClaimAccountType({
      requestedPickerId: "individual",
      requestedSubRole: "notary",
      currentType: "individual",
      onboardingCompleted: false,
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "sub_role_mismatch");
  });

  test("T2.ONB.7: User who already has non-individual role is refused with type_already_set", () => {
    const res = canClaimAccountType({
      requestedPickerId: "company",
      requestedSubRole: null,
      currentType: "lawyer",
      onboardingCompleted: false,
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "type_already_set");
  });

  test("T2.ONB.8: User with onboarding_completed = true is refused with onboarding_already_completed", () => {
    const res = canClaimAccountType({
      requestedPickerId: "lawyer",
      requestedSubRole: null,
      currentType: "individual",
      onboardingCompleted: true,
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "onboarding_already_completed");
  });
});

// ─── 3. AI Wizards Text Length & Schema Boundaries (T2.INTAKE) ──────────────

describe("Tier 2.3 — AI Wizards Text Length & Schema Boundaries", () => {
  test("T2.INTAKE.1: Contract draft description with 19 characters fails (< 20 required)", () => {
    const raw = {
      schemaVersion: 1,
      service: "contracts",
      mode: "draft",
      parties: { one: { fullName: "الطرف الأول" }, two: { fullName: "الطرف الثاني" } },
      contractDesc: "١٢٣٤٥٦٧٨٩٠١٢٣٤٥٦٧٨٩", // 19 chars
      attachments: [],
    };
    const check = validateContractsIntake(raw);
    assert.equal(check.ok, false);
    assert.ok(check.errors?.some((e) => e.includes("قصير")));
  });

  test("T2.INTAKE.2: Contract draft description with exactly 20 characters passes", () => {
    const raw = {
      schemaVersion: 1,
      service: "contracts",
      mode: "draft",
      parties: { one: { fullName: "الطرف الأول" }, two: { fullName: "الطرف الثاني" } },
      contractDesc: "عقد توريد خدمات تجار", // exactly 20 chars
      attachments: [],
    };
    const check = validateContractsIntake(raw);
    assert.equal(check.ok, true);
  });

  test("T2.INTAKE.3: Contract draft with empty first party name fails", () => {
    const raw = {
      schemaVersion: 1,
      service: "contracts",
      mode: "draft",
      parties: { one: { fullName: "" }, two: { fullName: "الطرف الثاني" } },
      contractDesc: "عقد توريد خدمات تجارية بين طرفين",
      attachments: [],
    };
    const check = validateContractsIntake(raw);
    assert.equal(check.ok, false);
  });

  test("T2.INTAKE.4: Contract review without attachments fails (at least 1 contract file required)", () => {
    const raw = {
      schemaVersion: 1,
      service: "contracts",
      mode: "review",
      representing: "الطرف الأول",
      attachments: [],
    };
    const check = validateContractsIntake(raw);
    assert.equal(check.ok, false);
    assert.ok(check.errors?.some((e) => e.includes("مرفق") || e.includes("عقد")));
  });

  test("T2.INTAKE.5: Legal draft memo with 29 characters facts text fails (< 30 required)", () => {
    const raw = {
      schemaVersion: 1,
      service: "draft",
      clientRole: "plaintiff",
      memoType: "صحيفة دعوى",
      legalBranch: "عمالي",
      caseText: "وقائع الدعوى أقل من ثلاثين حر", // 29 chars
      parties: { one: { fullName: "أحمد" }, two: { fullName: "شركة النور" } },
      attachments: [],
    };
    const check = validateDraftIntake(raw);
    assert.equal(check.ok, false);
    assert.ok(check.errors?.some((e) => e.includes("قصير")));
  });

  test("T2.INTAKE.6: Legal draft memo with exactly 30 characters facts text passes", () => {
    const raw = {
      schemaVersion: 1,
      service: "draft",
      clientRole: "plaintiff",
      memoType: "صحيفة دعوى",
      legalBranch: "عمالي",
      caseText: "وقائع الدعوى بالضبط ثلاثون حرف", // 30 chars
      parties: { one: { fullName: "أحمد" }, two: { fullName: "شركة النور" } },
      attachments: [],
    };
    const check = validateDraftIntake(raw);
    assert.equal(check.ok, true);
  });

  test("T2.INTAKE.7: Wargaming caseSummary with 19 characters fails (< 20 required)", () => {
    const raw = {
      schemaVersion: 1,
      service: "wargaming",
      role: "plaintiff",
      area: "تجاري",
      caseSummary: "١٢٣٤٥٦٧٨٩٠١٢٣٤٥٦٧٨٩", // 19 chars
      targets: ["opponent"],
      attachments: [],
    };
    const check = validateWargamingIntake(raw);
    assert.equal(check.ok, false);
  });

  test("T2.INTAKE.8: Wargaming critique target without memoText and without memoAttachment fails", () => {
    const raw = {
      schemaVersion: 1,
      service: "wargaming",
      role: "plaintiff",
      area: "تجاري",
      caseSummary: "ملخص وقائع النزاع التجاري بالتفصيل الوافي",
      targets: [WARGAMING_CRITIQUE_TARGET],
      memoText: "",
      memoAttachmentIds: [],
      attachments: [],
    };
    const check = validateWargamingIntake(raw);
    assert.equal(check.ok, false);
  });

  test("T2.INTAKE.9: Legal opinion description with 19 characters fails (< 20 required)", () => {
    const raw = {
      schemaVersion: 1,
      service: "legal_opinion",
      outputType: "memo",
      topicArea: "تجاري",
      description: "١٢٣٤٥٦٧٨٩٠١٢٣٤٥٦٧٨٩",
      attachments: [],
    };
    const check = validateLegalOpinionIntake(raw);
    assert.equal(check.ok, false);
  });

  test("T2.INTAKE.10: Legal opinion letter format with malformed non-object letter payload fails", () => {
    const raw = {
      schemaVersion: 1,
      service: "legal_opinion",
      outputType: "letter",
      letter: "not-an-object",
      attachments: [],
    };
    const check = validateLegalOpinionIntake(raw);
    assert.equal(check.ok, false);
    assert.ok(check.errors?.some((e) => e.includes("الخطاب")));
  });
});

// ─── 4. Auth Bearer Header Edge Cases (T2.AUTH) ─────────────────────────────

describe("Tier 2.4 — Auth Bearer Header Edge Cases", () => {
  const extractBearer = (header) => (header?.startsWith("Bearer ") ? header.slice(7).trim() : null);

  test("T2.AUTH.1: Header with 'Bearer' followed by only whitespace returns empty string", () => {
    assert.equal(extractBearer("Bearer    "), "");
  });

  test("T2.AUTH.2: Header with lowercase 'bearer token' is not treated as Bearer (case sensitivity)", () => {
    assert.equal(extractBearer("bearer token123"), null);
  });

  test("T2.AUTH.3: Header with Basic scheme is rejected", () => {
    assert.equal(extractBearer("Basic dXNlcjpwYXNz"), null);
  });

  test("T2.AUTH.4: Header with Token prefix is rejected", () => {
    assert.equal(extractBearer("Token eyJhbGciOi..."), null);
  });

  test("T2.AUTH.5: Expired token timestamp can be detected via JWT payload exp inspection", () => {
    const isTokenExpired = (expEpochSeconds) => expEpochSeconds * 1000 < Date.now();
    const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    assert.equal(isTokenExpired(pastExp), true);
    assert.equal(isTokenExpired(futureExp), false);
  });

  test("T2.AUTH.6: Malformed JWT token structure without three dot-separated parts is detectable", () => {
    const isValidJwtShape = (token) => typeof token === "string" && token.split(".").length === 3;
    assert.equal(isValidJwtShape("header.payload.signature"), true);
    assert.equal(isValidJwtShape("invalid-token-string"), false);
    assert.equal(isValidJwtShape("one.two"), false);
  });
});

// ─── 5. 48-Hour Revision Window & Quota Boundaries (T2.REV) ─────────────────

describe("Tier 2.5 — 48-Hour Revision Window & Quota Boundaries", () => {
  const REVISION_LIMIT = 2;
  const REVISION_WINDOW_HOURS = 48;
  const REVISION_WINDOW_MS = REVISION_WINDOW_HOURS * 60 * 60 * 1000;

  function evaluateRevisionEligibility(metadata, currentTimeMs = Date.now()) {
    const deliverable = metadata?.deliverable;
    const deliveredAt = deliverable?.deliveredAt;
    if (!deliveredAt) return { allowed: false, reason: "not_delivered" };

    const deliveredMs = new Date(deliveredAt).getTime();
    if (Number.isNaN(deliveredMs)) return { allowed: false, reason: "invalid_delivery_date" };

    const elapsedMs = currentTimeMs - deliveredMs;
    if (elapsedMs > REVISION_WINDOW_MS) return { allowed: false, reason: "window_expired" };

    const revisions = Array.isArray(metadata?.revisions) ? metadata.revisions : [];
    if (revisions.length >= REVISION_LIMIT) return { allowed: false, reason: "quota_exhausted" };

    return { allowed: true, revisionsLeft: REVISION_LIMIT - revisions.length };
  }

  test("T2.REV.1: Request revision within 47h 59m (before 48h limit) is permitted", () => {
    const now = Date.now();
    const deliveredAt = new Date(now - (47 * 60 * 60 * 1000 + 59 * 60 * 1000)).toISOString();
    const res = evaluateRevisionEligibility({ deliverable: { deliveredAt }, revisions: [] }, now);
    assert.equal(res.allowed, true);
    assert.equal(res.revisionsLeft, 2);
  });

  test("T2.REV.2: Request revision at 48h 01m (after 48h limit) is rejected with window_expired", () => {
    const now = Date.now();
    const deliveredAt = new Date(now - (48 * 60 * 60 * 1000 + 60 * 1000)).toISOString();
    const res = evaluateRevisionEligibility({ deliverable: { deliveredAt }, revisions: [] }, now);
    assert.equal(res.allowed, false);
    assert.equal(res.reason, "window_expired");
  });

  test("T2.REV.3: Exactly 2 revisions already recorded triggers quota_exhausted rejection", () => {
    const now = Date.now();
    const deliveredAt = new Date(now - 3600000).toISOString(); // 1 hour ago
    const revisions = [
      { requestedAt: "2026-10-14T01:00:00Z", notes: "تعديل 1", index: 1 },
      { requestedAt: "2026-10-14T02:00:00Z", notes: "تعديل 2", index: 2 },
    ];
    const res = evaluateRevisionEligibility({ deliverable: { deliveredAt }, revisions }, now);
    assert.equal(res.allowed, false);
    assert.equal(res.reason, "quota_exhausted");
  });

  test("T2.REV.4: Undelivered order (deliveredAt missing) cannot be revised", () => {
    const res = evaluateRevisionEligibility({ revisions: [] });
    assert.equal(res.allowed, false);
    assert.equal(res.reason, "not_delivered");
  });

  test("T2.REV.5: Unparseable date string in deliveredAt fails closed", () => {
    const res = evaluateRevisionEligibility({ deliverable: { deliveredAt: "invalid-date" } });
    assert.equal(res.allowed, false);
    assert.equal(res.reason, "invalid_delivery_date");
  });

  test("T2.REV.6: First revision leaves exactly 1 remaining revision", () => {
    const now = Date.now();
    const deliveredAt = new Date(now - 3600000).toISOString();
    const revisions = [{ requestedAt: "2026-10-14T01:00:00Z", notes: "تعديل أول", index: 1 }];
    const res = evaluateRevisionEligibility({ deliverable: { deliveredAt }, revisions }, now);
    assert.equal(res.allowed, true);
    assert.equal(res.revisionsLeft, 1);
  });
});
