/**
 * navigation.sidebars.business.test.ts
 *
 * Pins the guard behind the owner's 26 August ruling (§3أ): a company that
 * bookmarked one of the fabricated corporate sections must not walk back into
 * it through the URL bar after the sidebar link is gone.
 *
 * The trap this file exists to catch: /dashboard/business is the parent of
 * every hidden section, so a prefix match on the dashboard root would let all
 * of them straight through and the whole change would be cosmetic.
 *
 * Run: npm run test:unit
 */
import assert from 'node:assert/strict';
import {
  CORPORATE_SIDEBAR,
  VISIBLE_BUSINESS_ROUTES,
  isVisibleBusinessRoute,
  isHiddenBusinessSection,
} from './navigation.sidebars.business.ts';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (e) { console.error(`✗ ${name}`); throw e; }
};

// ── the visible set ──────────────────────────────────────────────────────────

// The vault joined the root on 26 August (owner item ٨). The list is pinned
// rather than merely counted so that re-opening a corporate route is always a
// deliberate edit here — every entry on it is a section a corporate account can
// reach, and the whole point of the 26 August ruling was that most of them
// could not honestly be.
test('only the dashboard root and the document vault are linked under /dashboard/business', () => {
  assert.deepEqual(VISIBLE_BUSINESS_ROUTES, [
    '/dashboard/business',
    '/dashboard/business/documents',
  ]);
});

test('the corporate sidebar links to nothing that renders fabricated data', () => {
  const hrefs = CORPORATE_SIDEBAR.flatMap((g) => g.items).map((i) => i.href);
  assert.deepEqual(hrefs, [
    '/dashboard/business',
    // Real: /dashboard/business/documents lists the account's own uploads and
    // nothing else — there is no mock row anywhere in it.
    '/dashboard/business/documents',
    // 2026-08-27 — the shared intake (owner س٢: «الشركة تستخدم نفس النموذج»).
    // These are /dashboard/client/* on purpose; routeAccess.ts opens exactly
    // these three subtrees to a corporate account and nothing else.
    '/dashboard/client/services',
    '/dashboard/client/requests',
    '/dashboard/client/consultation',
    '/notifications',
    '/blog',
    '/settings',
  ]);
});

test('the intake links do NOT re-open any /dashboard/business section', () => {
  // VISIBLE_BUSINESS_ROUTES is derived from CORPORATE_SIDEBAR, so anything
  // added to that array could in principle widen the guard. These three sit
  // under a different prefix and must be filtered out of it entirely.
  for (const href of ['/dashboard/client/services', '/dashboard/client/requests', '/dashboard/client/consultation']) {
    assert.equal(VISIBLE_BUSINESS_ROUTES.includes(href), false, href);
  }
  assert.deepEqual(VISIBLE_BUSINESS_ROUTES, ['/dashboard/business', '/dashboard/business/documents']);
});

test('the vault and its sub-pages are reachable, its look-alikes are not', () => {
  assert.equal(isVisibleBusinessRoute('/dashboard/business/documents'), true);
  assert.equal(isVisibleBusinessRoute('/dashboard/business/documents/42'), true);
  assert.equal(isVisibleBusinessRoute('/dashboard/business/documents?tab=all'), true);
  // A route that merely starts with the same letters is a different section.
  assert.equal(isVisibleBusinessRoute('/dashboard/business/documentsX'), false);
});

// ── what the guard admits ────────────────────────────────────────────────────

test('the overview itself is reachable', () => {
  assert.equal(isVisibleBusinessRoute('/dashboard/business'), true);
});

test('a trailing slash, a query and a hash do not change the answer', () => {
  assert.equal(isVisibleBusinessRoute('/dashboard/business/'), true);
  assert.equal(isVisibleBusinessRoute('/dashboard/business?mode=service'), true);
  assert.equal(isVisibleBusinessRoute('/dashboard/business/?mode=service'), true);
  assert.equal(isVisibleBusinessRoute('/dashboard/business#top'), true);
});

// ── what the guard refuses — the whole point ─────────────────────────────────

test('every hidden section is refused, including its sub-pages', () => {
  for (const hidden of [
    '/dashboard/business/kanban',
    '/dashboard/business/cases',
    '/dashboard/business/cases/new',
    '/dashboard/business/cases/abc-123',
    '/dashboard/business/departments',
    '/dashboard/business/departments/hr',
    '/dashboard/business/team',
    '/dashboard/business/reports',
    '/dashboard/business/wallet',
    '/dashboard/business/employee-contracts',
    '/dashboard/business/circuits-emails',
    '/dashboard/business/health-check',
    '/dashboard/business/governance',
    '/dashboard/business/reviews',
    '/dashboard/business/reviews/new',
    '/dashboard/business/seconded-counsel',
    '/dashboard/business/marketplace',
    '/dashboard/business/requests',
    '/dashboard/business/consultations',
    '/dashboard/business/hearings',
    '/dashboard/business/procedures-expert',
  ]) {
    assert.equal(isVisibleBusinessRoute(hidden), false, hidden);
  }
});

test('a query string does not smuggle a hidden section past the guard', () => {
  assert.equal(isVisibleBusinessRoute('/dashboard/business/kanban?mode=erp'), false);
  assert.equal(isVisibleBusinessRoute('/dashboard/business/governance?tab=matrix'), false);
});

test('a route that merely starts with the same letters is not the root', () => {
  assert.equal(isVisibleBusinessRoute('/dashboard/business-legacy'), false);
});

// ── re-adding a link re-opens its route ──────────────────────────────────────

test('a re-added section, and only it, becomes reachable again', () => {
  const withVault = ['/dashboard/business', '/dashboard/business/vault'];
  assert.equal(isVisibleBusinessRoute('/dashboard/business/vault', withVault), true);
  assert.equal(isVisibleBusinessRoute('/dashboard/business/vault/cr', withVault), true);
  assert.equal(isVisibleBusinessRoute('/dashboard/business/kanban', withVault), false);
});

// ── what the LAYOUT asks, which is a different question ──────────────────────
//
// BusinessDashboardLayout is not mounted only over /dashboard/business:
// src/app/ai/layout.tsx wraps every /ai/* page in it for any corporate
// account. It used to ask isVisibleBusinessRoute, got `false` for /ai/orders/x
// — a route that is not a business section at all — and painted the
// «هذا القسم قيد الإعداد» notice over a company's own order.

test('a route outside /dashboard/business is never a hidden business section', () => {
  for (const outside of [
    '/ai/orders',
    '/ai/orders/abc-123',
    '/ai/orders/abc-123?tab=files',
    '/ai/secretary',
    '/dashboard/client/requests',
    '/dashboard/client/requests/new',
    '/dashboard/client/services',
    '/dashboard/client/consultation/new',
    '/notifications',
    '/settings',
    '/blog',
    '/',
    // Starts with the same letters, is a different route.
    '/dashboard/business-legacy',
  ]) {
    assert.equal(
      isHiddenBusinessSection(outside),
      false,
      `${outside} is not a business section — the layout must render it, not refuse it`,
    );
  }
});

test('every hidden business section is still refused', () => {
  for (const hidden of [
    '/dashboard/business/kanban',
    '/dashboard/business/cases',
    '/dashboard/business/cases/abc-123',
    '/dashboard/business/team',
    '/dashboard/business/wallet',
    '/dashboard/business/reports',
    '/dashboard/business/reviews/new',
    '/dashboard/business/health-check?tab=files',
  ]) {
    assert.equal(isHiddenBusinessSection(hidden), true, hidden);
  }
});

test('the two visible business routes are not refused', () => {
  for (const visible of [
    '/dashboard/business',
    '/dashboard/business/',
    '/dashboard/business?mode=service',
    '/dashboard/business/documents',
    '/dashboard/business/documents/42',
  ]) {
    assert.equal(isHiddenBusinessSection(visible), false, visible);
  }
});

console.log(`✓ ${passed} tests passed`);
