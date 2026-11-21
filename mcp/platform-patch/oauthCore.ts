// DRAFT — src/lib/ext/oauthCore.ts. Pure functions of the OAuth 2.1 one-click flow (authorization code + PKCE S256),
// kept free of Next.js/Supabase so they are unit-tested here (test: nezamy-mcp/test/oauth.test.ts).
// The route handlers (/oauth/register, /oauth/authorize, /oauth/token, /oauth/revoke) call these and do the I/O.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const CODE_TTL_MS = 60_000;
export const ACCESS_TTL_S = 3600;
export const ALLOWED_SCOPES = ["library:read", "graph:read", "ai:run", "account:read", "dossier:read", "research:write"] as const;

const b64url = (b: Buffer) => b.toString("base64url");
export const sha256b64url = (s: string) => b64url(createHash("sha256").update(s).digest());

/** Dynamic client registration (RFC 7591): https redirect URIs only (loopback http allowed), no wildcards, no fragments. */
export function validRedirectUri(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.hash || u.includes("*")) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch { return false; }
}

/** The ONLY redirect check: exact string match with a registered URI. */
export const redirectMatches = (registered: string[], given: string) => registered.includes(given);

export function pkceChallengeOk(method: string | undefined, challenge: string | undefined): boolean {
  return method === "S256" && !!challenge && /^[A-Za-z0-9_-]{43}$/.test(challenge);
}

export function verifyPkce(verifier: string, storedChallenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const a = Buffer.from(sha256b64url(verifier));
  const b = Buffer.from(storedChallenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Scopes requested by the client, narrowed to what the platform offers. New v2 scopes are staff-only at first. */
export function grantScopes(requested: string | undefined, isStaff: boolean): string[] {
  const want = (requested ?? "library:read account:read").split(/\s+/).filter(Boolean);
  const staffOnly = new Set(["dossier:read", "research:write"]);
  return [...new Set(want)].filter((s) => (ALLOWED_SCOPES as readonly string[]).includes(s) && (isStaff || !staffOnly.has(s)));
}

export interface CodeRow { code_hash: string; client_id: string; redirect_uri: string; code_challenge: string; expires_at: number; used_at: number | null }

export function newCode(): { code: string; hash: string } {
  const code = b64url(randomBytes(32));
  return { code, hash: createHash("sha256").update(code).digest("hex") };
}

/** Exchange check: single-use, unexpired, same client, same redirect_uri, verifier matches. Returns an error code or null. */
export function checkCodeExchange(row: CodeRow | null, p: { clientId: string; redirectUri: string; verifier: string }, now = Date.now()): string | null {
  if (!row) return "invalid_grant";
  if (row.used_at !== null) return "invalid_grant"; // replay: the platform should also revoke tokens issued from this code
  if (row.expires_at < now) return "invalid_grant";
  if (row.client_id !== p.clientId || row.redirect_uri !== p.redirectUri) return "invalid_grant";
  if (!verifyPkce(p.verifier, row.code_challenge)) return "invalid_grant";
  return null;
}

export function authorizationServerMetadata(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...ALLOWED_SCOPES],
  };
}
