# CAPTCHA on login: Cloudflare Turnstile, enforced by GoTrue (OWNER-SEC-01)

Owner requirement: `OWNER-SEC-01-CAPTCHA.md` in the 2026-10-30 handoff package (P1, security phase).

This guide is for the operator: whoever runs the prod servers and deploys. It covers:
- what the code change does;
- how to switch the check on, in order, with full server paths;
- what each acceptance case CAP-01 to CAP-12 is covered by.

There are no secrets in this file. Code: `src/lib/auth/captcha.ts` (rules, tested), `src/components/auth/useTurnstile.ts` + `TurnstileWidget.tsx` (the widget), and the three pages listed below.

---

## 1. What it does, and where the protection really is

The browser shows a Turnstile challenge on the forms that call GoTrue's password endpoints. It sends the resulting token with the request as `options.captchaToken`, which supabase-js puts in the body as `gotrue_meta_security.captcha_token`.

| Page | Call | Token sent |
|---|---|---|
| `src/app/login/page.tsx` | `signInWithPassword`, email **and** phone | yes, on every attempt |
| `src/app/register/client/page.tsx` (step 3) | `signUp` | yes |
| `src/app/register/provider/page.tsx` (step 4) | `signUp` | yes |

**The protection is GoTrue's, not the page's.** Once `GOTRUE_SECURITY_CAPTCHA_ENABLED=true`, GoTrue (`verifyCaptcha` in `supabase/auth` `internal/api/middleware.go` and `api.go`) refuses these requests with `400 captcha_failed` before it looks at the password. It refuses when the token is missing, random, expired or already used, because it checks each one with Cloudflare's siteverify. The routes it checks:

- `POST /token?grant_type=password`: email and phone sign-in, and any script calling GoTrue directly.
- `POST /signup`, `/recover`, `/resend`, `/otp`, `/magiclink`, `/sso`.

**What GoTrue does NOT check (by design, upstream):**

- `grant_type=refresh_token`: a live session renews itself with no challenge, so refreshing the page never asks again (CAP-10).
- `grant_type=pkce` / `id_token` and `GET /authorize`: **Google sign-in is not covered by this token** (see §5).
- Requests that carry the **service-role key**. That key is server-only and never in the browser, so there is no account-based bypass of any kind: test accounts and the admin go through the same check (CAP-09). Because that key does skip the check, the still-pending rotation of the self-hosted service key is part of this protection (cutover guide §2.8: «rotate the secrets»).

**What the page adds on top:**
- One token per attempt. After any request that reached GoTrue, the widget is reset, whether the attempt succeeded, failed, threw, or the session handshake failed afterwards.
- No request is sent without a live token.
- A captcha refusal gets its own message («تعذّر اجتياز التحقق الأمني…»), and the password stays in its field.
- A wrong password or an unknown account still gets the one generic «بيانات الدخول غير صحيحة» (CAP-06).
- If the widget can't load (script blocked, offline, unsupported browser, or a challenge timeout), the page shows a retry button, which takes keyboard focus, and the form stays locked. It fails closed.

**Rate limits are unchanged.** `src/proxy.ts` limits the app's own `/api/*` routes. Password sign-in goes from the browser straight to `auth.nezamy.sa`, so those limits never applied to it. GoTrue's own `GOTRUE_RATE_LIMIT_*` settings still apply. CAPTCHA is added on top; it replaces neither.

---

## 2. Order matters

GoTrue ignores the token while its check is off, so the safe order is:
1. Deploy the frontend with the site key.
2. Make sure logins still work.
3. Switch GoTrue on.

**If you switch GoTrue on first, every password login and signup on the site is refused until the new frontend is live.**

### Step 0: Cloudflare (one time)

1. Log in to Cloudflare, go to **Turnstile**, and choose **Add widget**.
2. Fill it in:
   - **Name:** `Nezamy login`.
   - **Hostnames:** `nezamy.sa`, plus `www.nezamy.sa` if that host serves the site. Do not add `localhost`; for local work use the test keys in `.env.example`.
   - **Widget mode:** *Managed*.
3. Copy the **Site key** (public) and the **Secret key** (secret). The secret goes only into the Supabase server's `.env` (step 2b). Don't paste it into chat, git, or a report.

### Step 1: App server (site key, then deploy)

This step needs the branch merged into `main` and pulled on the server.

1. Add one line to this file (it is gitignored):

   ```
   /www/wwwroot/nzamy/latest-nzamy-full/.env.local
   ```

   ```
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=<the Site key from step 0>
   ```

2. Deploy. The key is inlined at **build** time, so a deploy is required; a plain `pm2 reload` is not enough:

   ```bash
   cd /www/wwwroot/nzamy/latest-nzamy-full && git pull origin main && nohup bash deploy.sh > /root/nzamy-deploy-captcha.log 2>&1 &
   ```

3. Check, while GoTrue is still off:
   - `https://nezamy.sa/login` shows the challenge box under «تذكرني».
   - Signing in with a real account still works.
   - If the box never appears, run this and look at the output (it is screen output, not a file):

     ```bash
     curl -sI https://nezamy.sa/login | grep -i content-security
     ```

     If it prints a policy, add `https://challenges.cloudflare.com` to both `script-src` and `frame-src` in the nginx config. Today the app itself sends no CSP.

### Step 2: Supabase server (switch GoTrue on)

**2a. Find the folder and the version.** Its contents are screen output, not files:

```bash
docker inspect supabase-auth --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}'
docker inspect supabase-auth --format '{{ .Config.Image }}'
```

- The first command prints the Supabase folder. The nightly backup script uses `/root/supabase-project`, and older notes say `/root/supabase/docker`. Use whatever the command prints; it is called `SUPABASE_DIR` below.
- The second prints the GoTrue image, e.g. `supabase/gotrue:v2.1xx.x`. Turnstile support has been in GoTrue since v2.x (2022), so any image from the current `supabase/docker` is fine.

**2b. Put the values in `.env`.** Open:

```
SUPABASE_DIR/.env
```

Add these lines:

```
CAPTCHA_ENABLED=true
CAPTCHA_SECRET=<the Secret key from step 0>
```

**2c. Pass them to the auth container.** In the official `docker-compose.yml`, the `auth` service has an explicit `environment:` list and no `env_file`. Lines added only to `.env` therefore never reach GoTrue.

Create this file (or, if it already exists, add the three lines under its existing `auth:` → `environment:`):

```
SUPABASE_DIR/docker-compose.override.yml
```

```yaml
services:
  auth:
    environment:
      GOTRUE_SECURITY_CAPTCHA_ENABLED: ${CAPTCHA_ENABLED}
      GOTRUE_SECURITY_CAPTCHA_PROVIDER: turnstile
      GOTRUE_SECURITY_CAPTCHA_SECRET: ${CAPTCHA_SECRET}
```

Check that compose picked it up. This counts lines and does not print the secret:

```bash
cd SUPABASE_DIR && docker compose config | grep -c GOTRUE_SECURITY_CAPTCHA
```

It should print `3`. If it prints `0`, the stack is started with explicit `-f` files and ignores the override. In that case, add the three lines directly under `auth:` → `environment:` in `SUPABASE_DIR/docker-compose.yml`.

**2d. Restart auth.** Use `up -d`, which recreates the container with the new env. `docker compose restart` would keep the old env:

```bash
cd SUPABASE_DIR && docker compose up -d auth
docker exec supabase-auth sh -c 'env | grep -E "GOTRUE_SECURITY_CAPTCHA_(ENABLED|PROVIDER)"'
docker logs supabase-auth --tail 30
```

- The second command should print `..._ENABLED=true` and `..._PROVIDER=turnstile`. It does not print the secret.
- The logs should show GoTrue starting with no error.

**Rollback:** set `CAPTCHA_ENABLED=false` in `SUPABASE_DIR/.env`, then run `cd SUPABASE_DIR && docker compose up -d auth`. The frontend can stay as it is, because GoTrue ignores the token while the check is off.

### Step 3: Live checks (after step 2)

**From any machine.** The anon key is public: it is in the site bundle and in `/www/wwwroot/nzamy/latest-nzamy-full/.env.local` as `NEXT_PUBLIC_SUPABASE_ANON_KEY`. No real account is needed, because GoTrue checks the captcha before the credentials.

```bash
ANON=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' /www/wwwroot/nzamy/latest-nzamy-full/.env.local | cut -d= -f2-)
```

No token (CAP-03 / CAP-05). Expect `"error_code":"captcha_failed"`:

```bash
curl -s -X POST 'https://auth.nezamy.sa/auth/v1/token?grant_type=password' -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"email":"nobody@example.invalid","password":"x"}'
```

Random token (CAP-03). Expect `captcha_failed`:

```bash
curl -s -X POST 'https://auth.nezamy.sa/auth/v1/token?grant_type=password' -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"email":"nobody@example.invalid","password":"x","gotrue_meta_security":{"captcha_token":"random-junk"}}'
```

Phone path (CAP-02). Expect `captcha_failed`:

```bash
curl -s -X POST 'https://auth.nezamy.sa/auth/v1/token?grant_type=password' -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"phone":"+966500000000","password":"x"}'
```

Signup with no token (CAP-12). Expect `captcha_failed`, and no user is created:

```bash
curl -s -X POST 'https://auth.nezamy.sa/auth/v1/signup' -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"email":"nobody@example.invalid","password":"x-Long-Enough-1"}'
```

Before step 2, the first command answers `invalid_credentials`. That difference is the evidence the check is on.

**In a browser**, with each test account and the owner's admin account, check:
- login → lands on that role's dashboard once (CAP-01, CAP-09);
- wrong password, then retry (CAP-06);
- refresh the dashboard: no challenge (CAP-10);
- Arabic, English, a phone, and keyboard-only use (CAP-08);
- airplane mode before the page loads: retry button, form locked (CAP-07);
- Google sign-in (CAP-11);
- one real client signup and one provider signup (CAP-12).

---

## 3. What this breaks on purpose

- **`scripts/uat/*.ps1`** (`verify-auth-and-profile-rls.ps1` and 7 more) sign in with the anon key and `grant_type=password`. Against prod, with the check on, they get `captcha_failed`. That is the protection working, not a bug.
  - Run them against a test/staging GoTrue that uses Cloudflare's *test* secret `1x0000000000000000000000000000000AA`. Turnstile accepts the dummy token there.
  - Never put that test secret on prod, and never add a skip for test accounts.
- **Any future server code** that signs users in with the anon key and a password would be refused the same way. Server-side admin work (service-role) is unaffected.

## 4. Password reset

`src/app/forgot-password/page.tsx` is a **UI mock**. It calls no GoTrue endpoint (no `resetPasswordForEmail`, no `/recover`), so switching the check on cannot break it, and there is nothing in it to protect yet.

When the real reset flow is built, it must pass `options: { captchaToken }` to `resetPasswordForEmail` (and to `signInWithOtp` / `resend` if used), using `useTurnstile` the same way the login page does. GoTrue's `/recover` and `/otp` already require the token.

## 5. Google / OAuth: what is and is not protected

- `signInWithOAuth` has no `captchaToken` option, and GoTrue does not run its captcha check on `GET /authorize` or on the `pkce` / `id_token` token exchanges. **The Turnstile token does not protect Google sign-in, and the code does not pretend it does:** the Google button sends nothing extra.
- What does protect that flow:
  - Google's own sign-in defences, at Google.
  - GoTrue's OAuth `state`, kept server-side in `auth.flow_state`.
  - PKCE: `@supabase/ssr`'s browser client uses `flowType: "pkce"`, and `/auth/callback` exchanges the code with the verifier kept in a cookie.
  - The redirect allow-list (`/**` on `https://nezamy.sa`).
- A password-guessing bot gets nothing from the Google path, since there is no password to guess there.
- Putting a challenge in front of the Google button would need a server-side, short-lived, single-use attempt record checked at the callback. The owner's note allows this only "if the login design requires it". It is not built. CAP-11 is a live check that the flow still works.

## 6. Mobile app

No `capacitor.config.*` is tracked in this repo. If the iOS/Android app loads bundled files from a local origin (e.g. `capacitor://localhost`) instead of `https://nezamy.sa`, Turnstile's hostname check fails there. Either add that hostname to the widget, or point the app at the live site.

---

## 7. Acceptance cases

**Code version:** this branch (`claude/cranky-heyrovsky-e0494b`), not deployed.

**Evidence:**
- **Unit tests:** `src/lib/auth/captcha.test.ts`, 17 tests, run with `npm run test:unit` or `node --test src/lib/auth/captcha.test.ts`.
- **Local check** (2026-10-30, `next dev --webpack` with Cloudflare's test site keys, against a local fake GoTrue that answers like GoTrue with the check on):
  - the widget renders in Arabic and in English (it re-renders on language switch);
  - the password request carries `gotrue_meta_security.captcha_token`;
  - a wrong password shows the generic message and keeps the password;
  - a server `captcha_failed` shows the captcha message;
  - after a spent token, a fresh token is issued for the next attempt;
  - with the always-fail key: one alert, focus on «إعادة المحاولة», and the submit sends **no** request.
  - The fake server proves the **browser** side only. Every "refused by GoTrue" claim needs the live check.

**No case is `verified_closed` until its live check passes.**

| Case | Covered here by | Still needs, after deploy + step 2 |
|---|---|---|
| CAP-01 email + password + good challenge | Unit: email credentials carry the token. Local: request shape. | Browser login per role, lands once on the right dashboard |
| CAP-02 phone + password | Unit: phone credentials carry the same token (one builder for both modes). | `curl` phone row → `captcha_failed`; a phone login in the browser |
| CAP-03 no token / random token | Unit: no live token → no request. Local: submit blocked. | `curl` no-token and random-token rows → `captcha_failed` |
| CAP-04 expired / reused token | Unit: expiry and spend drop the token, and a reset forces a fresh one. Local: a new token after each attempt. | GoTrue + siteverify refuse reuse by design; reusing a captured token by `curl` should give `captcha_failed` |
| CAP-05 direct call to Auth bypassing the UI | Nothing in the browser can cover this | `curl` no-token row (the decisive check) |
| CAP-06 wrong password, then retry | Code: one message for every non-captcha error. Local: generic message, password kept, new token. | Browser: wrong password with a real account, then the right one |
| CAP-07 provider/script/network failure | Unit: every error locks the submit. Local: alert + retry + focus, no request sent. | Browser in airplane mode / with challenges.cloudflare.com blocked |
| CAP-08 Arabic, English, phone, keyboard | Local: both languages, focus moves to retry on error, `size: flexible` | A real phone; keyboard-only pass; a screen reader if available |
| CAP-09 every account type + admin | Code: no account-based branch anywhere; GoTrue skips only the service-role key | Log in as each test account and as the owner admin, all challenged |
| CAP-10 live session + refresh | GoTrue exempts `refresh_token` (upstream code); the widget exists only on login/signup | Refresh dashboards for a while; the session stays live and no challenge appears |
| CAP-11 Google / OAuth | Documented in §5; Google button unchanged | Google sign-in still lands on the right dashboard |
| CAP-12 signup / forgot password | Unit + source tests: both signup forms send and spend the token. Forgot-password is a mock (§4). | `curl` signup row → `captcha_failed`; one real client signup and one provider signup |
