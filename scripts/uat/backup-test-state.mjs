#!/usr/bin/env node
/**
 * Read-only UAT safety snapshot.
 *
 * This is deliberately not a production database dump. It records the mutable
 * test-facing rows and the test auth-user metadata before a UAT run writes any
 * test records. It never prints credentials or row contents to stdout.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const MUTABLE_TABLES = [
  "profiles", "lawyer_profiles", "provider_profiles", "micro_profiles",
  "firm_profiles", "firm_members", "business_profiles", "business_members",
  "government_profiles", "government_members", "ngo_profiles", "ngo_members",
  "cases", "case_notes", "case_stages", "hearings", "deadlines", "tasks",
  "task_steps", "work_sessions", "lawyer_clients", "lawyer_client_notes",
  "contracts", "contract_parties", "contract_versions", "contract_obligations",
  "consultations", "consultation_notes", "attachments", "document_shares",
  "service_requests", "request_events", "payments", "subscriptions",
  "notifications", "notification_outbox", "support_tickets", "invitations",
  "activity_events", "admin_audit_events", "wallet_transactions",
];

function getArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readLocalEnv() {
  const raw = await fs.readFile(path.resolve(".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return env;
}

function runId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const env = await readLocalEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("The UAT test database credentials are not available in .env.local.");

  const output = path.resolve(getArgument("--output") ?? path.join("outputs", "uat", "backups", runId()));
  await fs.mkdir(output, { recursive: true });
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const tables = {};
  for (const table of MUTABLE_TABLES) {
    const { data, error } = await supabase.from(table).select("*").range(0, 4999);
    tables[table] = error
      ? { status: "unavailable", code: error.code ?? null, message: error.message }
      : { status: "captured", rows: data ?? [] };
  }

  const { data: authData, error: authError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authUsers = authError
    ? { status: "unavailable", message: authError.message }
    : {
        status: "captured",
        rows: (authData.users ?? []).map(({ id, email, phone, app_metadata, user_metadata, created_at, updated_at, email_confirmed_at }) => ({
          id, email, phone, app_metadata, user_metadata, created_at, updated_at, email_confirmed_at,
        })),
      };

  const snapshot = {
    format: "nzamy-uat-test-state/v1",
    createdAt: new Date().toISOString(),
    environment: env.NEXT_PUBLIC_APP_ENV ?? null,
    backend: env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND ?? null,
    databaseHost: new URL(url).host,
    tables,
    authUsers,
  };
  const body = `${JSON.stringify(snapshot, null, 2)}\n`;
  const hash = crypto.createHash("sha256").update(body).digest("hex");
  await fs.writeFile(path.join(output, "database-test-state.json"), body, { mode: 0o600 });
  await fs.writeFile(path.join(output, "manifest.json"), `${JSON.stringify({ createdAt: snapshot.createdAt, sha256: hash, output: path.basename(output) }, null, 2)}\n`, { mode: 0o600 });

  const captured = Object.values(tables).filter((value) => value.status === "captured").length;
  const unavailable = Object.values(tables).filter((value) => value.status === "unavailable").length;
  console.log(JSON.stringify({ output, capturedTables: captured, unavailableTables: unavailable, snapshotSha256: hash }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
