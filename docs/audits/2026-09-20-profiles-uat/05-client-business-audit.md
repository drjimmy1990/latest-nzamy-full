# CLIENT (individual) & BUSINESS (corporate) profile audit — `/home/claude/nzamy/web`

All paths absolute. Line numbers from the files as read on 2026-09-20.

---

## 1. CLIENT (individual) profile surface

**There is no `/dashboard/client/profile` page.** Full listing of `/home/claude/nzamy/web/src/app/dashboard/client`:
`_components/`, `_data.ts`, `cases/`, `celebrity/`, `consultation/`, `contracts/`, `documents/`, `find-lawyer/`, `layout.tsx`, `letters/`, `messages/`, `my-group/`, `page.tsx`, `referral/`, `requests/`, `services/`, `wallet/`. No `profile/` directory, no `settings/` directory.
(Contrast: the firm has one — `/home/claude/nzamy/web/src/app/dashboard/firm/profile/`.)

### Where an individual edits their profile: `/settings` → tab «الملف الشخصي»

Tabs visible to `user_type = 'individual'` — `/home/claude/nzamy/web/src/constants/settingsReadiness.ts:156-173`:

```ts
if (userType === "individual" || !userType) {
  return {
    roleLabel: "عميل فرد",
    canManageEntity: false, canManageTeam: false, canManageBilling: false,
    canManageCompliance: false, canInviteTeam: false, canUseProfession: false,
    canUseSignature: false, canUseDelegation: false, canUseReferral: true,
    showPayments: true, showSubscription: true,
    visibleTabs: uniqueTabs(["profile", "security", "notifications", "privacy",
                             "payments", "subscription", "referral", "help"]),
    inviteRoles: [],
  };
}
```

Exactly **8 tabs**: الملف الشخصي · الأمان · الإشعارات · الخصوصية · المدفوعات · الخطة والحدود · دعوة الأصدقاء · المساعدة. Labels at `/home/claude/nzamy/web/src/app/settings/hooks/useSettingsTabs.ts:45-60`; the hook maps ids → defs and silently drops unknown ids (`useSettingsTabs.ts:67-69`). Dispatch to components at `/home/claude/nzamy/web/src/app/settings/page.tsx:79-80`.

**Fields an individual sees in ProfileTab** — `/home/claude/nzamy/web/src/lib/services/profileSettingsFields.ts:32-42` + `:86-88`:

| key | label | column | target |
|---|---|---|---|
| `displayName` | الاسم الكامل | `profiles.display_name` (maxLength 120) | profile — `:33` |
| `phone` | رقم الجوال | `profiles.phone` | profile — `:34` |
| `email` | البريد الإلكتروني | `profiles.email` (read-only, `profileFormTransform.test.ts:19`) | profile — `:35` |
| `city` | المدينة | `profiles.city` (maxLength 80) | profile — `:36` |
| `nationality` | الجنسية | `profiles.nationality` (maxLength 60) | profile — `:41` |

So: **display name — yes** (`:33`); **city — yes, shown** (`:36`). Deliberately absent (header comment `:5-10`): رقم الهوية الوطنية and تاريخ الميلاد — pinned by `/home/claude/nzamy/web/src/lib/services/profileSettingsFields.test.ts:5-10`.

**Avatar upload: none.** `/home/claude/nzamy/web/src/app/settings/components/tabs/ProfileTab.tsx:286-300` renders a gradient tile with the first letter of `displayName` (`const avatarLetter = formValues.displayName?.charAt(0) || "م";` `:287`) and the static caption «تغيير الصورة غير متاح بعد» (`:299`), with the comment *"No upload control — there is no Storage/API wiring behind one yet."* Same rule for the entity logo (`EntitySettingsTab.tsx:267-269`).

### `/dashboard/client/page.tsx` — account facts and mock status

`grep MOCK/mock` → **zero hits** in `page.tsx` and in `_components/` (CaseCard.tsx, ClientLetterWorkflow.tsx, DashboardSkeleton.tsx). The page has been through a de-fiction pass; the long comments record what was removed. Current state:

- **Name**: `const firstName = (user.name ?? "").trim().split(/\s+/)[0] ?? ""` (`:353`), rendered as `{firstName ? \`أهلاً، ${firstName}\` : "أهلاً بك"}` (`:556`). The old hardcoded fallback «خالد» is gone (`:549-555`).
- **Plan**: `PLAN` is derived from the raw `subscriptions` row + embedded `subscription_plans` (`:393-448`). Prints `باقتك: {PLAN.name}` (`:780`) and a validity line; when the row/plan can't be identified it prints the neutral «الباقات والأسعار» instead of asserting a free plan (`:801-806`). **No price, no usage bars, no seat/quota numbers** — removed on purpose (`:370-385`).
- No mock documents (now `getDocuments()`, `:281-292`), no mock messages card (`:879-908`), no mock wallet figure (`:1011-1041`), no hardcoded Arabic names or numbers left.
- **Known residual defect, documented in-file and not fixable from the page** (`:251-269`): `getDashboardSummary()` cannot reject — `dashboardService.ts:71` ends in `catch { return { ...DEMO_SUMMARY } }`, so a failed summary request silently renders as "no cases / no appointment / free-ish plan".

**No link anywhere on the client dashboard to `/settings`** except via the shared sidebar; there is no "my profile" entry point on the landing page itself.

---

## 2. Client registration → profile creation

### Metadata sent by `/home/claude/nzamy/web/src/app/register/client/page.tsx`

`userType` mapping (`:240`): `individual→individual`, `company→corporate`, `micro→micro`, `government→government`, `ngo→ngo`.
`displayName` chain (`:246`): `companyName || entityName || ngoName || "first last" || "عميل نظامي"`.

`supabase.auth.signUp({ options: { data: … } })` — `:274-348`. **Base keys sent for every clientType** (`:276-290`):

```
user_type, display_name, full_name, tier:"free", sub_role:null,
phone (E.164, normalizeSaudiMobile — :268), country_code (formData.country||"SA"),
city (formData.city||null), credit_balance:0, credits_max:0,
display_mode:"full", onboarding_completed:true
```

**Type-specific spreads:**
- `company` → `corporateSignupMetadata(formData)` (`:313`) → `/home/claude/nzamy/web/src/app/register/client/components/_corporateIdentity.ts:161-178`: `business_type:"corporate"`, `company_name`, `cr_number` (ASCII-normalised, `:90-93`), `legal_rep_name`, `legal_rep_capacity` (only if in the CHECK list, `:44-59`). Blank optional keys are **omitted**, not sent as `""`.
- `micro` → `microSignupMetadata` (`:314`) → `_corporateIdentity.ts:193-203`: `business_type:"micro"`, `business_name` (taken from `companyName`), `cr_number`.
- `government` → `:340-344`: `entity_name`, `government_role` (default `"gov_counsel"`), `officer_specialty`.
- `ngo` → `:345-347`: `org_name`.
- `individual` → **no extra keys at all**. `id_number` was deliberately removed (`:291-306`).

Step-2 gate for company: `isCorporateIdentityComplete()` requires all four (`_corporateIdentity.ts:133-140`).

### `handle_new_user()` — latest definition

Latest is **`/home/claude/nzamy/web/supabase/migrations/20260827_signup_contact_fields.sql`** (carried forward byte-for-byte from `20260826_corporate_identity_persisted.sql`, which itself carried `20260821`; the header states this explicitly at `:56-68`).

`public.profiles` INSERT (the only statement 20260827 changed): `id, display_name, display_name_en, email, user_type, phone, city, country_code` — each `NULLIF`-wrapped; `country_code` coalesces to `'SA'`. `user_type` whitelist excludes `'admin'`.

Entity rows it creates, by type:
- `lawyer` → `lawyer_profiles(user_id, is_accepting_clients)`
- `provider` → `provider_profiles(user_id, sub_role)` (clamped)
- `firm` → `firm_profiles(owner_user_id, name_ar, name_en)`
- **`corporate` → `business_profiles`** (quoted below)
- `government` → `government_profiles(owner_user_id, entity_name_ar, entity_type)`
- `ngo` → `ngo_profiles(owner_user_id, org_name_ar, org_type)`
- `micro` → `micro_profiles(user_id, business_name)`
- all → `user_settings(user_id)`

**The corporate INSERT, verbatim (`20260827_signup_contact_fields.sql`, corporate branch):**

```sql
ELSIF v_user_type = 'corporate' THEN
  v_rep_capacity := NULLIF(new.raw_user_meta_data->>'legal_rep_capacity', '');
  IF v_rep_capacity IS NOT NULL AND v_rep_capacity NOT IN (
    'owner', 'partner', 'manager',
    'authorized_signatory', 'legal_counsel', 'other'
  ) THEN
    v_rep_capacity := NULL;
  END IF;

  INSERT INTO public.business_profiles (
    owner_user_id, company_name_ar, company_name_en,
    cr_number, legal_rep_name, legal_rep_capacity
  )
  VALUES (
    new.id,
    COALESCE(NULLIF(new.raw_user_meta_data->>'company_name', ''), 'شركة جديدة'),
    COALESCE(NULLIF(new.raw_user_meta_data->>'company_name_en', ''), ''),
    NULLIF(new.raw_user_meta_data->>'cr_number', ''),
    NULLIF(new.raw_user_meta_data->>'legal_rep_name', ''),
    v_rep_capacity
  )
  ON CONFLICT DO NOTHING;
```

**Gaps in what registration persists:**
- **No address** is persisted for a company. `business_profiles` has no address column (`/home/claude/nzamy/web/supabase/migrations/20260603_phase1_002_entities.sql`, `create table … business_profiles` — columns are `id, owner_user_id, company_name_ar, company_name_en, cr_number, size, legal_structure, service_model, has_legal_dept, plan_id, verification_status, metadata, created_at, updated_at`).
- **No company phone.** The registrant's personal `phone` lands on `profiles.phone` only.
- `micro` sends `cr_number` that reaches nothing (`micro_profiles` has no such column — `_corporateIdentity.ts:186-192`).
- `ON CONFLICT DO NOTHING` names **no unique target** on `business_profiles`, so duplicate rows per owner are possible — `BusinessProfileReadinessPanel.tsx:100-107` compensates by `.order("created_at").limit(1)`.
- ⚠ `20260827` header (`:95-99`): *"THIS FILE DOES NOT APPLY ITSELF"* — until executed, new registrations still land with no phone/city.

---

## 3. BUSINESS profile surface

### `/home/claude/nzamy/web/src/app/dashboard/business` — per-page status

**Critical framing first:** `/home/claude/nzamy/web/src/app/dashboard/business/layout.tsx:110` computes `const sectionHidden = userType !== "admin" && isHiddenBusinessSection(pathname);` and `:136-142` renders `<SectionNotReady>` instead of `children` for every hidden path. `isHiddenBusinessSection` (`/home/claude/nzamy/web/src/constants/navigation.sidebars.business.ts:370-378`) = "inside /dashboard/business AND not in `VISIBLE_BUSINESS_ROUTES`", and `VISIBLE_BUSINESS_ROUTES` is derived from `CORPORATE_SIDEBAR` (`:322-325`), whose only business-prefixed entries are **`/dashboard/business` and `/dashboard/business/documents`** (`:68-70`).

**So every page below except those two is unreachable and renders «هذا القسم قيد الإعداد» — the mock code is dead but still shipped in the bundle.**

| Path | Real / ComingSoon / MOCK | Evidence |
|---|---|---|
| `page.tsx` (overview) | **REAL** (visible) | `listMyServiceOrders()` + `getDocuments()` with three-state reads, `page.tsx:210-253`; renders `<BusinessProfileReadinessPanel/>` at `:342` |
| `documents/` | visible, not audited here | in `VISIBLE_BUSINESS_ROUTES` |
| `team/page.tsx` | **MOCK, hidden** | `MEMBERS` 4 fabricated people with names/emails/phones — `team/page.tsx:73-98`; `INITIAL_INVITES` — `:101-104` |
| `requests/page.tsx` | **MOCK, hidden** | `MOCK_REQUESTS` 6 rows — `requests/page.tsx:35-110`; zero `apiGet/fetch/useEffect` in the file |
| `departments/page.tsx` | **DashboardComingSoon, hidden** | `departments/page.tsx:37,41` |
| `reviews/new/page.tsx` | **DashboardComingSoon** | `reviews/new/page.tsx:44,48` |
| `reviews/page.tsx` | MOCK | `MOCK_DOCS` — `:48` |
| `consultations/page.tsx` | MOCK | `const MOCK: Consultation[]` — `:31` |
| `governance/page.tsx` | MOCK | `MOCK_RULES` — `:33,148` |
| `health-check/page.tsx` | MOCK + fake AI timer | `MOCK_FILES/MOCK_FINDINGS` — `:20-22,66-68` |
| `kanban/page.tsx` | MOCK | `MOCK_CARDS` — `:67,198` |
| `cases/page.tsx` | real-ish (rewritten; header documents the removed `MOCK_CASES`) | `:30-42` |

### Where a corporate user edits company data: `/settings` → «إعدادات الكيان»

`/home/claude/nzamy/web/src/app/settings/components/tabs/EntitySettingsTab.tsx` (full read).

**Fields for corporate** — `:39-45` + the dedicated select at `:292-310`:
- `companyName` → **اسم الشركة الرسمي**
- `crNumber` → **رقم السجل التجاري**
- `legalRepName` → **اسم الممثل النظامي**
- `legalRepCapacity` → **صفة الممثل النظامي**, a `<select>` over `LEGAL_REP_CAPACITIES` (imported `:9`) because the column is CHECK-constrained (`:289-291`)

**There is no address field and no phone field for a corporate account.** The file says so explicitly at `:16-19`: *"corporate → the four REAL business_profiles columns … No other field is added here — that IS the whole real column set, and a fifth invented field would be exactly the 'placeholder-only trick' this tab is being fixed to drop."* Address/phone exist only for `firm`, `micro`, `government`, `ngo`, which route through the `entitySettings` jsonb bag (`:47-76`).

**API it calls:**
- GET `apiGet<ProfileServerRow>("/api/v1/profile")` (`:153`), reads `res.businessProfile.{company_name_ar, cr_number, legal_rep_name, legal_rep_capacity}` (`:155-162`), and honours `roleProfileReadFailed` by **disabling Save** (`:177-182`, button `disabled={saving || !ready || loadFailed}` `:330`).
- PATCH `apiMutate("/api/v1/profile", "PATCH", { businessProfile })` (`:227`). `company_name_ar` is omitted when blank (NOT NULL, `:217-219`); the other three send `null` to clear.

**Server side** — `/home/claude/nzamy/web/src/app/api/v1/profile/route.ts`:
- GET selects `"metadata, company_name_ar, cr_number, legal_rep_name, legal_rep_capacity"` from `business_profiles` `.eq(ownerCol, user.id)` where `ownerCol = entityOwnerColumn("business_profiles") = owner_user_id` (`:206-250`), and the key is emitted only for corporate: `...(profile.user_type === "corporate" ? { businessProfile } : {})` (`:279`).
- PATCH validates via `validateBusinessProfilePatch(raw, normalizeCrNumber, isLegalRepCapacity)` (`:494-509`), refuses non-corporate (`:565`), then:
```ts
const { data, error } = await supabase
  .from("business_profiles")
  .update(businessProfilePatch)
  .eq("owner_user_id", user.id)
  .select("company_name_ar, cr_number, legal_rep_name, legal_rep_capacity")
  .single();                                    // route.ts:652-657
```
returns `{ profile, roleProfile, entitySettings, businessProfile }` (`:665`).

**Do values persist?** For the **owner**, yes. RLS update policy — `/home/claude/nzamy/web/supabase/migrations/20260603_phase1_002_entities.sql:274-277`:
```sql
create policy "business_profiles: owner can update"
  on public.business_profiles for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
```
No later migration adds a member-write policy (`20260916_fix_all_entities_rls_infinite_recursion.sql:45-48` only adds a **SELECT** policy `using (public.is_active_business_member(id))`).

**A business MEMBER (not owner) — what happens:**
1. The tab is offered to them. `settingsReadiness.ts:262-289` gives corporate the `entity` tab whenever `isCorporateEntityManager(businessRole)` — `:120-122`: `["owner","legal_manager","hr_manager"].includes(role ?? "owner")`. A `legal_manager` or `hr_manager` member sees «إعدادات الكيان».
2. **GET returns nothing**: the route filters `.eq("owner_user_id", user.id)`, so a member's read yields `data === null` with no error → `businessProfile` stays `null` → `roleProfileReadFailed` stays **false** → the tab renders **four blank fields with Save enabled**, indistinguishable from "nothing saved yet".
3. **PATCH fails**: `.update(...).eq("owner_user_id", user.id).single()` matches 0 rows → PostgREST error → route logs and returns `{ error: AR.saveFailed }` 500 (`:658-661`) → the user sees the generic «تعذّر حفظ بيانات الكيان…» (`EntitySettingsTab.tsx:114`). The same path for `entitySettings` returns 404 «لم نعثر على بيانات الكيان الخاصة بحسابك.» (`route.ts:58, 630`).
4. Note the default when membership is unknown: `businessRole` is `memberships.business?.role ?? meta.business_role` (`useUser.ts:721`); when both are absent `isCorporateEntityManager(undefined)` defaults to `"owner"` → **true**, so the entity tab is shown to a corporate account whose membership read failed.

**Contradiction worth flagging:** `/home/claude/nzamy/web/src/components/dashboard/business/BusinessProfileReadinessPanel.tsx:230-240` tells a company with no record *"There is no corporate profile editor to link to"* and links to `/contact` — while `/settings` → «إعدادات الكيان» **is** that editor and has been since the S1 task.

---

## 4. Business team

`/home/claude/nzamy/web/src/app/dashboard/business/team/page.tsx` — 651 lines, **entirely client-side fiction, and unreachable**:
- `MEMBERS` (`:73-98`): نورة الزهراني / فهد السبيعي / ريم القحطاني / سلمى الدوسري with invented emails, `+966 5x …` phones, case counts and join dates.
- `INITIAL_INVITES` (`:101-104`): two pending invites with `daysLeft`.
- `InviteModal` (`:108-194`) — «إرسال الدعوة» only calls `setSent(true)` (`:183`) and then prints a hardcoded invite URL `https://nezamy.sa/invite/x7k2m9p` (`:142`). **No network call.**
- «إزالة العضو» (`:569-571`) and «تعديل البيانات» (`:558-560`) are buttons with **no `onClick`**.
- `PowerModal` «تفعيل صلاحيات محامي» (`:198-245`) — «تأكيد وتفعيل» has no handler either.
- Stats row (`:385-389`) sums the fabricated `cases`/`completedCases`.
- Guarded by `RoleGuard allowedRoles={["owner","legal_manager","hr_manager"]}` (`:310`) + `SubscriptionGuard featureKey="team-manage"` (`:311`) — and then the layout's `SectionNotReady` wins anyway.

**Is there an API to invite/add/remove business members? NO.**
`ls /home/claude/nzamy/web/src/app/api/v1` → there is a `firm/` directory and **no `business/` directory**. The only membership endpoints are:
- `/home/claude/nzamy/web/src/app/api/v1/firm/members/route.ts` — `GET` (`:102`), `POST` (`:174`)
- `/home/claude/nzamy/web/src/app/api/v1/firm/members/[memberId]/route.ts` — `PATCH` (`:40`)
- `/home/claude/nzamy/web/src/app/api/v1/firm/members/workload/route.ts`

The firm counterpart `/home/claude/nzamy/web/src/app/dashboard/firm/team/page.tsx` is wired to those through `/home/claude/nzamy/web/src/lib/services/firmMembersService.ts`. There is no `businessMembersService.ts`.

This asymmetry is stated in the product itself — `/home/claude/nzamy/web/src/app/settings/components/tabs/TeamManagementTab.tsx:112`:
> «فريق حقيقي مُدار من هذه الصفحة موجود حالياً فقط لحسابات مكاتب المحاماة (جدول أعضاء المكتب `public.firm_members`). لا يوجد لهذا النوع من الحسابات جدول أعضاء مماثل بعد، فلا تعرض هذه الصفحة قائمة مختلقة بدلاً منه.»

That sentence is factually wrong about the schema — `business_members` exists — but correct about the code: nothing writes it except the owner-backfill trigger.

### `business_members` role enum

`/home/claude/nzamy/web/supabase/migrations/20260603_phase1_002_entities.sql:298-318`:
```sql
create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null
    check (role in (
      'owner', 'legal_manager', 'legal_staff', 'compliance_officer',
      'seconded', 'department_head', 'hr_manager', 'finance_manager',
      'employee'
    )),
  department text,
  permissions text[] not null default '{}',
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended', 'removed')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id, user_id)
);
```
9 roles; 4 statuses. The UI's `CORPORATE_INVITE_ROLES` (`settingsReadiness.ts:78-85`) offers 6 of the 9 — `legal_manager, legal_staff, department_head, hr_manager, finance_manager, employee` — omitting `owner`, `compliance_officer`, `seconded`, even though `isCorporateComplianceManager` branches on `compliance_officer` (`:128-130`) and the team page renders `seconded`/`compliance_officer` labels (`team/page.tsx:50-51,62-63`).

### "Company WITH legal department" vs "WITHOUT"

The distinction **exists in three disconnected places and is never sourced from the company's own row**:

1. **The real column exists and is never read or written by the app.** `business_profiles.has_legal_dept boolean not null default false` and `service_model text … check (service_model in ('internal','external','hybrid'))` — `20260603_phase1_002_entities.sql`, `business_profiles` DDL. Typed in `/home/claude/nzamy/web/src/types/database.ts:201-202`. `grep has_legal_dept` across `src` returns **exactly one hit** — that type declaration. Nothing selects it, nothing updates it, `handle_new_user()` does not set it, and registration never asks.
2. **A localStorage demo flag**: `hasInternalLegal` in `/home/claude/nzamy/web/src/types/businessBackendReady.ts:59,75` and `/home/claude/nzamy/web/src/hooks/useAdminSettingsHelper.ts:30,147-221,508` (per fictional company C-001 …).
3. **A tier gate**: `can("team-legal-department")` — `/home/claude/nzamy/web/src/app/dashboard/business/team/page.tsx:285-287` and `:410`, resolved by `resolveFeatureAccess`; per `/home/claude/nzamy/web/src/hooks/featureAccess.test.ts:98-122`, **production ignores `hasInternalLegal` entirely and decides on subscription tier alone**; only demo mode honours the flag.
4. A `?mode=service` URL param that only flips a banner: `layout.tsx:124-133` («وضع طلب الخدمة — لا يوجد قسم قانوني داخلي»), set from `/home/claude/nzamy/web/src/app/onboarding/page.tsx:728` and described in `business/page.tsx` header as now **inert**.
5. Marketing copy only: `/home/claude/nzamy/web/src/components/pricing/PricingHero.tsx:139` («لدينا إدارة قانونية داخلية»), `/home/claude/nzamy/web/src/components/floating/constants/floatingServices.tsx:473`.

**Conclusion for UAT closing-map item 4 («الفرد، الشركة بلا إدارة قانونية، الشركة بإدارة قانونية»):** the platform cannot currently distinguish the two company variants for a real account. A company's own `has_legal_dept` / `service_model` are never set at signup, never editable in `/settings`, and never consulted; what decides the "external legal department" banner in production is the subscription tier.

---

## 5. Business requests flow (`business_id`)

### Scope resolution

`/home/claude/nzamy/web/src/lib/auth/serviceRequestEntityScope.ts:32-76` — `resolveServiceRequestEntityScope({requestedScope, sourcePath, userType, firmId, businessId})`:
- Explicit `scope` in the body must be `"firm"` or `"business"` (else `invalid_scope` → 400) **and** must match an id the server already proved (else `unauthorized_scope` → 403) — `:37-49`.
- No explicit scope → `businessId && (isSharedClientIntakePath(sourcePath) || sourcePath.startsWith("/dashboard/business"))` → business (`:56-60`); then `userType === "corporate" && businessId` → business (`:63-65`); then firm for firm/lawyer (`:67-73`); else neither.

### Where `business_id` is set

`/home/claude/nzamy/web/src/app/api/v1/service-requests/route.ts`:
- `resolveActiveEntityIds(supabase, userId)` (`:13-88`) runs four parallel RLS-scoped reads: `firm_members(firm_id)` status=active, **`business_members(business_id)` status=active** (`:23-27`), `firm_profiles(id)` by `owner_user_id`, `business_profiles(id)` by `owner_user_id`. Each error is logged (`:50-55`) and coerced to `null`; result is `memberBusinessId ?? ownedBusinessId` (`:85-88`) — so **an owner does not need a `business_members` row for this path**.
- POST: `const { firmId, businessId } = entityScope;` (`:400`) then the INSERT (`:446-470`):
```ts
...(firmId ? { firm_id: firmId } : {}),
...(businessId ? { business_id: businessId } : {}),
```
with the comment at `:439-445` *"firm_id / business_id (resolved from active membership, never from the body)"*.
- GET with no `receiver` filter: if the caller has **any** entity id, the personal `requester_user_id/assigned_to` OR-filter is **dropped** so RLS alone decides (`:160-167`) — this is what lets a colleague see company rows.

### What the UI sends

**No caller anywhere in `src` sends `scope`.** `grep -n "scope"` across `/home/claude/nzamy/web/src/app/dashboard/client/requests/new/page.tsx`, `/home/claude/nzamy/web/src/app/dashboard/business/_components/AddCaseModal.tsx` and `/home/claude/nzamy/web/src/lib/services/*.ts` returns only unrelated matters (`intakeValues` due-diligence `scope`, doc comments). So attachment relies entirely on the **implicit** branches: `sourcePath` starting with `/dashboard/business`, `isSharedClientIntakePath`, or `userType === "corporate"`. The three intake paths a corporate account uses all write `receiver: "ai_workspace"` and their own `sourcePath` (enumerated in `BusinessProfileReadinessPanel.tsx:171-173`: `client/requests/new:135`, `client/consultation/new:347`, `business/_components/AddCaseModal:121`).

### `/dashboard/business/requests`

**Lists nothing real and is unreachable.** `requests/page.tsx:35-110` is `MOCK_REQUESTS` (6 hand-written Arabic requests with budgets «٣,٥٠٠ ر.س» … «٢٥,٠٠٠ ر.س», assignees محمد الغامدي / نورة القحطاني / فهد العتيبي, `offersCount`, deadlines); filters and stats at `:228-238` are computed over that array. **Zero `apiGet`/`fetch`/`useEffect` in the file.** It is not in `VISIBLE_BUSINESS_ROUTES`, so the layout renders «هذا القسم قيد الإعداد» instead.

The **real** company request list is the overview panel «طلبات منشأتك» on `/dashboard/business` (`business/page.tsx:346-455`), which calls `listMyServiceOrders()` → `GET /api/v1/service-requests` (no `receiver` param) → the RLS/business arm above. Its «عرض الكل» points at `/dashboard/client/requests` (`business/page.tsx:363`) and each row deep-links to `/ai/orders/{id}` (`:429`).

RLS arm for the company read — `/home/claude/nzamy/web/supabase/migrations/20260914_entity_memberships_and_business_requests.sql:52-59`:
```sql
create policy "business members read business service requests"
  on public.service_requests for select
  using (business_id is not null and public.is_active_business_member(business_id));
```
**This is the policy UAT-BIZ-001 depends on**, and the migration that adds the `business_id` column (`:9-11`) is the one whose absence produced `PGRST204 … column not found in schema cache`.

---

## 6. Membership resolution on the client side

`/home/claude/nzamy/web/src/lib/auth/entityMembership.ts` — 42 lines:
- `entityMembershipKindForPath` (`:20-25`): `/dashboard/firm` → firm; `/dashboard/business` → business; `isSharedClientIntakePath(pathname)` → business.
- `isAllowedByTypeOrMembership` (`:32-42`): admin always; type match; `allowedTypes.includes("firm") && memberships.firm`; `allowedTypes.includes("corporate") && memberships.business`. Membership is **additive only** — it never changes `user_type`.

`/home/claude/nzamy/web/src/hooks/useUser.ts` → `readEntityMemberships()` (`:559-630`): four parallel queries —
`firm_members(firm_id, role, firm_profiles(name_ar))` status=active (`:565-571`); **`business_members(business_id, role, business_profiles(company_name_ar))` status=active** (`:572-578`); `firm_profiles(id, name_ar)` by `owner_user_id` (`:579-584`); `business_profiles(id, company_name_ar)` by `owner_user_id` (`:585-590`).

```ts
if (firmResult.error || businessResult.error || ownedFirmResult.error || ownedBusinessResult.error) {
  return { status: "unavailable" };          // useUser.ts:592-594
}
```

**This is the 42P17 blast radius.** The four are `Promise.all`-ed and a single failing query collapses **all** memberships to `unavailable` — an owner's `business_profiles` read is discarded because someone else's `business_members` policy recursed.

Fallbacks: owner-without-membership-row is handled — `else if (ownedBusiness …) memberships.business = { entityId, entityName, role: "owner" }` (`:618-624`); same for firm with `role: "managing_partner"` (`:604-610`). So **a business OWNER does NOT depend on a `business_members` row in `useUser`** — but only when the `business_members` query itself **succeeds and returns no row**. A 42P17 on `business_members` aborts the whole function before the owner fallback is reached.

On `unavailable`, `applyUser` (`useUser.ts:764-800`) carries the **previous** memberships forward only for the same already-signed-in user (`:787-793`); on a cold load / fresh tab there is nothing to carry → `{}` → `businessRole` falls back to `meta.business_role` (`:721`), which no signup writes.

**What becomes inaccessible to a member when that query 500s (cold load):**
- `/dashboard/business/**` — `layout.tsx:113` `<UserTypeGuard allowedTypes={["corporate","admin"]}>`, which calls `isAllowedByTypeOrMembership` with `businessMembership` (`/home/claude/nzamy/web/src/components/dashboard/UserTypeGuard.tsx:32-37`). A member whose `profiles.user_type` is `individual`/`lawyer` is thrown out.
- `/dashboard/firm/**` — same guard, `firmMembership`.
- The shared client intake paths for company work (`isSharedClientIntakePath`) lose their business scope → a request created in that window gets **no `business_id`** and silently becomes a personal request (`serviceRequestEntityScope.ts` returns `EMPTY_SCOPE` at `:75`). The API-side `resolveActiveEntityIds` is independently affected (it logs per-query and nulls only the failing one, `route.ts:42-88`, so it degrades more gracefully than `useUser`).
- `/settings` corporate tabs: `businessRole` becomes `undefined` → `isCorporateEntityManager(undefined)` → `"owner"` → entity/team tabs are shown to everyone (`settingsReadiness.ts:120-122, 280-289`) — a **fail-open** in the opposite direction.
- `EntityRouteGuard scope="business"` wraps children at `layout.tsx:138-140`.

The owner-backfill trigger — `20260914_entity_memberships_and_business_requests.sql:21-48`: `ensure_business_owner_membership()` (`security definer`, `set search_path=''`) inserts `(new.id, new.owner_user_id, 'owner', 'active', now())` after insert on `business_profiles`, plus a one-off backfill over all existing rows (`:43-48`), guarded by `uq_business_members_business_user` (`:18-19`).

---

## 7. Settings tabs for corporate

`/home/claude/nzamy/web/src/constants/settingsReadiness.ts:262-289`, verbatim:

```ts
if (userType === "corporate") {
  const canManageEntity = isCorporateEntityManager(businessRole);
  const canManageBilling = isCorporateBillingManager(businessRole);
  const canManageCompliance = isCorporateComplianceManager(businessRole);
  return {
    roleLabel: "موظف شركة تجارية",
    entityLabel: "شركة تجارية",
    canManageEntity, canManageTeam: canManageEntity, canManageBilling, canManageCompliance,
    canInviteTeam: canManageEntity,
    canUseProfession: false,
    canUseSignature: false,
    canUseDelegation: canManageEntity || businessRole === "legal_manager",
    canUseReferral: false,
    showPayments: canManageBilling,
    showSubscription: canManageBilling,
    visibleTabs: uniqueTabs([
      "profile", "role-scope",
      ...(canManageEntity ? ["entity" as const, "team" as const] : []),
      ...(canManageEntity || businessRole === "legal_manager" ? ["delegation" as const] : []),
      ...(canManageBilling ? ["invoice" as const, "payments" as const, "subscription" as const] : []),
      ...(canManageCompliance ? ["compliance" as const] : []),
      "security", "notifications", "privacy", "help",
    ]),
    inviteRoles: canManageEntity ? CORPORATE_INVITE_ROLES : [],
  };
}
```

Predicates (`:120-130`): entity-manager = `["owner","legal_manager","hr_manager"]`, billing = `["owner","finance_manager"]`, compliance = `["owner","legal_manager","compliance_officer"]` — **each `?? "owner"`, i.e. unknown role ⇒ full manager**.

**Always visible to corporate**: `profile`, `role-scope`, `security`, `notifications`, `privacy`, `help`.
**Never visible to corporate**: `profession`, `signature`, `referral` (`canUseProfession/Signature/Referral: false`).
**Conditional**: `entity`+`team` (entity managers), `delegation` (entity managers + `legal_manager`), `invoice`+`payments`+`subscription` (billing managers), `compliance` (compliance managers).

**Marked not-ready / known-hollow:**
- `team` → `TeamManagementTab` renders the honest "no members table for this account type" panel for anything but `firm` (`TeamManagementTab.tsx:77-115`) — so a corporate entity-manager sees a `team` tab that can never list anyone.
- `seatPolicy` is documented as **NEVER POPULATED** (`settingsReadiness.ts:37-55`), including «مقاعد الشركة ١٢/٢٥» which every corporate account was shown as its own live figure. Do not zero-fill it — `TeamManagementTab` would read `0/0` as seats-full.
- The `nafath` tab id still exists in `SettingsTabId` but has no entry in `SETTINGS_TABS` and is dropped by the type-guarded filter (`useSettingsTabs.ts:37-43,67-69`).
- The global banner `SETTINGS_BACKEND_READY_MESSAGE` (`settingsReadiness.ts:4-5`) still says «محلي وجاهز للباك إند: لا يوجد حفظ خادمي…», which is now false for ProfileTab/EntitySettingsTab.

---

## 8. Tests

`grep -l 'business_profiles|businessProfile|entitySettings|EntitySettings|business_members' src/**/*.test.ts`:

| File | Assertions relevant here |
|---|---|
| `/home/claude/nzamy/web/src/lib/services/businessOverview.test.ts` | `:21-33` a real trading name is returned / nothing-at-all is `null`; `:40-49` **an email address is never printed as a company name**; `:52-60` the registration fallbacks are not names — `accountDisplayName("عميل نظامي") === null`, `("شركة جديدة") === null`, `("New Company") === null`, `("جهة جديدة") === null`, `("مستخدم جديد") === null`; `:63-67` placeholders padded with RLM/LRM/NBSP/ZWSP are still placeholders. Pins `business/page.tsx:286` to `BusinessProfileReadinessPanel`. |
| `/home/claude/nzamy/web/src/lib/services/profileSettingsFields.test.ts` | `:5-10` no account type collects a national id or birth date; `:12-17` every field has an Arabic label + a valid target, and an `entitySettings` target implies `entityProfileTableFor(type)` is non-null; `:22-26` lawyer split; `:29-34` firm `entitySettings` split, `entityProfileTableFor("firm")==="firm_profiles"`, `entityProfileTableFor("individual")===null`. |
| `/home/claude/nzamy/web/src/lib/services/profileFormTransform.test.ts` | `:18-19` email always read-only; `:22-24` `licenseExpiry` read-only only when target is `lawyer`; `:38-56` shaping rules. |
| `/home/claude/nzamy/web/src/lib/services/profileEntityFields.test.ts` | `:16-26` `nationality` length/type validation; `:29-32` `office_address` ≤200; `:37-50` ISO date validation. |
| `/home/claude/nzamy/web/src/hooks/featureAccess.test.ts` | `:98-108` **`team-legal-department`: production ignores `hasInternalLegal`, decides on tier alone**; `:111-122` demo mode honours the flag. |
| `/home/claude/nzamy/web/src/lib/auth/accountTypeClaim.test.ts` | account-type claim handling. |

**Test gaps — nothing covers:**
- `resolveServiceRequestEntityScope` (no `serviceRequestEntityScope.test.ts` exists) — the function that decides `business_id`.
- `entityMembership.ts` / `isAllowedByTypeOrMembership`.
- `validateBusinessProfilePatch` / the corporate PATCH arm of `/api/v1/profile`.
- `corporateSignupMetadata` / `isCorporateIdentityComplete` — despite `_corporateIdentity.ts:17-22` saying *"It is a pure function so the key names … are provable by test rather than by reading the page component."* **No such test file exists** (`_corporateIdentity.test.ts` not present).
- `EntitySettingsTab` behaviour for a non-owner member.

---

# Owner decisions relevant

Verbatim from `/home/claude/nzamy/spec/00_سياق_المنصة_والمالك/00A_إجابات_الأسئلة_وقرارات_التنفيذ_الحالية.md` (158 lines total). Nothing in this file names client/business *profile fields*, *memberships* or *registration* directly except through the mock-surfaces and P0-isolation rulings, which govern everything in this audit:

- `:17-21` — **حاجب سابق لكل البنود**
  > «UAT المؤرخ 2026-09-15 أثبت حواجز P0 في عزل profiles/العضويات/التخزين والجلسة. تُصلح وتُعاد سلبياً وإيجابياً على Staging أولاً. لا تطبيق SQL إنتاجي، ولا استعمال `service_role` لتقمص مستخدم أو لتجاوز RLS في مسار قراءة عادي.»

- `:46-51` — **٤. الشاشات والبيانات الوهمية**
  > «**القرار الحالي:** كل سطح ثبت أنه يعرض mock أو أرقاماً/أشخاصاً مختلقين يُحجب مباشرة بـ404 أو Coming Soon صادق. الرقم القديم «94» ليس معياراً؛ الجرد route-by-route هو.»
  > «**القبول:** الرابط المباشر لا يرسم fixture ولو اختفى من sidebar؛ build الإنتاج لا يحمل mock قابلاً للوصول. لا حذف للمصدر قبل قرار مستقل.»

- `:53-58` — **٥. أقسام الشركات الستة عشر**
  > «**القرار الحالي:** تبقى محجوبة ومحفوظة المصدر؛ لا schema ولا CRUD شكلي ولا حذف.»
  > «**القبول:** كل URL يعرض رسالة صادقة، ولا ينفذ no-op أو mock؛ admin preview داخلي وموسوم فقط. البناء أو الإلغاء توسع لاحق.»

- `:40-44` — **٣. الاستضافة وPDPL**
  > «إصلاح RLS وعزل التخزين وتقليل الجمع واجب لا ينتظر قرار الاستضافة.» / «**القبول:** مستخدم B لا يقرأ/يحذف ملف أو profile المستخدم A…»

- `:148-153` — **ترتيب التنفيذ**
  > «1. P0: عزل profiles/العضويات/التخزين والجلسات والاستحقاق.»
  > «2. حجب السطوح والادعاءات والمهل غير المعتمدة ومنع تجاوز service role.»
  > «5. ميزات المنتج الاختيارية لا تُفتح إلا بمواصفة جديدة وقرار صريح واختبار قبول.»

- `:157-158` — closing
  > «هذه القرارات تغلق الوضع الآمن الحالي؛ لا تمنح إذن نشر إنتاجي.»

**Direct consequence for this audit:** decisions ٤ and ٥ mean the business team/requests/departments pages must NOT be "built" as a fix — they are correctly withheld. The gaps below are therefore split into (a) truth/integrity fixes that decision ٤ *requires*, and (b) the one capability the owner test guide explicitly demands (ك‏٢ + UAT-BIZ-001/UAT-TEAM-001), which is entity-data persistence and real memberships — not the sixteen company sections.

**Owner acceptance references being measured against:**
- `/home/claude/nzamy/spec/00_سياق_المنصة_والمالك/06_دليل_اختبار_المالك_2026-09-04.md:313` — «**ك‏٢ — بحساب مكتب أو شركة:** «بيانات الكيان»: اكتب العنوان والهاتف (للشركة: اسم الشركة والسجل وصفة الممثل) ← حفظ ← أعد التحميل. **المتوقع:** تبقى. «الفريق» (مكتب): الأعضاء الحقيقيون الذين أضفتهم في القسم ج.»
- `/home/claude/nzamy/evidence/uat-20260915/00_دليل_اختبار_المنصة_والتكليف_للمبرمج.md:58` (UAT-BIZ-001, P1 — `PGRST204`, `business_id` missing from schema cache), `:60` (UAT-TEAM-001, P1 — 11/11 membership reads returned 500 `42P17 infinite recursion detected in policy`), `:163` (closing map item 4).

**ك‏٢ verdict as the code stands: FAIL.** A corporate account has **no العنوان and no الهاتف field anywhere** in «بيانات الكيان» (`EntitySettingsTab.tsx:39-45` — four fields, none of them address or phone), so step 1 of ك‏٢ cannot be performed at all for a company. اسم الشركة/السجل/صفة الممثل do persist — for the owner only.

---

# Gaps & fixes

## A. CLIENT (individual) profile

**C-1 — No company/individual address is collected, and `profiles` has no address column.** ك‏٢ asks for العنوان; the individual form has `city` only (`profileSettingsFields.ts:36`).
*Fix (code):* add `{ key: "address", label: "العنوان", placeholder: "حي الملقا، الرياض", type: "text", span: 2, target: "profile", maxLength: 200 }` to `COMMON_PROFILE_FIELDS` in `/home/claude/nzamy/web/src/lib/services/profileSettingsFields.ts`; add `"address"` to the `profileFields` allow-list in `/home/claude/nzamy/web/src/app/api/v1/profile/route.ts` (the `for (const key of profileFields)` loop at `:511`) with a length validator beside `officeAddressIssue` in `profileEntityFields.ts` + a case in `profileEntityFields.test.ts`.
*SQL:* new migration `supabase/migrations/20260921_profiles_address.sql` — `alter table public.profiles add column if not exists address text;` plus a `comment on column`. Do **not** touch `handle_new_user()` for this (the form doesn't collect it at signup).

**C-2 — `getDashboardSummary()` cannot fail, so a failed read renders as "you have nothing".** `/home/claude/nzamy/web/src/lib/services/dashboardService.ts:71` `catch { return { ...DEMO_SUMMARY } }`; consequence documented at `client/page.tsx:251-269`. This is decision ٤: a fixture is being drawn on a production surface.
*Fix:* make `getDashboardSummary()` throw (or return a `ListRead`-shaped value) in `/home/claude/nzamy/web/src/lib/services/dashboardService.ts`, and have `/home/claude/nzamy/web/src/app/dashboard/client/page.tsx:270-273` render the same "unreadable + retry" branch the documents card already has (`:935-960`). No SQL.

**C-3 — No avatar anywhere, and no entry point to the profile from the client dashboard.** `ProfileTab.tsx:291-300`. The missing upload is the honest choice; the missing *link* is not.
*Fix:* add a «الملف الشخصي» link to `/settings?tab=profile` in the client dashboard header or the plan card row of `/home/claude/nzamy/web/src/app/dashboard/client/page.tsx`. Leave the avatar as-is until Storage wiring exists (do not add a button that only apologises — `:296-298`).

**C-4 — `SETTINGS_BACKEND_READY_MESSAGE` still claims nothing is saved server-side.** `/home/claude/nzamy/web/src/constants/settingsReadiness.ts:4-5`. ProfileTab and EntitySettingsTab now persist to real columns.
*Fix:* delete the constant and its render sites, or narrow it to the tabs that are still local. No SQL.

**C-5 — `phone` is unrecoverable for every account registered 20260614→20260827, and `20260827_signup_contact_fields.sql` may not be applied.** Header `:95-99`: *"THIS FILE DOES NOT APPLY ITSELF."*
*Fix (ops, not code):* run the file's own verification query 2 (`position('new.phone' in prosrc)` etc., quoted in the migration footer) against staging, then production per owner decision «لا تطبيق SQL إنتاجي» → staging first.

## B. BUSINESS (corporate) profile

**B-1 — ك‏٢ blocker: a company cannot enter العنوان or الهاتف.** `EntitySettingsTab.tsx:39-45` offers four fields; the file's own comment `:16-19` explains why it refuses to invent a fifth (there is no column). The right fix is to give it columns, not jsonb — `business_profiles` is a real table and the admin fulfilment queue re-reads it per order (`BusinessProfileReadinessPanel.tsx:158-166` → `/home/claude/nzamy/web/src/app/api/v1/admin/service-orders/route.ts:178-203`).
*SQL:* new migration `supabase/migrations/20260921_business_profile_contact_fields.sql`:
```sql
alter table public.business_profiles
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists phone text,
  add column if not exists email text;
```
*Fix (code):* (i) add the four `FieldDef`s to `CORPORATE_FIELDS` in `/home/claude/nzamy/web/src/app/settings/components/tabs/EntitySettingsTab.tsx:39-45` (`address` with `span: 2`); (ii) widen the GET select in `/home/claude/nzamy/web/src/app/api/v1/profile/route.ts:222-225` and the `businessProfile` object at `:243-248`; (iii) widen `validateBusinessProfilePatch` and the PATCH `.select(...)` at `:656`; (iv) widen the read/write maps at `EntitySettingsTab.tsx:155-162` and `:214-228`; (v) add cases to a new `businessProfilePatch.test.ts`.

**B-2 — A non-owner entity-manager (`legal_manager`/`hr_manager`) is shown the entity tab, reads blanks with no error, and gets a generic 500 on save.** `settingsReadiness.ts:120-122` grants the tab; `/api/v1/profile` GET filters `.eq("owner_user_id", user.id)` (`route.ts:228`) → `data === null`, `roleProfileReadFailed` stays `false` → `EntitySettingsTab` renders four empty inputs with Save **enabled** (`:330`); PATCH `.eq("owner_user_id", user.id).single()` (`route.ts:652-657`) matches 0 rows → `AR.saveFailed` 500. RLS policy is owner-only: `20260603_phase1_002_entities.sql:274-277`.
*Fix — choose one, then make the UI agree:*
- **(a) Read-only for members (smallest, safest):** in `/home/claude/nzamy/web/src/app/api/v1/profile/route.ts`, resolve the caller's `business_id` via `business_members` (same shape as `resolveActiveEntityIds` in `service-requests/route.ts:13-88`) and select `business_profiles` by that id for GET; keep PATCH owner-only but return a **specific** Arabic 403 («تعديل بيانات الشركة متاح لمالك الحساب فقط») instead of `AR.saveFailed`; in `EntitySettingsTab.tsx` disable the inputs and the Save button when the session's `businessRole !== "owner"`.
- **(b) Allow managers to write:** new migration `supabase/migrations/20260921_business_profiles_manager_update_rls.sql`:
```sql
drop policy if exists "business_profiles: managers can update" on public.business_profiles;
create policy "business_profiles: managers can update"
  on public.business_profiles for update
  using (exists (select 1 from public.business_members bm
                 where bm.business_id = business_profiles.id
                   and bm.user_id = auth.uid()
                   and bm.status = 'active'
                   and bm.role in ('owner','legal_manager')))
  with check (exists (select 1 from public.business_members bm
                 where bm.business_id = business_profiles.id
                   and bm.user_id = auth.uid()
                   and bm.status = 'active'
                   and bm.role in ('owner','legal_manager')));
```
⚠ Write it through the existing `security definer` helper `public.is_active_business_member` / a new `public.is_business_manager(uuid)` in the style of `20260916_fix_all_entities_rls_infinite_recursion.sql:27-43` — an inline `exists` over `business_members` inside a `business_profiles` policy is exactly the shape that produced **42P17** (UAT-TEAM-001). Then change the PATCH filter in `route.ts:654` from `.eq("owner_user_id", user.id)` to `.eq("id", resolvedBusinessId)`.

**B-3 — `roleProfileReadFailed` cannot fire for a corporate member, so "no permission" renders as "no data".** Same code path as B-2 (`route.ts:226-250`: a null `data` with no error takes the `else if (data)` false branch silently).
*Fix:* emit an explicit `businessProfileScope: "owner" | "member" | "none"` on the GET envelope and branch in `EntitySettingsTab.tsx:155-162`. No SQL.

**B-4 — `has_legal_dept` / `service_model` are dead columns; the WITH/WITHOUT-legal-department distinction is decided by subscription tier in production.** `20260603_phase1_002_entities.sql` DDL; only hit in `src` is the type at `/home/claude/nzamy/web/src/types/database.ts:202`; the production decision is `resolveFeatureAccess("team-legal-department", tier, …)` per `/home/claude/nzamy/web/src/hooks/featureAccess.test.ts:98-108`. This is the UAT closing-map item 4 blocker.
*Fix (code):* (i) add a `serviceModel` select («إدارة قانونية داخلية» / «تفويض خارجي» / «مختلط») + a `hasLegalDept` toggle to `CORPORATE_FIELDS` in `EntitySettingsTab.tsx`, mapped to the real columns through the same `businessProfile` PATCH arm (a `<select>`, not free text — `service_model` is CHECK-constrained, same reasoning as `legal_rep_capacity` at `:289-291`); (ii) collect it at signup — add `service_model` / `has_legal_dept` to `corporateSignupMetadata()` in `/home/claude/nzamy/web/src/app/register/client/components/_corporateIdentity.ts:161-178` and a matching question in `components/Steps.tsx`; (iii) replace `can("team-legal-department")` at `/home/claude/nzamy/web/src/app/dashboard/business/team/page.tsx:285` and `:410` with the company's own `has_legal_dept`.
*SQL:* new migration `supabase/migrations/20260921_handle_new_user_business_service_model.sql` — carry the whole `handle_new_user()` body forward byte-for-byte from `20260827` (the carry-forward warning at `20260827:56-68` is not optional; losing the `v_sub_role` clamp breaks provider signup with 23502) and add to the corporate branch only:
```sql
v_service_model := coalesce(nullif(new.raw_user_meta_data->>'service_model',''), 'internal');
if v_service_model not in ('internal','external','hybrid') then v_service_model := 'internal'; end if;
-- … INSERT … service_model, has_legal_dept)
-- VALUES … v_service_model,
--   coalesce((new.raw_user_meta_data->>'has_legal_dept')::boolean, v_service_model <> 'external')
```
No column DDL needed — both columns already exist with defaults.

**B-5 — No business members API; `business_members` is written only by the owner-backfill trigger.** No `/home/claude/nzamy/web/src/app/api/v1/business/` directory; the firm equivalents are `/api/v1/firm/members/route.ts` (GET `:102`, POST `:174`) and `/api/v1/firm/members/[memberId]/route.ts` (PATCH `:40`). The RLS write policies **already exist**: `20260916_fix_all_entities_rls_infinite_recursion.sql:60-72` grants owner insert/update/delete on `business_members` through `public.is_business_owner(business_id)`.
*Fix (code, no SQL needed):* create `/home/claude/nzamy/web/src/app/api/v1/business/members/route.ts` (GET list + POST invite) and `.../[memberId]/route.ts` (PATCH role/status), mirroring the firm routes; add `/home/claude/nzamy/web/src/lib/services/businessMembersService.ts` mirroring `firmMembersService.ts`; then point `TeamManagementTab.tsx:112`'s corporate branch at it and correct that panel's copy (it currently asserts `business_members` does not exist). Roles must be constrained to the DDL's nine (`20260603_phase1_002_entities.sql:303-307`); `CORPORATE_INVITE_ROLES` (`settingsReadiness.ts:78-85`) currently omits `compliance_officer` and `seconded` although both are branched on elsewhere — add them.
*Owner-decision caveat:* this is the one expansion ك‏٢ and UAT-TEAM-001 arguably require («الأعضاء الحقيقيون»); decision ٥ («لا CRUD شكلي») forbids a fake one, not a real one. Confirm before building.

**B-6 — `/dashboard/business/team` and `/dashboard/business/requests` still ship reachable mock modules in the production bundle.** `team/page.tsx:73-104` (4 invented people + 2 invited + a fake `https://nezamy.sa/invite/x7k2m9p` link at `:142` + dead «إزالة العضو»/«تعديل البيانات»/«تأكيد وتفعيل» buttons at `:558-571`, `:235`); `requests/page.tsx:35-110`. They are blocked by `layout.tsx:110,136-142`, **but only by a client-side layout** — the modules are compiled and a direct link is what owner decision ٤ names («الرابط المباشر لا يرسم fixture ولو اختفى من sidebar»؛ «build الإنتاج لا يحمل mock قابلاً للوصول»).
*Fix:* replace the page bodies with `DashboardComingSoon` exactly as `/home/claude/nzamy/web/src/app/dashboard/business/departments/page.tsx:37-41` already does (source preserved in git per «لا حذف للمصدر»), so the fixture arrays leave the bundle. Same treatment for `consultations`, `governance`, `health-check`, `kanban`, `reviews`. No SQL.

**B-7 — `BusinessProfileReadinessPanel` denies the editor exists.** `/home/claude/nzamy/web/src/components/dashboard/business/BusinessProfileReadinessPanel.tsx:230-240`: *"There is no corporate profile editor to link to"* → links to `/contact`.
*Fix:* change the empty-state link to `/settings?tab=entity` (keeping `/contact` as the secondary route), and update the comment. No SQL.

**B-8 — `useUser.readEntityMemberships` collapses all four reads on any one error — the 42P17 amplifier.** `/home/claude/nzamy/web/src/hooks/useUser.ts:592-594`.
*Fix:* evaluate the four independently (mirror `resolveActiveEntityIds` in `/home/claude/nzamy/web/src/app/api/v1/service-requests/route.ts:42-88`, which logs each and nulls only the failing one), so an owner's `business_profiles`-derived membership survives a failed `business_members` policy, and return `unavailable` only when *every* read failed. Add `useUser` membership unit tests (none exist).

**B-9 — Fail-open role defaults.** `isCorporateEntityManager/BillingManager/ComplianceManager` all do `role ?? "owner"` (`settingsReadiness.ts:120-130`), so a corporate account whose membership read failed is treated as the owner.
*Fix:* make the default deny (`role ?? null` → false) and render a "we could not read your role" state, since `useUser` already distinguishes `unavailable` (`:548-549`). Pair with B-8 so legitimate owners are not locked out.

**B-10 — No `scope` is ever sent by any intake form; `business_id` attachment is entirely implicit.** `serviceRequestEntityScope.ts:37-49` supports an explicit scope; nothing in `src` sends one. A corporate account whose `sourcePath` is not recognised silently files a **personal** request (`:75`).
*Fix:* have the three corporate intake paths send `scope: "business"` explicitly (`/home/claude/nzamy/web/src/app/dashboard/client/requests/new/page.tsx`, `.../consultation/new/page.tsx`, `/home/claude/nzamy/web/src/app/dashboard/business/_components/AddCaseModal.tsx`) and show the resolved entity in the form («سيُقدَّم هذا الطلب باسم <اسم الشركة>»); add `/home/claude/nzamy/web/src/lib/auth/serviceRequestEntityScope.test.ts` covering all six branches. No SQL.

**B-11 — Migrations `20260914` and `20260916` are the two UAT P1s and their application state is unverified from the repo.** UAT-BIZ-001 (`PGRST204`, `business_id` absent) ⇒ `20260914_entity_memberships_and_business_requests.sql` not applied; UAT-TEAM-001 (`42P17`) ⇒ `20260916_fix_all_entities_rls_infinite_recursion.sql` not applied (it is precisely the fix — helper functions at `:27-43`, business policies at `:45-72`, and the same pattern for government/ngo/firm at `:80-230`).
*Fix (ops):* apply **`20260916` first, then `20260914`** on staging with a backup — `20260914:54-59` creates a policy that calls `public.is_active_business_member`, which `20260916` (re)defines as `security definer`; applying them the other way round re-creates the recursion. Then run `20260914`'s own read-only verification block (`:63-76`) and re-run the UAT positive/negative pair (B sees B, B does not see A).
