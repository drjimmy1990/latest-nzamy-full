/**
 * approve.test.ts — the instant approval does what the admin approval does
 * for a lawyer (source contract: both files import next/server or Supabase,
 * so node --test cannot execute them).
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/lawyerSignup/approve.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const approve = readFileSync(join(import.meta.dirname, "approve.ts"), "utf8");
const adminRoute = readFileSync(
  join(import.meta.dirname, "../../app/api/v1/admin/verifications/[id]/route.ts"),
  "utf8",
);

test("the notification texts are the admin route's", () => {
  const title = /APPROVED_TITLE = "([^"]+)"/.exec(approve)?.[1];
  const body = /APPROVED_BODY = "([^"]+)"/.exec(approve)?.[1];
  assert.ok(title && body);
  assert.ok(adminRoute.includes(`"${title}"`), "the admin route's approve title changed — keep both in step");
  assert.ok(adminRoute.includes(`"${body}"`), "the admin route's approve body changed — keep both in step");
});

test("the same lawyer_profiles update, only from pending", () => {
  assert.match(approve, /\.from\("lawyer_profiles"\)\s*\.update\(\{ verification_status: "verified", updated_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(approve, /\.eq\("verification_status", "pending"\)/);
  assert.match(adminRoute, /\.from\("lawyer_profiles"\)\s*\.update\(\{\s*verification_status: newStatus,\s*updated_at: new Date\(\)\.toISOString\(\),?\s*\}\)/);
});

test("R6 (23505) is a hold, never an error", () => {
  assert.match(approve, /error\?\.code === "23505"\) return "claimed"/);
});

test("the same n8n event, and no admin audit row", () => {
  assert.match(approve, /dispatchVerificationToN8n\(\{[\s\S]*status: "verified"/);
  const code = approve.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!code.includes("logAdminAction"));
  assert.ok(!code.includes("admin_audit_events"));
});
