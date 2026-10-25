-- Chain step (NOT a migration) for attachments_path_ownership.test.sql.
--
-- The INSERT policies the live database may still carry beside
-- attachments_insert_policy (prelude_attachments_live.sql), copied verbatim:
--   * "participants create attachments" — 20260518_client_workflow_backend_ready.sql:201-209
--     (any owner_user_id, any storage_path, on a request the caller filed);
--   * "users insert own attachments"    — 20260616_entities_setup_and_rls_fix.sql:727-729.
-- 20260616_production_readiness_fixes.sql drops neither. 20261026_65 must drop
-- all three by catalogue scan and leave exactly its own.
drop policy if exists "participants create attachments" on public.attachments;
create policy "participants create attachments"
  on public.attachments for insert
  with check (
    exists (
      select 1 from public.service_requests sr
      where sr.id = attachments.request_id
      and sr.requester_user_id = auth.uid()
    )
  );

drop policy if exists "users insert own attachments" on public.attachments;
create policy "users insert own attachments"
  on public.attachments for insert with check (owner_user_id = auth.uid());
