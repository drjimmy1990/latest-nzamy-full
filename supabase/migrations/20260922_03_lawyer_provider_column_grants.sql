-- =============================================================================
-- Migration: 20260922_03_lawyer_provider_column_grants.sql
-- =============================================================================
-- PURPOSE
--   Any signed-in lawyer can self-verify and self-credit through PostgREST:
--
--     PATCH /rest/v1/lawyer_profiles?user_id=eq.<me>
--       {"verification_status":"verified","credit_balance":999999}
--
--   succeeds today. `"lawyers update own profile"`
--   (20260603_phase1_001_profiles.sql:144-147) is row-scoped with NO column
--   list, and `authenticated` holds Supabase's default table-level UPDATE on
--   every table in `public`, so the row check is the ONLY check. The allowlist
--   `lawyerFields` in `src/app/api/v1/profile/route.ts:454-480` is a convention
--   of one route, not a database rule, and nothing forces a client through that
--   route. `public.provider_profiles` has the identical shape
--   ("providers update own profile", 20260603_phase1_001_profiles.sql:202-205).
--
--   THE SAME SHAPE IS OPEN ON EVERY OTHER ENTITY PROFILE TABLE — a row-scoped
--   "owner can update" policy, no column list, and a column consumers trust:
--     firm_profiles        "firm_profiles: owner can update"
--                          20260603_phase1_002_entities.sql:94 · 20260616:369
--                          · 20260921_03_entity_rls_recursion_fix.sql:280
--     business_profiles    "business_profiles: owner can update"
--                          20260603_phase1_002_entities.sql:274 · 20260616:450
--                          · 20260921_03:348
--     government_profiles  "government_profiles: owner can update"
--                          20260603_phase1_002_entities.sql:451 · 20260616:531
--                          · 20260921_03:416
--     ngo_profiles         "ngo_profiles: owner can update"
--                          20260603_phase1_002_entities.sql:621 · 20260616:612
--                          · 20260921_03:484
--     micro_profiles       "micro owners update own profile"
--                          20260603_phase1_001_profiles.sql:250-253
--   Each of the first four carries `verification_status` with exactly the
--   CHECK the lawyer table carries ('pending','verified','rejected',
--   'suspended') — a firm owner can hand his own office the verified badge the
--   admin verification queue exists to grant
--   (src/app/api/v1/admin/verifications/route.ts:88-94,160 lists firm_profiles
--   in that queue; src/app/api/v1/admin/erp/route.ts:84 downgrades an ERP row
--   on 'suspended'/'rejected'). They also carry the money-shaped columns
--   `plan_id` (read as the company's plan fallback at
--   src/app/api/v1/admin/corporates/route.ts:63), `annual_points_budget`,
--   `points_spent` and `max_seats`. `micro_profiles` has no
--   verification_status, but `litigation_boundary` is a capability switch
--   ('advisory_only' | 'marketplace_escalation' | 'case_tracking') the account
--   can flip on itself; it is included because the revoke costs nothing there
--   — the only RLS-scoped writer of that table writes `metadata` and nothing
--   else — not because a consumer reads it today.
--
--   A column-level REVOKE alone is a NO-OP while the table-level grant exists
--   (proven against this schema, and the same defect this repo already shipped
--   at 20260917_service_request_client_actions_rpc.sql:438). The only thing
--   that works is: REVOKE at the TABLE level, then GRANT back the columns the
--   RLS-scoped routes legitimately write.
--
-- CLOSES
--   docs/audits/2026-09-21-post-profiles-review.md — A6 (F04), CRITICAL, and
--   the same defect on the five entity tables the review did not enumerate.
--   Latent on the lawyer table only because production currently has 0
--   verified lawyers; the credit half (credit_balance /
--   free_briefs_remaining) is live today.
--
-- PREREQUISITES
--   * public.lawyer_profiles   — 20260603_phase1_001_profiles.sql:92
--       + city                              20260616_production_readiness_fixes.sql:19-21
--       + license_issued_on, office_address  20260906_phase6_settings_out_of_browser.sql:125-127
--       + slug, education, courts, languages, headline_ar, show_contact,
--         is_accepting_clients               20260907_phase7_profile_services_reviews.sql:45-51
--   * public.provider_profiles — 20260603_phase1_001_profiles.sql:157
--   * public.micro_profiles    — 20260603_phase1_001_profiles.sql:215
--   * public.firm_profiles, public.business_profiles,
--     public.government_profiles, public.ngo_profiles
--                              — 20260603_phase1_002_entities.sql:35,218,397,567,
--                                re-created in dependency order by
--                                20260616_entities_setup_and_rls_fix.sql:29-256
--   * !! public.business_profiles.legal_rep_name / .legal_rep_capacity
--     — 20260826_corporate_identity_persisted.sql:134-140. THAT FILE SAYS OF
--       ITSELF THAT IT DOES NOT APPLY ITSELF (…20260826:118-127). If it has
--       not been run, the `grant update (… legal_rep_name …)` below dies on
--       42703 and this migration rolls back whole. Apply 20260826 first. The
--       grant is deliberately NOT made conditional: a grant that silently
--       skips a column is the "looked applied, was a no-op" failure mode this
--       file exists to close.
--   * roles `anon` / `authenticated` — always present on a Supabase project.
--   Every statement is a GRANT/REVOKE, so the file is idempotent by nature and
--   safe to re-run. Nothing is written to any row.
--
-- WHAT IT REPLACES / REMOVES
--   No policy is dropped and no policy is created. The seven write policies
--   keep doing their job (deciding WHICH ROW); this file adds the layer that
--   decides WHICH COLUMN, which never existed.
--     * "lawyers update own profile"        20260603_phase1_001_profiles.sql:144-147  (kept)
--     * "providers update own profile"      20260603_phase1_001_profiles.sql:202-205  (kept)
--     * "micro owners update own profile"   20260603_phase1_001_profiles.sql:250-253  (kept)
--     * "<entity>_profiles: owner can update"  (kept — see the list above)
--     * "users insert own lawyer profile"   20260614_auto_create_role_profiles.sql:195-205
--     * "users insert own provider profile" 20260614_auto_create_role_profiles.sql:208-218
--     * "<entity>_profiles: owner can insert"  20260921_03:277,345,413,481
--       Every INSERT policy is left in place and becomes HARMLESS: with the
--       INSERT grant revoked, a policy that would have allowed the row is never
--       reached. Dropping them is a separate decision (they document intent)
--       and dropping them would not close anything this file leaves open.
--
-- WRITE-PATH AUDIT BEFORE SHIPPING THE REVOKE (grep -rn over src/, 2026-09-22)
--   RLS-scoped writers (createClient from @/lib/supabase/server => `authenticated`).
--   The sweep was, for each of the seven tables,
--       grep -rn -A4 'from("<table>")' src/ | grep -E '\.(update|insert|upsert|delete)\('
--   and what follows is its complete output minus the service-role hits listed
--   further down.
--     lawyer_profiles
--       src/app/api/v1/profile/route.ts:740-741   .update(lawyerUpdates)
--         lawyerUpdates is filtered by the `lawyerFields` allowlist at :454-480:
--         bio_ar, bio_en, specialties, years_experience, hourly_rate,
--         license_number, bar_association, city, marketplace_visible,
--         is_accepting_clients, show_contact, slug, education, courts,
--         languages, headline_ar, license_issued_on, office_address.
--         The same file's comment at :475-477 states that license_expiry is
--         deliberately NOT in that list — so it gets no grant here either.
--       src/app/api/v1/settings/preferences/route.ts:79-80
--         .update({ display_mode }) — the dashboard-mode mirror. This column is
--         MISSING from the review's draft grant list; without it the Phase 6
--         dashboard-mode toggle would start logging a 42501 the day this lands.
--     firm_profiles
--       src/app/api/v1/settings/preferences/route.ts:89-90
--         .update({ display_mode }) — the SAME mirror, `userType === "firm"`
--         branch, keyed on owner_user_id. Exactly the column the lawyer half
--         nearly lost; a firm-only 42501 is the shape this would have taken.
--       src/app/api/v1/profile/route.ts:794-795   .update({ metadata: merged })
--         entityProfileTableFor('firm') = 'firm_profiles'
--         (src/lib/services/profileSettingsFields.ts:100-110).
--     provider_profiles · micro_profiles · government_profiles · ngo_profiles
--       src/app/api/v1/profile/route.ts:794-795   .update({ metadata: merged })
--         is their ONLY RLS-scoped write. Every settings field those four types
--         offer is declared `target: "entitySettings"`
--         (…profileSettingsFields.ts:61-91), i.e. it lands inside
--         metadata->'settings'. No UI writes a real column on any of them, so
--         `metadata` is the whole legitimate surface.
--         entityProfileTableFor('lawyer') returns NULL, so this write can never
--         reach lawyer_profiles.metadata — lawyer metadata gets no grant.
--     business_profiles
--       src/app/api/v1/profile/route.ts:794-795   .update({ metadata: merged })
--         entityProfileTableFor('corporate') = 'business_profiles'.
--       src/app/api/v1/profile/route.ts:810-811   .update(businessProfilePatch)
--         businessProfilePatch is built by validateBusinessProfilePatch
--         (src/lib/services/profileEntityFields.ts:240-310) and can contain
--         exactly: company_name_ar, cr_number, legal_rep_name,
--         legal_rep_capacity, service_model, has_legal_dept. The route's own
--         `.select(...)` at :812-815 names the same six. Owner-only per
--         route.ts:705-719, but that gate is application code — the grant is
--         what a raw PostgREST PATCH meets.
--   RLS-scoped READERS (unaffected — SELECT is not touched by this file):
--     src/app/api/v1/profile/route.ts:115,271,279,287,327,361,774
--     · community/posts/[id]/route.ts:87 · community/posts/[id]/answers/route.ts:56
--     · reviews/route.ts:181 · lawyers/route.ts:71 · lawyers/[id]/route.ts:57
--     · access-control.ts:297 · firm/members/route.ts:104
--     · firm/members/[memberId]/route.ts:86 · business/members/route.ts:166,198,357
--     · business/members/[memberId]/route.ts:97 · me/invitations/route.ts:147
--     · service-requests/route.ts:32,38 · firm/activity/route.ts:43
--     · hooks/useUser.ts:623,629 · lib/auth/firmMembershipAccess.ts:27,56
--     · components/dashboard/business/BusinessProfileReadinessPanel.tsx:92
--   INSERT paths — none is RLS-scoped:
--     public.handle_new_user() (SECURITY DEFINER, latest body at
--       20260921_04_profiles_phone_e164_check.sql:300,314) does the signup rows
--       for all seven tables.
--     src/app/api/v1/onboarding/account-type/route.ts:200,212,223 —
--       provisionSectorRow(service, …) (:189), and `service` is
--       createServiceClient() (:312), i.e. service_role / BYPASSRLS. This is
--       the one `.from(<variable>)` write path in the codebase that reaches all
--       six sector tables; it is not affected by the INSERT revoke.
--     No browser-side insert exists (grep over src/app/register/**,
--       src/app/onboarding/**: no .from() write at all), and
--       src/app/dashboard/lawyer/profile/edit/page.tsx:160-166 documents in
--       product copy that nothing in the platform creates a lawyer_profiles row.
--   ADMIN / BACKEND writers — all service_role, all unaffected:
--     src/app/api/v1/admin/verifications/[id]/route.ts:74,98,121
--       (verification_status on lawyer_profiles, provider_profiles, firm_profiles)
--     src/app/api/v1/admin/credits/route.ts:134 · src/lib/entitlements.ts:253
--       (credit_balance) · src/app/api/v1/admin/users/[id]/route.ts:85
--     src/app/api/v1/admin/corporates/route.ts:138 (business_profiles.metadata)
--
-- COLUMNS DELIBERATELY LEFT UNGRANTED (the point of the file)
--   lawyer_profiles    : verification_status (the trust badge — self-verification
--                        is the finding), credit_balance, credit_package,
--                        credit_expiry, free_briefs_remaining (self-minted money),
--                        active_roles (role escalation), metadata (no RLS writer),
--                        bar_membership_number and license_expiry (no RLS writer;
--                        route.ts:475-477 names license_expiry as out of scope),
--                        user_id, created_at.
--   provider_profiles  : verification_status, sub_role (chosen once, written by
--                        the service client at onboarding), license_number,
--                        license_expiry, hourly_rate, service_areas, availability,
--                        marketplace_visible, user_id, created_at.
--   firm_profiles      : verification_status, plan_id, annual_points_budget,
--                        points_spent, max_seats (budget and seat ceiling),
--                        license_number, license_expiry, cr_number,
--                        unified_number_700, managing_partner_name,
--                        managing_partner_license (statutory identity — no
--                        screen writes them; the firm identity form is still
--                        unbuilt and must arrive with its own grant), name_ar,
--                        name_en, size, structure, practice_model, branches,
--                        departments, branding, owner_user_id, created_at.
--   business_profiles  : verification_status, plan_id, size, legal_structure,
--                        company_name_en, owner_user_id, created_at.
--   government_profiles: verification_status, role (judge / prosecutor /
--                        officer / counsel — a claim about state office),
--                        restricted_from (the Chinese-wall list; a self-write
--                        would let an account erase its own conflict bar),
--                        integrations, entity_type, entity_name_ar,
--                        entity_name_en, plan_id, owner_user_id, created_at.
--   ngo_profiles       : verification_status, compliance_status, plan_id,
--                        org_type, org_name_ar, org_name_en, volunteer_count,
--                        program_count, board_seats, reporting_cycle,
--                        owner_user_id, created_at.
--   micro_profiles     : litigation_boundary (capability switch),
--                        requirements_score, license_count, business_name,
--                        business_type, employee_count, user_id, created_at.
--   `updated_at` IS granted on all seven, although no RLS-scoped writer sends
--   it and the BEFORE UPDATE trigger (set_*_updated_at / trg_*_updated_at →
--   public.handle_updated_at()) overwrites whatever arrives: column privileges
--   are checked against the statement's SET list, never against what a trigger
--   assigns, so this grant carries no privilege — it only keeps a future writer
--   that sends the column from dying on a 42501.
--
-- WHAT THIS FILE NARROWS BUT DOES NOT CLOSE
--   `metadata` is granted on six tables because PATCH /api/v1/profile writes
--   metadata->'settings' there. A raw PostgREST PATCH can therefore still
--   replace the WHOLE jsonb, including sibling keys the owner never sees in
--   the settings form — most concretely `business_profiles.metadata.features`,
--   the corporate feature-flag bag the admin console writes and reads back
--   (src/app/api/v1/admin/corporates/route.ts:58,124-140). Today that bag is
--   read by nothing but that same admin listing, so the reach is an admin
--   screen showing flags the company set on itself, not an entitlement. A
--   column grant cannot express "this key but not that key"; closing it needs
--   either a BEFORE UPDATE trigger that pins the privileged keys or moving
--   `features` off the self-writable column. Out of scope here, and strictly
--   narrower than today, where `authenticated` may write every column.
--
-- ROLLBACK
--   grant insert, update on public.lawyer_profiles     to authenticated;
--   grant insert, update on public.provider_profiles   to authenticated;
--   grant insert, update on public.firm_profiles       to authenticated;
--   grant insert, update on public.business_profiles   to authenticated;
--   grant insert, update on public.government_profiles to authenticated;
--   grant insert, update on public.ngo_profiles        to authenticated;
--   grant insert, update on public.micro_profiles      to authenticated;
--   — which re-opens A6/F04 in full, on all seven tables.
-- =============================================================================

begin;

-- ── 1. lawyer_profiles ──────────────────────────────────────────────────────
-- Table level first: a column-level REVOKE against a live table-level GRANT
-- changes nothing at all. Revoking UPDATE at the table level also drops every
-- column-level UPDATE grant the role held on this table, so the GRANT below is
-- the complete, authoritative list after this statement — re-running the file
-- can never accumulate stale column grants. The same holds for each table
-- below.
revoke insert, update on public.lawyer_profiles from authenticated, anon;

grant update (
  -- PATCH /api/v1/profile -> lawyerFields (src/app/api/v1/profile/route.ts:454-480)
  bio_ar,
  bio_en,
  specialties,
  years_experience,
  hourly_rate,
  license_number,        -- a claim, not a credential: verification_status is what admins decide
  bar_association,       -- same
  city,
  marketplace_visible,   -- listing needs verification_status = 'verified' too, and that is ungranted
  is_accepting_clients,
  show_contact,
  slug,
  education,
  courts,
  languages,
  headline_ar,
  license_issued_on,
  office_address,
  -- PATCH /api/v1/settings/preferences -> dashboard-mode mirror (route.ts:79-80)
  display_mode,
  -- trigger-overwritten; granted so a writer that sends it is not refused
  updated_at
) on public.lawyer_profiles to authenticated;

-- ── 2. provider_profiles ────────────────────────────────────────────────────
revoke insert, update on public.provider_profiles from authenticated, anon;

grant update (
  metadata,     -- metadata->'settings' is the ONLY provider surface the UI writes
  updated_at
) on public.provider_profiles to authenticated;

-- ── 3. firm_profiles ────────────────────────────────────────────────────────
-- The only entity table with TWO legitimate self-service surfaces: the
-- dashboard-mode mirror and the settings bag.
revoke insert, update on public.firm_profiles from authenticated, anon;

grant update (
  -- PATCH /api/v1/settings/preferences, firm branch (route.ts:89-90)
  display_mode,
  -- PATCH /api/v1/profile -> entitySettings -> metadata->'settings'
  metadata,
  updated_at
) on public.firm_profiles to authenticated;

-- ── 4. business_profiles ────────────────────────────────────────────────────
-- The six identity columns come from validateBusinessProfilePatch
-- (src/lib/services/profileEntityFields.ts:240-310); `metadata` is the same
-- entitySettings bag every other entity type uses.
revoke insert, update on public.business_profiles from authenticated, anon;

grant update (
  company_name_ar,
  cr_number,
  legal_rep_name,        -- requires 20260826_corporate_identity_persisted.sql
  legal_rep_capacity,    -- requires 20260826_corporate_identity_persisted.sql
  service_model,
  has_legal_dept,
  metadata,
  updated_at
) on public.business_profiles to authenticated;

-- ── 5. government_profiles ──────────────────────────────────────────────────
-- `role` and `restricted_from` are the reason this table is in the file.
revoke insert, update on public.government_profiles from authenticated, anon;

grant update (
  metadata,
  updated_at
) on public.government_profiles to authenticated;

-- ── 6. ngo_profiles ─────────────────────────────────────────────────────────
revoke insert, update on public.ngo_profiles from authenticated, anon;

grant update (
  metadata,
  updated_at
) on public.ngo_profiles to authenticated;

-- ── 7. micro_profiles ───────────────────────────────────────────────────────
revoke insert, update on public.micro_profiles from authenticated, anon;

grant update (
  metadata,
  updated_at
) on public.micro_profiles to authenticated;

comment on table public.lawyer_profiles is
  'Lawyer-specific profile data. Self-service writes are column-scoped: authenticated holds UPDATE only on the PATCH /api/v1/profile allowlist plus display_mode. verification_status, credit_balance, credit_package, credit_expiry, free_briefs_remaining and active_roles are admin/service-role territory and carry no grant; INSERT is revoked (the row is born in handle_new_user).';

comment on table public.provider_profiles is
  'Service-provider profile data. Self-service writes are column-scoped: authenticated holds UPDATE only on metadata (metadata->''settings'', PATCH /api/v1/profile) and updated_at. verification_status and sub_role carry no grant; INSERT is revoked (service-role onboarding / handle_new_user).';

comment on table public.firm_profiles is
  'Law-firm entity profile. Self-service writes are column-scoped: authenticated holds UPDATE only on display_mode (PATCH /api/v1/settings/preferences), metadata (metadata->''settings'') and updated_at. verification_status, plan_id, annual_points_budget, points_spent, max_seats and the statutory identity columns carry no grant; INSERT is revoked.';

comment on table public.business_profiles is
  'Corporate entity profile. Self-service writes are column-scoped: authenticated holds UPDATE only on the six identity columns PATCH /api/v1/profile validates (company_name_ar, cr_number, legal_rep_name, legal_rep_capacity, service_model, has_legal_dept) plus metadata and updated_at. verification_status and plan_id carry no grant; INSERT is revoked.';

comment on table public.government_profiles is
  'Government entity profile. Self-service writes are column-scoped: authenticated holds UPDATE only on metadata (metadata->''settings'') and updated_at. verification_status, role and restricted_from (the conflict-of-interest wall) carry no grant; INSERT is revoked.';

comment on table public.ngo_profiles is
  'NGO / charity / waqf entity profile. Self-service writes are column-scoped: authenticated holds UPDATE only on metadata (metadata->''settings'') and updated_at. verification_status, compliance_status and plan_id carry no grant; INSERT is revoked.';

comment on table public.micro_profiles is
  'Micro/small-business profile. Self-service writes are column-scoped: authenticated holds UPDATE only on metadata (metadata->''settings'') and updated_at. litigation_boundary, requirements_score and license_count carry no grant; INSERT is revoked.';

-- ── 8. Read-only verification — raises, so the transaction rolls back ───────
-- has_column_privilege(), NOT information_schema.role_table_grants: that view
-- shows grants made directly to the named role and misses a privilege reaching
-- it through role membership or PUBLIC — which is exactly the class of bug
-- ("the REVOKE looked applied and was a no-op") this migration exists to close.
--
-- Table-DRIVEN, not unrolled per table. The first version of this block hand-
-- wrote each assertion and checked `anon` on one table's forbidden list and not
-- the other's; a loop cannot drift that way, and an eighth table added later
-- gets every check for free instead of only the ones someone remembered.
--
-- DUPLICATED ON PURPOSE: supabase/migrations/_verify.sql carries the same
-- allowed/forbidden arrays, so a deploy re-checks them without re-running this
-- file. Widen a grant below and you must widen it THERE TOO - otherwise the
-- next deploy stops on "authenticated can UPDATE <table> columns outside the
-- allowlist". That drift is fail-closed, but it surfaces on someone else's
-- change, so touch both copies in the same edit.
do $$
declare
  spec   record;
  c      text;
  leaked text;
  n      int;
  tables int := 0;
begin
  for spec in
    select * from (values
      ('lawyer_profiles',
       array['bio_ar','bio_en','specialties','years_experience','hourly_rate',
             'license_number','bar_association','city','marketplace_visible',
             'is_accepting_clients','show_contact','slug','education','courts',
             'languages','headline_ar','license_issued_on','office_address',
             'display_mode','updated_at']::text[],
       array['verification_status','credit_balance','credit_package','credit_expiry',
             'free_briefs_remaining','active_roles','metadata','user_id']::text[],
       'lawyers update own profile'),
      ('provider_profiles',
       array['metadata','updated_at']::text[],
       array['verification_status','sub_role','license_number','license_expiry',
             'hourly_rate','service_areas','availability','marketplace_visible',
             'user_id']::text[],
       'providers update own profile'),
      ('firm_profiles',
       array['display_mode','metadata','updated_at']::text[],
       array['verification_status','plan_id','annual_points_budget','points_spent',
             'max_seats','license_number','license_expiry','name_ar','branding',
             'owner_user_id']::text[],
       'firm_profiles: owner can update'),
      ('business_profiles',
       array['company_name_ar','cr_number','legal_rep_name','legal_rep_capacity',
             'service_model','has_legal_dept','metadata','updated_at']::text[],
       array['verification_status','plan_id','size','legal_structure',
             'company_name_en','owner_user_id']::text[],
       'business_profiles: owner can update'),
      ('government_profiles',
       array['metadata','updated_at']::text[],
       array['verification_status','role','restricted_from','integrations',
             'entity_type','plan_id','owner_user_id']::text[],
       'government_profiles: owner can update'),
      ('ngo_profiles',
       array['metadata','updated_at']::text[],
       array['verification_status','compliance_status','plan_id','org_type',
             'board_seats','owner_user_id']::text[],
       'ngo_profiles: owner can update'),
      ('micro_profiles',
       array['metadata','updated_at']::text[],
       array['litigation_boundary','requirements_score','license_count',
             'employee_count','user_id']::text[],
       'micro owners update own profile')
    ) as t(tbl, allowed, forbidden, policy_name)
  loop
    tables := tables + 1;

    -- 8a. every forbidden column really is unwritable, for BOTH roles.
    --     `anon` is checked on every table, not just the first: a REVOKE that
    --     names only `authenticated` leaves the anon key writing rows, and the
    --     anon key is the one that ships to the browser.
    foreach c in array spec.forbidden loop
      if has_column_privilege('authenticated', 'public.' || spec.tbl, c, 'UPDATE') then
        raise exception '20260922_03 verify: authenticated can still UPDATE public.%.%', spec.tbl, c;
      end if;
      if has_column_privilege('anon', 'public.' || spec.tbl, c, 'UPDATE') then
        raise exception '20260922_03 verify: anon can still UPDATE public.%.%', spec.tbl, c;
      end if;
    end loop;

    -- 8b. every allowed column really is writable (a typo here would break a
    --     settings screen with an Arabic 500 instead of failing loudly now)
    foreach c in array spec.allowed loop
      if not has_column_privilege('authenticated', 'public.' || spec.tbl, c, 'UPDATE') then
        raise exception '20260922_03 verify: authenticated LOST UPDATE on public.%.% — its write path would 500', spec.tbl, c;
      end if;
    end loop;

    -- 8c. nothing OUTSIDE the allowlist is writable by authenticated, including
    --     columns added after this file was written …
    --     CAVEAT, mirrored in the _verify.sql copy: information_schema.columns
    --     is privilege-filtered, so a role that neither owns these tables nor
    --     holds a privilege on them would see no rows here and this check - the
    --     strongest in the block - would pass vacuously. Exact on the migration
    --     path (owner); the catalog-level form that is immune is in the
    --     re-check recipe at the foot of this file. Swap BOTH copies or neither.
    select string_agg(column_name, ', ' order by column_name) into leaked
      from information_schema.columns
     where table_schema = 'public' and table_name = spec.tbl
       and not (column_name = any (spec.allowed))
       and has_column_privilege('authenticated', 'public.' || spec.tbl, column_name, 'UPDATE');
    if leaked is not null then
      raise exception '20260922_03 verify: authenticated can UPDATE % columns outside the allowlist: %', spec.tbl, leaked;
    end if;

    --     … and NOTHING AT ALL is writable by anon, on any column of any of
    --     these tables. anon has no legitimate write here, so its allowlist is
    --     empty and this is the symmetric form of the check above.
    select string_agg(column_name, ', ' order by column_name) into leaked
      from information_schema.columns
     where table_schema = 'public' and table_name = spec.tbl
       and has_column_privilege('anon', 'public.' || spec.tbl, column_name, 'UPDATE');
    if leaked is not null then
      raise exception '20260922_03 verify: anon can UPDATE % columns: %', spec.tbl, leaked;
    end if;

    -- 8d. INSERT is gone for both roles …
    if has_table_privilege('authenticated', 'public.' || spec.tbl, 'INSERT') then
      raise exception '20260922_03 verify: authenticated can still INSERT into public.%', spec.tbl;
    end if;
    if has_table_privilege('anon', 'public.' || spec.tbl, 'INSERT') then
      raise exception '20260922_03 verify: anon can still INSERT into public.%', spec.tbl;
    end if;
    -- … and SELECT survives: every reader listed in the header depends on it.
    if not has_table_privilege('authenticated', 'public.' || spec.tbl, 'SELECT') then
      raise exception '20260922_03 verify: authenticated LOST SELECT on public.% — the profile and directory reads would 401', spec.tbl;
    end if;

    -- 8e. the row-scoping policy is still there (the column layer replaces
    --     nothing; it is added beneath it). polcmd 'w' = FOR UPDATE.
    select count(*) into n from pg_policy
     where polrelid = ('public.' || spec.tbl)::regclass
       and polname  = spec.policy_name
       and polcmd   = 'w';
    if n <> 1 then
      raise exception '20260922_03 verify: the row-scoped UPDATE policy "%" on % is missing', spec.policy_name, spec.tbl;
    end if;
  end loop;

  if tables <> 7 then
    raise exception '20260922_03 verify: checked % tables, expected 7', tables;
  end if;

  raise notice '20260922_03 verify: OK — UPDATE column-scoped and INSERT revoked on all 7 profile tables (lawyer 20 columns, business 8, firm 3, provider/government/ngo/micro 2 each); anon may write nothing on any of them';
end $$;

commit;

-- Read-only re-check after applying (SQL Editor):
--   select c.relname, a.attname,
--          has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE') as can_update
--     from pg_attribute a join pg_class c on c.oid = a.attrelid
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public'
--      and c.relname in ('lawyer_profiles','provider_profiles','firm_profiles',
--                        'business_profiles','government_profiles','ngo_profiles',
--                        'micro_profiles')
--      and a.attnum > 0 and not a.attisdropped
--    order by c.relname, can_update desc, a.attname;
--   select t.relname,
--          has_table_privilege('authenticated','public.'||t.relname,'INSERT') as auth_insert,
--          has_table_privilege('anon','public.'||t.relname,'INSERT')          as anon_insert
--     from pg_class t join pg_namespace n on n.oid = t.relnamespace
--    where n.nspname = 'public'
--      and t.relname in ('lawyer_profiles','provider_profiles','firm_profiles',
--                        'business_profiles','government_profiles','ngo_profiles',
--                        'micro_profiles')
--    order by t.relname;
