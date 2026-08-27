/**
 * lead.test.ts — run with:  node --test src/app/api/v1/leads/business-assessment/lead.test.ts
 *
 * These assertions are about a PUBLIC, unauthenticated write path, so they are
 * mostly about what must NOT get through: extra columns, over-long strings,
 * unknown need ids, and a lead with no way to contact it back.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HONEYPOT_FIELD,
  LEGAL_NEEDS,
  LEAD_SOURCE_PATHS,
  DEFAULT_LEAD_SOURCE_PATH,
  resolveLeadSourcePath,
  LIMITS,
  buildLeadDescription,
  buildLeadRow,
  isHoneypotTripped,
  leadReference,
  validateBusinessLead,
} from "./lead.ts";

const VALID = {
  companyName: "شركة النخيل التجارية",
  companySize: "medium",
  needs: ["contracts", "labor"],
  contactName: "أحمد العتيبي",
  contactEmail: "ahmed@example.com",
  contactPhone: "0555555555",
  notes: "نحتاج مراجعة عقود الموردين.",
};

test("accepts a complete lead and returns only whitelisted fields", () => {
  const out = validateBusinessLead(VALID);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.deepEqual(Object.keys(out.value).sort(), [
    "companyName",
    "companySize",
    "contactEmail",
    "contactName",
    "contactPhone",
    "needs",
    "notes",
  ]);
});

test("drops any field the caller invented", () => {
  const out = validateBusinessLead({
    ...VALID,
    status: "completed",
    receiver: "lawyer",
    requester_user_id: "00000000-0000-0000-0000-000000000000",
    payment: { amount: 9999, status: "paid" },
  });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal("status" in out.value, false);
  assert.equal("receiver" in out.value, false);
  assert.equal("requester_user_id" in out.value, false);
  assert.equal("payment" in out.value, false);
});

test("rejects a lead with no phone and no email", () => {
  const out = validateBusinessLead({ ...VALID, contactEmail: "", contactPhone: "" });
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.ok(out.errors.some((e) => e.includes("جوال")));
});

test("accepts a phone-only lead and an email-only lead", () => {
  assert.equal(validateBusinessLead({ ...VALID, contactEmail: "" }).ok, true);
  assert.equal(validateBusinessLead({ ...VALID, contactPhone: "" }).ok, true);
});

test("rejects a malformed email and a malformed phone", () => {
  assert.equal(validateBusinessLead({ ...VALID, contactEmail: "not-an-email" }).ok, false);
  assert.equal(validateBusinessLead({ ...VALID, contactPhone: "abc", contactEmail: "" }).ok, false);
  assert.equal(validateBusinessLead({ ...VALID, contactPhone: "12345", contactEmail: "" }).ok, false);
});

test("rejects a missing or unknown company size", () => {
  assert.equal(validateBusinessLead({ ...VALID, companySize: "" }).ok, false);
  assert.equal(validateBusinessLead({ ...VALID, companySize: "enormous" }).ok, false);
  // A non-string must not coerce its way through.
  assert.equal(validateBusinessLead({ ...VALID, companySize: 2 }).ok, false);
});

test("caps every string field", () => {
  assert.equal(validateBusinessLead({ ...VALID, companyName: "ن".repeat(LIMITS.companyName + 1) }).ok, false);
  assert.equal(validateBusinessLead({ ...VALID, contactName: "ن".repeat(LIMITS.contactName + 1) }).ok, false);
  assert.equal(validateBusinessLead({ ...VALID, notes: "ن".repeat(LIMITS.notes + 1) }).ok, false);
});

test("silently drops unknown need ids but rejects a lead left with none", () => {
  const mixed = validateBusinessLead({ ...VALID, needs: ["contracts", "drop-tables", 7, null] });
  assert.equal(mixed.ok, true);
  if (!mixed.ok) return;
  assert.deepEqual(mixed.value.needs, ["contracts"]);

  assert.equal(validateBusinessLead({ ...VALID, needs: ["drop-tables"] }).ok, false);
  assert.equal(validateBusinessLead({ ...VALID, needs: [] }).ok, false);
  assert.equal(validateBusinessLead({ ...VALID, needs: "contracts" }).ok, false);
});

test("de-duplicates repeated needs", () => {
  const out = validateBusinessLead({ ...VALID, needs: ["labor", "labor", "labor"] });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.deepEqual(out.value.needs, ["labor"]);
});

test("rejects a non-object payload", () => {
  assert.equal(validateBusinessLead(null).ok, false);
  assert.equal(validateBusinessLead("companyName=x").ok, false);
  assert.equal(validateBusinessLead([VALID]).ok, false);
});

test("honeypot trips only when it carries text", () => {
  // Keyed off HONEYPOT_FIELD, never the literal name: renaming the field must
  // not silently turn this assertion into a test of a key nobody reads.
  assert.equal(isHoneypotTripped(VALID), false);
  assert.equal(isHoneypotTripped({ ...VALID, [HONEYPOT_FIELD]: "" }), false);
  assert.equal(isHoneypotTripped({ ...VALID, [HONEYPOT_FIELD]: "   " }), false);
  assert.equal(isHoneypotTripped({ ...VALID, [HONEYPOT_FIELD]: "http://spam.example" }), true);
});

test("the honeypot value never reaches the stored lead", () => {
  const out = validateBusinessLead({ ...VALID, [HONEYPOT_FIELD]: "http://spam.example" });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(HONEYPOT_FIELD in out.value, false);
});

test("the row reaches the admin queue and carries no price", () => {
  const out = validateBusinessLead(VALID);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  const row = buildLeadRow(out.value, { id: "abc", requesterUserId: null });

  // The one predicate the admin queue filters on.
  assert.equal(row.receiver, "ai_workspace");
  assert.equal(row.status, "pending_assignment");
  assert.equal(row.title, "تقييم قانوني مجاني — شركة النخيل التجارية");
  assert.deepEqual(row.payment, { amount: 0, status: "not_required" });
  assert.equal(row.requester_user_id, null);
});

test("the row carries the Arabic name «طلباتي» prints for it", () => {
  // A signed-in visitor's lead lands on their own orders list, and both that
  // list and the detail page print metadata.serviceTitleAr with no fallback.
  const out = validateBusinessLead(VALID);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  const meta = buildLeadRow(out.value, { id: "abc", requesterUserId: "u1" }).metadata as Record<string, unknown>;
  assert.equal(meta.serviceTitleAr, "تقييم قانوني مجاني");
  assert.equal(meta.isPublicLead, true);
});

test("the stored intake is Arabic, values included", () => {
  const out = validateBusinessLead(VALID);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  const row = buildLeadRow(out.value, { id: "abc", requesterUserId: null });
  const intake = (row.metadata as { intake: Record<string, unknown> }).intake;
  assert.equal(intake.companySize, "متوسطة (٢٠–٢٠٠ موظف)");
  assert.deepEqual(intake.legalNeeds, ["عقود ومراجعة وثائق", "قضايا عمالية ونزاعات"]);
});

test("optional intake keys are omitted rather than stored blank", () => {
  const out = validateBusinessLead({ ...VALID, contactEmail: "", notes: "" });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  const intake = (buildLeadRow(out.value, { id: "abc", requesterUserId: null }).metadata as {
    intake: Record<string, unknown>;
  }).intake;
  assert.equal("contactEmail" in intake, false);
  assert.equal("notes" in intake, false);
  assert.equal(intake.contactPhone, "0555555555");
});

test("the brief names the company, every need and the contact", () => {
  const out = validateBusinessLead(VALID);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  const brief = buildLeadDescription(out.value);
  assert.ok(brief.includes("شركة النخيل التجارية"));
  assert.ok(brief.includes("عقود ومراجعة وثائق"));
  assert.ok(brief.includes("قضايا عمالية ونزاعات"));
  assert.ok(brief.includes("0555555555"));
  assert.ok(brief.includes("أحمد العتيبي"));
});

test("every offered need id is accepted", () => {
  const all = LEGAL_NEEDS.map((n) => n.id);
  const out = validateBusinessLead({ ...VALID, needs: all });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.value.needs.length, all.length);
});

test("the reference is derived from the id that was written", () => {
  assert.equal(leadReference("0f8c1a2b-3d4e-5f60-7182-93a4b5c6d7e8"), "0F8C1A2B");
});

// ── source_path, an allowlist on an UNAUTHENTICATED endpoint ────────────────
//
// Anyone on the internet can POST to this route, and `source_path` is a stored
// column an admin reads to know where a lead came from. It is a hint from the
// caller, so it is resolved against a list rather than trusted.

test("each real page resolves to itself", () => {
  for (const path of LEAD_SOURCE_PATHS) {
    assert.equal(resolveLeadSourcePath(path), path);
  }
  assert.equal(resolveLeadSourcePath("/services/corporate/health-check"), "/services/corporate/health-check");
});

test("surrounding whitespace does not defeat the allowlist", () => {
  assert.equal(resolveLeadSourcePath("  /services/corporate/health-check  "), "/services/corporate/health-check");
});

test("anything else becomes the default and is never stored verbatim", () => {
  for (const hostile of [
    "/dashboard/admin",
    "/services/business/../../dashboard/admin",
    "https://example.com/phish",
    "javascript:alert(1)",
    "قال العميل إنه جاء من صفحة أخرى",
    "",
    "   ",
    undefined,
    null,
    42,
    { toString: () => "/dashboard/admin" },
    ["/services/business"],
  ]) {
    assert.equal(
      resolveLeadSourcePath(hostile),
      DEFAULT_LEAD_SOURCE_PATH,
      `${String(hostile)} must not reach source_path`,
    );
  }
});

test("an unrecognised value never rejects the lead — it only loses provenance", () => {
  // The whole point of resolving instead of validating: a lead from a real
  // prospective client must not be lost over a field that only affects
  // reporting.
  assert.equal(typeof resolveLeadSourcePath("nonsense"), "string");
  assert.ok(resolveLeadSourcePath("nonsense").startsWith("/"));
});

test("the 360 audit is offered as a need, so the health-check page needs no free text", () => {
  const ids = LEGAL_NEEDS.map((n) => n.id);
  assert.ok(ids.includes("legal_audit"), "legal_audit must exist — /services/corporate/health-check pre-selects it");
  const out = validateBusinessLead({ ...VALID, needs: ["legal_audit"] });
  assert.equal(out.ok, true);
});
