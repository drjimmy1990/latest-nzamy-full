# B1 — Library device limit (owner answer ٤٢٧)

Branch `t/device`, worktree `D:\nzwt\b1108-device`. Status: DONE_WITH_CONCERNS. The concerns are listed under "Known limits".

Owner ٤٢٧ (11-03 package, «المكتبة القانونية والأجهزة»):

> «الجهاز الثالث (في كمبيوتر + جوال): يُرفض الجهاز الثالث الجديد فوراً ويُقفل، ويُطلب من المستخدم تسجيل الخروج من أحد أجهزته المصرحة.»

## What was built

### 1. Migration `supabase/migrations/20261108_20_library_device_limit.sql`

The migration is idempotent and can run before or after the deploy. It needs 20261031_10.

**Settings.** `library_monitor_settings` (the admin-edited row of library caps from 20261031_10) gains two columns:
- `device_limit_enabled boolean default false`. **It ships OFF.** An admin turns it on after testing.
- `device_limit int default 2`, with a CHECK of 1–10.

**Table `public.user_devices`.** Columns: `id`, `user_id` (references auth.users, cascade), `device_hash` (sha-256 hex, CHECK), `label` (≤120), `first_seen`, `last_seen`, `revoked_at`, `revoked_by`, `revoke_reason` (self / other_device / sign_out / admin_reset). It is UNIQUE on (user_id, device_hash) and has a partial index on the active rows.
- RLS is on, and `authenticated` may SELECT its own rows only.
- The column-level grant excludes `device_hash`, so a user never reads a hash.
- There is no write grant for anon or authenticated. `service_role` has all.

**`library_device_check(p_user, p_device_hash, p_label)`.** SECURITY DEFINER, `search_path = ''`, service_role only. It answers one of:

| Answer | When | Written |
|---|---|---|
| `disabled` | The setting is off | Nothing |
| `exempt` | `profiles.user_type = 'admin'` (staff, as `library_read_quota_hit` does) | Nothing |
| `ok` | A known active device | `last_seen`, at most every 5 min |
| `registered` | A new device and there is room | A new row, or a revoked row revived |
| `refused` | A new device and no room | Nothing; the active devices come back as jsonb (id, label, first_seen, last_seen — never the hash) |

All of it runs under `pg_advisory_xact_lock(hashtextextended('library_device:'||user,0))`, so two new devices at the same moment cannot both take the last slot.

**`library_device_revoke(p_user, p_device_id, p_device_hash, p_reason, p_actor)`.** Same security. It revokes one device by id or by hash. A revoke-all (both null) is allowed only with reason `admin_reset`. It always matches `user_id`, so a user cannot revoke someone else's device. It returns the count and takes the same advisory lock.

### 2. App

**Pure helper `src/lib/library/deviceLimit.ts`.** It holds:
- cookie name and options: `nz_lib_device`, httpOnly, SameSite=Lax, path /, 400 days, Secure in production;
- id minting (32 random bytes, base64url) and strict validation;
- the sha-256 hash;
- the user-agent label, e.g. «كمبيوتر — Chrome / Windows», «جوال — Safari / iPhone», «جهاز لوحي — …»;
- row parsing and `deviceGateDecision`;
- the Arabic message, worded for the admin's number: «جهازين», «3 أجهزة»…;
- the missing-schema codes, the Bearer check, the device-list shaping (drops the hash) and the settings-patch parser.

**I/O helper `src/lib/library/deviceLimitServer.ts`.** `enforceLibraryDevice(userId, entitled)`:
- Reads the cookie through `next/headers` `cookies()`. If there is none, it mints one and sets it on the route's response.
- Calls the RPC as the service role with a 1.5 s timeout.
- Remembers an allowed (user, device) for 60 s in-process; exempt for 5 min; disabled for 60 s.
- On a refusal it returns a **403 `{ code: "device_limit", error, limit, devices[] }`** with `Cache-Control: private, no-store`.
- **Fails open** on 42P01, 42703, 42883, PGRST202, PGRST204 and PGRST205 (rechecked after 10 min), a missing service key, a timeout, or any error.

**Hook points.** Every route that sends a subscriber the full text calls the helper once, right after the entitlement is known and before the text is built:

| Route | Entitled flag passed |
|---|---|
| `GET /api/library/laws/[slug]` | `isSubscriber` |
| `GET /api/library/decrees/[id]` | `isSubscriber` |
| `GET /api/library/precedents/[slug]` (the principles) | `hasFullAccess` |
| `GET /api/library/books/[slug]` | `freeLimit === -1 && !isWhitelisted` (a free book is not checked) |
| `POST /api/library/scoped-search` (article text inside a document) | `hasFullAccess` |

A guest or a non-entitled viewer is never checked. There is no `/api/library/principles` route; the principles are served by the precedents route.

**No device id → refused while the limit is on (controller ruling on question E, 2026-11-08).**
- A browser always gets a device cookie minted on its first entitled read.
- A caller that cannot keep one, an `Authorization: Bearer` caller with no valid `nz_lib_device` cookie, is decided without minting (`cookielessGateDecision` + `readCookielessState`):
  - switch ON and an ordinary subscriber → **403 `{ code: "device_cookie_required", error, limit, devices: [] }`**, text: «لا يمكن فتح نص المكتبة الكامل من هذا الاتصال لأنه لا يحمل معرّف الجهاز. افتح المكتبة من المتصفح، أو حدّث التطبيق إلى إصدار يرسل معرّف الجهاز.»;
  - switch OFF → nothing changes;
  - staff → exempt;
  - migration missing, or a failed settings or profile read → fail open.
- The readers render `device_cookie_required` with the same notice as `device_limit` (the readers only call these routes from a browser, so in practice they never see it).
- **The rule a future phone app must handle:** it generates its own device id once (32 random bytes, base64url, 43 characters), keeps it, and sends it on every library read as the cookie `nz_lib_device` (a `Cookie:` header). The server then counts the app as one device, exactly like a browser.

**New routes.**

| Route | Who | What |
|---|---|---|
| `GET /api/v1/library/devices` | The session user | «أجهزتي»: id, label, firstSeen, lastSeen, current. Never the hash. `available: false` before the migration. |
| `POST /api/v1/library/devices/[id]/revoke` | The session user, never one named in the body | «تسجيل خروج هذا الجهاز». Reason `self` or `other_device`. A frozen account is refused (D6). |
| `POST /api/v1/library/devices/sign-out` | The session user | Called by `logout()`. Revokes this browser's device by its cookie and always answers 200. |
| `GET/POST /api/v1/admin/users/[id]/library-devices` | GET: `requireStaff("read")`. POST: `requireStaff("library.lock_lift")`, the same library-ops permission as lifting a library lock | The list, and «إعادة تعيين الأجهزة» (revoke all, `admin_reset`, audited). |
| `GET/PUT /api/v1/admin/library-monitor/devices` | GET: read. PUT: `requireStaff("settings.write")`, audited | The switch and the number. |

The switch and number got their own route on purpose: the existing «نشاط المكتبة» settings route reads a fixed column list and would return 500 before the migration runs.

**Screens.**
- **Readers.** The law reader shows the refusal in place of the text. The book, precedents and decree readers, which had no refusal UI, now show a whole-page refusal. The refusal (`LibraryDeviceLimitNotice`) carries the owner's sentence and the authorised devices, each with its label, «آخر استخدام» (computed on the client) and «تسجيل خروج هذا الجهاز». Revoking one reloads the page, and this device then registers.
- **`readerRefusal.ts`** gains `kind: "device"`, for a 403 with `code === "device_limit"` only, plus `deviceLastSeenAr`.
- **Settings → الأمان** gets a «أجهزتي» section (`LibraryDevicesPanel`). It is hidden before the migration and in demo mode.
- **Admin → الأمان والحماية** gets a new tab «أجهزة المكتبة» with the switch, the number (1–10) and an explanation.
- **Admin → المستخدمون → [user] → الأمان** gets the «أجهزة المكتبة» card: the list and «إعادة تعيين الأجهزة», with a confirmation step.
- **`logout()`** in `src/hooks/useUser.ts` first calls `/api/v1/library/devices/sign-out` with a 1.5 s cap and every error ignored, then calls `signOut()`. Logging out never waits on it.

## Rulings applied (controller), and the owner questions they raise

1. **Scope.** Only the subscriber library's full text is checked, not the whole-site login. A guest or a non-entitled viewer is never device-checked. → Owner question A below.
2. **Limit.** 2 per account, edited by an admin in the library settings row. **Shipped OFF** (`device_limit_enabled = false`): after the SQL runs and the deploy, the user or admin turns it on from «الأمان والحماية ← أجهزة المكتبة».
3. **Device identity.**
   - A random id in an httpOnly cookie. Only its sha-256 is stored, with a label taken from the user-agent.
   - Clearing cookies, or a private window, makes the browser a NEW device. → Owner question B.
4. **Refusal and freeing a slot.**
   - The third device gets a 403 listing the devices, and it may sign out ANOTHER device from there; that is how «سجّل الخروج من أحد أجهزته» works without holding the other device. → Owner question C.
   - Logging out of the platform frees the current device. Settings has «أجهزتي».
5. **Admin.** «إعادة تعيين الأجهزة» needs `library.lock_lift`. Staff (every `admin` account) is exempt.
6. **Out of scope.** Devices idle for N days do not expire automatically. → Owner question D.

### Proposed owner questions (the controller numbers them)
- **A.** Should the limit also cover the library AI (the library assistant, paid in points) and the general search? Today it covers only the full text (laws, decrees, principles, books, search inside a document).
- **B.** A cleared browser, or a private window, counts as a new device. Is that acceptable, or should a device that has not been used for a long time drop off by itself (see D)?
- **C.** From the refused third device the user can sign out one of his other devices directly. This is how «سجّل الخروج من أحد أجهزته» works without holding the other device. Do you approve, or must the sign-out be done only from the device itself?
- **D.** Should a device unused for N days (e.g. 90) be released automatically?
- *(FYI, decided by the controller, not a question:* while the limit is on, a connection that carries no device id — a Bearer call, the future phone app's path — is refused on the library text with «لا يمكن فتح نص المكتبة الكامل من هذا الاتصال لأنه لا يحمل معرّف الجهاز…». The phone app, when built, must send its own device id; it then counts as one of the account's devices.)*

## Known limits / concerns

- **Cookie-minting race.** If a new browser sends two library reads in parallel before the first `Set-Cookie` lands, each mints its own id and one browser takes both slots.
  - Every reader's first content fetch is a single request: the law, decree and book readers make one initial fetch, and the precedents windows are sequential. So this needs two tabs opened at the same instant.
  - The ghost device shows in «أجهزتي» and can be signed out.
  - The cookie is deliberately NOT minted on HTML page responses (the nginx cache trap).
- **Quota before the device refusal.** The proxy spends the read quota (20261030_80) before the route refuses the device, so a refused third device still spends one document of the daily quota. This is harmless, and the reads are the same document.
- **Memo.** A revoke made on another server process reaches an already-open reader within 60 s. The same applies when the admin switches the limit on: other processes pick it up within 60 s.
- **Sign-out paths.** Only `logout()` releases the device. `/account-frozen` and the global sign-out in `/reset-password` do not: a frozen account cannot read the library, and the reset page signs out every session (its devices stay until signed out from «أجهزتي» or reset by an admin).
- **Bearer bypass: CLOSED** (ruling E, commit 3 on this branch). Sending the access token as a Bearer header with no device cookie, the only way to skip the device check, now gets 403 `device_cookie_required` while the limit is on.
  - No client sends `Authorization` to `/api/library/*` today (grep 2026-11-08: only server-side service-role calls do), so this breaks nothing.
  - A Bearer caller that sends a valid `nz_lib_device` cookie is counted like any device.
  - Each such read costs two small service-role reads (the settings row, then `profiles.user_type`); "off" is memoised for 60 s and staff for 5 min.
- **Lowering the limit evicts nobody.** Devices already registered keep answering `ok`; only new devices are refused once the active count reaches the new number. An admin can reset a user's devices.
- **`/laws/feqh-preview`** fetches `/api/library/books/...` but has no device-refusal branch. An over-limit subscriber there sees that page's generic error path. It was not wired: it is a preview page, and the book reader itself shows the refusal.
- **Disabled writes nothing.** While the switch is off no devices are recorded. When it is turned on, every account starts with zero devices, so nobody is grandfathered over the limit.
- **Secure flag.** The cookie is `Secure` only when `NODE_ENV === "production"`, so a phone on the LAN over http can test a dev build.

## Impact analysis (GitNexus)

The GitNexus `impact` tool returned "Target not found" for `logout`, `readerRefusalFrom`, `hasFullLibraryAccess` and the route `GET` handlers. The `latest-nzamy-full` index does not contain these symbols (it is stale or does not cover this worktree), so I did not re-index the worktree. The callers below come from grep:

| Symbol | Callers | Risk |
|---|---|---|
| The 5 route handlers (laws, decrees, precedents, books, scoped-search) | The law reader, the decree reader `/laws/orders/[slug]`, `/precedents/[slug]`, `/book/[slug]` + `/laws/feqh-preview`, `ScopedSearchPanel` + the precedents page | LOW. The added call is a no-op unless the user is entitled AND the switch is on AND the migration ran, and it fails open. |
| `readerRefusalFrom` (`src/lib/library/readerRefusal.ts`) | The law reader. Now also the book, precedents and decree readers. | LOW. A new branch for 403 + `device_limit` only; any other 403 still returns null as before. |
| `logout()` (`src/hooks/useUser.ts`) | `onboarding/page.tsx`, `settings/page.tsx`, `AdminSidebar`, `SharedSidebar`, `Navbar` (×2) | LOW to MEDIUM. Sign-out now waits up to 1.5 s for the release call; every error is ignored and signOut always follows. |
| `SecurityTab`, admin `security/page.tsx`, admin `users/[id]/page.tsx` | One mount point each | LOW. Additive components only. |

No HIGH or CRITICAL risk was found.

`detect_changes` (worktree, scope all) found 15 changed files but mapped 0 symbols and 0 affected processes, with risk_level "low". That is the same index gap as above, so it is not evidence that nothing is affected.

## Tests

**`npx tsc --noEmit -p .`** is clean.

**`npm run -s test:unit`** (worktree root): 6343 tests, 6337 pass, 6 fail. The 6 failures are the known baseline ones; there are no new failures (re-run after ruling E).
- New: `src/lib/library/deviceLimit.test.ts`, 16 tests:
  - user-agent labels (10 agents) and odd input;
  - cookie options and the id format;
  - the sha-256;
  - row parsing;
  - the decision (only `refused` refuses; no row allows; what may be memoised);
  - the message wording;
  - missing-schema codes;
  - Bearer detection, and ruling E: `cookielessGateDecision` refuses (403 `device_cookie_required`, Arabic copy, no devices) only when the switch is on and the user is not staff; off, unknown and staff all allow;
  - the reader renders `device_cookie_required` as the device notice;
  - the list without the hash;
  - the settings patch;
  - the reader's 403 parsing and «آخر استخدام».
- New: `src/app/api/library/device-limit.routes.test.ts`, the source contract:
  - each of the 5 entitled read paths calls `enforceLibraryDevice` once, with the entitled flag, after the entitlement read and before the answer;
  - the server half fails open, and the Bearer-without-cookie branch goes to `cookielessGateDecision` before any id is minted, never a bare `return null`;
  - logout releases before signOut;
  - the user routes take the session user, and the admin routes are staff-gated and audited;
  - all 4 readers render the refusal;
  - the panels are mounted;
  - the migration's key lines.
- Updated contracts (deliberate):
  - `src/lib/auth/adminRouteGates.test.ts` pins the two new admin write handlers: `library-monitor/devices` PUT → settings.write, and `users/[id]/library-devices` POST → library.lock_lift.
  - The two new user write routes call `frozenAccountResponse(user)`, as `accountFreezeWrites.test.ts` requires.

**Docker RLS** (`supabase/tests/rls/user_devices_1108.test.sql`, postgres:16): **ALL PASS**. The chain runs 20261030_80 → 20261031_10 → 20261108_20 ×2 (it is re-runnable). It covers:
- defaults off at 2;
- disabled answers `disabled` for every device and writes nothing;
- 2 devices register, the same device again is `ok`, and the 3rd is `refused` with the 2 devices listed, no hash and limit 2;
- another user's slots are separate;
- a revoke by id frees a slot and the 3rd registers;
- a revoked device is then refused;
- a cross-user revoke is a no-op;
- a sign-out by hash revives the row without duplicating it;
- revoke-all only with `admin_reset`;
- admin exempt, with no rows;
- limit 1 refuses the 2nd;
- a bad hash is refused (22023);
- SECURITY DEFINER + `search_path ''`;
- the advisory lock is present in both functions (the concurrency guard);
- anon, authenticated and app_user cannot execute; service_role can;
- authenticated cannot read `device_hash` nor write;
- a user reads only his own rows, cannot read the hash and cannot update;
- anon cannot execute the revoke.

The negative control (without 20261108_20) stops at T0 as it should.

To run it:
```
R=supabase/tests/rls; M=supabase/migrations
bash $R/run.sh $M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql \
  $M/20261108_20_library_device_limit.sql $M/20261108_20_library_device_limit.sql $R/user_devices_1108.test.sql
```

The verify block `docs/plans/2026-11-08-snippets/B1-verify.sql` (`verify:library_device_limit_1108`) was run in Docker:
- after the migration, all 9 rows are ok = true;
- before it, 9 rows are ok = false plus one NOTICE.

## SQL run order (for the controller / the user)

1. **Any time, before or after the deploy:** `supabase/migrations/20261108_20_library_device_limit.sql`. It needs 20261031_10 (already on prod), and the app fails open without it.
2. Run the `verify:library_device_limit_1108` block once it is merged into `_verify.sql`. Every row must be ok = true.
3. **After the deploy, as a test subscriber, with the switch on** (from «الأمان والحماية ← أجهزة المكتبة», or `update public.library_monitor_settings set device_limit_enabled = true where id;`). **This is the condition for leaving it on.** The cookie round-trip (`cookies().set()` inside a route helper reaching the browser through nginx) is NOT covered by any automated test.
   - a. The first entitled law read's response carries `Set-Cookie: nz_lib_device=…; HttpOnly; Secure; SameSite=Lax` (browser devtools → Network), and the second read does not set it again.
   - b. Open a law, a decree, a precedents collection (scroll several windows), a book, and one in-document search. Then
     `select count(*) from public.user_devices where user_id = '<test uuid>' and revoked_at is null;` must return **1**.
   - c. A second browser makes it 2. A third browser gets the refusal with the two devices listed, and «تسجيل خروج هذا الجهاز» there lets the third one in.
   - d. «تسجيل الخروج» on one browser drops the count by 1.
   - **If a or b fails:** switch it off at once with `update public.library_monitor_settings set device_limit_enabled = false where id;` (with the cookie lost, every subscriber would be refused on his third read).
   - Read-only state check: `select device_limit_enabled, device_limit from public.library_monitor_settings where id;`

Rollback is in the migration header (drop the 2 functions and the table, then drop the 2 columns).

## Owner-facing summary (Arabic, 4–5 lines)

- **حد الأجهزة في المكتبة (جوابكم ٤٢٧):** حساب المشترك يفتح نص المكتبة الكامل على جهازين مصرّحين فقط (كمبيوتر + جوال)، والعدد يعدّله المسؤول من «الأمان والحماية ← أجهزة المكتبة».
- عند محاولة جهاز ثالث تظهر رسالة: «هذا الحساب مفعّل على جهازين بالفعل. سجّل الخروج من أحد أجهزتك المصرّحة لتفتح المكتبة من هذا الجهاز» مع قائمة الأجهزة وزر «تسجيل خروج هذا الجهاز» لكل منها.
- تسجيل الخروج من المنصة يحرّر مكان الجهاز تلقائياً، وفي الإعدادات ← الأمان قسم «أجهزتي»، وفي صفحة المستخدم لدى الإدارة زر «إعادة تعيين الأجهزة».
- الزائر وغير المشترك لا يُفحص جهازه، وحسابات المسؤولين مستثناة.
- الميزة جاهزة لكنها **مطفأة** حتى نجرّبها ثم نفعّلها.

## Test run

Final numbers (worktree root, after the last edits):

- `npx tsc --noEmit -p .`: exit 0 (clean), re-run after ruling E.
- `npm run -s test:unit`: 6343 tests, 6337 pass, **6 fail — exactly the 6 known baseline failures**. They are `books/[slug]/_shape.test.ts:172` (a CRLF regex), `navigation.consultant.test.ts:177`, `libraryAccess.test.ts:225`, `fulfillOrder.test.ts:78` and `trackingWiring.test.ts:93` and `:159`. None of them touches this work.

## Files

**New**
- `supabase/migrations/20261108_20_library_device_limit.sql`
- `supabase/tests/rls/user_devices_1108.test.sql`
- `docs/plans/2026-11-08-snippets/B1-verify.sql`
- `docs/plans/2026-11-08-snippets/B1-report.md`
- `src/lib/library/deviceLimit.ts`
- `src/lib/library/deviceLimit.test.ts`
- `src/lib/library/deviceLimitServer.ts`
- `src/app/api/library/device-limit.routes.test.ts`
- `src/app/api/v1/library/devices/route.ts`
- `src/app/api/v1/library/devices/[id]/revoke/route.ts`
- `src/app/api/v1/library/devices/sign-out/route.ts`
- `src/app/api/v1/admin/users/[id]/library-devices/route.ts`
- `src/app/api/v1/admin/library-monitor/devices/route.ts`
- `src/components/library/LibraryDeviceList.tsx`
- `src/components/library/LibraryDeviceLimitNotice.tsx`
- `src/app/settings/components/tabs/LibraryDevicesPanel.tsx`
- `src/app/dashboard/admin/security/LibraryDevicesPanel.tsx`
- `src/app/dashboard/admin/users/[id]/UserLibraryDevicesCard.tsx`

**Edited** (byte-level, each line's EOL kept)
- `src/app/api/library/{laws/[slug],decrees/[id],precedents/[slug],books/[slug],scoped-search}/route.ts`
- `src/lib/library/readerRefusal.ts`
- `src/app/laws/[slug]/page.tsx`
- `src/app/book/[slug]/page.tsx`
- `src/app/precedents/[slug]/page.tsx`
- `src/app/laws/orders/[slug]/page.tsx`
- `src/hooks/useUser.ts`
- `src/app/settings/components/tabs/SecurityTab.tsx`
- `src/app/dashboard/admin/security/page.tsx`
- `src/app/dashboard/admin/users/[id]/page.tsx`
- `src/lib/auth/adminRouteGates.test.ts`
