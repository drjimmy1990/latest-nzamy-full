-- prelude_extensions_schema.sql — Supabase ships a schema named `extensions`
-- (pgcrypto lives there); a bare postgres:16 does not. Needed by
-- 20260919_private_precedent_details.sql (`create extension … with schema extensions`).
create schema if not exists extensions;
