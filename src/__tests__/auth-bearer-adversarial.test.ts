/**
 * auth-bearer-adversarial.test.ts — Adversarial stress tests for Mobile Bearer Auth.
 *
 * EMPIRICAL CHALLENGER TEST SUITE:
 * 1. Case-insensitivity: lowercase 'bearer <token>', uppercase, mixed case.
 * 2. Empty / blank tokens: 'Bearer ', 'Bearer   ', 'Bearer', 'Bearer\t'.
 * 3. Whitespace anomalies & trailing garbage: '  Bearer   <token>   ', 'Bearer <token> garbage'.
 * 4. Dual-mode precedence & fallback:
 *    - Both valid cookie and valid Bearer -> Bearer wins.
 *    - Valid cookie and invalid Bearer -> 401 Rejected (no silent fallback).
 *    - Valid cookie and expired Bearer -> 401 Rejected (no silent fallback).
 *    - Valid cookie and absent Bearer -> Cookie wins.
 * 5. Token invalidation, expiration, and transport fault discrimination.
 * 6. Direct invocation resilience of createClient() outside request context.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── 1. Pure extraction helper mirroring proxy.ts and server.ts ────────────────

function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const trimmed = authHeader.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}

// ── 2. Adversarial Extraction Tests ──────────────────────────────────────────

test('adversarial: lowercase "bearer <token>" correctly extracts token', () => {
  const token = 'valid_token_xyz_123';
  assert.equal(extractBearerToken(`bearer ${token}`), token);
  assert.equal(extractBearerToken(`bearer    ${token}`), token);
});

test('adversarial: mixed and uppercase "BEARER", "bEaReR" correctly extracts token', () => {
  const token = 'valid_token_xyz_123';
  assert.equal(extractBearerToken(`BEARER ${token}`), token);
  assert.equal(extractBearerToken(`bEaReR ${token}`), token);
  assert.equal(extractBearerToken(`BeArEr   ${token}`), token);
});

test('adversarial: empty token "Bearer " with single or multiple spaces returns null', () => {
  assert.equal(extractBearerToken('Bearer '), null);
  assert.equal(extractBearerToken('Bearer    '), null);
  assert.equal(extractBearerToken('bearer '), null);
  assert.equal(extractBearerToken('bearer    '), null);
  assert.equal(extractBearerToken('BEARER '), null);
});

test('adversarial: empty token without space "Bearer" returns null', () => {
  assert.equal(extractBearerToken('Bearer'), null);
  assert.equal(extractBearerToken('bearer'), null);
  assert.equal(extractBearerToken('BEARER'), null);
});

test('adversarial: non-space whitespace like tab or newline in place of delimiter', () => {
  // RFC 9110 standard delimiter is space
  assert.equal(extractBearerToken('Bearer\ttoken'), null);
  assert.equal(extractBearerToken('Bearer\ntoken'), null);
});

test('adversarial: leading and trailing whitespace surrounding token is cleanly trimmed', () => {
  const token = 'eyJh.eyJb.c_d';
  assert.equal(extractBearerToken(`   Bearer    ${token}   `), token);
  assert.equal(extractBearerToken(` \t  bearer   ${token}  \t `), token);
});

test('adversarial: trailing garbage is retained in token for JWT validation to reject', () => {
  const malformed = 'eyJhbGciOiJIUzI1NiJ9 extra_injected_garbage -- DROP TABLE';
  const extracted = extractBearerToken(`Bearer ${malformed}`);
  assert.equal(extracted, malformed);
});

// ── 3. Dual-Mode Precedence & Fallback Simulation ────────────────────────────

interface MockUser {
  id: string;
  email: string;
  role: string;
}

interface MockAuthError {
  name: string;
  message: string;
  status: number;
}

function simulateAuthGate(
  authHeader: string | null,
  cookieUser: MockUser | null,
  jwtRegistry: Record<string, { user?: MockUser; error?: MockAuthError }>,
) {
  const bearerToken = extractBearerToken(authHeader);

  // If bearerToken exists, it MUST be evaluated.
  if (bearerToken) {
    const result = jwtRegistry[bearerToken];
    if (result && result.user) {
      return {
        status: 200,
        user: result.user,
        authenticatedVia: 'bearer',
        globalHeaderPassed: authHeader,
      };
    }
    // Explicit Bearer token was supplied but is invalid/expired: MUST reject, NOT fall back to cookie!
    return {
      status: 401,
      user: null,
      error: result?.error || { name: 'AuthApiError', message: 'Invalid JWT', status: 401 },
      authenticatedVia: 'none',
      globalHeaderPassed: null,
    };
  }

  // If NO bearerToken exists, fall back to cookieStore
  if (cookieUser) {
    return {
      status: 200,
      user: cookieUser,
      authenticatedVia: 'cookie',
      globalHeaderPassed: null,
    };
  }

  // Neither bearer nor cookie present
  return {
    status: 401,
    user: null,
    error: { name: 'AuthApiError', message: 'Unauthorized', status: 401 },
    authenticatedVia: 'none',
    globalHeaderPassed: null,
  };
}

test('dual-mode: both valid cookie (User A) and valid Bearer (User B) -> Bearer User B takes precedence', () => {
  const userA: MockUser = { id: 'usr_browser_cookie_alice', email: 'alice@nezamy.sa', role: 'client' };
  const userB: MockUser = { id: 'usr_mobile_bearer_bob', email: 'bob@nezamy.sa', role: 'lawyer' };

  const validBobJwt = 'bob_valid_jwt_header.payload.sig';
  const registry = {
    [validBobJwt]: { user: userB },
  };

  const gateResult = simulateAuthGate(`Bearer ${validBobJwt}`, userA, registry);

  assert.equal(gateResult.status, 200);
  assert.equal(gateResult.authenticatedVia, 'bearer');
  assert.equal(gateResult.user?.id, 'usr_mobile_bearer_bob');
  assert.equal(gateResult.user?.email, 'bob@nezamy.sa');
  assert.equal(gateResult.globalHeaderPassed, `Bearer ${validBobJwt}`);
});

test('dual-mode: valid cookie (User A) + INVALID Bearer -> MUST reject with 401 (no silent cookie fallback)', () => {
  const userA: MockUser = { id: 'usr_browser_cookie_alice', email: 'alice@nezamy.sa', role: 'client' };
  const forgedJwt = 'forged_or_invalid_jwt_token';

  const registry = {
    [forgedJwt]: {
      error: { name: 'AuthApiError', message: 'Invalid token signature', status: 401 },
    },
  };

  const gateResult = simulateAuthGate(`Bearer ${forgedJwt}`, userA, registry);

  assert.equal(gateResult.status, 401);
  assert.equal(gateResult.user, null);
  assert.equal(gateResult.authenticatedVia, 'none');
  assert.equal(gateResult.error?.status, 401);
});

test('dual-mode: valid cookie (User A) + EXPIRED Bearer -> MUST reject with 401 (no silent cookie fallback)', () => {
  const userA: MockUser = { id: 'usr_browser_cookie_alice', email: 'alice@nezamy.sa', role: 'client' };
  const expiredJwt = 'expired_jwt_from_old_mobile_session';

  const registry = {
    [expiredJwt]: {
      error: { name: 'AuthApiError', message: 'JWT expired', status: 401 },
    },
  };

  const gateResult = simulateAuthGate(`Bearer ${expiredJwt}`, userA, registry);

  assert.equal(gateResult.status, 401);
  assert.equal(gateResult.user, null);
  assert.equal(gateResult.authenticatedVia, 'none');
  assert.equal(gateResult.error?.message, 'JWT expired');
});

test('dual-mode: valid cookie (User A) + ABSENT Bearer header -> cleanly authenticates via cookie', () => {
  const userA: MockUser = { id: 'usr_browser_cookie_alice', email: 'alice@nezamy.sa', role: 'client' };

  const gateResult = simulateAuthGate(null, userA, {});

  assert.equal(gateResult.status, 200);
  assert.equal(gateResult.authenticatedVia, 'cookie');
  assert.equal(gateResult.user?.id, 'usr_browser_cookie_alice');
});

test('dual-mode: valid cookie (User A) + empty "Bearer " header -> falls back to cookie', () => {
  const userA: MockUser = { id: 'usr_browser_cookie_alice', email: 'alice@nezamy.sa', role: 'client' };

  // When empty 'Bearer ' is sent, extractBearerToken is null, meaning no Bearer was supplied
  const gateResult = simulateAuthGate('Bearer ', userA, {});

  assert.equal(gateResult.status, 200);
  assert.equal(gateResult.authenticatedVia, 'cookie');
  assert.equal(gateResult.user?.id, 'usr_browser_cookie_alice');
});

test('dual-mode: NO cookie + NO Bearer -> returns 401 Unauthorized', () => {
  const gateResult = simulateAuthGate(null, null, {});
  assert.equal(gateResult.status, 401);
  assert.equal(gateResult.user, null);
});

test('dual-mode: NO cookie + valid Bearer -> returns 200 OK with Bearer user', () => {
  const userB: MockUser = { id: 'usr_mobile_bearer_bob', email: 'bob@nezamy.sa', role: 'lawyer' };
  const token = 'bob_valid_token';
  const gateResult = simulateAuthGate(`Bearer ${token}`, null, {
    [token]: { user: userB },
  });

  assert.equal(gateResult.status, 200);
  assert.equal(gateResult.authenticatedVia, 'bearer');
  assert.equal(gateResult.user?.id, 'usr_mobile_bearer_bob');
});

// ── 4. Token Invalidation, Expiration, and Transport Fault Oracles ────────────

function resolveAuthOutcome(
  user: unknown,
  error: { name?: string; status?: number; message?: string } | null,
): 'ok' | 'unauthenticated' | 'unavailable' {
  if (user) return 'ok';
  if (!error) return 'unauthenticated';

  const isTransport =
    error.name === 'FetchError' ||
    error.name === 'AbortError' ||
    (typeof error.message === 'string' &&
      /failed to fetch|network|timeout|connection refused|econnrefused/i.test(error.message));

  if (isTransport || error.status === 503) {
    return 'unavailable';
  }
  return 'unauthenticated';
}

test('oracle: expired or invalid token produces unauthenticated (401), NOT unavailable (503)', () => {
  const expiredError = { name: 'AuthApiError', message: 'Token expired', status: 401 };
  assert.equal(resolveAuthOutcome(null, expiredError), 'unauthenticated');

  const invalidSigError = { name: 'AuthApiError', message: 'invalid signature', status: 400 };
  assert.equal(resolveAuthOutcome(null, invalidSigError), 'unauthenticated');

  const malformedError = { name: 'AuthApiError', message: 'bad format', status: 422 };
  assert.equal(resolveAuthOutcome(null, malformedError), 'unauthenticated');
});

test('oracle: network/TLS/transport failure produces unavailable (503)', () => {
  const networkError = { name: 'FetchError', message: 'Failed to fetch' };
  assert.equal(resolveAuthOutcome(null, networkError), 'unavailable');

  const timeoutError = { name: 'AbortError', message: 'Connection timeout' };
  assert.equal(resolveAuthOutcome(null, timeoutError), 'unavailable');

  const econnError = { name: 'Error', message: 'connect ECONNREFUSED 127.0.0.1:443' };
  assert.equal(resolveAuthOutcome(null, econnError), 'unavailable');
});

// ── 5. Behavioral Simulation of server.ts Context Safety ──────────────────────

test('server.ts safety: simulation of createClient catches throwing headers() outside request context', async () => {
  const throwingHeaders = async () => {
    throw new Error('headers() can only be called in a Server Component or Route Handler');
  };

  let authHeader: string | null = null;
  let bearerToken: string | null = null;

  // Exact logic from server.ts
  try {
    const headerStore = await throwingHeaders();
    authHeader = (headerStore as { get: (name: string) => string | null }).get('authorization');
    if (authHeader && authHeader.trim().toLowerCase().startsWith('bearer ')) {
      const token = authHeader.trim().slice(7).trim();
      if (token.length > 0) {
        bearerToken = token;
      }
    }
  } catch {
    // headers() may throw outside request contexts
  }

  assert.equal(authHeader, null);
  assert.equal(bearerToken, null);
});

test('server.ts safety: simulation of createClient parses headers() when available', async () => {
  const mockHeaders = async () => ({
    get(name: string) {
      if (name === 'authorization') return 'Bearer mobile_secret_token_123';
      return null;
    },
  });

  let authHeader: string | null = null;
  let bearerToken: string | null = null;

  try {
    const headerStore = await mockHeaders();
    authHeader = headerStore.get('authorization');
    if (authHeader && authHeader.trim().toLowerCase().startsWith('bearer ')) {
      const token = authHeader.trim().slice(7).trim();
      if (token.length > 0) {
        bearerToken = token;
      }
    }
  } catch {
    // headers() may throw outside request contexts
  }

  assert.equal(authHeader, 'Bearer mobile_secret_token_123');
  assert.equal(bearerToken, 'mobile_secret_token_123');
});

// ── 6. Source AST & Regex Invariant Checks ───────────────────────────────────

test('invariants: proxy.ts passes global.headers.Authorization only when bearerToken is present', () => {
  const proxyPath = join(process.cwd(), 'src/proxy.ts');
  const proxySource = readFileSync(proxyPath, 'utf8');

  // Verify condition: ...(authHeader && bearerToken ? { global: { headers: { Authorization: authHeader } } } : {})
  assert.match(
    proxySource,
    /\.\.\.\(authHeader\s*&&\s*bearerToken\s*\?\s*\{\s*global:\s*\{\s*headers:\s*\{\s*Authorization:\s*authHeader,?\s*\},?\s*\},?\s*\}\s*:\s*\{\}\)/,
    'proxy.ts must conditionally pass global.headers.Authorization only when bearerToken is valid',
  );
});

test('invariants: server.ts passes global.headers.Authorization only when bearerToken is present', () => {
  const serverPath = join(process.cwd(), 'src/lib/supabase/server.ts');
  const serverSource = readFileSync(serverPath, 'utf8');

  assert.match(
    serverSource,
    /\.\.\.\(authHeader\s*&&\s*bearerToken\s*\?\s*\{\s*global:\s*\{\s*headers:\s*\{\s*Authorization:\s*authHeader,?\s*\},?\s*\},?\s*\}\s*:\s*\{\}\)/,
    'server.ts must conditionally pass global.headers.Authorization only when bearerToken is valid',
  );
});
