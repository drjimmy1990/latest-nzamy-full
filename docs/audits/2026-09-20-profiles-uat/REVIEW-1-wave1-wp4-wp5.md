# Independent verification — wave 1 (master = wp1+wp2+wp3) + wp4 + wp5

**Verifier:** independent agent (wrote none of this code) · **Date:** 2026-09-20
**Baselines:** master `75d9226` (= `37e3bd4` + wp1 + wp2 + wp3) · wp4 and wp5 diffed vs `75d9226`
**Method:** read-only in `/home/claude/nzamy/web` and the worktrees; every SQL chain, unit suite,
type-check and merge below was re-run by me, not taken from the agents' reports.
**Verdict:** wp4 and wp5 are **mergeable**. Two gaps must be closed before delivery, neither of
them in wp4/wp5 — both are wp1/wp2/wp3 integration gaps.

---

## A · Ground rules

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| A1 | No existing migration modified except `_verify.sql` | **PASS** | `git diff --name-status 37e3bd4..HEAD -- supabase/migrations` → 4×`A` (`20260921_01..04`) + `M supabase/migrations/_verify.sql`, nothing else. `75d9226..wp4` and `75d9226..wp5` on the same path → **empty**. |
| A2 | No deleted files | **PASS** | `--diff-filter=D` on `37e3bd4..HEAD`, `75d9226..wp4`, `75d9226..wp5` → all three empty. `src/app/ai/direction-support/page.tsx` shrinks 681→46 lines but is **not** deleted, and `direction-support.data.ts` is untouched on disk. |
| A3 | No new `service_role` / `createServiceClient` in a user read path | **PASS** | Added lines only (`git diff … \| grep -E "^\+"`): master has exactly **one** hit — `+  assert.doesNotMatch(routeSource, /createServiceClient\|SUPABASE_SERVICE_ROLE_KEY/);` (a test *forbidding* it). wp4 and wp5 added-line hits: **0**. The two wp4 hits seen in an unfiltered grep are unchanged context lines (`src/app/api/v1/lawyers/[id]/route.ts:3`, `service-requests/route.ts:3`). |
| A4 | No `NODE_TLS_REJECT_UNAUTHORIZED` | **PASS** | `git grep -n` on HEAD/wp4/wp5 → only `.env.example:51,61` (a prohibition, in English and Arabic), the audit appendix and the plan. No code sets it. |
| A5 | Arabic user-facing copy in new strings | **PASS** | Every new 503/400/403 body routes through an Arabic constant: `AUTH_UNAVAILABLE_AR = "تعذّر التحقق من الجلسة حالياً، حاول بعد قليل"` (`resolveAuthOutcome.ts:29`), `AR_MESSAGE` (`saudiMobile.ts:32-37`), `CONTACT_AR` (`contact/_validate.ts:22-28`), `AR` in `serviceRequestIntake.ts:78-88` (9 strings, all Arabic), `sessionResponse.ts:63` «غير مصرح — يرجى تسجيل الدخول», `assertRole.ts:36,58`. Banners: `ServerSessionGate.tsx:31` «تعذّر التحقق من الجلسة، بعض البيانات قد لا تظهر»; login 503/401 copy `login/page.tsx:215,234`; `settingsReadiness.ts:36-39`. Hints: `Steps.tsx:384`, `contact/page.tsx:276`, `partners/page.tsx:455` — all Arabic with an English twin behind `isAr`. |
| A6 | Line-ending discipline | **PASS (1 concern)** | I compared EOL *mode* (CR count vs line count), not just CR count, for every modified file on all three branches. **No whole-file conversion anywhere.** wp4: 13 files, every one keeps its mode (`navigation.sidebars.legal.ts` stays CRLF 438→442). wp5: 5 files, all keep their mode. master: one file changes mode — `src/proxy.ts` `CRLF(511/511) → MIXED(602/604)`. The 2 LF-only lines are `src/proxy.ts:12-13` (the two new imports). Cosmetic, harmless, but it makes that file mixed for the first time. |
| A7 | `Blast radius:` in every commit that edits an existing function | **wp4/wp5 PASS · master CONCERN** | wp4 **11/11** commits carry it; wp5 **5/5**. master: 19 of 29. The 10 without = 3 merge commits (edit nothing) + 7 WP-1 commits. Of those 7, `a4ae2f8` (`20260921_03`) does `create or replace` on four existing DB functions and `a57714e`/`07ddb29` edit existing files — no literal heading, but the bodies carry the equivalent in prose (e.g. `a4ae2f8`: *"never DROP: 20260914's service_requests policy depends on is_active_business_member"*). Substance present, literal ground-rule 5 wording absent. |

---

## B · SQL (master)

All four files are `begin;…commit;`-wrapped and end in a `do $$ … raise exception …` verify block,
so a failed assertion rolls the whole file back.

| Check | Verdict | Evidence |
|---|---|---|
| `_01` structure | **PASS** | `begin;` :77 → `commit;` :190. Dynamic `do $$` loop (:82-99) drops by **absence from the allow-list**, one `raise notice` per drop; names are never guessed. |
| `_01` re-creates the three with `public.is_admin()` | **PASS** | `:112-115` `create policy "admins read all profiles" … using (public.is_admin())` — the non-recursive form, **not** the self-referential `exists (select … from public.profiles)` of `20260603_phase1_001_profiles.sql:70-77`. All three are `to authenticated`. |
| `_01` idempotent | **PASS** | Loop + `drop policy if exists` + `create` + idempotent `revoke`. **Proved:** applied twice in one chain → `verify: OK` twice, test exit 0. |
| `_02` revokes on both tables, keeps read-own | **PASS** | `:88-89` `revoke insert, update, delete on public.subscriptions from authenticated, anon;` and the same for `public.credit_transactions`. `"users read own subscriptions"` re-created `:80-82`; `"users read own credit transactions"` left untouched. Harness `T0 SELECT grants … (expect 4 — reads survive): 4`. |
| `_02` idempotent | **PASS** | Applied twice → `verify: OK` twice, exit 0. |
| `_03` keeps the `20260903` parameter names | **PASS** | `20260903_phase2…:283,299,311,323` declare `p_firm / p_business / p_gov / p_ngo`; `20260921_03:252,320,388,456` use **exactly those**. No `42P13` risk. |
| `_03` never `DROP … CASCADE` | **PASS** | `grep -in cascade` → 4 hits, **all in comments**. The only `drop function if exists` calls are the four new `is_X_owner(uuid)` helpers (`:259,327,395,463`), each after step 1 has already removed every dependent policy; `_verify.sql` is the only other referrer. The four member helpers are `create or replace`, never dropped. |
| `_03` no inline entity-table select inside a policy | **PASS** | Proved by the file's own verify block **4b** (regex `(from\|join)\s+(public\.)?(firm\|business\|government\|ngo)_(members\|profiles)`) **and 4c** (no `( select` at all), and re-proved by the test: `policies on the 8 tables that read an entity table inline (expect 0): 0`. |
| `_03` covers all 8 tables, 3+4 matrix | **PASS** | Harness: `business_members=4 · business_profiles=3 · firm_members=4 · firm_profiles=3 · government_members=4 · government_profiles=3 · ngo_members=4 · ngo_profiles=3`; `helper functions (expect 8): 8`. Keys verified: `gov_id` (not `government_id`). |
| `_03` idempotent | **PASS** | Applied twice → `verify: OK` twice, counts unchanged, exit 0. |
| `_04` carries `handle_new_user()` forward with ONLY the phone expression changed | **PASS** | **My own extraction + diff** (below). |
| `_04` `not valid` then `validate` | **PASS** | `:202-203` `add constraint … not valid` guarded by a `pg_constraint` existence check (`:196-201`); `:207` `alter table … validate constraint`. |
| `_04` quarantine preserves the value | **PASS** | `:176-183` `set metadata = metadata \|\| jsonb_build_object('invalid_phone_quarantined', phone, 'invalid_phone_quarantined_at', now()), phone = null`. `profiles.metadata` is `jsonb not null default '{}'` (`20260603_phase1_001_profiles.sql:51`), so the `\|\|` can never null out. Harness: `T2 garbage row quarantined value (expect letters-and-email@example.test): letters-and-email@example.test`. |
| `_04` idempotent | **PASS** | Applied twice → `20260921_04 OK — no_phone=2 e164_ok=4 quarantined=1` twice, all T1–T6 pass, exit 0. |

### B.1 · My own `handle_new_user()` carry-forward diff

I extracted both `$$…$$` bodies programmatically from `20260827_signup_contact_fields.sql` and
`20260921_04_profiles_phone_e164_check.sql` (5364 and 6591 chars) and diffed them. **The complete
diff is three hunks — there is nothing else:**

```diff
@@ -6,6 +6,8 @@
   v_rep_capacity TEXT;
+  -- NEW in 20260921_04. The clamped Saudi mobile in E.164 form, or NULL.
+  v_phone     TEXT;
 BEGIN
@@ -20,6 +22,29 @@
+  v_phone := regexp_replace(
+               translate(
+                 COALESCE(new.raw_user_meta_data->>'phone', new.phone, ''),
+                 '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'
+               ), '[^0-9]', '', 'g');
+  IF v_phone ~ '^(00966|966|0)?5[0-9]{8}$' THEN
+    v_phone := '+966' || right(v_phone, 9);
+  ELSE
+    v_phone := NULL;
+  END IF;
@@ -42,8 +67,9 @@
-    NULLIF(COALESCE(new.raw_user_meta_data->>'phone', new.phone), ''),
+    v_phone,
```

The `v_sub_role` and `v_rep_capacity` clamps, the `user_type` whitelist, `country_code` and all
seven sector-table inserts are **byte-identical**. Independently re-proved at runtime:
`T5 whitelist|sub_role|rep_capacity|country_code intact (expect t|t|t|t): true|true|true|true`.
I also hand-checked the regex against `+96605…`: after digit-stripping it is `96605…`, which no
alternative matches → `NULL`, i.e. rejected, matching `normalizeSaudiMobile`.

### B.2 · Harness runs (all mine, `PGHOST=/tmp/pg PGPORT=5499 PGUSER=postgres`, PostgreSQL 16)

| Chain | Exit | Key lines |
|---|---|---|
| `prelude_profiles_rls_chain` → `20260603_phase1_001` → `20260625` → `prelude_profiles_leak_injection` → `_01` → `profiles_cross_user_read.test.sql` | **0** | `DEFECT REPRODUCED (UAT-SEC-001): A reads B's profile row (foreign rows visible: 1 …)` → `dropping unsanctioned policy on public.profiles: Enable read access for all users` → `T2 A reads B's profile (expect 0): 0` · `T4 admin reads all 4 rows via public.is_admin()` · `T6 PASS: anon SELECT … refused (42501)` · `anon DML grants (expect 0): 0` · `relrowsecurity: true` |
| `20260603_phase1_003` → `20260906_fix_subscriptions_rls_security` → `_02` → `subscriptions_write_guard.test.sql` | **0** | `T1/T2/T3 PASS … refused (42501)` · `T4 A's tier is unchanged (expect free): free` · `T5 PASS: credit_transactions INSERT refused` · `INSERT/UPDATE/DELETE grants for authenticated+anon (expect 0): 0` |
| `prelude_entity_rls_chain` → `20260616` → `20260617` → `20260903` → `20260914` → `prelude_entity_recursion_defect_proof` → `_03` → `entity_members_no_recursion.test.sql` | **0** | 8 × `DEFECT REPRODUCED … 42P17` first, then **T1–T7 PASS for all four entities** (28 assertions) · `T8 business member reads the company request (expect 1): 1` / `outsider … 0` · `helper functions (expect 8): 8` · `policies … that read an entity table inline (expect 0): 0` |
| `prelude_profiles_phone` → `20260603_phase1_001` → `20260827` → `prelude_seed_phones` → `_04` → `profiles_phone_e164.test.sql` | **0** | `20260921_04 OK — no_phone=2 e164_ok=4 quarantined=1` · all four salvageable shapes → `+966512345678` · `T3 constraint exists and is validated: true\|true` · three `23514` refusals · `T4 signup with garbage (expect NULL): NULL` · `T4 all four accounts were still created (expect 4): 4` · `T6 rows violating the constraint (expect 0): 0` |
| **Idempotency**: each of `_01`, `_02`, `_03`, `_04` listed **twice** in its chain | **0 ×4** | every verify block printed `OK` twice; every test still passed |
| **Regression** `20260903` → `_03` → `phase2_clients_and_membership.test.sql` | **0** | `T0b member C reads co-members without recursion (expect 2): 2` · T1–T12 unchanged · `policies: cases=3 · consultations=3 · contracts=3 · lawyer_client_notes=4 · lawyer_clients=4 · service_requests=4` |
| **Regression** `20260907_phase7` → `phase7_profile_services_reviews.test.sql` | **0** | unchanged, 18 assertion lines |

### B.3 · Full staging-order rehearsal — **I re-ran it with `20260921_04` included**

WP1-report.md §4's rehearsal script (`rehearse.sh`) applies
`court_costs → fix_subscriptions_rls → 20260914 → _01 → _02 → _03 → storage side-file → _verify.sql`
— **`_04` is not in it**, because `_04` was written on wp3, not wp1, and nobody re-ran the rehearsal
after the merge. I rebuilt the rehearsal on the **merged master**, inserted `_04` in the plan §3
position, added `20260827` to the base and seeded two malformed phones so the backfill had real work:

```
=========== STAGING APPLY ORDER (plan §3, _04 INCLUDED) ===========
── 20260906_court_costs_and_firm_profile_fields.sql
── 20260906_fix_subscriptions_rls_security.sql
── 20260914_entity_memberships_and_business_requests.sql
── 20260921_01_profiles_rls_lockdown.sql        NOTICE: verify: OK — 3 sanctioned policies, RLS on, no anon DML grant
── 20260921_02_subscriptions_write_revoke.sql   NOTICE: verify: OK — no write policy and no write grant
── 20260921_03_entity_rls_recursion_fix.sql     NOTICE: firm/business/government/ngo — 3+4 each, helpers installed
                                                NOTICE: verify: OK — matrix in place, no policy … reads any of them inline
── 20260921_04_profiles_phone_e164_check.sql    NOTICE: 20260921_04 OK — no_phone=1 e164_ok=1 quarantined=1
── storage_policies_documents.sql               NOTICE: OK — 4 owner-only policies, nothing else can match bucket documents
=========== _verify.sql ===========
handle_new_user fn | t                     court_cost_notices table | t
on_auth_user_created trigger | t           case_disbursements table | t
service_requests RLS enabled | t           firm_profiles.cr_number | t
platform_settings.payments_gateway | t     service_requests.business_id | t
profiles.city | t                          business members read business service requests policy | t
entity RLS helper functions (expect 8) | 8
policies on the 8 entity tables that read an entity table inline (expect 0) | 0
public.profiles policy count (expect 3) | 3
anon DML grants on public.profiles (expect 0) | 0
subscriptions INSERT/UPDATE policies (expect 0) | 0
authenticated/anon write grants on subscriptions+credit_transactions (expect 0) | 0
documents owner-only storage policies (expect 4) | 4
other storage.objects policies that can match bucket documents (expect 0) | 0
_verify rc=0
=========== post-rehearsal phone state ===========
1111…1111 | +966512345678 | -                          ← salvageable shape normalised
2222…2222 | NULL          | letters-and-email@…test    ← quarantined, value preserved
```

**The whole plan §3 order applies cleanly end to end with all four new migrations. `_verify` rc=0.**

**But:** `grep -n "phone\|e164\|20260921_04\|saudi" supabase/migrations/_verify.sql` → **zero hits**.
`_verify.sql` gained 219 lines of gates for `_01`, `_02`, `_03`, `20260906` and `20260914` — and
**none for `_04`**. Plan §3d is explicit: *"assertions in `supabase/migrations/_verify.sql` for
every object in 3a/3d"*, and `_04` is item 4 of 3d. A bulk apply that silently skips `_04` therefore
leaves `deploy.sh` green — exactly the failure mode commit `07ddb29` was written to end.
→ **MUST FIX 1.**

---

## C · Auth (master, from wp2)

| # | Check | Verdict | Evidence |
|---|---|---|---|
| C1 | `grep -rn "authError \|\| !user\|error \|\| !user" src/app/api src/lib` → comments only | **PASS** | 4 hits, all prose: `apiAuth.ts:14`, `resolveAuthOutcome.test.ts:6`, `resolveAuthOutcome.ts:5,75`. Zero live gates. |
| C2 | No path defaults to demo; production+`"demo"` | **PASS** | `runtimeMode.ts:60` `const raw = envValue ?? "supabase"` (rule 1); `:71` `isDemoMode = raw === "demo" && nodeEnv !== "production"` (rule 2); `:63-68` **throws** on any other value (rule 3). Production+`"demo"` does **not** throw *in `resolveBackendMode`* — it resolves to `supabase`/`isDemoMode:false` — but it is caught twice over: `instrumentation.ts:31-36` throws at boot on `backend !== 'supabase'`, and `proxy.ts:149-153` throws at module load on the edge. Net: unreachable in production by construction, and loud. `resolveAuthOutcome.ts` correctly returns `"ok"` for a user present alongside a stale error (`:73`) and `"unavailable"` on `AuthRetryableFetchError`/no status/transport message (`:55-65`). |
| C3 | `proxy.ts` behaviour | **PASS** | Page branch `:343-353`: `console.error` + `const degraded = nextWithPathname(); degraded.headers.set("x-nzamy-auth","unavailable"); return degraded;` — **no redirect**, and `nextWithPathname()` is `NextResponse.next({ request: { headers } })` (`:296-300`). API branch `:203-210` → `NextResponse.json({ error: AUTH_UNAVAILABLE_AR }, { status: 503 })`. Legacy cookie branch gated: `:578` `if (!isDemoMode) return NextResponse.next();`. Module-level production assertion `:149-153`. `x-nzamy-pathname` set at `:298`, only inside the protected-page branch. |
| C4 | Server gates | **PASS** | `src/app/dashboard/layout.tsx` and `src/app/settings/layout.tsx` are `async` **server** components (no `"use client"`), each rendering `<ServerSessionGate fallbackPath=…>`. `ServerSessionGate.tsx:66-69` `redirect()` **only** on `anonymous`; `unavailable` renders the Arabic banner + `children`; `ok` renders `children`. |
| C5 | Login handshake | **PASS** | `login/page.tsx:207` fetches `/api/v1/auth/session` with `credentials:"same-origin", cache:"no-store"`; 503 → Arabic message and stay (`:212-219`); 401 → Arabic message and stay (`:220-237`); 200 → `window.location.assign(dest)` (`:256`) — a **full** document load. `router.push` survives only in the demo branch (`:269`). Cookie logging is **names only**: `document.cookie.split(";").map((c) => c.split("=")[0].trim())` (`:227-230`) — no values. |
| C6 | `useUser` demotion + guard | **PASS** | `useUser.ts:731-735` `userType = profileState === "missing" ? null : …`; `:744` exposes `profileState`. Guest unchanged (`GUEST_SESSION` returned at `:711` before any of this, `profileState` undefined by construction). `UserTypeGuard.tsx:39` tests `isLoggedIn && profileState === "missing"` **before** the allowedTypes branch at `:89`, rendering «ملفك غير مكتمل» (`:51`) + a link to `/onboarding` (`:57`). |
| C7 | `ai/layout.tsx` ordering | **PASS** | Logged-out escape is now step **2b** at `:125-127`, **above** `LAWYER_AI_PREFIXES` at `:133-136`. A guest on `/ai/direction-support` gets the page unwrapped and `proxy.ts` sends them to `/login`. |
| C8 | `api.ts` credentials/cache | **PASS** | `credentials:"same-origin"` + `cache:"no-store"` on **both** `apiGet` (`:56-57`) and `apiMutate` (`:79-80`). |
| — | `assertRole` / `access-control` | **PASS** | `assertRole.ts:29-31` `isAuthUnavailable → authUnavailableResponse()` (503) before the 401 at `:33-40`. `access-control.ts:119` returns `{ error: AUTH_UNAVAILABLE_AR, status: 503 }`. |
| — | Demo block reachable in production? | **PASS** | `useUser.ts:437-545` is kept (owner decision ٤ / Q6 default) but `initDemo` starts `:953 if (isSupabaseMode) return;` — and `isSupabaseMode` is unconditionally true in production. |

**Regression sweeps (both clean):**
- **401 bodies:** the only 401 lines in the diff are `- if (authError \|\| !user) return … "Unauthorized" … 401` → `+ if (!user) return … "Unauthorized" … 401`. **No 401 body text changed anywhere.**
- **`userType === "individual"` as "signed in":** 7 live sites. `settingsReadiness.ts:156` already handles `!userType`. `EscalationFlow.tsx:141`, `marketplace/post:102`, `SubscriptionTab:44`, `ai/page:607` degrade to the not-individual branch, which is the honest answer for an incomplete profile. `ai/layout.tsx:70` and `notifications/layout.tsx:23` fall through to a different dashboard chrome — but every one of those chromes wraps `<UserTypeGuard>`, whose `profileState === "missing"` branch fires first, so the user lands on «ملفك غير مكتمل», not on «صلاحيات غير كافية». **No regression.**

**Gap:** WP-2 item 3 also required *"a startup probe `GET ${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`
that logs loudly (not throws) on failure"* in `src/instrumentation.ts`.
`grep -n "health\|fetch" src/instrumentation.ts` → **zero hits**; the file has only the backend-mode
assertion and the env-var check. This is the one piece of WP-2 that would have caught UAT-ENV-001
(untrusted intercepting-proxy CA) *at boot* instead of at the first user request.
→ **MUST FIX 2.**

---

## D · Registration / phone (master, from wp3)

| # | Check | Verdict | Evidence |
|---|---|---|---|
| D1 | `canNext` email regex + name requirements | **PASS** | `register/client/page.tsx:72` `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/`; `:77` gates on it; `:79` individual needs **both** `firstName` and `lastName`; `:80` government `entityName`; `:81` ngo `ngoName`; plus `:83` corporate identity and `:85` micro name. `:78` also gates on `normalizeSaudiMobile(formData.phone).ok`. |
| D2 | `Steps.tsx` inline errors + sanitize | **PASS** | `:144-149` derives `emailTouched/emailValid/phoneTouched/phoneResult/phoneValid`. Phone input `:377` `onChange={… sanitizePhoneDigits(e.target.value)}`, `:378` `aria-invalid`, `:379` red border, `:383-386` Arabic reason from `saudiMobileMessage(phoneResult)` with a neutral hint otherwise. `grep -c aria-invalid` = 2 (email + phone). |
| D3 | Contact route validation + client mirrors | **PASS** | `contact/_validate.ts` is pure (no `next/server`, no Supabase): email regex, optional phone → `normalizeSaudiMobile` → 400 with `saudiMobileMessage`, caps `name ≤ 120 / subject ≤ 200 / message ≤ 5000`, returns `phoneE164`. `route.ts:41-45` calls it and 400s; `:51` stores `phone: phoneE164`; `:84` forwards the **same** normalised value to n8n. Mirrors: `contact/page.tsx:51-52,270-276,330` and `partners/page.tsx:114-115,455,492`. *(Note: the contact form treats phone as required — label `«رقم الجوال *»`, its own pre-existing rule — while the server treats it as optional. Client stricter than server; not a defect.)* |
| D4 | `proxy.ts` `hasPhone` format-aware | **PASS** | `proxy.ts:494` `hasPhone: hasValidSaudiMobile(profile?.phone)`. Tests at `onboardingGate.test.ts:67-97` assert both the rejected-stored-garbage and accepted cases. |
| D5 | Helper refactor — call sites compile, semantics unchanged | **PASS** | All 20 call sites moved to `{ok,e164}` / `saudiMobileMessage` / `hasValidSaudiMobile` / `saudiMobileOrNull`; `npm run type-check` is clean on the merged tree. **I wrote my own parity test** against the *old* `37e3bd4:saudiMobile.test.ts` expectation sets, run against the *new* module: all 6 old-accepted inputs still yield `+966512345678`, all 8 old-rejected inputs still rejected — `# pass 2 # fail 0`. The only behaviour widening is deliberate and documented: `.`, `_`, `/`, NBSP and ZWSP are now stripped as separators (`STRIP_RE`, `saudiMobile.ts:49`). `+9660512345678` stays a rejection. |
| D6 | `ProfileTab` pre-flight | **PASS** | `ProfileTab.tsx:219-221` `const parsed = normalizeSaudiMobile(typedPhone); if (!parsed.ok) setFieldErrors({ phone: saudiMobileMessage(parsed) })` — field-level, before the round trip. |
| D7 | `email` still not in the profile allow-list | **PASS** | `profile/route.ts:321-334` `profileFields` = `display_name, display_name_en, phone, avatar_url, language, calendar_type, theme, country_code, city, onboarding_completed, nationality`. **`email` absent**, and `:520` only copies keys from that array. |

---

## E · WP-4 (`/home/claude/wt/wp4`, vs `75d9226`) — 20 files, +1267/−840

| Item | Verdict | Evidence |
|---|---|---|
| **G1** public link row | **PASS** | `profile/page.tsx:235-236` `const [origin,setOrigin]=useState(""); useEffect(()=>setOrigin(window.location.origin),[])`; `:799` label «رابط ملفك العام»; `:804` `value={buildPublicProfileUrl(origin, profileData.slug, user.userId ?? "")}`; `:808` beta sentence under `BETA_MONOPOLY_MODE`. Read-only row deliberately **not** gated on `canShareProfile` (`:785-786`); the share **button** still is (`:556`). |
| **G2** `nationality` for lawyers | **PASS** | `profileSettingsFields.ts:52` adds it to the lawyer list with `target:"profile"`, `maxLength:60`; only lawyer + individual (`:41`), per Q3 default. `profileSettingsFields.test.ts` 6/6 pass. |
| **G3** `is_accepting_clients` tile | **PASS** | Carried through `EMPTY_PROFILE:118`, `ProfileApiResponse.roleProfile:253`, `load():294`; rendered `:712-717` «يستقبل موكلين جدد» / «لا يستقبل موكلين جدداً حالياً» with the colour split. |
| **G4** shared link builder | **PASS** | New `publicProfileLink.ts` (`buildPublicProfileUrl`, `canShareProfile`, `copyToClipboard` with a two-tier clipboard that **returns a boolean the caller honours**). Used by `profile/page.tsx:23,391,399,804` **and** `dashboard/lawyer/page.tsx:62,317,347`. The dashboard's UUID-only link is genuinely fixed: `:331-343` fetches `roleProfile.slug` from `GET /api/v1/profile` and `:337` `setProfileSlug(...)`, falling back to the user id only on a failed read. 5/5 tests pass. |
| **G5** wording (Q1) | **PASS** | No code change — `lawyerProfileFields.ts` is untouched in the diff — and commit `bc29a14` records the Q1 default («ر.س» / «بحسب الحالة») being kept. Correct per plan §5. |
| **G6** review anonymity | **PASS** | New `reviews/_redact.ts`: `requestIdsForEnrichment` excludes anonymous rows **at the query**, `redactAnonymousReview` nulls all three identity fields regardless of what the caller resolved. Wired in `reviews/route.ts:59,90`. 6/6 tests pass. |
| **G7** migration notice | **PASS** | `edit/page.tsx:298` `setNewFieldsAvailable("slug" in r)`; `:567` Arabic notice «حقول الملف المهني (الرابط، النبذة، المؤهلات) تحتاج تشغيل ترحيل 20260907 على هذه القاعدة.» rendered once. |
| **8** AddCaseModal | **PASS** | Real `disabled`: `:323 disabled={!step1Complete}` + `aria-disabled`, and `:369 disabled={saving \|\| !step1Complete}` on Save. Re-validated in `handleSave` (`:120-125`) with an Arabic error and `setStep(1)`. **Both silent fallbacks gone** — `git show 75d9226:…AddCaseModal.tsx` had `:109 title: title.trim() \|\| \`قضية — ${clientName.trim() \|\| "عميل نظامي"}\`` and `:115 name: clientName.trim() \|\| user.name \|\| "عميل نظامي"`; in wp4 «عميل نظامي» survives **only inside a comment** (`:172`) and «قضية —» is gone entirely. |
| **8** server validator wired **before** the insert | **PASS** | `service-requests/route.ts:275` `validateServiceRequestCreate(requestData)` → 400, placed right after `requestData` is unwrapped (`:263`), i.e. before the payment gate, entity-scope resolution, the `lawyer_clients` lookup **and** the insert at `:462`. The insert reads `shape.value.*` (`:465-474`). 10/10 tests pass. |
| **8** type/receiver lists vs the **latest** CHECKs | **PASS — independently re-derived** | I traced the constraint history myself: `20260814_service_orders_types.sql:20-26` is the latest redefinition of `service_requests_type_check` (8 values: `service, consultation, business_case, ngo_volunteer, ai_draft, ai_contracts, ai_wargaming, ai_legal_opinion`); no later migration touches it (`20260905`, `20260906`, `20260907` → 0 hits for `type_check`/`receiver_check`). `receiver` is still `20260518:11` (7 values). `serviceRequestIntake.ts:32-53` matches **both, exactly**. Defaults preserved byte-for-byte from the old inline code (`'service'`, `'lawyer'`, `''`, `{}`). |
| **9** `direction-support.data` out of the bundle | **PASS** | `grep -rn "direction-support.data" src` → **0**. Page body is `DashboardComingSoon`; all four files kept on disk. |
| **9** «قريباً» badges | **PASS** | `navigation.sidebars.legal.ts:101` and `:340` badge `"قريباً"`; `mockData.ts:109` tile badge `"قريباً"`; `lawyerAiCatalog.ts:298` `if (tool.comingSoon) return "قريباً"` before any price. `ai:direction-support` is **kept** in `LAWYER_AI_PERMISSION_KEYS` (`useUser.ts:185`, `lawyerAiCatalog.ts:17,202`) so the lawyer is not refused their own «قريباً» page. |
| **9** `navComingSoon.test.ts` | **PASS** | Lives at `src/lib/services/navComingSoon.test.ts` (not `src/constants/`). Run: `# tests 3 # pass 3 # fail 0`. |

### E.1 · The two judgement calls

**(a) Extending the redaction to the PUBLIC `/api/v1/lawyers/[id]` route — SAFE, and correct.**
The plan named only `reviews/route.ts`. The agent found the identical defect on the public profile
route (`hydrateReviews` withheld `reviewerName`/`requestId` for an anonymous review and then resolved
that same request's title into `serviceTitleAr`, which `/lawyers/[slug]` prints as «عن: …» directly
under «عميل») and routed it through the same module. The change is **monotonically more restrictive**
— it can only withhold more, never expose more — and it reuses a tested pure function rather than
duplicating logic. The only user-visible effect is that an anonymous review on a public lawyer page
loses its service-title line, which is the point. Verified `createServiceClient` usage there is
unchanged (it is a public route by design and was already service-scoped).

**(b) Option 1 (create the card) over the «بدون بطاقة موكّل» label — SAFE, with one residue.**
Ordering is correct: `createLawyerClient` runs at `AddCaseModal.tsx:141`, **before** the case POST at
`:190`. On card-creation failure (`:148-158`) the modal shows an Arabic reason
(«تعذّر إنشاء بطاقة الموكّل: …»), `setSaving(false)` and **returns** — no case is written without its
موكل. Demo mode is correctly excluded (`:139 isSupabaseMode`), because `createLawyerClient` throws
there by design. Ownership of the card is still enforced server-side (`route.ts:436-449`, 400 with
«الموكّل المحدَّد غير موجود أو لا تملك صلاحيته.»).
*Residue:* if the card is created and the case POST then fails, an orphan `lawyer_clients` row is
left. It is not silent (the lawyer sees the save error), and the retry is clean because
`setSelectedClientId(card.id)` at `:145` prevents a duplicate card. Acceptable; worth one line in the
owner-facing note. See **SHOULD FIX 5**.

---

## F · WP-5 (`/home/claude/wt/wp5`, vs `75d9226`) — 7 files, +505/−33

| Item | Verdict | Evidence |
|---|---|---|
| **C-2** three-state summary | **PASS** | `dashboardService.ts:103-113` returns `ListRead<DashboardSummary>`: demo → `listOk([{...DEMO_SUMMARY}])` (a fixture is the honest answer when there is no backend), a non-object body → `listFailed()` (`summaryReadFrom`, `:96-101`), a throw → `listFailed()`. **No caller left assuming a summary object:** `getDashboardSummary` has exactly one consumer — `dashboard/client/page.tsx:268` — and it uses `listViewState(loading, summaryRead)` + `itemsOf(summaryRead)[0] ?? null` (`:292-293`), the same three-state spelling as the documents card, with `retrySummary` at `:283`. `dashboardService.test.ts` 7/7 pass. |
| **C-3** `?tab=` support | **PASS** | `settings/page.tsx:134-144`: `window.location.search` read **inside `useEffect`** (not `useSearchParams`, deliberately, to avoid forcing a Suspense boundary on a statically-rendered page), applied once via a `useRef` latch, and **only** to a tab the role actually has (`tabs.find(...)`, ignored otherwise). No server/client mismatch. Entry point: `dashboard/client/page.tsx:693` `<Link href="/settings?tab=profile">` labelled «الملف الشخصي». |
| **C-4** banner narrowed | **PASS** | `settingsReadiness.ts` — old blanket claim «لا يوجد حفظ خادمي …» replaced by a narrowed, accurate sentence naming the two tabs that still store nothing («التوقيع والختم», «الفواتير»); 33 lines of doc comment record why it was narrowed rather than deleted. Single render site (`RoleScopeTab.tsx:40`) confirmed. |
| **bonus** `maxLength` | **PASS** | `dashboard/client/requests/new/page.tsx:220` `maxLength={200}` on the subject input, mirroring `serviceRequestIntake`'s 200-char title cap, with a comment explaining why no counter. *Note: the comment references WP-4's validator, which lives on wp4 — the two are consistent once both are merged, which is the plan's sequence.* |
| **conflict risk with wp6 in `settingsReadiness.ts`** | **PASS today** | wp6 currently holds **one** commit (`90acba0`, B-1 corporate contact fields) and `git diff --stat 75d9226..wp6 -- src/constants/settingsReadiness.ts` is **empty** — it does not touch the file. wp5's only hunk is `@@ -1,8 +1,41 @@` (the file header). WP-6's *future* targets are `CORPORATE_INVITE_ROLES` (B-5) and the three `role ?? "owner"` defaults (B-9), which after wp5 sit at `:111` and `:154,158,162` — ≥70 lines from wp5's hunk, so git will merge them cleanly. The only cost is that the plan's line references (`settingsReadiness.ts:78-85`, `:120-130`) are now stale. See **SHOULD FIX 4**. |

---

## G · Merge preview (scratch clone — master was never touched)

```
git clone -q /home/claude/nzamy/web /home/claude/wt/verify/scratch
git fetch -q /home/claude/nzamy/web wp4:wp4 wp5:wp5
git merge --no-ff --no-edit wp4   → "Merge made by the 'ort' strategy."  20 files changed, 1267 insertions(+), 840 deletions(-)   EXIT=0
git merge --no-ff --no-edit wp5   → "Merge made by the 'ort' strategy."   7 files changed,  505 insertions(+),  33 deletions(-)   EXIT=0
git status --short | grep -E "^(UU|AA|DU|UD|AU|UA|DD)"  →  (empty)
```

**Zero conflicts, in any file or region.** The two branches are disjoint except for
`src/app/api/v1/service-requests/route.ts` (wp4 only) — wp5 touches
`dashboard/client/requests/new/page.tsx`, not the route.

| Gate | Result |
|---|---|
| `npm run type-check` | `> tsc --noEmit` · **`TYPECHECK_EXIT=0`** (no output) |
| `npm run test:unit` | `1..1301 / # tests 1301 / # pass 1301 / # fail 0 / # duration_ms 31406` · **`TESTUNIT_EXIT=0`** |
| `npm run build` | **Environment limitation — not a code failure.** |

**Build detail.** `npm run build` first fails as `sh: 1: next: Permission denied` (this container's
`node_modules/.bin/next` is mode `0666`, not executable — it is a symlink into a prepared
`node_modules`). Invoking the binary directly through node gets past that and reaches the real wall:

```
▲ Next.js 16.3.3 (Turbopack)
  Downloading swc package @next/swc-linux-x64-gnu... to /root/.cache/next-swc
⨯ Failed to download swc package from https://registry.npmjs.org/@next/swc-linux-x64-gnu/-/swc-linux-x64-gnu-16.3.3.tgz
unhandledRejection Error: request failed with status 403
BUILD_EXIT=1
```

I confirmed this is environmental by running the **same** command on the **unmerged** baseline repo
`/home/claude/nzamy/web`, which produces the identical failure:

```
⨯ Failed to load SWC binary for linux/x64, see more info here: https://nextjs.org/docs/messages/failed-loading-swc
⨯ Failed to load next.config.ts …
Error: Failed to load SWC binary for linux/x64
```

`@next/swc` was deliberately excluded from this container's `node_modules` and the agent proxy
returns 403 for the registry tarball. **`npm run build` is unverified here and must be run on a
machine with the native binaries before delivery** (plan ground rule 8).

---

## MUST FIX before delivery

1. **`supabase/migrations/_verify.sql` has no gate for `20260921_04`** — `deploy.sh` will pass even
   when the phone migration was skipped.
   *Evidence:* `grep -n "phone\|e164\|20260921_04\|saudi" supabase/migrations/_verify.sql` → 0 hits,
   while the file carries 219 new lines of gates for `_01`/`_02`/`_03`/`20260906`/`20260914`. Plan
   §3d requires assertions "for every object in 3a/3d"; `_04` is 3d item 4. Root cause: `_verify.sql`
   was written on wp1 and `_04` on wp3; the merge at `75d9226` never reconciled them, and
   `docs/audits/2026-09-20-profiles-uat/WP1-report.md` §4's rehearsal omits `_04` for the same reason.
   *Fix:* append to `supabase/migrations/_verify.sql`, in the file's existing style — a report row
   plus a `do $$ … raise exception … end $$;` block asserting all three of:
   ```sql
   -- report row
   select exists (select 1 from pg_constraint
                   where conrelid = 'public.profiles'::regclass
                     and conname  = 'profiles_phone_e164_saudi_mobile'
                     and convalidated) as "profiles phone E.164 constraint (validated)";
   -- gate
   do $$
   begin
     if not exists (select 1 from pg_constraint
                     where conrelid = 'public.profiles'::regclass
                       and conname  = 'profiles_phone_e164_saudi_mobile'
                       and convalidated) then
       raise exception '_verify: profiles_phone_e164_saudi_mobile is missing or NOT VALID — run 20260921_04_profiles_phone_e164_check.sql';
     end if;
     if pg_get_functiondef('public.handle_new_user()'::regprocedure) not like '%v_phone%' then
       raise exception '_verify: handle_new_user() carries no phone clamp — 20260921_04 was skipped or overwritten';
     end if;
     if exists (select 1 from public.profiles
                 where phone is not null and phone !~ '^\+9665[0-9]{8}$') then
       raise exception '_verify: public.profiles holds a non-E.164 phone';
     end if;
   end $$;
   ```
   Then re-run the §3 rehearsal **with `_04` in the order** (my script is reproduced in §B.3 above;
   it currently ends `_verify rc=0`, and must still do so after this addition).

2. **`src/instrumentation.ts` — the Supabase startup health probe from WP-2 item 3 was never
   implemented.**
   *Evidence:* `grep -n "health\|fetch" src/instrumentation.ts` → 0 hits. The file (55 lines) has only
   the backend-mode assertion (`:31-36`) and the required-env-var check (`:47-54`). The plan is
   explicit: *"add a startup probe `GET ${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health` that logs loudly
   (not throws) on failure."* This is the one thing in WP-2 that surfaces the UAT-ENV-001 class (an
   untrusted intercepting-proxy CA on the server runtime) **at boot** instead of as a 503 on a user's
   first request.
   *Fix:* inside `register()`, after the env-var check at `src/instrumentation.ts:54` (i.e. already
   behind `NEXT_RUNTIME === 'nodejs'` and `NODE_ENV === 'production'`), add a non-throwing probe:
   ```ts
   // UAT-ENV-001 — say at boot whether this runtime can actually REACH Auth.
   // Logs, never throws: a transient blip must not stop the server from starting.
   try {
     const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
       headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
       cache: 'no-store',
     });
     if (!res.ok) console.error(`[startup] Supabase auth health probe returned ${res.status}`);
   } catch (e) {
     console.error(
       '[startup] Supabase auth is UNREACHABLE from this runtime — every getUser() will answer 503. ' +
       'If this is a certificate error, set NODE_EXTRA_CA_CERTS; never NODE_TLS_REJECT_UNAUTHORIZED=0.',
       e,
     );
   }
   ```

*(Neither item is in wp4 or wp5. **wp4 and wp5 can be merged as they stand** — both merge cleanly,
type-check is clean and 1301/1301 unit tests pass on the merged tree.)*

---

## SHOULD FIX / follow-up

3. **`src/proxy.ts:12-13` are the only LF lines in an otherwise 100% CRLF file** (`CRLF(511/511) →
   MIXED(602/604)`; the two new imports `routeAccess` and `resolveAuthOutcome`). No whole-file
   conversion, nothing breaks — but it makes the repo's largest auth file mixed for the first time and
   will produce noisy diffs later. Re-terminate those two lines with CRLF.

4. **Plan line references into `src/constants/settingsReadiness.ts` are stale after wp5.** WP-6 B-5
   cites `:78-85` (`CORPORATE_INVITE_ROLES`) and B-9 cites `:120-130` (`role ?? "owner"`); post-wp5
   they are `:111` and `:154,158,162`. No merge conflict (wp6 does not touch the file today, and the
   hunks are ≥70 lines apart), but the WP-6 agent will be reading the wrong lines. Update the plan, or
   tell that agent to re-locate by symbol.

5. **`AddCaseModal` can leave an orphan `lawyer_clients` card.** If `createLawyerClient`
   (`AddCaseModal.tsx:141`) succeeds and the case POST at `:190` then fails, the card row persists with
   no case attached. It is not silent (the lawyer sees the save error) and the retry is clean
   (`setSelectedClientId(card.id)` at `:145` prevents a duplicate), so this is a data-tidiness matter,
   not a correctness one. Worth one sentence in the owner-facing note, and worth watching for in the
   WP-8 browser round.

6. **WP-2 and WP-3 shipped no report.** `docs/audits/2026-09-20-profiles-uat/` contains the six
   appendices and `WP1-report.md` only; wp4 and wp5 carry `WP4-report.md` / `WP5-report.md` on their
   branches. The plan §6 preamble requires every agent to *"Finish with a report: what changed
   (file:line), what you could not do and why, exact commands you ran, and the proof still owed."*
   Against the owner's evidence-based closing standard, WP-2 and WP-3 have no such record — and gap
   **MUST FIX 2** is exactly the kind of omission a WP-2 report would have declared.

7. **The 7 WP-1 commits carry no literal `Blast radius:` section** (`bfc365f`, `af039be`, `a57714e`,
   `a4ae2f8`, `07ddb29`, `e0faefc`, `89ed54e`), though `a4ae2f8` does `create or replace` on four
   existing DB functions and two of them edit existing files. Their bodies document the dependents in
   prose, so the substance is there; only the heading ground rule 5 asks for is missing. wp4 (11/11)
   and wp5 (5/5) comply fully.

8. **`npm run build` is still owed** (plan ground rule 8). Blocked here by a deliberately absent
   `@next/swc-linux-x64-gnu` and a 403 from the agent proxy on `registry.npmjs.org`; reproduced
   identically on the unmerged baseline, so it is not attributable to wp4/wp5. Must be run on a
   machine with the native binaries before delivery.

9. **Proof still owed for everything in this wave** — nothing here was applied to, or exercised
   against, a live database, and no browser round was run. The plan's *Proof to close* for WP-1/2/3/4/5
   (staging apply, the `scripts/uat/verify-*.ps1` suite, the owner's ي/ك/ز browser steps with «بعد»
   screenshots, and the matrix rows) all remain outstanding. My evidence above is harness + merge +
   static verification only.
