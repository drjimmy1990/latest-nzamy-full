-- _verify.sql — READ-ONLY schema/RLS assertions run by deploy.sh.
-- This is NOT a migration (leading underscore keeps it out of `supabase db push`).
-- Confirms the prerequisite migrations 20260616 + 20260630 actually landed in
-- the live DB. Every statement is a SELECT; nothing is written.

SELECT 'lawyer_profiles.is_accepting_clients' AS check,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'lawyer_profiles'
                 AND column_name = 'is_accepting_clients') AS present;

SELECT 'lawyer_profiles.city' AS check,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'lawyer_profiles'
                 AND column_name = 'city') AS present;

SELECT 'profiles.city' AS check,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'profiles'
                 AND column_name = 'city') AS present;

SELECT 'handle_new_user fn' AS check,
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user') AS present;

SELECT 'on_auth_user_created trigger' AS check,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') AS present;

SELECT 'service_requests RLS enabled' AS check,
       (SELECT relrowsecurity FROM pg_class
        WHERE oid = 'public.service_requests'::regclass) AS present;

SELECT 'platform_settings.payments_gateway seeded' AS check,
       EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'payments_gateway') AS present;
