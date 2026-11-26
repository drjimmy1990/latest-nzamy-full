/**
 * routeAccess.test.ts
 *
 * Two defects are pinned here, both of which shipped to production and neither
 * of which any existing test could have caught, because the tables lived in a
 * file that imports `next/server`.
 *
 *   1. A corporate account could not reach any order form. Every working
 *      intake in the app sits under /dashboard/client, and that prefix was
 *      restricted to `individual`. The owner's own ruling (س٢) was that a
 *      company files through the same form.
 *
 *   2. The PUBLIC lawyer directory answered 401 to the public.
 *      "/api/v1/lawyer" was matched with startsWith, so it swallowed
 *      "/api/v1/lawyers" — a route that goes out of its way to use the
 *      service-role client so a logged-out visitor can read it.
 *
 * Run: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ROUTE_ACCESS,
  routeAccessRuleFor,
  isRouteAllowedFor,
  isProtectedApiPath,
  PROTECTED_API_PREFIXES,
  DB_USER_TYPES,
  isSharedClientIntakePath,
} from './routeAccess.ts';

// ── The corporate ordering path ────────────────────────────────────────────

const CORPORATE_INTAKE_PATHS = [
  '/dashboard/client/services',
  '/dashboard/client/requests',
  '/dashboard/client/requests/new',
  '/dashboard/client/requests/REQ-123',
  '/dashboard/client/consultation',
  '/dashboard/client/consultation/new',
];

test('a corporate account may load every shared intake path', () => {
  for (const path of CORPORATE_INTAKE_PATHS) {
    assert.equal(isSharedClientIntakePath(path), true, path);
    assert.equal(
      isRouteAllowedFor(path, 'corporate'),
      true,
      `${path} must be open to a corporate account — it is the only order form there is`,
    );
  }
});

test('the shared intake detector does not classify personal client screens as company context', () => {
  for (const path of [
    '/dashboard/client',
    '/dashboard/client/cases',
    '/dashboard/client/documents',
    '/dashboard/client/letters',
  ]) {
    assert.equal(isSharedClientIntakePath(path), false, path);
  }
});

test('an individual client keeps the same intake paths', () => {
  for (const path of CORPORATE_INTAKE_PATHS) {
    assert.equal(isRouteAllowedFor(path, 'individual'), true, path);
  }
});

test('opening the intake did NOT open the rest of the client dashboard', () => {
  // The whole point of listing three subtrees instead of relaxing
  // /dashboard/client: these are an individual's own screens and several read
  // individual-only data.
  const individualOnly = [
    '/dashboard/client',
    '/dashboard/client/cases',
    '/dashboard/client/wallet',
    '/dashboard/client/referral',
    '/dashboard/client/documents',
    '/dashboard/client/messages',
    '/dashboard/client/my-group',
    '/dashboard/client/letters',
    '/dashboard/client/find-lawyer',
  ];
  for (const path of individualOnly) {
    assert.equal(
      isRouteAllowedFor(path, 'corporate'),
      false,
      `${path} is an individual's screen and must stay closed to a company`,
    );
    assert.equal(isRouteAllowedFor(path, 'individual'), true, path);
  }
});

test('the narrow intake rules are ordered before the broad client rule', () => {
  // A first-match table is only as good as its order. If /dashboard/client
  // ever moves above the three intake prefixes, every one of them silently
  // reverts to individual-only and the corporate account loses ordering again
  // with nothing on screen to say so.
  const broad = ROUTE_ACCESS.findIndex((r) => r.prefix === '/dashboard/client');
  for (const path of ['/dashboard/client/services', '/dashboard/client/requests', '/dashboard/client/consultation']) {
    const narrow = ROUTE_ACCESS.findIndex((r) => r.prefix === path);
    assert.ok(narrow !== -1, `${path} must have its own rule`);
    assert.ok(narrow < broad, `${path} must be listed before /dashboard/client`);
  }
});

test('no other account type gained the intake', () => {
  for (const type of ['lawyer', 'firm', 'provider', 'government', 'ngo']) {
    assert.equal(isRouteAllowedFor('/dashboard/client/requests/new', type), false, type);
  }
});

test('E-108 (l16): the small-business account files through the shared intake, and nothing else of /dashboard/client', () => {
  for (const path of ['/dashboard/client/requests/new', '/dashboard/client/services', '/dashboard/client/consultation/new']) {
    assert.equal(isRouteAllowedFor(path, 'micro'), true, path);
  }
  for (const path of ['/dashboard/client', '/dashboard/client/cases', '/dashboard/client/wallet']) {
    assert.equal(isRouteAllowedFor(path, 'micro'), false, path);
  }
});

test("D-73 (l16): memo-studio is the simulator (lawyer / firm), gov and ngo tools are their sector's", () => {
  assert.equal(isRouteAllowedFor('/ai/memo-studio', 'lawyer'), true);
  assert.equal(isRouteAllowedFor('/ai/memo-studio', 'individual'), false);
  assert.equal(isRouteAllowedFor('/ai/gov/judgment-drafter', 'government'), true);
  assert.equal(isRouteAllowedFor('/ai/gov/judgment-drafter', 'individual'), false);
  assert.equal(isRouteAllowedFor('/ai/ngo/donation-analyzer', 'ngo'), true);
  assert.equal(isRouteAllowedFor('/ai/ngo/donation-analyzer', 'corporate'), false);
});

test('an unresolved user_type is refused, never defaulted', () => {
  assert.equal(isRouteAllowedFor('/dashboard/client/requests/new', null), false);
  assert.equal(isRouteAllowedFor('/dashboard/business', null), false);
});

test('every other dashboard prefix keeps its single owner', () => {
  const owners: Record<string, string> = {
    '/dashboard/lawyer': 'lawyer',
    '/dashboard/firm': 'firm',
    '/dashboard/business': 'corporate',
    '/dashboard/micro': 'micro',
    '/dashboard/provider': 'provider',
    '/dashboard/government': 'government',
    '/dashboard/ngo': 'ngo',
    '/dashboard/admin': 'admin',
  };
  for (const [path, owner] of Object.entries(owners)) {
    const rule = routeAccessRuleFor(path);
    assert.ok(rule, `${path} must have a rule`);
    assert.deepEqual([...rule.allowedTypes], [owner], path);
  }
});

test('every allowed type is a real profiles.user_type value', () => {
  for (const rule of ROUTE_ACCESS) {
    for (const type of rule.allowedTypes) {
      assert.ok(
        (DB_USER_TYPES as readonly string[]).includes(type),
        `${rule.prefix} allows "${type}", which the CHECK constraint does not`,
      );
    }
  }
});

test('every type is admitted by the rule on its own dashboard path', () => {
  // The property the proxy's redirect depends on: when a user is refused a
  // prefix it sends them to DASHBOARD_PATHS[type], and if THAT path's rule also
  // refused them the redirect would bounce forever. Pinned here rather than
  // asserted in a comment, because the table is no longer one-prefix-per-type.
  const dashboards: Record<string, string> = {
    individual: '/dashboard/client',
    lawyer: '/dashboard/lawyer',
    firm: '/dashboard/firm',
    corporate: '/dashboard/business',
    micro: '/dashboard/micro',
    provider: '/dashboard/provider',
    government: '/dashboard/government',
    ngo: '/dashboard/ngo',
    admin: '/dashboard/admin',
  };
  for (const [type, path] of Object.entries(dashboards)) {
    assert.equal(isRouteAllowedFor(path, type), true, `${type} must be admitted at ${path}`);
  }
});

test('a path outside the table is open', () => {
  assert.equal(routeAccessRuleFor('/settings'), null);
  assert.equal(isRouteAllowedFor('/settings', 'corporate'), true);
});

// ── The public lawyer directory ────────────────────────────────────────────

test('the public lawyer directory is NOT edge-protected', () => {
  // Both routes use the service-role client on purpose so a logged-out
  // visitor can read them. Answering 401 here made the public directory
  // unreadable by the public — confirmed against production, 2026-08-27.
  assert.equal(isProtectedApiPath('/api/v1/lawyers'), false);
  assert.equal(isProtectedApiPath('/api/v1/lawyers/abc-123'), false);
});

test('the lawyer-private subtree is still protected', () => {
  for (const path of [
    '/api/v1/lawyer/activity',
    '/api/v1/lawyer/clients',
    '/api/v1/lawyer/dashboard/summary',
    '/api/v1/lawyer/finance',
    '/api/v1/lawyer/tasks',
  ]) {
    assert.equal(isProtectedApiPath(path), true, path);
  }
});

test('the admin and firm subtrees are still protected', () => {
  assert.equal(isProtectedApiPath('/api/v1/admin/service-orders'), true);
  assert.equal(isProtectedApiPath('/api/v1/admin/receipts'), true);
  assert.equal(isProtectedApiPath('/api/v1/firm/anything'), true);
});

test('the bare subtree root is protected even without its slash', () => {
  // No route file sits at these paths today. If one is added, it is covered
  // from the moment it exists rather than from the moment someone remembers.
  assert.equal(isProtectedApiPath('/api/v1/lawyer'), true);
  assert.equal(isProtectedApiPath('/api/v1/admin'), true);
  assert.equal(isProtectedApiPath('/api/v1/firm'), true);
});

test('no sibling segment can be swallowed again', () => {
  // The exact class of bug: a prefix without a trailing slash matching a
  // longer word that starts with it.
  for (const prefix of PROTECTED_API_PREFIXES) {
    assert.ok(prefix.endsWith('/'), `${prefix} must end in a slash`);
  }
  for (const path of ['/api/v1/lawyers', '/api/v1/administration', '/api/v1/firms']) {
    assert.equal(isProtectedApiPath(path), false, path);
  }
});

test('unrelated API paths are untouched', () => {
  for (const path of ['/api/v1/service-requests', '/api/v1/documents', '/api/v1/leads', '/api/v1/payments/status']) {
    assert.equal(isProtectedApiPath(path), false, path);
  }
});
test("N05-V2: /ai/corp is for the corporate account only", () => {
  assert.equal(isRouteAllowedFor("/ai/corp/hr", "corporate"), true);
  for (const t of ["lawyer", "firm", "individual", "ngo", null]) {
    assert.equal(isRouteAllowedFor("/ai/corp/advisor", t), false, String(t));
  }
});

// ── PROTECTED (src/proxy.ts) and this table agree (17 Nov 2026) ───────────
// proxy.ts imports next/server, so its list is read as source, as
// lawyerOnlyTools.test.ts does. A rule here is read by the proxy ONLY for a
// PROTECTED path, so every rule prefix must sit under one.
import { readFileSync } from 'node:fs';

const proxySource = readFileSync(new URL('../../proxy.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const protectedBlock = /const PROTECTED = \[([\s\S]*?)\];/.exec(proxySource);
const PROTECTED_PAGES = protectedBlock
  ? [...protectedBlock[1].replace(/\/\/.*$/gm, '').matchAll(/"([^"]+)"/g)].map((m) => m[1])
  : [];
const isProtectedPage = (path: string) => PROTECTED_PAGES.some((p) => path.startsWith(p));

test('every ROUTE_ACCESS prefix is PROTECTED in the proxy, so its rule is actually read', () => {
  assert.ok(PROTECTED_PAGES.length > 10, 'read the PROTECTED list');
  for (const rule of ROUTE_ACCESS) {
    assert.ok(isProtectedPage(rule.prefix), `${rule.prefix} has a rule but is not PROTECTED`);
  }
});

test('N05-V2 / N05-M6: /ai/templates and the account marketplace pages need a session', () => {
  for (const path of [
    '/ai/templates',
    '/marketplace/post',
    '/marketplace/order/ORD-1',
    '/marketplace/workspace/col-1',
    '/marketplace/collaborate',
  ]) {
    assert.ok(isProtectedPage(path), path);
    // Any signed-in type: no type rule.
    assert.equal(routeAccessRuleFor(path), null, path);
  }
});

test('the public marketplace listing and its detail page stay public', () => {
  for (const path of ['/marketplace', '/marketplace/42', '/pro/marketplace', '/pro']) {
    assert.equal(isProtectedPage(path), false, path);
  }
});
