/**
 * libraryPurchaseEligibility.test.ts — LIVE-F05: the library is sold to
 * professionals only (owner, CONV-1285), and an individual is told why.
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/libraryPurchaseEligibility.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIBRARY_ELIGIBLE_USER_TYPES,
  LIBRARY_INDIVIDUAL_MESSAGE_AR,
  isLibrarySaleRequest,
  isPaidLibraryPlanRef,
  libraryPurchaseEligibility,
} from './libraryPurchaseEligibility.ts';
import { DB_USER_TYPES } from '../auth/userTypes.ts';

test('the professional account types may buy (an eligible professional account)', () => {
  for (const t of ['lawyer', 'firm', 'corporate', 'government']) {
    assert.deepEqual(libraryPurchaseEligibility(t), { eligible: true }, t);
  }
});

test('an individual is refused with the clear eligibility message', () => {
  const r = libraryPurchaseEligibility('individual');
  assert.equal(r.eligible, false);
  if (r.eligible) return;
  assert.equal(r.reason, 'individual');
  assert.equal(r.messageAr, LIBRARY_INDIVIDUAL_MESSAGE_AR);
  assert.match(r.messageAr, /لا يُباع لحسابات الأفراد/);
});

test('the types the owner did not name stay refused until he answers (owner question)', () => {
  for (const t of ['micro', 'ngo', 'provider']) {
    const r = libraryPurchaseEligibility(t);
    assert.equal(r.eligible, false, t);
    if (!r.eligible) assert.equal(r.reason, 'not_professional');
  }
});

test('a missing or unknown type fails closed', () => {
  for (const t of [null, undefined, '', 42, 'company']) {
    assert.equal(libraryPurchaseEligibility(t).eligible, false, String(t));
  }
});

test('every eligible type is a real profiles.user_type value', () => {
  for (const t of LIBRARY_ELIGIBLE_USER_TYPES) assert.ok((DB_USER_TYPES as readonly string[]).includes(t), t);
  assert.ok(!LIBRARY_ELIGIBLE_USER_TYPES.includes('individual'));
});

test('paid plans and library sale requests', () => {
  assert.ok(isPaidLibraryPlanRef('lib-q1') && isPaidLibraryPlanRef('lib-q2') && isPaidLibraryPlanRef('lib-annual'));
  assert.ok(!isPaidLibraryPlanRef('lib-admin') && !isPaidLibraryPlanRef('free') && !isPaidLibraryPlanRef(null));
  assert.ok(isLibrarySaleRequest('library'));
  assert.ok(!isLibrarySaleRequest('plan') && !isLibrarySaleRequest('media'));
});
