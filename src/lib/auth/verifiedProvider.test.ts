/**
 * R9b / F11 (batch l11-sec): an unverified account creates no contract,
 * invoice or fee statement.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  UNVERIFIED_PROVIDER_CHECK_FAILED_AR,
  UNVERIFIED_PROVIDER_CODE,
  UNVERIFIED_PROVIDER_REFUSAL_AR,
  verifiedProviderDecision,
  type VerifiedProviderFacts,
} from "./verifiedProvider.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const facts = (o: Partial<VerifiedProviderFacts>): VerifiedProviderFacts => ({
  userType: "lawyer",
  lawyerStatus: null,
  ownedFirmStatuses: [],
  memberFirmStatuses: [],
  ...o,
});

test("R9b: a verified lawyer passes; pending, rejected, suspended or no profile are refused", () => {
  assert.deepEqual(verifiedProviderDecision(facts({ lawyerStatus: "verified" })), { ok: true });
  for (const s of ["pending", "rejected", "suspended", null]) {
    const d = verifiedProviderDecision(facts({ lawyerStatus: s }));
    assert.equal(d.ok, false, String(s));
    if (!d.ok) {
      assert.equal(d.status, 403);
      assert.equal(d.error, UNVERIFIED_PROVIDER_REFUSAL_AR);
      assert.equal(d.code, UNVERIFIED_PROVIDER_CODE);
    }
  }
});

test("R9b: a firm account passes on its own verified firm; a pending firm is refused", () => {
  assert.deepEqual(verifiedProviderDecision(facts({ userType: "firm", ownedFirmStatuses: ["verified"] })), { ok: true });
  assert.equal(verifiedProviderDecision(facts({ userType: "firm", ownedFirmStatuses: ["pending"] })).ok, false);
  // a «verified» lawyer status on a firm account counts for nothing
  assert.equal(verifiedProviderDecision(facts({ userType: "firm", lawyerStatus: "verified" })).ok, false);
});

test("R9b: staff of a verified firm pass; of an unverified firm they do not", () => {
  assert.deepEqual(verifiedProviderDecision(facts({ userType: "individual", memberFirmStatuses: ["verified"] })), { ok: true });
  assert.deepEqual(verifiedProviderDecision(facts({ lawyerStatus: "pending", memberFirmStatuses: ["pending", "verified"] })), { ok: true });
  assert.equal(verifiedProviderDecision(facts({ userType: "individual", memberFirmStatuses: ["pending"] })).ok, false);
});

test("R9b: admin passes; an unreadable state fails closed (503)", () => {
  assert.deepEqual(verifiedProviderDecision(facts({ userType: "admin" })), { ok: true });
  const d = verifiedProviderDecision(null);
  assert.equal(d.ok, false);
  if (!d.ok) {
    assert.equal(d.status, 503);
    assert.equal(d.error, UNVERIFIED_PROVIDER_CHECK_FAILED_AR);
  }
});

test("R9b: the refusal is Arabic and says what to do", () => {
  assert.match(UNVERIFIED_PROVIDER_REFUSAL_AR, /وثّق رخصتك أولاً/);
  assert.doesNotMatch(UNVERIFIED_PROVIDER_REFUSAL_AR, /[A-Za-z]/);
});

test("R9b: the four create paths call the guard after the role check and before any write", () => {
  const routes: Array<[string, string, RegExp]> = [
    ["src/app/api/v1/lawyer/contracts/route.ts", "export async function POST", /\.from\("contracts"\)\s*\.insert\(/],
    ["src/app/api/v1/lawyer/finance/route.ts", "export async function POST", /createInvoiceWith\(/],
    ["src/app/api/v1/lawyer/fee-statement/route.ts", "export async function GET", /buildFeeStatement\(/],
    ["src/app/api/v1/lawyer/fee-statement/billed/route.ts", "export async function POST", /\.update\(/],
  ];
  for (const [rel, fn, write] of routes) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    const start = src.indexOf(fn);
    assert.ok(start >= 0, `${rel}: ${fn}`);
    const body = src.slice(start);
    const role = body.search(/assert(Role|CaseWorker)\(/);
    const guard = body.indexOf("requireVerifiedProvider(user.id, auth.userType)");
    const firstWrite = body.search(write);
    assert.ok(role >= 0 && guard > role, `${rel}: the guard runs after the role check`);
    assert.ok(firstWrite < 0 || guard < firstWrite, `${rel}: the guard runs before the write`);
  }
});
