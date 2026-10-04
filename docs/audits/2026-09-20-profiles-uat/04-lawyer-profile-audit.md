# 04 — Lawyer profile audit vs owner acceptance (sections ي / ك / ز of `06_دليل_اختبار_المالك_2026-09-04.md`)

> Audit date 2026-09-20 against the owner's package `web/`. Paths relative to `web/`.

**Headline:** the Phase-7 profile stack is substantially built and honest. Real gaps: (1) the profile *view* page never shows «رابط ملفك العام»; (2) settings «الملف الشخصي» has **no الجنسية field for a lawyer**; (3) «قبول عملاء جدد» is saved but not reflected on any page a lawyer can reach in beta; (4) the dashboard share button copies the UUID URL, never the slug; plus price-unit wording and an anonymity leak in the reviews tab.

## 1. Per-step status

### ي‏١ — تعديل الملف (`/dashboard/lawyer/profile/edit`)
| Owner step | Status | Evidence | Gap |
|---|---|---|---|
| ي‏١.1 headline + «اقتراح رابط» / lowercase slug — saved | IMPLEMENTED | headline `dashboard/lawyer/profile/edit/page.tsx:556-571`; slug + button `:573-602` (`:594`), `suggestSlug` `lib/services/lawyerProfileFields.ts:32-42`; lowercase forced `:582`; `slugIssue`/`SLUG_RE` `lawyerProfileFields.ts:12-25`; PATCH `:397-403`; allow-listed `api/v1/profile/route.ts:349`; server re-validation `:391-409`; written `:587-593`; column + CHECKs `20260907_phase7_profile_services_reviews.sql:46,54-61` | — |
| ي‏١.1 …profile page shows «رابط ملفك العام» | **MISSING** | `profile/page.tsx` has no public-link row; only the «مشاركة» button `:574-591`, and `canShareProfile = Boolean(user.userId) && !BETA_MONOPOLY_MODE` (`:413`) is **false** in beta (`lib/betaConfig.ts:46`) → URL (`:421-424`) never on screen | Lawyer cannot see/copy his public URL |
| ي‏١.2 phone number in bio → immediate warning + Arabic refusal | IMPLEMENTED | client warning `edit/page.tsx:437,540-544`; Save disabled `:439,741`; server refusal `route.ts:447-450` via `offPlatformContactIssue`; detector `contactSanitizer.ts:46-52`, message `:100-106`; headline same `edit:438,562-566` + `route:441-442` | — |
| ي‏١.3 qualification + 2 courts + 2 languages → «نبذة» card | IMPLEMENTED | editor `edit/page.tsx:621-654,656-665,667-676`; validation `lawyerProfileFields.ts:50-61,78-80,96-98`; route `:411-428`; columns `20260907:47-49,65-67`; rendered `profile/page.tsx:818-864` | languages hidden when exactly `["ar"]` (`:503-506`, deliberate) |
| ي‏١.4 second lawyer takes same slug → «هذا الرابط مستخدم من محامٍ آخر» under field | IMPLEMENTED | unique index `20260907:63`; 23505 → 409 `route.ts:599-600` (`AR.slugTaken:57`); `api.ts:56-58` rethrows; editor matches `edit:56,412`, renders under field `:597-601` | — |

### ي‏٢ — الخدمات
| Step | Status | Evidence | Gap |
|---|---|---|---|
| ي‏٢.1 add service, fixed 500 → «٥٠٠ ريال» | PARTIAL | table `20260907:72-89`; API `api/v1/lawyer/services/route.ts` GET `:80-106` POST `:118-224`; modal `_components/profile/ServiceFormModal.tsx`; row `profile/page.tsx:918-967`. Renders **«٥٠٠ ر.س»** (`servicePriceLabelAr` `lawyerProfileFields.ts:126-132`, asserted `lawyerProfileFields.test.ts:36`) | wording «ر.س» vs owner's «ريال» — owner decision |
| ي‏٢.2 quote w/o price accepted; fixed w/o price rejected | IMPLEMENTED | modal `ServiceFormModal.tsx:82-94,215`; POST `services/route.ts:152-174`; PATCH `services/[id]/route.ts:127-160`; DB `lawyer_services_price_pair_check` `20260907:88`. Kind labelled «بحسب الحالة», not «حسب الطلب» | label wording |
| ي‏٢.3 toggle instant; delete after confirm | IMPLEMENTED | `profile/page.tsx:367-378,939-947`; delete `window.confirm` `:380-399` → DELETE `services/[id]/route.ts:207-231` | — |

### ي‏٣ — طباعة / PDF
IMPLEMENTED — `window.print()` `profile/page.tsx:439,592-598`; `app/globals.css:346-349` hides `header, footer, nav, aside, button, .print\:hidden, [role="button"]`; `print:hidden` on action row `:574`, tabs `:792`, services/reviews `:872,975`; «نبذة» card `hidden print:block` `:816`; dark-mode text forced black `:525-532`.

### ي‏٤ — تقييم العميل
| Step | Status | Evidence | Gap |
|---|---|---|---|
| ي‏٤.1 review button on completed request; 4 stars + WhatsApp number → refused | IMPLEMENTED | `api/v1/reviews/eligible/route.ts:34-104`; banner `dashboard/client/requests/page.tsx:863-892` → `ReviewForm` `:559-566`; stars `components/reviews/ReviewForm.tsx:132-160`; inline refusal `:49-52,168-176,195-200`; server `api/v1/reviews/route.ts:247-256` | — |
| ي‏٤.2 anonymous → saved | IMPLEMENTED | checkbox `ReviewForm.tsx:205-215`; `is_anonymous` `route.ts:277`; RLS `20260907:118-128` | — |
| ي‏٤.3 second review same request → refused | IMPLEMENTED | `uq_reviews_request` `20260907:115`; 23505 → 409 `route.ts:288-290`; `ReviewForm.tsx:75`; removed from eligible `requests/page.tsx:743-749` | — |
| ي‏٤.4 lawyer tab: no name/no request id; reply works; reply refused if phone | IMPLEMENTED (with a leak) | tab `profile/page.tsx:974-978` → `ReviewsPanel.tsx`; name suppressed `:189-191`; `requestId`/`reviewerName` withheld `api/v1/reviews/route.ts:52-68,108-113`; `/reviews/mine` `mine/route.ts:22-71`; reply `ReviewsPanel.tsx:216-251`, phone check `:89,224`; server `api/v1/reviews/[id]/response/route.ts:46-49`; one reply `:80-83,86-98` | **Leak:** panel prints «الخدمة: {serviceTitleAr}» `ReviewsPanel.tsx:194-196`, and `enrichReviews` resolves that title from `request_id` **even for anonymous reviews** (`route.ts:100-121`) |

### ك‏١ — الإعدادات (lawyer)
| Step | Status | Evidence | Gap |
|---|---|---|---|
| ك‏١.1 «الجنسية» | **MISSING** | `profileSettingsFields.ts:41` puts `nationality` under `individual` only; lawyer list `:43-51` lacks it; `ProfileTab.tsx:70` renders `profileFieldsFor(userType)`. Column exists (`20260906:124`), route allow-lists (`:329`) + validates (`:456-459`) | field spec only |
| ك‏١.1 license issue date + office address persist | IMPLEMENTED | specs `:45,49`; split `:104-118`; PATCH `ProfileTab.tsx:243-248`; allow-list `route.ts:358-359`; validation `:461-469`; written `:587-593`; columns `20260906:126-127` | — |
| ك‏١.1 NO national ID / DOB | CONFIRMED | no field anywhere; rationale `profileSettingsFields.ts:6-10`; regression test `profileSettingsFields.test.ts:5-9`; only prose `ProfileTab.tsx:361-364` | — |
| ك‏١.5 «قبول عملاء جدد» → reflected in profile | PARTIAL | toggle `ProfessionTab.tsx:217-219,92,113,141-143`; allow-listed `route.ts:346`; echoed in editor `edit:474-477` and public page `lawyers/[slug]/page.tsx:565-580` (redirected in beta) — but `/dashboard/lawyer/profile` never renders the flag (`EMPTY_PROFILE` `:94-142`; status row `:697-736`) | not visible on the lawyer's own profile page |

### ز‏١ / ز‏٢
| Step | Status | Evidence |
|---|---|---|
| badge «حساب على المنصّة» + hint | IMPLEMENTED | `dashboard/lawyer/clients/page.tsx:376-378` |
| «إنشاء بطاقة موكّل لهذا الحساب» | IMPLEMENTED | `clients/[id]/page.tsx:748`; POST with `clientUserId` `api/v1/lawyer/clients/route.ts:388-443` |
| «ربط بحساب على المنصّة» — only accounts that requested a service | IMPLEMENTED | `clients/[id]/page.tsx:739,1137-1150,189`; source "profile" = accounts with `service_requests` assigned (`clients/route.ts:27-37`); guard `api/v1/lawyer/clients/_link.ts` `assertLinkableAccount:33-80` (self-link refused `:53-55`; one card per account 409 `:40-50`). Column is `lawyer_clients.client_user_id` (`20260903_phase2:177`); no invite flow |
| «تم الربط: … عقود/طلبات/استشارات» | IMPLEMENTED | `propagateLink` `clients/route.ts:442-443`, `clients/[id]/route.ts:325-327`; message `clients/[id]/page.tsx:78-87,209` |
| «فكّ الربط» | IMPLEMENTED | `clients/[id]/page.tsx:713-718,229`; PATCH clears `api/v1/lawyer/clients/[id]/route.ts:222-233`; no on-screen text explaining contract retention |
| ز‏٢ «الخطة والحدود» tab for individual | IMPLEMENTED | `useSettingsTabs.ts:58`; `settingsReadiness.ts:168-170` |

### E — Public page `/lawyers/[slug]` and verification
- Page renders real data only: `app/lawyers/[slug]/page.tsx` (`:631-661,662-700,802-863,864-900,565-580`; print CSS `:271,290-299`).
- Beta gate: `app/lawyers/layout.tsx:27` `if (BETA_MONOPOLY_MODE) redirect("/services/lawyers")`; flag `lib/betaConfig.ts:46`. Owner: «مخفيّة بوضع البيتا، فلا تختبرها».
- Listing requirement: `api/v1/lawyers/[id]/route.ts:192-194` (`verification_status='verified'` + `marketplace_visible`); same gate in `api/v1/reviews/route.ts:172-178`; RLS `20260907:99-104`.
- Verification is admin-only: `PATCH /api/v1/admin/verifications/[id]` (`route.ts:58,73-77`, admin-gated `:28-38`, audited `:149-150`); queue `api/v1/admin/verifications/route.ts:58-158`; UI `dashboard/admin/users/[id]/page.tsx` + bulk «تحقق جماعي» `dashboard/admin/users/page.tsx:280,350-351,480-485`. `verification_status` not self-serve (`api/v1/profile/route.ts:331-333`).

### G — «مشاركة ملفي المهني 🔗» on `/dashboard/lawyer`
PARTIAL — button `dashboard/lawyer/page.tsx:649`; `canShareProfile = Boolean(userId) && !BETA_MONOPOLY_MODE` (`:348`) → disabled today; when enabled copies `${origin}/lawyers/${userId}` (`:357-363`) — **UUID, never slug**. The profile page's twin does it right: `profileData.slug || uid` (`profile/page.tsx:421-424`). File admits staleness at `page.tsx:329-347`.

### I — Tests
`lawyerProfileFields.test.ts:5-40` (slug rules, suggestion, education, courts/languages, price label); `contactSanitizer.test.ts:5-40`; `profileSettingsFields.test.ts:5-34`; `supabase/tests/rls/phase7_profile_services_reviews.test.sql:25-126` (columns, slug own/unique/format/reserved, B cannot touch A, services visibility, reviews once/completed/stranger, stats view). **Not covered:** `lawyer_services` HTTP routes, `POST /api/v1/reviews`, `/reviews/[id]/response`, anonymous-DTO redaction in `enrichReviews`.

## 2. Gaps & fixes (all application-side; **no migration required**)

- **G1 — MISSING «رابط ملفك العام» on profile page.** `dashboard/lawyer/profile/page.tsx` after `:782`: render a read-only public-link row whenever `profileData.slug` is set, independent of `canShareProfile`; compute `origin` in an effect; add the beta sentence «الدليل العام غير مُفعَّل خلال مرحلة التجربة، فالرابط لا يفتح بعد.» when `BETA_MONOPOLY_MODE`. Keep the share *button* gated.
- **G2 — MISSING الجنسية for lawyer.** `profileSettingsFields.ts:43-51`: add `{ key: "nationality", label: "الجنسية", placeholder: "سعودي", type: "text", target: "profile", maxLength: 60 }` (consider `firm`/`corporate` too — owner decision). Extend `profileSettingsFields.test.ts:22-27`.
- **G3 — PARTIAL «قبول عملاء جدد» not on profile page.** `profile/page.tsx`: add `isAcceptingClients` to `EMPTY_PROFILE` (`:94-142`), to `ProfileApiResponse.roleProfile` (`:267-281`), map in `load()` (`:298-323`), render a 4th tile in the status grid (`:697-736`) «يستقبل موكلين جدد» / «لا يستقبل موكلين جدداً حالياً», gated on `hasRoleProfile`.
- **G4 — PARTIAL dashboard share copies UUID.** Extract `src/lib/services/publicProfileLink.ts` (`copyToClipboard` + `canShareProfile` + URL builder `slug || userId`) and use it in both `dashboard/lawyer/page.tsx:309-363` and `profile/page.tsx:191-198,401-412`.
- **G5 — wording «ر.س» vs «ريال», «بحسب الحالة» vs «حسب الطلب».** `lawyerProfileFields.ts:126-132,106-111` + tests `:36-39`. Owner decision; site-wide.
- **G6 — DEFECT anonymous reviews de-anonymised by service title.** `api/v1/reviews/route.ts:100-121`: exclude anonymous rows from `requestIds`; pass `row.is_anonymous ? null : serviceTitleAr` at `:119-121`. Add a unit test for the redaction.
- **G7 — robustness note.** `edit/page.tsx:298,555,620` render the Phase-7 sections only when `"slug" in roleProfile` (i.e. only once `20260907` ran) — silent on a fresh/staging DB; add a one-line notice.
- Optional schema follow-up: reviewee-owned SELECT policy on `public.reviews` (today only `status='active'`), suggested `20260921_xx_reviews_owner_read_policy.sql` — not needed for ي/ك.
