import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  authorizationServerMetadata, checkCodeExchange, grantScopes, newCode, pkceChallengeOk, redirectMatches, sha256b64url, validRedirectUri, type CodeRow,
} from "../../platform-patch/oauthCore.js";

const verifier = randomBytes(48).toString("base64url");
const row = (over: Partial<CodeRow> = {}): CodeRow => ({
  code_hash: newCode().hash, client_id: "c1", redirect_uri: "https://claude.ai/api/mcp/auth_callback",
  code_challenge: sha256b64url(verifier), expires_at: Date.now() + 60_000, used_at: null, ...over,
});
const ok = { clientId: "c1", redirectUri: "https://claude.ai/api/mcp/auth_callback", verifier };

test("PKCE S256 only; plain and malformed challenges are refused", () => {
  assert.equal(pkceChallengeOk("S256", sha256b64url(verifier)), true);
  assert.equal(pkceChallengeOk("plain", sha256b64url(verifier)), false);
  assert.equal(pkceChallengeOk("S256", "short"), false);
  assert.equal(pkceChallengeOk(undefined, undefined), false);
});

test("code exchange: right verifier passes; wrong verifier, replay, expiry, other client or redirect fail", () => {
  assert.equal(checkCodeExchange(row(), ok), null);
  assert.equal(checkCodeExchange(row(), { ...ok, verifier: randomBytes(48).toString("base64url") }), "invalid_grant");
  assert.equal(checkCodeExchange(row({ used_at: Date.now() }), ok), "invalid_grant");
  assert.equal(checkCodeExchange(row({ expires_at: Date.now() - 1 }), ok), "invalid_grant");
  assert.equal(checkCodeExchange(row(), { ...ok, clientId: "c2" }), "invalid_grant");
  assert.equal(checkCodeExchange(row(), { ...ok, redirectUri: "https://evil.example/cb" }), "invalid_grant");
  assert.equal(checkCodeExchange(null, ok), "invalid_grant");
});

test("redirect URIs: exact match only; https (or loopback http); no wildcard or fragment", () => {
  assert.equal(validRedirectUri("https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(validRedirectUri("http://localhost:6274/cb"), true);
  assert.equal(validRedirectUri("http://evil.example/cb"), false);
  assert.equal(validRedirectUri("https://*.evil.example/cb"), false);
  assert.equal(validRedirectUri("https://claude.ai/cb#x"), false);
  assert.equal(redirectMatches(["https://claude.ai/cb"], "https://claude.ai/cb/"), false);
});

test("scopes: unknown dropped; v2 scopes only for staff; default is read-only", () => {
  assert.deepEqual(grantScopes(undefined, false), ["library:read", "account:read"]);
  assert.deepEqual(grantScopes("library:read ai:run dossier:read research:write bogus", false), ["library:read", "ai:run"]);
  assert.deepEqual(grantScopes("ai:run dossier:read research:write", true), ["ai:run", "dossier:read", "research:write"]);
});

test("metadata advertises PKCE S256, public clients and dynamic registration", () => {
  const m = authorizationServerMetadata("https://nezamy.sa");
  assert.deepEqual(m.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(m.token_endpoint_auth_methods_supported, ["none"]);
  assert.match(m.registration_endpoint, /\/oauth\/register$/);
});
