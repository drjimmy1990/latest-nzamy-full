/**
 * route.test.ts — GET /api/v1/auth/session.
 *
 * The contract itself is the pure `sessionResponseFor`, which lives in
 * src/lib/auth/sessionResponse.ts and is tested in sessionResponse.test.ts
 * beside it. What is left here is what only THIS file can show — no route
 * handler in this repo is exercised with a mocked Supabase client, and a route
 * file may not export a helper for a test to call, so these are assertions on
 * the route source (the house style of
 * src/app/api/library/search/route-fail-closed.test.ts).
 *
 * Kept in the endpoint's own folder as ground rule 6 of
 * docs/plans/PROFILES_COMPLETION_PLAN_2026-09-20.md requires.
 *
 * Run: npm run test:unit
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routeSource = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');

test('the route uses the RLS-scoped client and never the service role', () => {
  assert.match(routeSource, /createClient \} from "@\/lib\/supabase\/server"/);
  assert.doesNotMatch(routeSource, /createServiceClient|SUPABASE_SERVICE_ROLE_KEY/);
});

test('the route never caches its answer', () => {
  assert.match(routeSource, /export const dynamic = "force-dynamic";/);
  assert.match(routeSource, /"Cache-Control": "no-store"/);
});

test('the route routes its decision through resolveAuthOutcome and sessionResponseFor', () => {
  assert.match(routeSource, /resolveAuthOutcome\(user, authError\)/);
  assert.match(routeSource, /sessionResponseFor\(outcome, user\?\.id \?\? null, profile\)/);
});

test('the profile read is skipped unless there is a user to read it for', () => {
  assert.match(routeSource, /if \(outcome === "ok" && user\) \{/);
  assert.match(routeSource, /\.from\("profiles"\)[\s\S]{0,120}\.eq\("id", user\.id\)/);
});
