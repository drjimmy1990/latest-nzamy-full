# Google Sign-In for Every Account Type — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A Google account works exactly like an email account — for a client, a lawyer, a firm, a company, a small business, a government body, an NGO and a service provider alike. Today it works for none of them properly.

**Supersedes:** `docs/superpowers/plans/2026-08-14-google-signin.md`. That plan is unstarted and correctly identifies four defects (G1–G4), but its design **routes every Google user to `individual`** and its runbook states that as the expected outcome. That is the exact thing the owner asked to fix. Four more defects (G5–G8) are not in it. Do not execute the old plan.

**Architecture:** One change underneath everything else: **`profiles` becomes the single source of truth for `user_type`, `phone` and `onboarding_completed`.** `auth.user_metadata` is written for backwards compatibility but never read for routing, gating or authorization. Every defect below is a symptom of reading `user_metadata`, which OAuth providers do not populate.

**Tech Stack:** Next.js 16 (`src/proxy.ts`, **never** `middleware.ts`), Supabase Auth (`@supabase/ssr`), React 19, TypeScript. Tests: `node --test` native TS. No new dependencies.

---

## Measured facts — established against the live database, do not re-guess

Run `node scripts/auth-readiness-report.mjs` to reproduce. As of 21 August 2026:

| | |
|---|---|
| accounts | **16** |
| identity providers | **email × 16, Google × 0** — nobody has signed in with Google yet |
| accounts **with** a phone | **0** |
| accounts **without** a phone | **16 (100%)** |
| `profiles.user_type` | individual × 9, lawyer × 6, **admin × 1** |
| `user_metadata.user_type` vs `profiles.user_type` | **agree on all 16, disagree on 0** |

Three consequences that shape this plan:

1. **Moving the source of truth to `profiles` changes nobody's role.** Zero disagreements. This is safe today and will not be safe later — do it now.
2. **A phone-requiring gate would redirect every existing account.** With lawyer, firm and admin exempt, **9 individual accounts** meet the wizard once. That is acceptable — it is how they get a phone, and WhatsApp has no other channel — but it must be stated to the owner, not discovered by him.
3. **One of the 16 is the admin.** The onboarding picker has no admin option, so an admin who completes the wizard could downgrade their own account. `admin` must be exempt from the gate and must never be assignable from any picker or parameter.

---

## The eight defects

| # | Defect | Effect | Source |
|---|---|---|---|
| G1 | `src/proxy.ts:133` — `skipOnboarding` is inverted relative to its own comment | Onboarding is forced **only** on lawyers and firms, and skipped for everyone else | old plan |
| G2 | Same block requires `user_metadata.onboarding_completed === false` (strict) | Google users have `undefined`, so the gate never fires even once G1 is fixed | old plan |
| G3 | `src/app/onboarding/page.tsx:679` writes via `auth.updateUser({data})` only | Nothing reaches `profiles`; `profiles.phone` stays NULL and WhatsApp silently does nothing | old plan |
| G4 | `src/app/auth/callback/route.ts:52` routes on `user_metadata.user_type` | Google sets none → **every** Google user is sent to `/dashboard/client` | old plan |
| **G5** | **`src/hooks/useUser.ts:511-512` reads `user_metadata.user_type` and falls back to `"individual"`** | **The entire client UI treats every Google user as an individual client** — wrong sidebar, wrong dashboard, and `UserTypeGuard` blocks them from their own. Server-side `assertRole` reads `profiles`, so the app is split-brained: server says lawyer, browser says client | **new** |
| **G6** | **`src/proxy.ts:148` guards the whole RBAC block behind `if (userType)`, read from metadata** | **Undefined for a Google user → RBAC is skipped entirely**, on every `/dashboard/*` prefix | **new** |
| **G7** | **The onboarding picker emits `company`, which is not in the `profiles.user_type` CHECK** (`corporate` is), and has **no `provider` option at all** | Writing the picker's value to `profiles` would violate the constraint for companies and leave providers unable to say what they are | **new** |
| **G8** | **The Google button exists only on `/login` and `/register/client`** | A lawyer, firm, company, government body or NGO cannot start a Google signup from their own registration page | **new** |

`assertRole` (`src/lib/auth/assertRole.ts:37`) and `requireAdmin` (`src/lib/access-control.ts:110`) already read `profiles`. They are correct and must not be changed — they are the model the rest of the app is being moved onto.

---

## Global Constraints

- **No new npm dependencies.**
- **Next.js 16 uses `src/proxy.ts`. Never create `middleware.ts`** — having both breaks `next build`.
- All user-facing copy is Arabic, RTL, including API errors.
- **`admin` is never assignable** from a picker, a URL parameter, or an onboarding write. Guard it in code, not by omission from a list.
- **No `user_type` travels in a URL.** A Google user chooses their type inside onboarding, on an authenticated page. This is a deliberate design choice — see Task 5.
- Saudi mobile: accept `05XXXXXXXX` or `+9665XXXXXXXX`, store E.164 (`+9665XXXXXXXX`).
- `npm run test:unit` baseline is **145 pass / 0 fail**. Never regress it.
- **This round ships code that is inert until the owner configures Google Cloud and Supabase.** Say so in every report. Do not describe Google sign-in as working.

---

## Task 1: The canonical user-type vocabulary

Everything else depends on this. It is one small module and it is the guard that stops the next picker entry from silently coercing someone to `individual`.

**Files:**
- Create: `src/lib/auth/userTypes.ts`, `src/lib/auth/userTypes.test.ts`

**Interfaces produced:**
- `DB_USER_TYPES: readonly string[]` — exactly the CHECK-constraint list
- `PICKER_TO_DB: Record<string, string>` — onboarding picker id → DB value
- `toDbUserType(pickerValue: string): string | null`
- `isAssignableUserType(v: string): boolean` — false for `admin` and anything unknown
- `dashboardPathFor(userType: string): string`

- [ ] **Step 1: Read the constraint, do not trust this plan**

`supabase/migrations/20260603_phase1_001_profiles.sql:32-35` is the CHECK. Copy the list from there. `supabase/migrations/20260614_auto_create_role_profiles.sql:31-36` repeats it in the trigger — confirm the two agree and say so.

- [ ] **Step 2: Write the failing tests**

Cover at minimum:
- every value of `PICKER_TO_DB` is in `DB_USER_TYPES` — this is the test that matters most
- `toDbUserType("company") === "corporate"` — the live mismatch
- `toDbUserType("individual") === "individual"` (identity mappings still map)
- `toDbUserType("nonsense") === null` — unknown returns null, never a default
- `isAssignableUserType("admin") === false` — pinned, with a comment saying why
- `isAssignableUserType("lawyer") === true`
- `dashboardPathFor("corporate") === "/dashboard/business"` and `dashboardPathFor("individual") === "/dashboard/client"` — the two that do not match 1:1

- [ ] **Step 3: Implement**

Take the dashboard map from `src/app/auth/callback/route.ts:53-63` and the `dashDir` map in `src/proxy.ts:155-158`; they must not diverge again, which is why this module exists.

`toDbUserType` returns `null` for anything unrecognised. **Never fall back to `individual`** — a silent default is how G7 stayed invisible.

- [ ] **Step 4: Verify**

`npx tsc --noEmit --incremental false`, `npm run test:unit`.

**Report:** the picker list, the DB list, and which picker ids have no DB counterpart or vice versa. Name `provider` explicitly — it is in the DB and not in the picker, and Task 5 has to decide what to do about it.

---

## Task 2: The onboarding gate predicate

**Files:**
- Create: `src/lib/auth/onboardingGate.ts`, `src/lib/auth/onboardingGate.test.ts`

**Interfaces produced:**
- `needsOnboarding(input: { userType?: string | null; onboardingCompleted?: unknown; hasPhone: boolean }): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
test("a fresh Google user needs onboarding", () => {
  assert.equal(needsOnboarding({ userType: "individual", onboardingCompleted: false, hasPhone: false }), true);
});

test("REGRESSION G1: lawyers and firms are SKIPPED, not forced", () => {
  assert.equal(needsOnboarding({ userType: "lawyer", onboardingCompleted: false, hasPhone: false }), false);
  assert.equal(needsOnboarding({ userType: "firm", onboardingCompleted: false, hasPhone: false }), false);
});

test("an admin is never sent to a wizard that cannot describe them", () => {
  // The picker has no admin option, so an admin completing it could
  // downgrade their own account. One of the 16 live accounts is the admin.
  assert.equal(needsOnboarding({ userType: "admin", onboardingCompleted: false, hasPhone: false }), false);
});

test("REGRESSION G2: undefined counts as NOT completed, never as completed", () => {
  assert.equal(needsOnboarding({ userType: "individual", onboardingCompleted: undefined, hasPhone: true }), true);
});

test("a completed individual with a phone is done", () => {
  assert.equal(needsOnboarding({ userType: "individual", onboardingCompleted: true, hasPhone: true }), false);
});

test("a completed individual WITHOUT a phone still needs it — WhatsApp has no other channel", () => {
  assert.equal(needsOnboarding({ userType: "individual", onboardingCompleted: true, hasPhone: false }), true);
});
```

- [ ] **Step 2: Run and watch them fail. Step 3: Implement. Step 4: Run and watch them pass.**

Exempt set: `lawyer`, `firm`, `admin`. Say in the doc comment why each is exempt — the first two have their own registration flow, the third has no representation in the picker.

- [ ] **Step 5: Verify and report**

State how many of the 16 live accounts this predicate would send to onboarding, by type. Re-run `node scripts/auth-readiness-report.mjs` for the numbers rather than copying them from this plan.

---

## Task 3: Make the proxy read `profiles` (G1, G2, G6)

**Files:**
- Modify: `src/proxy.ts`

- [ ] **Step 1: Read the file first**

`PROTECTED` (`:17-32`) is what the auth block runs on. `/login`, `/register/*` and `/auth/callback` are **not** in it, so a redirect to `/onboarding` cannot loop through them. `/onboarding` **is** in it. **Preserve both facts** — verify, then state in your report that you did.

- [ ] **Step 2: One profile read, used by both gates**

After `getUser()`, fetch `profiles` once: `select("user_type, phone, onboarding_completed").eq("id", user.id).maybeSingle()`. Feed it to `needsOnboarding`, and use `profile.user_type` for the RBAC block.

**This is G6's fix and it is an authorization change, not a cleanup.** Today `if (userType)` reads metadata; undefined skips RBAC entirely. State plainly in your report what a Google user could reach before and cannot after.

- [ ] **Step 3: Decide what happens when the profile row is missing**

It should never be missing — the signup trigger creates it. But decide explicitly and say which you chose: treat a missing profile as "needs onboarding" (safe, may trap someone) or "no RBAC opinion" (permissive). **Do not leave it implicit.**

- [ ] **Step 4: Keep the dashboard map in one place**

Delete the local `dashDir` at `:155-158` and use `dashboardPathFor` from Task 1.

- [ ] **Step 5: Verify**

`npx tsc --noEmit --incremental false`, `npm run test:unit`. Confirm no `middleware.ts` was created.

**Report:** the exact new control flow, and confirmation that an existing lawyer with no phone is NOT redirected (6 of the 16 live accounts are exactly that).

---

## Task 4: Make the browser agree with the server (G5)

This is the task that most directly answers the owner's requirement. `useUser` is consumed by **115 files**; none of them change.

**Files:**
- Modify: `src/hooks/useUser.ts`

- [ ] **Step 1: Read `mapSupabaseUser` (`:508-538`) and the hook body below it**

`mapSupabaseUser` is a pure synchronous mapper. The hook already does an async `getUser()` and already exposes `loading`.

- [ ] **Step 2: Give the mapper the profile**

Change the signature to `mapSupabaseUser(user, profile)` and take `userType` from `profile.user_type`. Fall back to `user_metadata.user_type`, and only then to `"individual"` — and **comment honestly** that the final fallback exists so a missing profile row degrades instead of crashing, not because `individual` is a sensible guess.

Fetch the profile in the same effect that already fetches the user. **Do not add a second render pass that briefly reports the wrong type** — a flash of `individual` would render the wrong sidebar and could bounce a lawyer off their own dashboard via `UserTypeGuard`. If that is unavoidable, keep `loading` true until both have resolved, and say which you did.

- [ ] **Step 3: Leave everything else on metadata for now**

`tier`, `subRole`, `credits`, `display_mode` and the rest stay as they are. Only `userType` moves. Widening scope here touches 115 consumers.

Note in your report that `permissions` is derived from `userType` (`:527`), so it changes with it — that is intended, and it is what makes a Google lawyer see lawyer permissions.

- [ ] **Step 4: Verify and report**

`npx tsc --noEmit --incremental false`, `npm run test:unit`.

**Report:** what a Google-signed-in lawyer sees before and after — sidebar, dashboard route, and whether `UserTypeGuard` admits them.

---

## Task 5: Onboarding writes to `profiles`, for every type (G3, G7)

**Files:**
- Modify: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Fix the picker's vocabulary (G7)**

The picker (`:38-58`) offers `individual, company, micro, government, ngo, lawyer, firm`. Route every write through `toDbUserType` from Task 1, so `company` becomes `corporate`.

**Decide about `provider`** and say what you chose. It is a real DB type reachable only through `/register/provider`, and a Google user has no way to become one. Adding a picker option is one answer; leaving it to `/register/provider` is another. Argue it.

- [ ] **Step 2: Add the phone field**

Required. `05XXXXXXXX` or `+9665XXXXXXXX`, stored E.164. Arabic label and Arabic validation message. Block the step until it validates — this is the only channel WhatsApp has.

- [ ] **Step 3: Persist to `profiles`, not only to metadata (G3)**

`PATCH /api/v1/profile` exists; **read its allowlist before using it** and confirm it accepts `phone`, `user_type` and `onboarding_completed`. If it does not accept a field, say so rather than writing around it.

Keep the `auth.updateUser` call for backwards compatibility, but the `profiles` write is the one that must succeed. **If it fails, the user must be told in Arabic and must not be advanced to the next step** — silently continuing would leave them permanently phone-less and permanently redirected back here.

- [ ] **Step 4: `admin` can never be written**

Guard the write with `isAssignableUserType`. The picker has no admin option, but the guard must be in the code path, not in the absence of a UI control.

- [ ] **Step 5: Do not overwrite a type the user already has**

The existing code has this instinct at `:675-678` (`if (!existingUserType)`). Preserve it, but source `existingUserType` from `profiles`, not metadata. A Google lawyer who registered through `/register/provider` must not be reset to whatever the picker defaults to.

- [ ] **Step 6: The sub-profile gap — decide and state it**

`supabase/migrations/20260614_auto_create_role_profiles.sql` creates `lawyer_profiles` (`:87`) and `provider_profiles` (`:127`) **only in the signup trigger**. A Google user who becomes a lawyer in onboarding gets **no `lawyer_profiles` row**, so the verification flow and marketplace browse have nothing to read.

Investigate what actually breaks, then either create the row from onboarding or state precisely what a Google lawyer cannot do until an admin acts. **Do not skip this step silently** — it is the difference between "a lawyer can sign up with Google" and "a lawyer can sign up with Google and then be stuck".

- [ ] **Step 7: Verify and report**

**Report:** for each of the seven picker options, the DB value written, and whether a working dashboard results.

---

## Task 6: Route on `profiles` after the OAuth exchange (G4)

**Files:**
- Modify: `src/app/auth/callback/route.ts`

- [ ] **Step 1: Read `user_type` from `profiles`, not metadata**

The row exists by the time the callback runs — the signup trigger fires on `auth.users` insert. **Verify that ordering rather than assuming it**, and say what you found. If there is a race, handle it.

- [ ] **Step 2: Send unfinished users to onboarding, not to a dashboard**

Use `needsOnboarding` from Task 2 so the callback and the proxy cannot disagree. A user bounced straight to a dashboard would be redirected to `/onboarding` by the proxy on the next request anyway — one hop, visibly.

- [ ] **Step 3: Use `dashboardPathFor`**

Delete the local `dashboardMap` (`:53-63`).

- [ ] **Step 4: Keep the failure path Arabic and honest**

`?error=auth_callback_failed` currently lands on `/login`. Check what `/login` renders for it. If it renders English or nothing, that is a defect — report it, and fix it only if `/login` is in your file list (it is not; report it instead).

- [ ] **Step 5: Verify and report** the redirect target for each of the nine DB types, plus the not-yet-onboarded case.

---

## Task 7: Offer Google where the other account types register (G8)

**Files:**
- Modify: `src/app/register/provider/page.tsx`

- [ ] **Step 1: Read how `/register/client` does it** (`:340-343`) and match it exactly — same provider, same `redirectTo`, same error handling.

- [ ] **Step 2: Add the button**

**No `user_type` in the URL.** The user picks their type in onboarding, on an authenticated page. This is deliberate: a type in a query string is user-editable, and `admin` is in the CHECK constraint. Put that reasoning in a comment so nobody "optimises" it later.

- [ ] **Step 3: Say what the copy promises**

`/register/provider` collects licence numbers and specialties that Google cannot supply. **Do not imply Google signup completes a lawyer registration.** Write copy that is true about what happens next, and quote it in your report.

- [ ] **Step 4: Verify and report.**

---

## Task 8: The owner's console runbook

**Files:**
- Create: `docs/GOOGLE_OAUTH_SETUP.md`

- [ ] **Step 1: Write it in Arabic, for someone who has never opened Google Cloud Console**

Adapt Task 1 of the superseded plan (`docs/superpowers/plans/2026-08-14-google-signin.md:75-160`) — its console steps are correct and were checked. **Correct its verification section**: it says to expect `user_type='individual'`, which is precisely what this plan removes.

- [ ] **Step 2: The redirect URI trap deserves its own line**

The Authorized redirect URI is the **Supabase** URL (`https://<ref>.supabase.co/auth/v1/callback`), not the site URL. This is the single most common failure and produces `redirect_uri_mismatch`.

- [ ] **Step 3: State plainly that nothing works until he does this**

The code ships inert. Say it in the first paragraph.

- [ ] **Step 4: Verification section**

A new Google account should land in `/onboarding`, pick its type, and arrive at the matching dashboard. Give the SQL to confirm `profiles` holds the chosen `user_type` and a phone.

---

## Self-review

**Coverage.** G1 → Task 3. G2 → Tasks 2 + 3. G3 → Task 5. G4 → Task 6. G5 → Task 4. G6 → Task 3. G7 → Tasks 1 + 5. G8 → Task 7. Console configuration → Task 8, owner-performed.

**The owner's requirement** — "make sure Google connects like a normal email, whether lawyer or client or company" — is G4, G5, G6, G7 and G8 together. G1–G3 alone (the superseded plan) would produce a Google user who is an individual client forever.

**What this plan does not do.** It does not migrate existing users, because there are none to migrate: all 16 accounts are email, and metadata and profiles agree on all 16. It does not touch `assertRole` or `requireAdmin`, which already read `profiles`. It does not add a `user_type` URL parameter, deliberately.

**The risk I am most wary of** is Task 4. `useUser` has 115 consumers, and a render pass that briefly reports `individual` before the profile resolves would bounce a lawyer off their own dashboard through `UserTypeGuard`. Step 2 names that failure and requires the implementer to say which way they resolved it.

---

# AMENDMENT — written after Wave 1, before Wave 2

Wave 1 built Tasks 1 and 2 and, in doing so, turned up four facts that change Tasks 5 and 6. **These override the task text above where they conflict.**

## A1. The database forbids what Task 5 Step 3 was going to do

`supabase/migrations/20260716_security_hardening.sql:123-157` adds `trg_lock_user_type`, a BEFORE UPDATE trigger on `public.profiles`:

> Allow service-role operations (`auth.uid() IS NULL`). Otherwise, if `OLD.user_type IS DISTINCT FROM NEW.user_type` and the caller is not an admin, `RAISE EXCEPTION 'Permission denied: user_type cannot be self-modified' USING ERRCODE = '42501'`.

It is a deliberate P0 fix ("Lock user_type column against self-escalation"), and it is correct. **A user's own session cannot change their own `user_type`, ever.** So onboarding cannot write `user_type` the way Task 5 assumed.

`phone` is unaffected — the trigger only fires when `user_type` actually changes.

## A2. `PATCH /api/v1/profile` accepts `phone` but not the other two

Read at `src/app/api/v1/profile/route.ts:91-101`. The `profiles` allowlist is `display_name, display_name_en, phone, avatar_url, language, calendar_type, theme, country_code, city`.

- `phone` — **present.** Use this endpoint for it.
- `onboarding_completed` — absent.
- `user_type` — absent, deliberately, alongside `verification_status` whose comment explains the reasoning ("self-verification would be a trust-badge bypass").

It uses `.update()`, not `.upsert()`, so it cannot create a missing row. That is acceptable: the signup trigger creates the row with `ON CONFLICT (id) DO NOTHING` (`20260630_handle_new_user_sectors.sql:26-33`), so the row always exists. **Confirm that rather than assuming it.**

## A3. The live signup trigger is not the one the plan cites

The live definition is `supabase/migrations/20260716_security_hardening.sql:19` (`CREATE OR REPLACE`), which preserves the sector provisioning from `20260630_handle_new_user_sectors.sql` and removes `admin` from the signup whitelist. It:

- defaults `user_type` to `individual` via `COALESCE` — so a Google signup **does** succeed and lands as `individual`;
- inserts only `(id, display_name, email, user_type)` — **no `phone`, no `onboarding_completed`**;
- takes `display_name` from `raw_user_meta_data->>'full_name'`, which Google **does** supply;
- provisions the sector row for `lawyer`, `provider`, `firm`, `corporate`, `government`, `ngo` — **only at signup**.

## A4. Corrected line citations — Wave 1 verified these

| Reference | Plan says | Actual |
|---|---|---|
| callback dashboard map | `route.ts:53-63` | **`:47-57`** |
| callback metadata read (G4) | `:52` | **`:46`** |
| proxy `dashDir` | `proxy.ts:155-158` | **`:153-156`** |
| proxy `skipOnboarding` (G1) | `:133` | **`:135`** |
| proxy RBAC guard (G6) | `:148` | `:148` — correct |
| onboarding picker | `page.tsx:38-58` | **`:38-57`** |
| trigger validation list | `20260614:31-36` | **`:32-37`**, and superseded — see A3 |
| CHECK constraint | `20260603:32-35` | correct |

---

## Task 5a (NEW, supersedes Task 5 Step 3's `user_type` half): the one-time account-type claim

**Files:**
- Create: `src/app/api/v1/onboarding/account-type/route.ts`
- Create: `src/lib/auth/accountTypeClaim.ts`, `src/lib/auth/accountTypeClaim.test.ts`

Because of A1, the only way a Google user can be anything but an individual is a **server-side** write with the service-role client, which the trigger exempts. That is a security-relevant decision and it must be built narrowly.

**Why this is parity and not escalation:** `/register/provider:214` already lets anyone self-select `lawyer`, `firm` or `provider` at signup, and the trigger honours it verbatim. The real gate on lawyer privileges is `lawyer_profiles.verification_status = 'verified'`, which this endpoint does not touch and which `supabase/migrations/20260815_marketplace_excludes_ai_workspace.sql` shows the marketplace relying on. This endpoint gives a Google user exactly what an email user already has at signup — no more. **State that argument in the route's doc comment.** If you find a surface that authorizes on `profiles.user_type === 'lawyer'` alone, without a verification check, stop and report it instead of shipping.

- [ ] **Step 1: Put the eligibility rule in a pure, tested module**

`canClaimAccountType({ currentType, onboardingCompleted, requestedPickerId })` returns a discriminated result, not a bare boolean, so the route can map each refusal to its own Arabic message.

It permits the claim **only** when all of these hold:
- the requested picker id maps through `toDbUserType` to a non-null DB value
- `isAssignableUserType` is true for it — **never `admin`**
- the caller's current `user_type` is `individual` — the untouched OAuth/signup default
- `onboarding_completed` is not `true`

This is a **one-time claim during onboarding, not a role-switch API.** A user who has already onboarded, or who already has a non-individual type, is refused. Pin every one of those refusals with a test, and pin `admin` twice — once through `isAssignableUserType` and once as an explicit case.

- [ ] **Step 2: The route**

Authenticate with `createClient()` and `getUser()`; 401 in Arabic if absent. Read the caller's own profile through that **RLS-scoped** client, not the service client — never trust an id from the body. Evaluate `canClaimAccountType`. On refusal return 403 with the Arabic message for that specific reason.

Only then use `createServiceClient()` to write `user_type`, and re-assert the caller's id in the query itself (`.eq("id", user.id)`) — the service client bypasses RLS, so ownership must be in the query.

- [ ] **Step 3: Provision the sector row the signup trigger would have created**

Per A3 the trigger only runs at signup, so a Google user claiming `lawyer` has no `lawyer_profiles` row and the verification flow has nothing to read. Mirror the trigger's branches for the type being claimed, using the same `ON CONFLICT DO NOTHING` shape. **Read the trigger and match its column names exactly** — `firm_profiles` and `business_profiles` have NOT NULL columns without defaults.

State in your report, per claimable type, which table you provision and which columns you fill.

- [ ] **Step 4: Audit it**

A privileged write deserves a trace. Find what this codebase already uses (there is an admin audit-log surface) and use it if it fits; if nothing fits, `console.error` with the user id, old type and new type, and say in your report that a structured audit trail is a follow-up rather than pretending one exists.

- [ ] **Step 5: Verify** — `npx tsc --noEmit --incremental false`, `npm run test:unit`.

**Report:** the exact Arabic for each refusal, and the full list of conditions under which the claim succeeds.

## Task 5 — revised

Step 3 changes: write `phone` through `PATCH /api/v1/profile`, and `user_type` through the Task 5a endpoint. **Order matters and gets its own step.**

- [ ] **Step 3a: Write the phone FIRST, the type SECOND**

Wave 1's reviewer found the trap: the picker offers `lawyer` and `firm`, and `needsOnboarding` exempts both **unconditionally**. So if the type write lands and the phone write then fails, that user is exempt forever, phone-less forever, and the gate can never bring them back. Writing the phone first means a failure leaves them still gated and still able to retry.

If either write fails, show the Arabic error and **do not advance the step**.

- [ ] **Step 3b: `onboarding_completed`**

Not in the PATCH allowlist (A2). Either add it there — it is a harmless self-set flag, unlike `user_type` — or set it from the Task 5a endpoint. Choose, and say why.

Step 6 (the sub-profile gap) is now **Task 5a Step 3** and is done there. Task 5 should confirm it happened rather than duplicating it.
