-- Chain step (NOT a migration) for academy_certificates_policy.test.sql:
-- gives the API roles the write grants a restore or a blanket grant could
-- leave on schema academy (the migrations grant none), so the test shows what
-- the policy alone allows.
grant usage on schema academy to anon, authenticated, service_role;
grant all on all tables in schema academy to anon, authenticated, service_role;
