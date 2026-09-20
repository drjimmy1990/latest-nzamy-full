import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { PRIVATE_PRECEDENT_STORAGE_VERSION } from "./seed-library.live-preflight.ts";

const sql = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20260919_private_precedent_details.sql"),
  "utf8",
);

test("private precedent migration is service-role only and has no read RPC", () => {
  assert.match(sql, /create schema if not exists library_precedent_private/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /force row level security/i);
  assert.match(sql, /revoke all on schema library_precedent_private[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant usage on schema library_precedent_private to service_role/i);
  assert.match(sql, /revoke all on library_precedent_private\.precedent_unparsed_details[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant select, insert, update on library_precedent_private\.precedent_unparsed_details[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /create or replace function public\.(?:read|get|list|search)_private_precedent/i);
});

test("private precedent migration binds bodies to hashes and public principle identities", () => {
  assert.match(sql, /extensions\.digest\(convert_to\(body, 'UTF8'\), 'sha256'\)/);
  assert.doesNotMatch(sql, /\bsha256\(convert_to\(/);
  assert.match(sql, /where p\.id = v_id and p\.collection_id = v_collection/i);
  assert.match(sql, /where library_precedent_private\.precedent_unparsed_details\.review_state = 'unverified'/i);
  assert.match(sql, /reviewed private judicial row cannot be overwritten/i);
});

test("runtime readiness version is one constant shared with the seeder", () => {
  assert.ok(sql.includes(`'version', '${PRIVATE_PRECEDENT_STORAGE_VERSION}'`));
  assert.match(sql, /grant execute on function public\.private_precedent_storage_contract\(\)[\s\S]*to service_role/i);
  assert.match(sql, /revoke all on function public\.private_precedent_storage_contract\(\)[\s\S]*from public, anon, authenticated/i);
});
