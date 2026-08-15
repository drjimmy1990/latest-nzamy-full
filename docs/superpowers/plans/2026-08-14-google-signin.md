# Google Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "تسجيل الدخول بـ Google" actually work end to end, and guarantee every Google user ends up with a phone number in `profiles` — without which the WhatsApp notification in the order pipeline silently does nothing.

**Architecture:** The OAuth code already exists (`signInWithOAuth`, `/auth/callback`). The work is console configuration plus fixing three defects that between them let a Google user reach the dashboard with no phone and the wrong role: an inverted boolean in the onboarding gate, an onboarding wizard that writes only to `user_metadata`, and a callback that trusts `user_metadata.user_type`.

**Tech Stack:** Next.js 16 (`src/proxy.ts`, **not** `middleware.ts`), Supabase Auth (`@supabase/ssr` 0.10), React 19, TypeScript. Tests: `node --test` with native type-stripping.

**Spec:** `docs/superpowers/specs/2026-08-14-manual-fulfillment-services-design.md` §8

**Relationship to the pipeline plan:** independent — this can ship before or after `2026-08-14-manual-fulfillment-order-pipeline.md`. Task 5 here is the only shared seam, and it degrades gracefully if the pipeline is not yet built.

## Global Constraints

- **No new npm dependencies.**
- **Next.js 16 uses `src/proxy.ts`. Never create `middleware.ts`** — having both breaks `next build`.
- All user-facing copy is Arabic, RTL.
- `profiles.phone` is the single source of truth for WhatsApp. `user_metadata` is **not** — it is not readable from Postgres and n8n cannot query it.
- Saudi mobile format: `05XXXXXXXX` (10 digits) or `+9665XXXXXXXX`. Store E.164 (`+9665XXXXXXXX`).

---

## Defects this plan fixes

| # | Defect | Effect |
|---|---|---|
| G1 | `src/proxy.ts:131` — `skipOnboarding` boolean is inverted relative to its comment | Onboarding is forced **only** on lawyers/firms and skipped for everyone else |
| G2 | Same block requires `onboarding_completed === false` (strict) | Google users have `undefined`, so the gate never fires even once G1 is fixed |
| G3 | `src/app/onboarding/page.tsx:679` writes via `auth.updateUser({data})` only | Nothing reaches the `profiles` table; `profiles.phone` stays NULL |
| G4 | `src/app/auth/callback/route.ts` routes on `user_metadata.user_type` | Google never sets it → every Google user is routed as `individual` |

---

## File Structure

**Create:**
| Path | Responsibility |
|---|---|
| `src/lib/auth/onboardingGate.ts` | Pure predicate: does this user need onboarding? |
| `src/lib/auth/onboardingGate.test.ts` | Unit tests for the predicate |
| `docs/GOOGLE_OAUTH_SETUP.md` | Console runbook for the owner |

**Modify:**
| Path | Change |
|---|---|
| `src/proxy.ts` | Use the predicate; fix G1 + G2 |
| `src/app/onboarding/page.tsx` | Add phone field; persist to `profiles` (G3) |
| `src/app/auth/callback/route.ts` | Read `user_type` from `profiles`; route to onboarding when phone missing (G4) |

---

## Task 1: Console configuration runbook

Configuration is the owner's to perform; this task produces the exact steps and a verification.

**Files:**
- Create: `docs/GOOGLE_OAUTH_SETUP.md`

- [ ] **Step 1: Write the runbook**

````markdown
# تفعيل تسجيل الدخول بجوجل

الكود جاهز في `src/app/login/page.tsx` و`src/app/register/client/page.tsx`
و`src/app/auth/callback/route.ts`. الناقص هو الإعداد فقط.

## ١. Google Cloud Console

1. <https://console.cloud.google.com> → أنشئ مشروعاً (أو اختر القائم).
2. **APIs & Services → OAuth consent screen**
   - User Type: **External**
   - App name: `نظامي` · شعار · بريد الدعم
   - Authorized domains: `nezamy.sa` و`<project-ref>.supabase.co`
   - Scopes: `email` · `profile` · `openid` (لا حاجة لغيرها)
   - Publish app (وإلا يعمل فقط مع Test users)
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URI — **واحد فقط، وهو عنوان Supabase لا عنوان الموقع**:
     ```
     https://<project-ref>.supabase.co/auth/v1/callback
     ```
   - احفظ **Client ID** و**Client Secret**

## ٢. Supabase

1. **Authentication → Providers → Google** → Enable → ألصق Client ID + Secret → Save.
2. **Authentication → URL Configuration**
   - Site URL: `https://nezamy.sa`
   - Redirect URLs — أضف:
     ```
     https://nezamy.sa/auth/callback
     http://localhost:3000/auth/callback
     ```

## ٣. التحقق

1. تصفح خفي → `/login` → "تسجيل الدخول بـ Google".
2. المتوقع: شاشة موافقة جوجل → رجوع إلى `/auth/callback` → تحويل إلى `/onboarding`.
3. تحقق من قاعدة البيانات:
   ```sql
   select id, email, display_name, user_type, phone
   from public.profiles order by created_at desc limit 1;
   ```
   المتوقع: صف جديد، `user_type='individual'`، و`phone` فارغ **قبل** إكمال التهيئة
   ومملوء **بعدها**.

## أخطاء شائعة

| العرض | السبب |
|---|---|
| `redirect_uri_mismatch` | وضعت عنوان الموقع بدل عنوان Supabase في الخطوة ١‑٣ |
| العودة إلى `/login?error=auth_callback_failed` | عنوان `/auth/callback` غير مضاف في Redirect URLs |
| "App not verified" | لم تُنشر شاشة الموافقة (Publish) |
````

- [ ] **Step 2: Commit**

```bash
git add docs/GOOGLE_OAUTH_SETUP.md
git commit -m "docs: Google OAuth console setup runbook"
```

---

## Task 2: Fix the onboarding gate (G1 + G2)

The predicate is extracted into a pure module so the inverted boolean is pinned by a test and cannot silently flip back.

**Files:**
- Create: `src/lib/auth/onboardingGate.ts`
- Create: `src/lib/auth/onboardingGate.test.ts`
- Modify: `src/proxy.ts:129-141`

**Interfaces:**
- Produces: `needsOnboarding(input: { userType?: string | null; onboardingCompleted?: unknown; hasPhone: boolean }): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/onboardingGate.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { needsOnboarding } from "./onboardingGate.ts";

test("a fresh Google user (no type, no flag, no phone) needs onboarding", () => {
  assert.equal(needsOnboarding({ userType: undefined, onboardingCompleted: undefined, hasPhone: false }), true);
});

test("REGRESSION: lawyers and firms are SKIPPED, not forced", () => {
  assert.equal(needsOnboarding({ userType: "lawyer", onboardingCompleted: undefined, hasPhone: false }), false);
  assert.equal(needsOnboarding({ userType: "firm", onboardingCompleted: undefined, hasPhone: false }), false);
});

test("an individual who has not completed onboarding needs it", () => {
  assert.equal(needsOnboarding({ userType: "individual", onboardingCompleted: false, hasPhone: false }), true);
});

test("a completed individual WITH a phone does not need it", () => {
  assert.equal(needsOnboarding({ userType: "individual", onboardingCompleted: true, hasPhone: true }), false);
});

test("a completed individual WITHOUT a phone still needs it", () => {
  assert.equal(needsOnboarding({ userType: "individual", onboardingCompleted: true, hasPhone: false }), true);
});

test("undefined onboardingCompleted is treated as not-completed, not as completed", () => {
  assert.equal(needsOnboarding({ userType: "individual", onboardingCompleted: undefined, hasPhone: true }), true);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm run test:unit`
Expected: FAIL — cannot resolve `./onboardingGate.ts`.

> If the pipeline plan has not run yet, `test:unit` does not exist. Add to `package.json` scripts: `"test:unit": "node --test \"src/**/*.test.ts\""`

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/onboardingGate.ts`:

```ts
/**
 * onboardingGate.ts — pure predicate for the onboarding redirect.
 *
 * Extracted from src/proxy.ts, which had the boolean inverted: a variable
 * named `skipOnboarding` was true for NON-lawyers, and the guard then required
 * `!skipOnboarding`, so onboarding was forced only on lawyers and firms — the
 * exact opposite of the comment above it.
 *
 * A phone number is required because it is the only channel WhatsApp
 * notifications can use, and OAuth providers never supply one.
 */

/** Roles with their own registration flow — they do not use the wizard. */
const ROLES_WITH_OWN_FLOW = new Set(["lawyer", "firm"]);

export interface OnboardingGateInput {
  userType?: string | null;
  /** `user_metadata.onboarding_completed` — may be undefined for OAuth users. */
  onboardingCompleted?: unknown;
  /** Whether `profiles.phone` holds a value. */
  hasPhone: boolean;
}

export function needsOnboarding(input: OnboardingGateInput): boolean {
  if (ROLES_WITH_OWN_FLOW.has(input.userType ?? "")) return false;

  // Only an explicit `true` counts as completed — undefined means never ran.
  const completed = input.onboardingCompleted === true;

  return !completed || !input.hasPhone;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm run test:unit`
Expected: PASS — 6 tests here.

- [ ] **Step 5: Use the predicate in proxy.ts**

Replace `src/proxy.ts:129-141` with:

```ts
    // Check onboarding status. Roles with their own registration flow (lawyer,
    // firm) are skipped; everyone else must complete the wizard AND have a
    // phone on their profile — OAuth providers never supply one.
    const userType = user.user_metadata?.user_type as string | undefined;

    if (!pathname.startsWith("/onboarding") && !pathname.startsWith("/api")) {
      const { data: gateProfile } = await supabase
        .from("profiles").select("phone, user_type").eq("id", user.id).maybeSingle();

      const gate = needsOnboarding({
        userType: (gateProfile?.user_type as string | undefined) ?? userType,
        onboardingCompleted: user.user_metadata?.onboarding_completed,
        hasPhone: Boolean(gateProfile?.phone),
      });

      if (gate) {
        const url = req.nextUrl.clone();
        url.pathname = "/onboarding";
        return NextResponse.redirect(url);
      }
    }
```

Add the import at the top of `src/proxy.ts`:

```ts
import { needsOnboarding } from "@/lib/auth/onboardingGate";
```

- [ ] **Step 6: Verify an existing complete user is not trapped**

Run `npm run dev`, sign in with an existing email account that has a phone in `profiles`, and visit `/dashboard/client`.
Expected: loads normally, no redirect loop.

- [ ] **Step 7: Verify a phone-less user is redirected**

```sql
update public.profiles set phone = null where email = '<your test account>';
```
Reload `/dashboard/client`.
Expected: redirected to `/onboarding`. Restore the phone afterwards.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/onboardingGate.ts src/lib/auth/onboardingGate.test.ts src/proxy.ts
git commit -m "fix(auth): onboarding gate was inverted, forcing it only on lawyers

skipOnboarding was true for NON-lawyers and the guard required
!skipOnboarding, so the wizard was forced on exactly the roles the comment
said to skip, and skipped for everyone else. The strict
onboarding_completed === false check also never matched OAuth users, whose
value is undefined.

Extracted to a tested predicate that also requires profiles.phone, since
OAuth never supplies a phone and WhatsApp has no other channel."
```

---

## Task 3: Collect the phone in onboarding and persist it (G3)

**Files:**
- Modify: `src/app/onboarding/page.tsx`

**Interfaces:**
- Consumes: `PATCH /api/v1/profile` (existing; its allowlist already includes `phone`)
- Produces: `profiles.phone` populated in E.164

- [ ] **Step 1: Add phone state and a normaliser**

Near the other `useState` calls in `src/app/onboarding/page.tsx`:

```tsx
const [phone, setPhone] = useState("");
const [phoneError, setPhoneError] = useState("");

/** `05XXXXXXXX` or `+9665XXXXXXXX` → `+9665XXXXXXXX`; null when invalid. */
function normalizeSaudiPhone(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  if (/^05\d{8}$/.test(digits)) return `+966${digits.slice(1)}`;
  if (/^\+9665\d{8}$/.test(digits)) return digits;
  if (/^9665\d{8}$/.test(digits)) return `+${digits}`;
  return null;
}
```

- [ ] **Step 2: Render the phone field on step 1**

Inside the step-1 block, below the user-type options:

```tsx
<div className="mt-5">
  <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
    رقم الجوال <span className="text-red-500">*</span>
  </label>
  <input
    type="tel" dir="ltr" value={phone} placeholder="05XXXXXXXX"
    onChange={(e) => { setPhone(e.target.value); setPhoneError(""); }}
    className={`w-full rounded-xl p-3 text-[13px] border text-left ${
      isDark ? "bg-zinc-950 border-white/[0.07] text-zinc-200" : "bg-white border-zinc-200 text-zinc-800"
    }`}
  />
  <p className={`mt-1 text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
    نستخدمه لإشعارك على واتساب عند جهوزية طلباتك.
  </p>
  {phoneError && <p className="mt-1 text-[11px] text-red-500">{phoneError}</p>}
</div>
```

- [ ] **Step 3: Block step 1 until the phone is valid**

In the step-1 "next" handler, before advancing:

```tsx
const normalized = normalizeSaudiPhone(phone);
if (!normalized) {
  setPhoneError("أدخل رقم جوال سعودي صحيح — مثال: 0501234567");
  return;
}
```

- [ ] **Step 4: Persist to `profiles` alongside the existing metadata write**

At `src/app/onboarding/page.tsx:679`, immediately after `await supabase.auth.updateUser({ data: updateData });`, add:

```tsx
// user_metadata is invisible to Postgres and to n8n — the phone and role
// must land on the profiles row or WhatsApp notifications cannot address
// this user at all.
try {
  const normalized = normalizeSaudiPhone(phone);
  const res = await fetch("/api/v1/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: normalized }),
  });
  if (!res.ok) throw new Error("profile_update_failed");
} catch (err) {
  console.warn("[Nzamy] Failed to persist phone to profiles:", err);
}
```

- [ ] **Step 5: Verify the phone reaches the database**

Sign in as a test user with `profiles.phone` set to NULL, complete onboarding.

```sql
select email, phone from public.profiles where email = '<test account>';
```
Expected: `phone` = `+9665XXXXXXXX`.

- [ ] **Step 6: Verify an invalid phone is rejected**

Enter `123` on step 1 and try to advance.
Expected: "أدخل رقم جوال سعودي صحيح" and the wizard does not advance.

- [ ] **Step 7: Commit**

```bash
git add src/app/onboarding/page.tsx
git commit -m "feat(onboarding): require a Saudi mobile and persist it to profiles

Onboarding wrote only to auth user_metadata, which Postgres and n8n cannot
read, so profiles.phone stayed NULL and WhatsApp had no address."
```

---

## Task 4: Route the callback on the real profile (G4)

**Files:**
- Modify: `src/app/auth/callback/route.ts`

- [ ] **Step 1: Read the profile instead of `user_metadata`**

Replace the block from `const userType = user?.user_metadata?.user_type ?? "individual";` through the `return NextResponse.redirect(...)`:

```ts
      // user_metadata.user_type is never set by OAuth providers — read the
      // profiles row, which handle_new_user() populates on signup.
      let userType = "individual";
      let hasPhone = false;

      if (user) {
        const { data: profile } = await supabase
          .from("profiles").select("user_type, phone").eq("id", user.id).maybeSingle();
        userType = (profile?.user_type as string | undefined) ?? "individual";
        hasPhone = Boolean(profile?.phone);
      }

      // No phone means WhatsApp cannot reach them — finish onboarding first.
      if (!hasPhone && !["lawyer", "firm"].includes(userType)) {
        return NextResponse.redirect(`${origin}/onboarding`);
      }

      const dashboardMap: Record<string, string> = {
        individual: "/dashboard/client",
        lawyer: "/dashboard/lawyer",
        firm: "/dashboard/firm",
        corporate: "/dashboard/business",
        micro: "/dashboard/micro",
        provider: "/dashboard/provider",
        government: "/dashboard/government",
        ngo: "/dashboard/ngo",
        admin: "/dashboard/admin",
      };

      const redirectTo = dashboardMap[userType] ?? next;
      return NextResponse.redirect(`${origin}${redirectTo}`);
```

- [ ] **Step 2: Verify a fresh Google sign-in lands on onboarding**

With Task 1's console setup done, sign in with a Google account never used before.
Expected: `/onboarding`, not `/dashboard/client`.

- [ ] **Step 3: Verify the second sign-in goes to the dashboard**

Complete onboarding, sign out, sign in with Google again.
Expected: straight to `/dashboard/client`, no onboarding.

- [ ] **Step 4: Commit**

```bash
git add src/app/auth/callback/route.ts
git commit -m "fix(auth): route the OAuth callback on profiles, not user_metadata

Google never sets user_metadata.user_type, so every Google user was routed
as individual regardless of their actual role. Also sends phone-less users
to onboarding, since WhatsApp cannot address them."
```

---

## Task 5: Refuse order submission without a phone

Belt-and-braces: even if a user reaches the wizard phone-less, they should be told rather than silently never notified.

> **If the pipeline plan has not been implemented yet, skip this task** and return to it afterwards — `src/hooks/useDraftState.ts` has no `submitOrder` until then.

**Files:**
- Modify: `src/hooks/useDraftState.ts`

- [ ] **Step 1: Guard inside `submitOrder`**

In `submitOrder()`, immediately after the profile is fetched and before `createServiceOrder`:

```ts
if (!profile?.phone) {
  setSubmitErrors([
    "أضف رقم جوالك أولاً لنتمكن من إشعارك عند جهوزية الطلب — من الإعدادات أو التهيئة.",
  ]);
  setSubmitting(false);
  return;
}
```

- [ ] **Step 2: Verify the guard fires**

```sql
update public.profiles set phone = null where email = '<test account>';
```
Submit an order from `/ai/draft`.
Expected: the Arabic message appears; no row is created. Restore the phone and confirm submission then succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDraftState.ts
git commit -m "feat(orders): refuse submission without a phone rather than never notifying"
```

---

## Self-Review

**Spec coverage.** Spec §8.1 console configuration → Task 1. §8.2 phone capture → Tasks 3, 5. §8.2 role handling → Tasks 2, 4. The spec's D10 ("restrict Google to clients") is **superseded**: investigation found `/onboarding` already contains a user-type picker (`src/app/onboarding/page.tsx:38-45`), so routing every Google user through a working onboarding gate solves the role problem properly instead of removing the button. This is a strict improvement on the spec and is recorded here deliberately.

**Placeholder scan.** No TBD/TODO. Every code step carries runnable code; every verification names a command or SQL and an expected result.

**Type consistency.** `needsOnboarding` / `OnboardingGateInput` defined in Task 2 and consumed unchanged in `src/proxy.ts`. `normalizeSaudiPhone` defined in Task 3 Step 1 and used in Steps 3 and 4 of the same task. `PATCH /api/v1/profile` field name `phone` matches the route's existing allowlist (`src/app/api/v1/profile/route.ts:94`).

**Cross-plan dependency.** Task 5 depends on the pipeline plan's Task 5 and is explicitly marked skippable.
