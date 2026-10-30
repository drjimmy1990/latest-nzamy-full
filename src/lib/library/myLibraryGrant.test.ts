/**
 * myLibraryGrant.test.ts — the my-grant answer (owner note ١٨ C05) and where
 * the UI uses it (LIVE-F05: an individual sees why, not a checkout).
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/myLibraryGrant.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { grantHeadlineAr, grantNeedsRenewal, parseMyLibraryGrant } from './myLibraryGrant.ts';

const SRC = join(import.meta.dirname, '..', '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

const GRANT = {
  status: 'active', startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2027-01-01T00:00:00.000Z',
  endsAtAr: '١ يناير ٢٠٢٧', daysLeft: 63, planRef: 'lib-q1', planLabel: 'ربع سنوي', nextStartsAt: null,
};

test('a well-formed answer is read; the card says «ساري حتى» with the date', () => {
  const a = parseMyLibraryGrant(true, { signedIn: true, grant: GRANT, purchase: { eligible: true } });
  assert.equal(a.signedIn, true);
  assert.ok(a.grant);
  assert.equal(grantHeadlineAr(a.grant!), 'اشتراك المكتبة: ساري حتى ١ يناير ٢٠٢٧');
  assert.deepEqual(a.purchase, { eligible: true });
  assert.equal(grantNeedsRenewal(a.grant!), false);
  assert.equal(grantNeedsRenewal({ ...a.grant!, daysLeft: 7 }), true);
});

test('a refusal is read with its message; anything malformed is nothing (never a fake date)', () => {
  const a = parseMyLibraryGrant(true, {
    signedIn: true, grant: null, purchase: { eligible: false, reason: 'individual', messageAr: 'رسالة' },
  });
  assert.deepEqual(a.purchase, { eligible: false, reason: 'individual', messageAr: 'رسالة' });
  assert.equal(a.grant, null);
  assert.deepEqual(parseMyLibraryGrant(false, { signedIn: true, grant: GRANT }), { signedIn: false, grant: null, purchase: null });
  assert.equal(parseMyLibraryGrant(true, { signedIn: true, grant: { ...GRANT, endsAt: 5 } }).grant, null);
  assert.equal(parseMyLibraryGrant(true, { signedIn: true, purchase: { eligible: false, reason: 'x', messageAr: 'm' } }).purchase, null);
});

test('my-grant never sends the admin reason, notes, granted_by or the order', () => {
  const route = read('app/api/v1/library/my-grant/route.ts');
  const select = route.slice(route.indexOf('.from("library_access_grants")'), route.indexOf('.limit(50)'));
  assert.ok(select.includes('.select("id, plan_ref, source, starts_at, ends_at")'));
  assert.ok(!/reason|notes|granted_by|order_id/.test(select));
  assert.ok(!route.includes('library_access_grant_admin'));
  assert.ok(route.includes('.eq("user_id", user.id)'), 'the id comes from the session');
});

test('/laws/subscribe: the card, the eligibility note, and no request or checkout for a refused account', () => {
  const page = read('app/laws/subscribe/page.tsx');
  assert.ok(page.includes('<LibraryGrantStatusCard answer={myGrant.answer}'));
  assert.ok(page.includes('{purchaseRefusal.messageAr}'));
  const fnAt = page.indexOf('function handleSubscribe(');
  const refuseAt = page.indexOf('if (purchaseRefusal) {', fnAt);
  const checkoutAt = page.indexOf('buyButtonAction(', fnAt);
  const requestAt = page.indexOf('requestEntitlement(', fnAt);
  assert.ok(refuseAt > fnAt && refuseAt < checkoutAt && refuseAt < requestAt, 'refuse before checkout or request');
});

test('PaywallModal: the eligibility note and a non-link button for a refused account; no fallback number', () => {
  const modal = read('app/laws/components/PaywallModal.tsx');
  assert.ok(modal.includes('{refusal.messageAr}'));
  assert.ok(modal.includes('aria-disabled="true"'));
  assert.ok(!modal.includes(': FREE_LIMIT;'), 'the 5 fallback is not printed when no freeLimit is passed');
  assert.ok(modal.includes('يُعرض جزء مجاني من كل نص'));
});

test('settings → subscription shows the card', () => {
  assert.ok(read('app/settings/components/tabs/SubscriptionTab.tsx').includes('<LibraryGrantStatusCard'));
});
