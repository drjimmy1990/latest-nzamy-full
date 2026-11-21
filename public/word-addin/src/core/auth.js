/**
 * One-click OAuth 2.1 (authorization code + PKCE) for the Office dialog.
 * ASSUMPTION: the platform exposes /oauth/authorize and /oauth/token (+ dynamic client
 * registration) as the contract says; neither exists yet. No secret lives here: public client.
 */
const b64url = (b            ) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function randomString(bytes = 32)         { return b64url(crypto.getRandomValues(new Uint8Array(bytes))); }
export async function pkceChallenge(verifier        )                  {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

                                                                           
export async function buildAuthorizeUrl(o                                                                              )                     {
  const verifier = randomString(48);
  const state = randomString(16);
  const u = new URL("/oauth/authorize", o.baseUrl);
  u.search = new URLSearchParams({
    response_type: "code", client_id: o.clientId, redirect_uri: o.redirectUri, scope: o.scopes.join(" "),
    state, code_challenge: await pkceChallenge(verifier), code_challenge_method: "S256",
  }).toString();
  return { url: u.toString(), verifier, state };
}

/** Parse the redirect the dialog returns. Rejects a wrong `state` (CSRF) and any error reply. */
export function parseCallback(redirected        , expectedState        )                   {
  const u = new URL(redirected);
  const err = u.searchParams.get("error");
  if (err) throw new Error(`oauth_${err}`);
  if (u.searchParams.get("state") !== expectedState) throw new Error("oauth_state_mismatch");
  const code = u.searchParams.get("code");
  if (!code) throw new Error("oauth_no_code");
  return { code };
}

                                                                                               
export async function exchangeCode(o                                                                                                                                      )                     {
  const f = o.fetch ?? fetch;
  const r = await f(new URL("/oauth/token", o.baseUrl), {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: o.code, client_id: o.clientId, redirect_uri: o.redirectUri, code_verifier: o.verifier }),
  });
  if (!r.ok) throw new Error(`oauth_token_${r.status}`);
  const j = (await r.json())                                                                          ;
  if (!j.access_token) throw new Error("oauth_bad_token_reply");
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: (o.now?.() ?? Date.now()) + (j.expires_in ?? 3600) * 1000 };
}
