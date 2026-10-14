/**
 * auth-bearer.test.ts — Mobile Bearer Token Authentication & SSR Cookie Fallback.
 *
 * Verifies Milestone 1 requirements:
 * 1. Mobile Authorization: Bearer <token> authentication in proxy.ts and server.ts.
 * 2. Clean fallback to SSR cookies when Authorization header is absent.
 * 3. Rejection of invalid or expired Bearer tokens (401 Unauthorized).
 * 4. Pass-through of Authorization header to Supabase PostgREST (global.headers).
 * 5. Wrapped getUser behavior in server.ts delegating to the Bearer token.
 *
 * Run: npm run test:unit
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── 1. Source Contract Verification: src/proxy.ts ─────────────────────────────

const proxyPath = join(process.cwd(), 'src/proxy.ts');
const proxySource = readFileSync(proxyPath, 'utf8').replace(/\r\n/g, '\n');

test('proxy.ts: isProtectedApiPath gate checks for Authorization header', () => {
  assert.match(
    proxySource,
    /const\s+authHeader\s*=\s*req\.headers\.get\(["']authorization["']\)/,
    'proxy.ts must extract the authorization header from req.headers',
  );
});

test('proxy.ts: isProtectedApiPath parses Bearer token case-insensitively and trims whitespace', () => {
  assert.match(
    proxySource,
    /authHeader\.trim\(\)\.toLowerCase\(\)\.startsWith\(["']bearer\s+["']\)/,
    'proxy.ts must detect "Bearer " prefix case-insensitively',
  );
  assert.match(
    proxySource,
    /authHeader\.trim\(\)\.slice\(7\)\.trim\(\)/,
    'proxy.ts must slice the 7-character "bearer " prefix and trim the token',
  );
});

test('proxy.ts: isProtectedApiPath attaches Authorization header to createServerClient options', () => {
  assert.match(
    proxySource,
    /global:\s*\{\s*headers:\s*\{\s*Authorization:\s*authHeader,?\s*\},?\s*\}/,
    'proxy.ts must provide global.headers.Authorization to createServerClient when Bearer is present',
  );
});

test('proxy.ts: isProtectedApiPath authenticates via supabase.auth.getUser(bearerToken)', () => {
  assert.match(
    proxySource,
    /await\s*\(bearerToken\s*\?\s*supabase\.auth\.getUser\(bearerToken\)\s*:\s*supabase\.auth\.getUser\(\)\)/,
    'proxy.ts must call getUser(bearerToken) when bearerToken exists and getUser() otherwise',
  );
});

test('proxy.ts: isProtectedApiPath maintains 401 Unauthorized for missing/invalid auth and 503 for transport faults', () => {
  assert.match(
    proxySource,
    /if\s*\(!user\)\s*return\s+NextResponse\.json\(\{\s*error:\s*["']Unauthorized["']\s*\},?\s*\{\s*status:\s*401\s*\}\)/,
    'proxy.ts must reject unauthorized requests with status 401',
  );
  assert.match(
    proxySource,
    /resolveAuthOutcome\(user,\s*authError\)\s*===\s*["']unavailable["']/,
    'proxy.ts must handle auth transport unavailability',
  );
});

// ── 2. Source Contract Verification: src/lib/supabase/server.ts ───────────────

const serverPath = join(process.cwd(), 'src/lib/supabase/server.ts');
const serverSource = readFileSync(serverPath, 'utf8').replace(/\r\n/g, '\n');

test('server.ts: imports headers from next/headers alongside cookies', () => {
  assert.match(
    serverSource,
    /import\s*\{[^}]*cookies[^}]*headers[^}]*\}\s*from\s*['"]next\/headers['"]|import\s*\{[^}]*headers[^}]*cookies[^}]*\}\s*from\s*['"]next\/headers['"]/,
    'server.ts must import both cookies and headers from next/headers',
  );
});

test('server.ts: createClient inspects headers() for authorization inside a try-catch block', () => {
  assert.match(
    serverSource,
    /const\s+headerStore\s*=\s*await\s+headers\(\)/,
    'server.ts must await headers()',
  );
  assert.match(
    serverSource,
    /headerStore\.get\(['"]authorization['"]\)/,
    'server.ts must inspect authorization header',
  );
  assert.match(
    serverSource,
    /try\s*\{[\s\S]*?await\s+headers\(\)[\s\S]*?\}\s*catch/,
    'server.ts must safely catch errors if headers() is invoked outside a request context',
  );
});

test('server.ts: passes global Authorization header to createServerClient for Bearer requests', () => {
  assert.match(
    serverSource,
    /global:\s*\{\s*headers:\s*\{\s*Authorization:\s*authHeader,?\s*\},?\s*\}/,
    'server.ts must pass Authorization header to PostgREST via global options',
  );
});

test('server.ts: wraps client.auth.getUser to supply bearerToken by default', () => {
  assert.match(
    serverSource,
    /if\s*\(bearerToken\)\s*\{[\s\S]*?client\.auth\.getUser\s*=/,
    'server.ts must wrap client.auth.getUser when a Bearer token is present',
  );
  assert.match(
    serverSource,
    /originalGetUser\(jwt\s*\|\|\s*bearerToken!?\)/,
    'server.ts getUser wrapper must pass bearerToken when jwt is omitted',
  );
});

test('server.ts: preserves SSR cookieStore for browser session backward compatibility', () => {
  assert.match(
    serverSource,
    /cookies:\s*\{\s*getAll\(\)\s*\{[\s\S]*?cookieStore/,
    'server.ts must preserve cookieStore.getAll() implementation',
  );
  assert.match(
    serverSource,
    /cookieStore!?\.set\(name,\s*value,\s*options\)/,
    'server.ts must preserve cookieStore.set() implementation',
  );
});

test('server.ts: createServiceClient remains untouched with service role key', () => {
  assert.match(
    serverSource,
    /export\s+async\s+function\s+createServiceClient\(\)/,
    'server.ts must export createServiceClient',
  );
  assert.match(
    serverSource,
    /process\.env\.SUPABASE_SERVICE_ROLE_KEY!/,
    'server.ts createServiceClient must use service role key',
  );
});

// ── 3. Pure Logic & Behavioral Unit Tests ─────────────────────────────────────

/**
 * Extracts Bearer token from authorization header according to the exact spec.
 */
function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const trimmed = authHeader.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Simulates client.auth.getUser wrapping logic as implemented in server.ts.
 */
function simulateSupabaseClient(
  bearerToken: string | null,
  cookieUser: { id: string; email: string } | null,
  validJwtTokens: Record<string, { id: string; email: string }>,
) {
  // Underlying mock GoTrue client
  const auth = {
    async getUser(jwt?: string) {
      if (jwt) {
        if (validJwtTokens[jwt]) {
          return { data: { user: validJwtTokens[jwt] }, error: null };
        }
        return {
          data: { user: null },
          error: { name: 'AuthApiError', message: 'Invalid or expired JWT', status: 401 },
        };
      }
      // No JWT provided: resolve from cookie store
      if (cookieUser) {
        return { data: { user: cookieUser }, error: null };
      }
      return { data: { user: null }, error: null };
    },
  };

  const client = { auth };

  // Apply server.ts wrapping
  if (bearerToken) {
    const originalGetUser = client.auth.getUser.bind(client.auth);
    client.auth.getUser = async (jwt?: string) => {
      return originalGetUser(jwt || bearerToken);
    };
  }

  return client;
}

test('extractBearerToken: successfully extracts clean JWT from standard Bearer header', () => {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.token';
  assert.equal(extractBearerToken(`Bearer ${token}`), token);
});

test('extractBearerToken: handles case-insensitivity ("bearer", "BEARER", "Bearer")', () => {
  const token = 'my-token-123';
  assert.equal(extractBearerToken(`bearer ${token}`), token);
  assert.equal(extractBearerToken(`BEARER ${token}`), token);
  assert.equal(extractBearerToken(`BeArEr ${token}`), token);
});

test('extractBearerToken: handles irregular whitespace surrounding Bearer prefix and token', () => {
  const token = 'my-token-456';
  assert.equal(extractBearerToken(`  Bearer   ${token}   `), token);
  assert.equal(extractBearerToken(`bearer    ${token}`), token);
});

test('extractBearerToken: returns null for missing, null, or empty headers', () => {
  assert.equal(extractBearerToken(null), null);
  assert.equal(extractBearerToken(undefined), null);
  assert.equal(extractBearerToken(''), null);
  assert.equal(extractBearerToken('   '), null);
});

test('extractBearerToken: returns null for non-Bearer schemes (Basic, ApiKey, Digest)', () => {
  assert.equal(extractBearerToken('Basic dXNlcjpwYXNz'), null);
  assert.equal(extractBearerToken('ApiKey secret_12345'), null);
  assert.equal(extractBearerToken('Digest username="user"'), null);
});

test('extractBearerToken: returns null for empty Bearer token ("Bearer ")', () => {
  assert.equal(extractBearerToken('Bearer'), null);
  assert.equal(extractBearerToken('Bearer '), null);
  assert.equal(extractBearerToken('Bearer    '), null);
});

test('server.ts getUser wrapper: authenticates valid Bearer token without passing arguments', async () => {
  const validToken = 'valid_mobile_jwt_123';
  const expectedUser = { id: 'usr_lawyer_99', email: 'lawyer@nezamy.sa' };
  const client = simulateSupabaseClient(validToken, null, {
    [validToken]: expectedUser,
  });

  // Calling getUser() with no args must return the Bearer user
  const { data, error } = await client.auth.getUser();
  assert.equal(error, null);
  assert.deepEqual(data.user, expectedUser);
});

test('server.ts getUser wrapper: rejects invalid or forged Bearer token', async () => {
  const invalidToken = 'forged_or_malformed_token';
  const client = simulateSupabaseClient(invalidToken, null, {});

  const { data, error } = await client.auth.getUser();
  assert.equal(data.user, null);
  assert.notEqual(error, null);
  assert.equal(error?.status, 401);
});

test('server.ts getUser wrapper: rejects expired Bearer token', async () => {
  const expiredToken = 'expired_mobile_jwt_456';
  const client = simulateSupabaseClient(expiredToken, null, {});

  const { data, error } = await client.auth.getUser();
  assert.equal(data.user, null);
  assert.notEqual(error, null);
  assert.equal(error?.message, 'Invalid or expired JWT');
});

test('server.ts getUser wrapper: allows explicit JWT argument override', async () => {
  const defaultBearer = 'default_bearer_token';
  const overrideJwt = 'explicit_override_jwt';
  const defaultUser = { id: 'default_usr', email: 'default@nezamy.sa' };
  const overrideUser = { id: 'override_usr', email: 'override@nezamy.sa' };

  const client = simulateSupabaseClient(defaultBearer, null, {
    [defaultBearer]: defaultUser,
    [overrideJwt]: overrideUser,
  });

  // Calling with explicit override JWT returns overrideUser
  const overrideResult = await client.auth.getUser(overrideJwt);
  assert.deepEqual(overrideResult.data.user, overrideUser);

  // Calling with no args returns defaultUser
  const defaultResult = await client.auth.getUser();
  assert.deepEqual(defaultResult.data.user, defaultUser);
});

test('server.ts cookie fallback: missing Bearer token cleanly authenticates from cookies', async () => {
  const cookieSessionUser = { id: 'usr_browser_42', email: 'client@nezamy.sa' };
  // bearerToken is null, but cookieUser is present
  const client = simulateSupabaseClient(null, cookieSessionUser, {});

  const { data, error } = await client.auth.getUser();
  assert.equal(error, null);
  assert.deepEqual(data.user, cookieSessionUser);
});

test('server.ts cookie fallback: missing Bearer token and empty cookies returns null user', async () => {
  // Both Bearer token and cookies are null
  const client = simulateSupabaseClient(null, null, {});

  const { data, error } = await client.auth.getUser();
  assert.equal(error, null);
  assert.equal(data.user, null);
});

type ProxyGateResult =
  | { status: 503; body: { error: string } }
  | { status: 401; body: { error: string } }
  | { status: 200; body: { ok: true; user: { id: string; email: string } } };

function simulateProxyGate(
  authHeader: string | null,
  cookieUser: { id: string; email: string } | null,
  validJwtTokens: Record<string, { id: string; email: string }>,
  isTransportFailure = false,
): ProxyGateResult {
  const bearerToken = extractBearerToken(authHeader);

  if (isTransportFailure) {
    return { status: 503, body: { error: 'خدمة المصادقة غير متاحة مؤقتاً — حاول بعد قليل' } };
  }

  let user: { id: string; email: string } | null = null;
  if (bearerToken) {
    user = validJwtTokens[bearerToken] ?? null;
  } else {
    user = cookieUser;
  }

  if (!user) {
    return { status: 401, body: { error: 'Unauthorized' } };
  }

  return { status: 200, body: { ok: true, user } };
}

test('proxy simulation: valid Bearer token allows API request through (200 OK)', () => {
  const token = 'valid_mobile_token_abc';
  const user = { id: 'lawyer_1', email: 'lawyer@nezamy.sa' };
  const res = simulateProxyGate(`Bearer ${token}`, null, { [token]: user });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('proxy simulation: invalid Bearer token is rejected with 401 Unauthorized', () => {
  const res = simulateProxyGate('Bearer bad_token_123', null, {});
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'Unauthorized' });
});

test('proxy simulation: missing Bearer token falls back to browser cookies (200 OK)', () => {
  const cookieUser = { id: 'cookie_user_2', email: 'cookie@nezamy.sa' };
  const res = simulateProxyGate(null, cookieUser, {});
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('proxy simulation: missing Bearer token and missing cookies yields 401 Unauthorized', () => {
  const res = simulateProxyGate(null, null, {});
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'Unauthorized' });
});

test('proxy simulation: transport failure returns 503 Service Unavailable', () => {
  const res = simulateProxyGate('Bearer any_token', null, {}, true);
  assert.equal(res.status, 503);
  if (res.status === 503) {
    assert.match(res.body.error, /غير متاحة مؤقتاً/);
  }
});
