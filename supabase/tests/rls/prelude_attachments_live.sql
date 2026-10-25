-- Chain step (NOT a migration) for soft_delete_case_records.test.sql.
--
-- stubs.sql gives public.attachments its 20260518 shape and policies, and
-- public.notifications a reduced shape. 20261025_51 runs against the LIVE
-- ones, copied verbatim here instead of loading all of 20260906 onto stubs:
--   * attachments_select_policy / attachments_insert_policy —
--     20260616_production_readiness_fixes.sql:82-109;
--   * the Phase 6 columns and "attachments owner update" —
--     20260906_phase6_settings_out_of_browser.sql:195-219;
--   * notifications.href — 20260518_client_workflow_backend_ready.sql:126-134
--     (user_id, title, body, href, read_at, created_at).
drop policy if exists "participants read attachments" on public.attachments;
drop policy if exists "participants insert attachments" on public.attachments;
drop policy if exists "attachments_select_policy" on public.attachments;
drop policy if exists "attachments_insert_policy" on public.attachments;

CREATE POLICY "attachments_select_policy" ON public.attachments
  FOR SELECT
  USING (
    owner_user_id = auth.uid()
    OR (
      request_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.service_requests
        WHERE service_requests.id = attachments.request_id
          AND (
            service_requests.requester_user_id = auth.uid()
            OR service_requests.assigned_to = auth.uid()
          )
      )
    )
  );

CREATE POLICY "attachments_insert_policy" ON public.attachments
  FOR INSERT
  WITH CHECK (
    owner_user_id = auth.uid()
  );

alter table public.attachments
  add column if not exists source      text not null default 'upload'
                             check (source in ('upload','generated','imported','contract_version')),
  add column if not exists deleted_at  timestamptz,
  add column if not exists deleted_by  uuid references auth.users(id) on delete set null,
  add column if not exists legal_hold  boolean not null default false,
  add column if not exists hold_reason text;
drop policy if exists "attachments owner update" on public.attachments;
create policy "attachments owner update" on public.attachments for update
  using (owner_user_id = auth.uid()
         or exists (select 1 from public.service_requests sr
                     where sr.id = attachments.request_id
                       and (sr.requester_user_id = auth.uid() or sr.assigned_to = auth.uid())))
  with check (owner_user_id = auth.uid()
         or exists (select 1 from public.service_requests sr
                     where sr.id = attachments.request_id
                       and (sr.requester_user_id = auth.uid() or sr.assigned_to = auth.uid())));
alter table public.attachments drop constraint if exists attachments_hold_blocks_delete_check;
alter table public.attachments add constraint attachments_hold_blocks_delete_check
  check (not (legal_hold and deleted_at is not null));

alter table public.notifications add column if not exists href text;

-- request_id is nullable on the live table (20260628_documents_upload.sql:13-14):
-- personal vault documents carry no case.
alter table public.attachments alter column request_id drop not null;
