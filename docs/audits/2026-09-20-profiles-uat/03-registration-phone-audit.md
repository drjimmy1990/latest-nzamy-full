# 03 — Registration / phone audit (UAT-REG-001, UAT-REG-002, UAT-CONTACT-001)

> Audit date 2026-09-20 against the owner's package `web/`. Paths relative to `web/`.

**Headline:** a canonical `normalizeSaudiMobile` already exists (`src/lib/services/saudiMobile.ts`) and is already wired into register/client, register/provider, onboarding, login and the profile PATCH. The three defects are **partially fixed in the tree since the 2026-09-15 UAT**. Genuinely still open:

| UAT | Status in tree today | Residual |
|---|---|---|
| UAT-REG-001 | Partially fixed — phone now gated; **email still truthy-only** at `/register/client` step 2 | `not-an-email` still advances step 2→3 |
| UAT-REG-002 | Fixed in app code (no `+966` concatenation anywhere). **Not fixed in DB** | direct PostgREST PATCH still writes garbage |
| UAT-CONTACT-001 | Not fixed | `/api/v1/contact` inserts phone unvalidated |

---

## 1. `/register/client`
- `src/app/register/client/page.tsx` — 4 steps, flat `formData` (`:65`), `clientType` (`:48`); `?type=` jumps to step 2 (`:53-64`); `BACKEND_MODE … ?? "demo"` (`:38`).
- `canNext()` `:69-85`:
```ts
if (step === 2) {
  if (!(formData.email && normalizeSaudiMobile(formData.phone))) return false;   // :72  ← email truthy only
  if (clientType === "company" && !isCorporateIdentityComplete(formData)) return false;
  if (clientType === "micro" && !(formData.companyName || "").trim()) return false;
  return true;
}
if (step === 3) return !!(formData.password && formData.password === formData.confirmPassword && formData.password.length >= 8);
```
No name requirement at all for an individual. Compare `/register/provider/page.tsx:222-223` which has the email regex.
- Inputs `src/app/register/client/components/Steps.tsx`: email `:335-339` raw; phone `:351-355` raw, no `sanitizePhoneDigits`, no `aria-invalid`, no inline hint (Next button silently disabled). The provider form does it right: `register/provider/components/Steps.tsx:5,276,305,307-314` («رقم الجوال غير صحيح — مثال: 0512345678»).
- `signUp` is **browser-side** (`page.tsx:250-274`): `:254` `createClient()`, `:269` `normalizeSaudiMobile`, `:274` `supabase.auth.signUp({ … options.data.phone: phoneE164 })`. No `/api/v1/onboarding` signup route (only `account-type/`). Only server-side gate at signup is `handle_new_user()` — which does not validate.
- `/register/page.tsx` — static chooser, nothing to fix. `/register/provider` — correct. `/onboarding/page.tsx` — imports helper `:33`, pre-fills `:814,823`, validates `:499,860,896-901`, PATCHes `/api/v1/profile` `:908`.

## 2. Phone utilities
Canonical: `src/lib/services/saudiMobile.ts` — `toAsciiDigits` (`:2`, Arabic-Indic + Extended), `sanitizePhoneDigits` (`:11`), `normalizeSaudiMobile(raw): string | null` (`:19-26`): strips `[\s()‎‏-]`, `00966`→`+966`, `966`→`+966`, `/^0?5\d{8}$/`→`+966…`, returns only `/^\+9665\d{8}$/`. Satisfies every owner format. Gaps: `.`/`_` not stripped; U+200B not stripped; returns `null` with no reason. Tested thoroughly in `saudiMobile.test.ts:9-41`.

Duplicates: `src/utils/normalizeDigits.ts:10`, `src/lib/services/contactSanitizer.ts:31` (same name, different module), inline Arabic-digit strips in `normalizeArabic.ts:42`, `provider/profile/page.tsx:369`, `RevisionPanel.tsx:76`, `PrecedentsTabContent.tsx:80`. Ad-hoc phone regexes: `contactSanitizer.ts:43-48` `PHONE_RE` (detector, **leave alone**); `api/v1/leads/business-assessment/lead.ts:230,232` (B2B leads, may be non-Saudi — deliberate); `api/v1/contact/route.ts:31` (`.trim()` only).

Call sites already using the helper (8): `register/client/page.tsx:31,72,269` · `register/provider/page.tsx:34,223,394` · `register/provider/components/Steps.tsx:5,276,305` · `onboarding/page.tsx:33,499,860,896` · `login/page.tsx:32,180` · `api/v1/profile/route.ts:30,372`.

## 3. Profile PATCH — `src/app/api/v1/profile/route.ts`
Allowlist `:315-329` (`email` NOT on it — silently dropped). Phone `:371-378`:
```ts
if ("phone" in body) {
  const normalized = normalizeSaudiMobile(body.phone);
  if (!normalized) return NextResponse.json({ error: AR.badPhone }, { status: 400 });
  body.phone = normalized;
}
```
Correct and complete. **The malformed phone in `profile-write-guards.json` did NOT go through this route**: `scripts/uat/verify-profile-write-guards.ps1:49-61` PATCHes PostgREST directly (`/rest/v1/profiles?id=eq.<A>`) with the anon key + A's own JWT. RLS `"users update own profile"` permits it (rows, not columns) and there is no CHECK ⇒ 200. Fixing this requires a DB constraint.

## 4. DB layer
- `profiles.phone text` (`20260603_phase1_001_profiles.sql:39`) — **no CHECK, no unique, no trigger**, no later alter. Triggers: `set_profiles_updated_at`, `trg_lock_user_type` (`20260716_security_hardening.sql:123-157`), `handle_new_user()` (current def `20260827_signup_contact_fields.sql`) writes `NULLIF(COALESCE(new.raw_user_meta_data->>'phone', new.phone), '')` — no validation; a crafted `signUp()` can seed any string.
- `profiles.email text` written once at INSERT; **no sync trigger** with `auth.users`; not in the PATCH allowlist but editable by direct PostgREST PATCH (same class of hole). Flag to owner.
- ⚠ `20260827` header (`:95-99`): "THIS FILE DOES NOT APPLY ITSELF" — verify it is applied on staging/production.

## 5. Settings ProfileTab + onboarding gate
- Pre-fill works: `ProfileTab.tsx:146-150`; failed load disables Save (`:181,528`). No client-side phone validation (server 400 shown as a banner via `arabicProfileError` `:266`). Field spec `profileSettingsFields.ts:34` has no `pattern`/`maxLength`. `profileFormTransform.ts:37` `OMIT_WHEN_EMPTY_KEYS` prevents wiping the phone; `:34` `READONLY_KEYS = ["email"]`.
- Gate `src/lib/auth/onboardingGate.ts:104-127`: exempt lawyer/firm/admin; `""` type → true; `onboardingCompleted !== true` → true; else `!hasPhone`. Caller `proxy.ts:406-416` with `hasPhone: (profile?.phone ?? "").trim() !== ""` (`:412`) — **a row holding `letters-and-email@example.test` counts as having a phone** and flows to WhatsApp dispatch (`src/lib/n8n/payload.ts`).
- Owner requirement "pre-filled and not asked again" is met on both surfaces.

## 6. Contact API — `src/app/api/v1/contact/route.ts`
`:29-34` trims; `:36-41` email+message required; `:44-49` email regex. `phone` **unvalidated**, `name`/`message`/`subject` no length caps. Insert `:53-62` into `contact_messages` via `createServiceClient()` (`:51`); policy `contact_insert_any … with check (true)` (`20260706_content_and_ops.sql:62-63`) means the anon key can insert directly too. Pushed unvalidated to n8n `:77-101`. Callers `contact/page.tsx:51-62,259` and `partners/page.tsx:116-127,440` don't validate client-side.

## 7. Tests
`saudiMobile.test.ts`, `onboardingGate.test.ts:47,54,122-125`, `profileFormTransform.test.ts:65-67,86-94`, `profileSettingsFields.test.ts:30-32`, `lead.test.ts:66-78`, `contactSanitizer.test.ts`, `n8n/payload.test.ts`. **Gaps:** no test on the profile PATCH phone guard; none on `/api/v1/contact`; none on `canNext()` (inline closure); none on a DB constraint (there is none).

---

# Fix design

## (a) Canonical helper — keep `src/lib/services/saudiMobile.ts`, change the return shape
```ts
export type SaudiMobileResult =
  | { ok: true;  e164: string }
  | { ok: false; reason: "empty" | "letters" | "length" | "prefix" };
export const saudiMobileMessage = (r: SaudiMobileResult) => r.ok ? "" : AR_MESSAGE[r.reason];
// AR_MESSAGE: empty «رقم الجوال مطلوب.» · letters «رقم الجوال يجب أن يحتوي على أرقام فقط.» ·
// length «رقم الجوال السعودي مكوّن من ١٠ أرقام — مثال: 0512345678» · prefix «أدخل رقم جوال سعودي يبدأ بـ 05 — مثال: 0512345678»
export function normalizeSaudiMobile(raw: unknown): SaudiMobileResult { /* widen strip set: add . _ / NBSP ZWSP; classify reason */ }
/** Back-compat shim — delete once every call site migrated. */
export const saudiMobileOrNull = (raw: unknown): string | null => { const r = normalizeSaudiMobile(raw); return r.ok ? r.e164 : null; };
```
Call sites to switch: `register/client/page.tsx:72,269-273` · `register/provider/page.tsx:223,394-399` · `register/provider/components/Steps.tsx:276` · `onboarding/page.tsx:499,860,896-901` · `login/page.tsx:180` · `api/v1/profile/route.ts:372-377`. New call sites: `register/client/components/Steps.tsx:355` (sanitize + inline hint, copy provider `:300-315`), `api/v1/contact/route.ts` after `:49`, `ProfileTab.tsx handleSave :196` (pre-flight). Follow-ups (out of scope): `AddClientModal.tsx:324`, `StepApproval.tsx:155`, `ClientSharePanel.tsx:108`, `FloatingButtons.tsx:337`. Deliberately NOT switched: `contactSanitizer.ts` `PHONE_RE`, `leads/business-assessment/lead.ts:230-232`.

## (b) Client-side validation per registration step — `register/client/page.tsx:69-85`
```ts
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (step === 2) {
  if (!EMAIL_RE.test((formData.email || "").trim())) return false;               // NEW — closes UAT-REG-001
  if (!normalizeSaudiMobile(formData.phone).ok) return false;
  if (clientType === "individual" && !(`${formData.firstName||""} ${formData.lastName||""}`.trim())) return false; // NEW
  if (clientType === "government" && !(formData.entityName || "").trim()) return false;      // NEW
  if (clientType === "ngo" && !(formData.ngoName || "").trim()) return false;                // NEW
  if (clientType === "company" && !isCorporateIdentityComplete(formData)) return false;
  if (clientType === "micro" && !(formData.companyName || "").trim()) return false;
  return true;
}
```
Plus inline feedback in `Steps.tsx` for email (`:335-340`) and phone (`:351-356`: `sanitizePhoneDigits` on change + `aria-invalid` + `saudiMobileMessage`).

## (c) Server-side checks
Profile PATCH `:371-378` → new shape + per-reason message; add `src/app/api/v1/profile/route.test.ts`. Contact route after `:49`: optional phone but if given must normalize; caps `name ≤ 120`, `message ≤ 5000`, `subject ≤ 200`; store `phone: phoneE164`; mirror client-side.

## (d) DB CHECK on `profiles.phone` — new migration (normalize first, then constrain)
```sql
begin;
-- 1) inspect (standalone, read-only): select id, phone from public.profiles where phone is not null and btrim(phone) <> '' and phone !~ '^\+9665[0-9]{8}$';
-- 2) blanks → NULL
update public.profiles set phone = null
 where phone is not null and btrim(phone, E' \t\r\n  ​‎‏') = '';
-- 3) normalize salvageable shapes (mirrors normalizeSaudiMobile)
update public.profiles p set phone = '+966' || right(cleaned, 9)
from (select id, regexp_replace(translate(phone,'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[^0-9]','','g') as cleaned
        from public.profiles where phone is not null) src
where src.id = p.id and p.phone !~ '^\+9665[0-9]{8}$'
  and (src.cleaned ~ '^009665[0-9]{8}$' or src.cleaned ~ '^9665[0-9]{8}$' or src.cleaned ~ '^05[0-9]{8}$' or src.cleaned ~ '^5[0-9]{8}$');
-- 4) quarantine the rest into metadata (never delete)
update public.profiles
   set metadata = metadata || jsonb_build_object('invalid_phone_quarantined', phone, 'invalid_phone_quarantined_at', now()),
       phone = null
 where phone is not null and phone !~ '^\+9665[0-9]{8}$';
-- 5) constraint (NULL allowed; NOT VALID + VALIDATE keeps the lock short)
alter table public.profiles add constraint profiles_phone_e164_saudi_mobile
  check (phone is null or phone ~ '^\+9665[0-9]{8}$') not valid;
alter table public.profiles validate constraint profiles_phone_e164_saudi_mobile;
comment on constraint profiles_phone_e164_saudi_mobile on public.profiles is
  'رقم الجوال يُحفظ بصيغة E.164 السعودية فقط (+9665XXXXXXXX) أو NULL. يطابق normalizeSaudiMobile() في src/lib/services/saudiMobile.ts. أُضيف بعد UAT-REG-002.';
commit;
```
**Also harden `handle_new_user()` in the same migration** — carry the body forward byte-for-byte from `20260827` (per that file's ⚠ warning; losing the `v_sub_role` clamp breaks provider signup) and change only the phone expression to a *clamp* (normalize if it matches `^(00966|966|0)?5[0-9]{8}$` after digit translation, else `NULL` — never raise; a 23514 inside the AFTER INSERT trigger would abort the whole `auth.users` insert). Cleanest as `DECLARE v_phone text;` computed once before the INSERT.

Verify after: `select count(*) filter (where phone is null), count(*) filter (where phone ~ '^\+9665[0-9]{8}$'), count(*) filter (where metadata ? 'invalid_phone_quarantined') from public.profiles;`

Optional (email hole from §4): `revoke update (email, user_type, verification_status) on public.profiles from authenticated;` or an `AFTER UPDATE ON auth.users` sync trigger — owner decision.

## (e) Pre-fill
Already correct on both surfaces. Close the gate gap: `proxy.ts:412` → `hasPhone: normalizeSaudiMobile(profile?.phone).ok` and a test beside `onboardingGate.test.ts:54`.

## Suggested fix order
1. `register/client/page.tsx:72` email regex (one line) → 2. `Steps.tsx:339,355` inline errors → 3. contact route validation → 4. DB migration (d) → 5. `proxy.ts:412` → 6. result-shape refactor + call-site updates + tests.
