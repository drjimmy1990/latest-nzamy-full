-- letterhead_verify_card.test.sql — proves 20261103_69 (q343: the short card a
-- verified, unpublished lawyer's QR opens, and its privacy switch) and its
-- _verify block.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 69 runs TWICE.
-- It needs only branding_vaults (63) and the live lawyer_profiles columns; no
-- migration of the skipped firm tasks (R32). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_letterhead_verify_card_block.sql
--   sed -n '/^-- >>> verify:letterhead_verify_card/,/^-- <<< verify:letterhead_verify_card/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $R/prelude_storage_objects_stub.sql $R/prelude_storage_buckets_stub.sql \
--     $R/prelude_account_deletion_requests_stub.sql \
--     $M/20261026_63_branding_vault.sql \
--     $R/prelude_lawyer_profiles_live.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20261025_50_profile_visibility.sql \
--     $M/20261103_69_letterhead_verify_card.sql \
--     $M/20261103_69_letterhead_verify_card.sql \
--     "$B" \
--     $R/letterhead_verify_card.test.sql
--
-- NEGATIVE CONTROLS (each must FAIL; recorded 2026-11-05):
--   NC1 — the card without its verified test (sed the condition out of a copy of
--     the migration) → "T3 FAIL: an unverified lawyer got a card".
--   NC2 — the card without qr_verify_card → "T2 FAIL: the switch is off, yet a card".
--   NC3 — grant update (qr_verify_card) to authenticated → the _verify block
--     stops first: "authenticated can write branding_vaults.qr_verify_card"
--     (T7 proves the same refusal for a real session).
--   NC4 — the card without its frozen-account test (sed the "not exists" out of a
--     copy of the migration) → "T10 FAIL: a frozen account (requested) still shows a card".
--   NC5 — the chain without the account_deletion_requests prelude → the migration
--     stops: "20261103_69: public.account_deletion_requests does not exist".
--
-- People: L verified, unpublished · L2 verified, published · U unverified ·
--         S suspended · firm F (a vault with a token, to prove firms get no card).
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

-- stubs.sql's profiles has no phone; production's does, and T9 must prove it stays out.
alter table public.profiles add column if not exists phone text;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3'), ('00000000-0000-0000-0000-0000000000a4'),
  ('00000000-0000-0000-0000-0000000000b0');
insert into public.profiles (id, user_type, display_name, email, phone) values
  ('00000000-0000-0000-0000-0000000000a1', 'lawyer', 'اسم الحساب', 'l@secret.example', '0500000001'),
  ('00000000-0000-0000-0000-0000000000a2', 'lawyer', 'منشور', 'l2@secret.example', '0500000002'),
  ('00000000-0000-0000-0000-0000000000a3', 'lawyer', 'غير موثق', 'u@secret.example', '0500000003'),
  ('00000000-0000-0000-0000-0000000000a4', 'lawyer', 'موقوف', 's@secret.example', '0500000004'),
  ('00000000-0000-0000-0000-0000000000b0', 'firm', 'مالك', 'f@secret.example', '0500000005');
insert into public.lawyer_profiles (user_id, license_number, verification_status, marketplace_visible, slug) values
  ('00000000-0000-0000-0000-0000000000a1', '12345', 'verified', false, 'hidden-slug'),
  ('00000000-0000-0000-0000-0000000000a2', '67890', 'verified', true, 'public-slug'),
  ('00000000-0000-0000-0000-0000000000a3', '11111', 'pending', false, null),
  ('00000000-0000-0000-0000-0000000000a4', '22222', 'suspended', false, null);
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b0', 'مكتب ف');
insert into public.branding_vaults (id, lawyer_user_id, display_name_ar) values
  ('11111111-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', ''),
  ('11111111-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2', 'مكتب المنشور'),
  ('11111111-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a3', 'مكتب غير موثق'),
  ('11111111-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a4', 'مكتب موقوف');
insert into public.branding_vaults (id, firm_id, display_name_ar) values
  ('11111111-0000-0000-0000-0000000000f1', 'ffffffff-0000-0000-0000-0000000000f1', 'مكتب ف');

-- ── T0 shape: two columns, no overload, the switch on by default ─────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'branding_vaults' and column_name = 'qr_verify_card'
                    and is_nullable = 'NO' and column_default = 'true') then
    raise exception 'T0a FAIL: qr_verify_card is not NOT NULL DEFAULT true';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'letterhead_verification_card') <> 1
     or (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'mint_letterhead_verify_token') <> 1 then
    raise exception 'T0b FAIL: a function has an overload after two runs';
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.branding_vaults'::regclass) <> 3 then
    raise exception 'T0c FAIL: the policies of branding_vaults changed: no RLS change is allowed here';
  end if;
  begin
    update public.branding_vaults set verify_token = 'too-short' where id = '11111111-0000-0000-0000-0000000000a1';
    raise exception 'T0d FAIL: a malformed token was stored';
  exception when check_violation then null;
  end;
  raise notice 'T0 PASS: the switch defaults on, no overload, the 3 policies untouched, the token''s shape is checked';
end $$;

-- ── T1, T6 the mint keeps the first token; the card shows the three facts ────
set role service_role;
do $$
declare v_tok text; v jsonb;
begin
  v_tok := public.mint_letterhead_verify_token('11111111-0000-0000-0000-0000000000a1', 'abcdefghijklmnopqrstuvwxyz234567');
  if v_tok is distinct from 'abcdefghijklmnopqrstuvwxyz234567' then raise exception 'T1a FAIL: the mint returned %', v_tok; end if;

  v_tok := public.mint_letterhead_verify_token('11111111-0000-0000-0000-0000000000a1', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  if v_tok is distinct from 'abcdefghijklmnopqrstuvwxyz234567' then raise exception 'T6 FAIL: a second mint replaced the token: %', v_tok; end if;

  v := public.letterhead_verification_card('abcdefghijklmnopqrstuvwxyz234567');
  if v->>'state' is distinct from 'card' then raise exception 'T1b FAIL: %', v; end if;
  if v->>'name' is distinct from 'اسم الحساب' then raise exception 'T1c FAIL: an empty vault name falls to the profile''s: %', v; end if;
  if v->>'licence' is distinct from '12345' then raise exception 'T1d FAIL: %', v; end if;
  if (v->>'published')::boolean is distinct from false then raise exception 'T1e FAIL: %', v; end if;
  if v->'slug' <> 'null'::jsonb then raise exception 'T1f FAIL: an unpublished lawyer''s slug left the database: %', v; end if;

  -- T9: exactly the listed keys, and no identifier anywhere in the text.
  if (select array_agg(k order by k) from jsonb_object_keys(v) k) <> array['licence', 'name', 'published', 'slug', 'state'] then
    raise exception 'T9a FAIL: unexpected keys: %', v;
  end if;
  if v::text ~ '00000000-0000|secret\.example|05000000|11111111-0000' then
    raise exception 'T9b FAIL: an id, e-mail or phone in the card: %', v;
  end if;
  raise notice 'T1, T6, T9 PASS: a verified unpublished lawyer gets a card of name, licence and state only; the first token stays';
end $$;
reset role;

-- A published lawyer's card links his profile; his vault's own name wins.
update public.branding_vaults set verify_token = '22222222222222222222222222222222' where id = '11111111-0000-0000-0000-0000000000a2';
set role service_role;
do $$
declare v jsonb;
begin
  v := public.letterhead_verification_card('22222222222222222222222222222222');
  if v->>'state' <> 'card' or v->>'name' <> 'مكتب المنشور' or (v->>'published')::boolean is not true or v->>'slug' <> 'public-slug' then
    raise exception 'T1g FAIL: %', v;
  end if;
  raise notice 'T1g PASS: published shows its slug and the vault''s name';
end $$;
reset role;

-- ── T2–T5 every other answer is the same one word: no oracle ─────────────────
update public.branding_vaults set verify_token = '33333333333333333333333333333333' where id = '11111111-0000-0000-0000-0000000000a3';
update public.branding_vaults set verify_token = '44444444444444444444444444444444' where id = '11111111-0000-0000-0000-0000000000a4';
update public.branding_vaults set verify_token = '55555555555555555555555555555555' where id = '11111111-0000-0000-0000-0000000000f1';
update public.branding_vaults set qr_verify_card = false where id = '11111111-0000-0000-0000-0000000000a2';
set role service_role;
do $$
declare
  home constant jsonb := '{"state": "home"}'::jsonb;
  v jsonb;
begin
  v := public.letterhead_verification_card('22222222222222222222222222222222');
  if v is distinct from home then raise exception 'T2 FAIL: the switch is off, yet a card: %', v; end if;
  v := public.letterhead_verification_card('33333333333333333333333333333333');
  if v is distinct from home then raise exception 'T3 FAIL: an unverified lawyer got a card: %', v; end if;
  v := public.letterhead_verification_card('44444444444444444444444444444444');
  if v is distinct from home then raise exception 'T3b FAIL: a suspended lawyer got a card: %', v; end if;
  v := public.letterhead_verification_card('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  if v is distinct from home then raise exception 'T4 FAIL: an unknown token: %', v; end if;
  v := public.letterhead_verification_card('55555555555555555555555555555555');
  if v is distinct from home then raise exception 'T5 FAIL: a firm vault got a card: %', v; end if;
  foreach v in array array[to_jsonb(''::text), to_jsonb('short'::text), to_jsonb('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'::text), to_jsonb('00000000-0000-0000-0000-0000000000a1'::text)] loop
    if public.letterhead_verification_card(v #>> '{}') is distinct from home then raise exception 'T4b FAIL: malformed token %', v; end if;
  end loop;
  if public.letterhead_verification_card(null) is distinct from home then raise exception 'T4c FAIL: a null token'; end if;
  raise notice 'T2–T5 PASS: off, unverified, suspended, unknown, malformed and firm all answer the same {"state":"home"}';
end $$;
reset role;

-- The switch back on: the paper already printed works again, same token.
update public.branding_vaults set qr_verify_card = true where id = '11111111-0000-0000-0000-0000000000a2';
do $$
begin
  if public.letterhead_verification_card('22222222222222222222222222222222')->>'state' <> 'card' then
    raise exception 'T2b FAIL: turning the switch back on did not restore the card';
  end if;
  raise notice 'T2b PASS: the switch is reversible, the token does not change';
end $$;

-- ── T7 a session cannot write either column, even on his own vault ───────────
set role authenticated;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  begin
    update public.branding_vaults set qr_verify_card = false where id = '11111111-0000-0000-0000-0000000000a1';
    raise exception 'T7 FAIL: a session wrote qr_verify_card';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.branding_vaults set verify_token = 'cccccccccccccccccccccccccccccccc' where id = '11111111-0000-0000-0000-0000000000a1';
    raise exception 'T7b FAIL: a session wrote verify_token';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.branding_vaults (lawyer_user_id, verify_token) values ('00000000-0000-0000-0000-0000000000a1', 'cccccccccccccccccccccccccccccccc');
    raise exception 'T7c FAIL: a session inserted verify_token';
  exception when insufficient_privilege then null;
  end;
  -- The identity fields a session may write still work.
  update public.branding_vaults set address = 'الرياض' where id = '11111111-0000-0000-0000-0000000000a1';
  raise notice 'T7 PASS: the switch and the token are server-only; the identity fields stay writable';
end $$;
reset role;

-- ── T8 only the service role runs the two functions ──────────────────────────
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_function_privilege(r, 'public.letterhead_verification_card(text)', 'EXECUTE') then
      raise exception 'T8a FAIL: % can run letterhead_verification_card', r;
    end if;
    if has_function_privilege(r, 'public.mint_letterhead_verify_token(uuid, text)', 'EXECUTE') then
      raise exception 'T8b FAIL: % can run mint_letterhead_verify_token', r;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.letterhead_verification_card(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.mint_letterhead_verify_token(uuid, text)', 'EXECUTE') then
    raise exception 'T8c FAIL: the service role cannot run them';
  end if;
  raise notice 'T8 PASS: guests and sessions run neither function';
end $$;
set role anon;
do $$
begin
  begin
    perform public.letterhead_verification_card('abcdefghijklmnopqrstuvwxyz234567');
    raise exception 'T8d FAIL: a guest ran the card function';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T8d PASS: a guest is refused for real';
end $$;
reset role;

-- ── T10 a frozen account shows no card: printed paper must not vouch for it ──
-- The same statuses as account_frozen_never_listed (20261026_70).
insert into public.account_deletion_requests (user_id, status)
  values ('00000000-0000-0000-0000-0000000000a1', 'requested');
do $$
declare s text;
begin
  foreach s in array array['requested', 'purging', 'blocked'] loop
    update public.account_deletion_requests set status = s where user_id = '00000000-0000-0000-0000-0000000000a1';
    if public.letterhead_verification_card('abcdefghijklmnopqrstuvwxyz234567') is distinct from '{"state": "home"}'::jsonb then
      raise exception 'T10 FAIL: a frozen account (%) still shows a card', s;
    end if;
  end loop;
  -- Someone else's freeze changes nothing for him.
  if public.letterhead_verification_card('22222222222222222222222222222222')->>'state' <> 'card' then
    raise exception 'T10b FAIL: another account''s freeze took this card';
  end if;
  update public.account_deletion_requests set status = 'cancelled' where user_id = '00000000-0000-0000-0000-0000000000a1';
  if public.letterhead_verification_card('abcdefghijklmnopqrstuvwxyz234567')->>'state' <> 'card' then
    raise exception 'T10c FAIL: a cancelled deletion did not bring the card back';
  end if;
  raise notice 'T10 PASS: requested, purging and blocked answer home; cancelled brings the same token back';
end $$;

select 'letterhead_verify_card.test.sql: ALL PASS';
