#!/usr/bin/env node
/**
 * auth-readiness-report.mjs — READ-ONLY. Answers the questions you have to
 * answer BEFORE changing the onboarding gate or the source of truth for
 * `user_type`.
 *
 * Writes nothing. Updates nothing. Deletes nothing. Two SELECTs and a listing.
 *
 * Why it exists: the onboarding gate is about to start requiring
 * `profiles.phone`, and the app is about to start reading `user_type` from
 * `profiles` instead of `auth.user_metadata`. Both changes are safe or
 * catastrophic depending on numbers nobody has looked at:
 *
 *   1. How many existing accounts have no phone? Every one of them gets
 *      redirected into the onboarding wizard on their next page load.
 *   2. How many accounts DISAGREE between profiles.user_type and
 *      user_metadata.user_type? Each disagreement is an account that changes
 *      role the moment the source of truth changes.
 *
 *   node scripts/auth-readiness-report.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const f of [".env.local", ".env", ".env.vps"]) {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, f), "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch { /* absent */ }
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const db = createClient(URL_, KEY, { auth: { persistSession: false } });

const pct = (n, total) => (total === 0 ? "—" : `${((n / total) * 100).toFixed(1)}%`);
const row = (label, value) => console.log(`  ${label.padEnd(46)} ${value}`);

console.log("\n═══ profiles ═══════════════════════════════════════════════════");

const { data: profiles, error: pErr } = await db
  .from("profiles")
  .select("id, user_type, phone, email, created_at");

if (pErr) {
  console.error("profiles read failed:", pErr.message);
  process.exit(1);
}

const total = profiles.length;
row("accounts", String(total));

const noPhone = profiles.filter((p) => !p.phone || String(p.phone).trim() === "");
console.log("\n  ── phone ──");
row("WITH a phone", `${total - noPhone.length}  (${pct(total - noPhone.length, total)})`);
row("WITHOUT a phone", `${noPhone.length}  (${pct(noPhone.length, total)})`);
console.log(
  `\n  >> ${noPhone.length} account(s) would be redirected into /onboarding on\n` +
  `     their next page load if the gate requires a phone.`,
);

console.log("\n  ── by user_type (profiles, the DB column) ──");
const byType = {};
for (const p of profiles) byType[p.user_type ?? "(null)"] = (byType[p.user_type ?? "(null)"] ?? 0) + 1;
for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  const missing = profiles.filter((p) => (p.user_type ?? "(null)") === t && !p.phone).length;
  row(t, `${String(n).padStart(4)}   (${missing} without a phone)`);
}

console.log("\n═══ auth.users — metadata vs profiles ══════════════════════════");

let page = 1;
const users = [];
for (;;) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error("listUsers failed:", error.message); break; }
  users.push(...data.users);
  if (data.users.length < 200) break;
  page += 1;
}

row("auth users", String(users.length));

const profileById = new Map(profiles.map((p) => [p.id, p]));
let metaMissing = 0, agree = 0, disagree = 0, noProfile = 0;
const disagreements = [];
const providerCount = {};

for (const u of users) {
  for (const idp of (u.app_metadata?.providers ?? [u.app_metadata?.provider ?? "unknown"])) {
    providerCount[idp] = (providerCount[idp] ?? 0) + 1;
  }
  const p = profileById.get(u.id);
  if (!p) { noProfile += 1; continue; }
  const meta = u.user_metadata?.user_type;
  if (meta == null || meta === "") { metaMissing += 1; continue; }
  if (meta === p.user_type) agree += 1;
  else { disagree += 1; disagreements.push({ email: u.email, meta, profile: p.user_type }); }
}

console.log("\n  ── identity provider ──");
for (const [k, n] of Object.entries(providerCount).sort((a, b) => b[1] - a[1])) row(k, String(n));

console.log("\n  ── user_metadata.user_type vs profiles.user_type ──");
row("agree", String(agree));
row("metadata MISSING (profiles wins by default)", String(metaMissing));
row("DISAGREE", String(disagree));
if (noProfile) row("auth user with NO profiles row", String(noProfile));

if (disagreements.length) {
  console.log("\n  >> These accounts CHANGE ROLE when the source of truth moves");
  console.log("     from user_metadata to profiles:\n");
  for (const d of disagreements.slice(0, 25)) {
    console.log(`     ${(d.email ?? "(no email)").padEnd(38)} metadata=${d.meta}  →  profiles=${d.profile}`);
  }
  if (disagreements.length > 25) console.log(`     … and ${disagreements.length - 25} more`);
} else {
  console.log("\n  >> No account changes role when the source of truth moves. Safe.");
}

console.log(
  `\n  Note: ${metaMissing} account(s) have no user_type in metadata at all.\n` +
  `  That is the normal signature of an OAuth sign-up: Google never writes\n` +
  `  that object. It is no longer a problem — since e3c6024, useUser() reads\n` +
  `  profiles.user_type first and only falls back to metadata when the\n` +
  `  profiles row cannot be read at all.\n`,
);
