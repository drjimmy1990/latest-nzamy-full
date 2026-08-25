-- ============================================================
-- Migration: 20260815_marketplace_excludes_ai_workspace.sql
-- Purpose:  Keep AI service orders out of the lawyer marketplace
--           browse clause of service_requests_select_policy.
--
--           The marketplace browse clause had no receiver filter
--           because it predates ai_workspace. AI service orders are
--           created with assigned_to IS NULL / status =
--           'pending_assignment', so they fell into lawyer
--           marketplace browse and exposed metadata.intake PII
--           (case narrative, party names, national ID / commercial
--           registration numbers, judgment text, private notes) to
--           every verified lawyer on the platform.
--
--           Surgical fix: exclude that one receiver value from the
--           marketplace clause. Every other clause of the policy
--           (requester_user_id = auth.uid(), assigned_to =
--           auth.uid(), the verified-lawyer EXISTS subquery, the
--           assigned_to/status conditions) is unchanged.
--
-- Idempotent: DROP POLICY IF EXISTS then CREATE POLICY.
-- ============================================================

begin;

DROP POLICY IF EXISTS "service_requests_select_policy" ON public.service_requests;

CREATE POLICY "service_requests_select_policy" ON public.service_requests
  FOR SELECT
  USING (
    -- Creator can always read
    requester_user_id = auth.uid()
    -- Assigned lawyer can read
    OR assigned_to = auth.uid()
    -- Verified lawyers can browse unassigned requests in marketplace,
    -- excluding AI service orders (receiver = 'ai_workspace'), which
    -- are routed to the platform's own fulfillment team, not the
    -- lawyer marketplace. General rule for whoever next extends the
    -- receiver CHECK constraint: any receiver value that represents
    -- platform-internal fulfillment (work handled by the platform's
    -- own team, never assigned out to a marketplace lawyer) belongs
    -- on this exclusion list alongside 'ai_workspace' — it is not
    -- unassigned marketplace work just because assigned_to happens
    -- to be NULL.
    OR (
      EXISTS (
        SELECT 1 FROM public.lawyer_profiles
        WHERE lawyer_profiles.user_id = auth.uid()
          AND lawyer_profiles.verification_status = 'verified'
      )
      AND assigned_to IS NULL
      AND status IN ('pending', 'pending_assignment')
      AND receiver <> 'ai_workspace'
    )
  );

commit;

-- ── Verification (read-only; run manually against Supabase) ───
--
--   select pg_get_expr(polqual, polrelid)
--   from pg_policy
--   where polname = 'service_requests_select_policy';
--
-- Expect the output to contain `receiver <> 'ai_workspace'`, and to
-- still contain both `requester_user_id = auth.uid()` and
-- `assigned_to = auth.uid()`.
