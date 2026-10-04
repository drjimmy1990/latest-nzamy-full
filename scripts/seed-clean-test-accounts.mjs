#!/usr/bin/env node
/**
 * scripts/seed-clean-test-accounts.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Reconciles the 12 NZAMY test accounts (…@nezamy.sa) on the SELF-HOSTED
 * Supabase so that each one is exactly what the app expects for its role.
 *
 * SAFE BY DEFAULT
 *   - DRY-RUN unless --execute is passed: it reads the current state and prints,
 *     per account, every create / update / delete it WOULD perform.
 *   - Refuses to run against a *.supabase.co host (exit 2). The cloud project is
 *     retired; nothing here may ever write to it.
 *   - URL and service key come ONLY from the environment / .env.local
 *     (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). There are no
 *     --url / --key / --password flags: secrets must not land in shell history.
 *   - Never prints a key or a password.
 *   - Idempotent: every field is compared first and only differences are
 *     written, so a second --execute run reports "no change".
 *   - Every Supabase call is error-checked; failures are collected, a summary
 *     table is printed and the exit code is 1 if anything failed.
 *
 * FLAGS
 *   (none)              dry-run: print the plan, write nothing
 *   --execute           apply the plan
 *   --verify            read-only report of the final state per account
 *                       (may be combined with --execute: verify runs after it)
 *   --reset-passwords   ALSO set the password of EXISTING users (never done
 *                       otherwise). Uses SEED_TEST_PASSWORD, or a random one
 *                       per account with --random-passwords.
 *   --random-passwords  generate a strong random password per account (for new
 *                       users, and for existing ones with --reset-passwords).
 *                       Passwords are written ONLY to
 *                       outputs/test-accounts/passwords-<timestamp>.md
 *                       (outputs/ is gitignored) — never to stdout.
 *
 * ENV
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (required)
 *   SEED_TEST_PASSWORD   required to CREATE a user or --reset-passwords, unless
 *                        --random-passwords is given.
 *
 * WHAT "CORRECT" MEANS HERE (evidence in the repo):
 *   - Server tier = the NEWEST `subscriptions` row with status='active' for the
 *     USER (not the entity), no expiry check: getUserTier(),
 *     src/lib/access-control.ts:94-106. So each paid account gets exactly one
 *     active row with the intended tier; free accounts get none.
 *   - Browser tier = auth user_metadata.tier (src/hooks/useUser.ts:791), which
 *     drives getPermissions(). The admin grant path stamps it the same way
 *     (src/lib/entitlements.ts:234-240), so this script does too.
 *   - Lawyer directory lists user_type='lawyer' AND lawyer_profiles
 *     .verification_status='verified' AND .marketplace_visible=true
 *     (src/app/api/v1/lawyers/route.ts:76-82; ?available=true also needs
 *     is_accepting_clients, :89-91). NOTE: BETA_MONOPOLY_MODE=true
 *     (src/lib/betaConfig.ts:46) makes /lawyers redirect to /services/lawyers
 *     (src/app/lawyers/layout.tsx:27), so "listed" applies to /api/v1/lawyers.
 *   - A corporate MEMBER who owns no company resolves as scope "member"
 *     (src/lib/auth/businessProfileScope.ts:58-78), and an OWNED company always
 *     wins over a membership — so corp-legal must NOT own the placeholder
 *     company the signup trigger created for it.
 *
 * Usage:
 *   node scripts/seed-clean-test-accounts.mjs                 # dry-run
 *   node scripts/seed-clean-test-accounts.mjs --verify        # read-only report
 *   node scripts/seed-clean-test-accounts.mjs --execute --verify
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Flags ───────────────────────────────────────────────────────────────────
const KNOWN_FLAGS = new Set([
  "--execute",
  "--verify",
  "--reset-passwords",
  "--random-passwords",
  "--help",
  "-h",
]);
const argv = process.argv.slice(2);
for (const a of argv) {
  if (!KNOWN_FLAGS.has(a) && !a.startsWith("--only=")) {
    console.error(`Unknown argument: ${a}`);
    console.error(
      "Allowed: --execute --verify --reset-passwords --random-passwords --only=<key>[,<key>]. " +
        "URL/key/password are read from the environment / .env.local only.",
    );
    process.exit(2);
  }
}
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(
    "node scripts/seed-clean-test-accounts.mjs [--execute] [--verify] [--reset-passwords] [--random-passwords] [--only=<key>[,<key>]]\n" +
      "  --only=admin  limit the run to these account keys (e.g. give admin@ its own password:\n" +
      "                --execute --reset-passwords --random-passwords --only=admin)",
  );
  process.exit(0);
}
const EXECUTE = argv.includes("--execute");
const VERIFY = argv.includes("--verify");
const RESET_PASSWORDS = argv.includes("--reset-passwords");
const RANDOM_PASSWORDS = argv.includes("--random-passwords");
// --verify alone is a pure read-only report; no plan is printed.
const PLAN = EXECUTE || !VERIFY;

// ─── Env (.env.local auto-load, same parser as seed-library-from-owner.mjs) ──
const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const SEED_PASSWORD = process.env.SEED_TEST_PASSWORD || "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (environment or .env.local).",
  );
  process.exit(1);
}
let HOST;
try {
  HOST = new URL(SUPABASE_URL).hostname.toLowerCase().replace(/\.$/, "");
} catch {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  process.exit(1);
}
if (HOST === "supabase.co" || HOST.endsWith(".supabase.co") || HOST.endsWith(".supabase.in")) {
  console.error(
    `⛔ Refusing to run: target host ${HOST} is the Supabase CLOUD project. ` +
      "The cloud project is retired; this script only targets the self-hosted instance " +
      "(point .env.local at it and try again).",
  );
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Account specs ───────────────────────────────────────────────────────────
// Every value below was checked against scripts/selfhost/run4_delivery/01-schema.sql:
//   profiles.user_type CHECK / phone CHECK '^\+9665[0-9]{8}$'     (:4286-4312)
//   subscriptions tier/status/billing_cycle CHECKs                (:4616-4641)
//   firm_profiles structure/verification CHECKs                   (:3419-3452)
//   firm_members.role CHECK (senior_lawyer allowed)               (:3397-3412)
//   business_profiles service_model/verification CHECKs           (:2364-2386)
//   business_members.role CHECK (legal_manager allowed)           (:2342-2357)
//   government_profiles entity_type/role/verification CHECKs      (:3504-3522)
//   ngo_profiles org_type/compliance/verification CHECKs          (:4150-4171)
//   provider_profiles sub_role/verification CHECKs                (:4359-4374)
//   lawyer_profiles verification CHECK                            (:3814-3853)
// Plan ids are the 18 rows of public.subscription_plans; they are re-checked
// read-only at runtime before anything is written.
const ALL_ACCOUNTS = [
  {
    key: "admin",
    email: "admin@nezamy.sa",
    displayName: "إدارة نظامي",
    displayNameEn: "Nezamy Admin",
    userType: "admin",
    phone: "+966500000001",
    // Admin keeps a max subscription on purpose: requireAdmin() looks only at
    // profiles.user_type (access-control.ts:128-133) but the library paywall
    // has NO admin bypass (access-control.ts:221-233, library/laws/[slug]
    // route.ts:132-139), so without pro+ the admin sees 5 articles per law.
    // In the browser, admin permissions are full at free AND max but EMPTY at
    // pro/ai (useUser.ts:334-343) — so max is the only paid tier that keeps
    // both. No admin-audience plan exists; firm-max is the max-tier plan.
    tier: "max",
    planId: "firm-max",
    dashboard: "/dashboard/admin",
  },
  {
    key: "client-free",
    email: "client-free@nezamy.sa",
    displayName: "عبدالله العميل (مجاني)",
    displayNameEn: "Abdullah Client (Free)",
    userType: "individual",
    phone: "+966500000002",
    tier: "free", // no subscription row: getUserTier() defaults to "free"
    planId: null,
    dashboard: "/dashboard/client",
  },
  {
    key: "client-pro",
    email: "client-pro@nezamy.sa",
    displayName: "محمد العميل (برو)",
    displayNameEn: "Mohammed Client (Pro)",
    userType: "individual",
    phone: "+966500000003",
    tier: "pro",
    planId: "individual-pro",
    dashboard: "/dashboard/client",
  },
  {
    key: "lawyer-solo",
    email: "lawyer-solo@nezamy.sa",
    displayName: "الأستاذ فهد المحامي",
    displayNameEn: "Fahad Lawyer (Solo)",
    userType: "lawyer",
    phone: "+966500000004",
    tier: "pro",
    planId: "lawyer-pro",
    dashboard: "/dashboard/lawyer",
    lawyerProfile: {
      license_number: "1448-SOLO-991",
      years_experience: 8,
      specialties: ["قضايا تجارية", "شركات", "عقود"],
      bio_ar: "محامٍ مرخص ومستشار قانوني معتمد في الأنظمة التجارية وعقود الشركات.",
      is_accepting_clients: true,
      marketplace_visible: true, // listed in the directory
      verification_status: "verified",
    },
  },
  {
    key: "firm-owner",
    email: "firm-owner@nezamy.sa",
    displayName: "مكتب العدالة للمحاماة (المالك)",
    displayNameEn: "Al-Adala Law Firm (Owner)",
    userType: "firm",
    phone: "+966500000005",
    tier: "max",
    planId: "firm-max",
    dashboard: "/dashboard/firm",
    firmProfile: {
      name_ar: "شركة العدالة للمحاماة والاستشارات",
      name_en: "Al-Adala Law Firm LLC",
      license_number: "LF-1448-001",
      structure: "multi_branch",
      verification_status: "verified",
    },
  },
  {
    key: "firm-lawyer",
    email: "firm-lawyer@nezamy.sa",
    displayName: "أحمد المحامي (عضو المكتب)",
    displayNameEn: "Ahmed Lawyer (Associate)",
    userType: "lawyer",
    phone: "+966500000006",
    tier: "pro",
    planId: "lawyer-pro",
    dashboard: "/dashboard/lawyer",
    lawyerProfile: {
      license_number: "1448-ASSOC-102",
      years_experience: 5,
      specialties: ["قضايا عمالية", "أحوال شخصية"],
      is_accepting_clients: true,
      // Verified, but NOT listed in the public directory: the spec never asked
      // for it and marketplace_visible is a consent flag (lawyers/route.ts:78-82).
      marketplace_visible: false,
      verification_status: "verified",
    },
    firmMembership: { ownerKey: "firm-owner", role: "senior_lawyer" },
  },
  {
    key: "corp-owner",
    email: "corp-owner@nezamy.sa",
    displayName: "شركة الأفق للاستثمار (المالك)",
    displayNameEn: "Al-Ofuq Investment Co.",
    userType: "corporate",
    phone: "+966500000007",
    tier: "corp",
    planId: "corporate-corp",
    dashboard: "/dashboard/business",
    businessProfile: {
      company_name_ar: "شركة الأفق للاستثمار والتطوير",
      company_name_en: "Al-Ofuq Investment & Development Co.",
      cr_number: "7001234567",
      has_legal_dept: true,
      service_model: "internal",
      verification_status: "verified",
    },
  },
  {
    key: "corp-legal",
    email: "corp-legal@nezamy.sa",
    displayName: "سعود مستشار الشركة القانوني",
    displayNameEn: "Saud Corporate Legal Manager",
    userType: "corporate",
    phone: "+966500000008",
    tier: "pro",
    planId: "corporate-pro",
    dashboard: "/dashboard/business",
    businessMembership: { ownerKey: "corp-owner", role: "legal_manager" },
  },
  {
    key: "micro-owner",
    email: "micro-owner@nezamy.sa",
    displayName: "مؤسسة الرواد (منشأة متناهية)",
    displayNameEn: "Al-Rowad Micro Establishment",
    userType: "micro",
    phone: "+966500000009",
    // Spec said tier "pro" on plan micro-ai; the micro audience has no pro plan
    // (subscription_plans: micro-free, micro-ai), so tier follows the plan.
    tier: "ai",
    planId: "micro-ai",
    dashboard: "/dashboard/micro",
    microProfile: {
      business_name: "مؤسسة الرواد التجارية",
      business_type: "retail",
    },
  },
  {
    key: "provider-notary",
    email: "provider-notary@nezamy.sa",
    displayName: "سلطان الموثق المعتمد",
    displayNameEn: "Sultan Notary Provider",
    userType: "provider",
    phone: "+966500000010",
    tier: "pro",
    planId: "provider-pro",
    dashboard: "/dashboard/provider",
    providerProfile: {
      sub_role: "notary",
      verification_status: "verified",
      marketplace_visible: true,
    },
  },
  {
    key: "gov-counsel",
    email: "gov-counsel@nezamy.sa",
    displayName: "مستشار الهيئة الحكومية",
    displayNameEn: "Government Legal Counsel",
    userType: "government",
    phone: "+966500000011",
    tier: "pro",
    planId: "government-pro",
    dashboard: "/dashboard/government",
    govProfile: {
      entity_name_ar: "الهيئة الوطنية للتطوير القانوني",
      entity_name_en: "National Authority for Legal Development",
      entity_type: "authority",
      role: "counsel",
      verification_status: "verified",
    },
  },
  {
    key: "ngo-director",
    email: "ngo-director@nezamy.sa",
    displayName: "مدير الجمعية الخيرية",
    displayNameEn: "NGO Legal Director",
    userType: "ngo",
    phone: "+966500000012",
    tier: "pro",
    planId: "ngo-pro",
    dashboard: "/dashboard/ngo",
    ngoProfile: {
      org_name_ar: "جمعية العون القانوني الأهلية",
      org_name_en: "Legal Aid Association",
      org_type: "association",
      compliance_status: "compliant",
      verification_status: "verified",
    },
  },
];
const BY_KEY = new Map(ALL_ACCOUNTS.map((a) => [a.key, a]));

// --only=<key>[,<key>] limits the run to those accounts. With --execute it is
// allowed only for password resets: the membership links of firm-lawyer and
// corp-legal need their owner's entity from the same run.
const ONLY = argv
  .filter((a) => a.startsWith("--only="))
  .flatMap((a) => a.slice("--only=".length).split(","))
  .map((k) => k.trim())
  .filter(Boolean);
for (const k of ONLY) {
  if (!BY_KEY.has(k)) {
    console.error(`--only: unknown account key "${k}". Known: ${ALL_ACCOUNTS.map((a) => a.key).join(", ")}`);
    process.exit(2);
  }
}
if (ONLY.length && argv.includes("--execute") && !argv.includes("--reset-passwords")) {
  console.error("--only with --execute is only for password resets: add --reset-passwords (and --random-passwords).");
  process.exit(2);
}
const ACCOUNTS = ONLY.length ? ALL_ACCOUNTS.filter((a) => ONLY.includes(a.key)) : ALL_ACCOUNTS;

// Markers of the placeholder company handle_new_user() inserts for a corporate
// signup with no company metadata (01-schema.sql:752-770).
const PLACEHOLDER_COMPANY_NAME = "شركة جديدة";
const SEED_TAG = { method: "test_seed", seeded_by: "scripts/seed-clean-test-accounts.mjs" };

// ─── Bookkeeping ─────────────────────────────────────────────────────────────
/** key → { actions: [{desc, state}], failures: [string] } */
const report = new Map(ACCOUNTS.map((a) => [a.key, { actions: [], failures: [] }]));
const globalFailures = [];
const passwordLog = []; // [{email, password}] — written to file only, never printed
let passwordFile = null;

function fail(accKey, msg) {
  if (accKey && report.has(accKey)) report.get(accKey).failures.push(msg);
  else globalFailures.push(msg);
}

class SbError extends Error {}

/** Throws SbError on a Supabase error so the caller's account is marked failed. */
function check(res, what) {
  if (res && res.error) {
    const e = res.error;
    throw new SbError(`${what}: ${e.message ?? String(e)}${e.code ? ` [${e.code}]` : ""}`);
  }
  return res ? res.data : undefined;
}

/**
 * Records an action. In dry-run it is only listed; with --execute it runs.
 * `fn` must return a Supabase response (or undefined) — its error is checked.
 * Returns the response data, or undefined in dry-run / on failure.
 */
async function act(accKey, desc, fn) {
  const entry = { desc, state: EXECUTE ? "pending" : "planned" };
  report.get(accKey).actions.push(entry);
  if (!EXECUTE) return undefined;
  try {
    const res = await fn();
    const data = check(res, desc);
    entry.state = "done";
    return data ?? true;
  } catch (err) {
    entry.state = "FAILED";
    fail(accKey, err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

const nowIso = () => new Date().toISOString();
function inOneYear() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

function sameValue(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return (a ?? null) === (b ?? null);
}

/** Fields of `desired` whose value differs from `row`. */
function diff(row, desired) {
  const out = {};
  for (const [k, v] of Object.entries(desired)) {
    if (!sameValue(row?.[k], v)) out[k] = v;
  }
  return out;
}

function fmtChange(row, patch) {
  return Object.entries(patch)
    .map(([k, v]) => `${k}: ${JSON.stringify(row?.[k] ?? null)} → ${JSON.stringify(v)}`)
    .join(", ");
}

function randomPassword() {
  // 24 url-safe random chars + one of each class so any GoTrue password
  // policy (lower/upper/digit/symbol) is satisfied.
  return `${crypto.randomBytes(18).toString("base64url")}#7aZ`;
}

function recordPassword(email, password) {
  passwordLog.push({ email, password });
  try {
    if (!passwordFile) {
      const dir = path.join(ROOT, "outputs", "test-accounts");
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      passwordFile = path.join(dir, `passwords-${stamp}.md`);
      fs.writeFileSync(
        passwordFile,
        `# NZAMY test-account passwords (${HOST})\n\n` +
          "Generated by scripts/seed-clean-test-accounts.mjs. outputs/ is gitignored — never commit or paste this file.\n\n" +
          "| email | password |\n|---|---|\n",
        { encoding: "utf-8", mode: 0o600 },
      );
    }
    fs.appendFileSync(passwordFile, `| ${email} | \`${password}\` |\n`, "utf-8");
  } catch (err) {
    globalFailures.push(
      `could not write the password file (${err instanceof Error ? err.message : err}) — ` +
        `the password for ${email} WAS set; re-run with --reset-passwords --random-passwords`,
    );
  }
}

// ─── Reads ───────────────────────────────────────────────────────────────────
async function listAllAuthUsers() {
  const byEmail = new Map();
  const perPage = 1000;
  for (let page = 1; page < 1000; page++) {
    const res = await supabase.auth.admin.listUsers({ page, perPage });
    const data = check(res, `auth.admin.listUsers page ${page}`);
    const users = data?.users ?? [];
    for (const u of users) if (u.email) byEmail.set(u.email.toLowerCase(), u);
    if (users.length < perPage) break;
  }
  return byEmail;
}

async function checkPlans() {
  const ids = [...new Set(ACCOUNTS.map((a) => a.planId).filter(Boolean))];
  const data = check(
    await supabase.from("subscription_plans").select("id, tier, audience, active").in("id", ids),
    "read subscription_plans",
  );
  const found = new Map((data ?? []).map((p) => [p.id, p]));
  const problems = [];
  for (const acc of ACCOUNTS) {
    if (!acc.planId) continue;
    const p = found.get(acc.planId);
    if (!p) problems.push(`${acc.key}: plan ${acc.planId} does not exist in subscription_plans`);
    else if (p.tier !== acc.tier)
      problems.push(`${acc.key}: plan ${acc.planId} has tier ${p.tier}, spec wants ${acc.tier}`);
  }
  return problems;
}

// ─── Phase A: auth users + profiles ──────────────────────────────────────────
function desiredMetadata(acc) {
  const meta = {
    user_type: acc.userType,
    full_name: acc.displayName,
    display_name: acc.displayName,
    display_name_en: acc.displayNameEn,
    tier: acc.tier,
  };
  if (acc.providerProfile) meta.sub_role = acc.providerProfile.sub_role;
  return meta;
}

/** Returns the auth user id (or null in dry-run for a user that does not exist). */
async function reconcileAuthUser(acc, authUsers) {
  const existing = authUsers.get(acc.email.toLowerCase());
  const wantMeta = desiredMetadata(acc);

  if (!existing) {
    let password = null;
    if (RANDOM_PASSWORDS) password = randomPassword();
    else if (SEED_PASSWORD) password = SEED_PASSWORD;
    const pwNote = RANDOM_PASSWORDS ? "random password → password file" : "SEED_TEST_PASSWORD";
    if (!password) {
      // Only reachable in dry-run: main() exits before --execute without one.
      report.get(acc.key).actions.push({
        desc: "create auth user (needs SEED_TEST_PASSWORD or --random-passwords)",
        state: "planned",
      });
      return null;
    }
    const data = await act(acc.key, `create auth user ${acc.email} (email confirmed, ${pwNote})`, () =>
      supabase.auth.admin.createUser({
        email: acc.email,
        password,
        email_confirm: true,
        // handle_new_user() reads full_name / display_name_en / phone and the
        // sector fields below from raw_user_meta_data (01-schema.sql:644-815).
        user_metadata: {
          ...wantMeta,
          phone: acc.phone,
          ...(acc.firmProfile
            ? { company_name: acc.firmProfile.name_ar, company_name_en: acc.firmProfile.name_en }
            : {}),
          ...(acc.businessProfile
            ? {
                company_name: acc.businessProfile.company_name_ar,
                company_name_en: acc.businessProfile.company_name_en,
                cr_number: acc.businessProfile.cr_number,
              }
            : {}),
          ...(acc.govProfile
            ? { entity_name: acc.govProfile.entity_name_ar, entity_type: acc.govProfile.entity_type }
            : {}),
          ...(acc.ngoProfile
            ? { org_name: acc.ngoProfile.org_name_ar, org_type: acc.ngoProfile.org_type }
            : {}),
          ...(acc.microProfile ? { business_name: acc.microProfile.business_name } : {}),
        },
      }),
    );
    const id = data && data.user ? data.user.id : null;
    if (id && RANDOM_PASSWORDS) recordPassword(acc.email, password);
    return id;
  }

  // Existing user: never touch the password unless --reset-passwords.
  const patch = {};
  const notes = [];
  if (!existing.email_confirmed_at) {
    patch.email_confirm = true;
    notes.push("confirm email");
  }
  const curMeta = existing.user_metadata ?? {};
  const metaDiff = diff(curMeta, wantMeta);
  if (Object.keys(metaDiff).length) {
    // GoTrue merges user_metadata keys on admin update (entitlements.ts relies
    // on the same behaviour when it writes { tier } alone).
    patch.user_metadata = metaDiff;
    notes.push(`user_metadata ${fmtChange(curMeta, metaDiff)}`);
  }
  let password = null;
  if (RESET_PASSWORDS) {
    password = RANDOM_PASSWORDS ? randomPassword() : SEED_PASSWORD || null;
    if (password) {
      patch.password = password;
      notes.push(RANDOM_PASSWORDS ? "reset password (random → password file)" : "reset password (SEED_TEST_PASSWORD)");
    }
  }
  if (notes.length) {
    const ok = await act(acc.key, `update auth user: ${notes.join("; ")}`, () =>
      supabase.auth.admin.updateUserById(existing.id, patch),
    );
    if (ok && password && RANDOM_PASSWORDS) recordPassword(acc.email, password);
  }
  return existing.id;
}

async function reconcileProfile(acc, userId) {
  const row = check(
    await supabase
      .from("profiles")
      .select("id, user_type, display_name, display_name_en, phone, onboarding_completed, verified_at")
      .eq("id", userId)
      .maybeSingle(),
    "read profiles",
  );
  if (!row) {
    // handle_new_user() creates it; its absence means the trigger failed.
    throw new SbError(`profiles row missing for ${acc.email} (signup trigger handle_new_user did not run?)`);
  }
  const desired = {
    user_type: acc.userType,
    display_name: acc.displayName,
    display_name_en: acc.displayNameEn,
    phone: acc.phone,
    onboarding_completed: true, // proxy Gate 1: src/lib/auth/onboardingGate.ts
  };
  const patch = diff(row, desired);
  if (!row.verified_at) patch.verified_at = nowIso();
  if (patch.user_type) {
    report
      .get(acc.key)
      .actions.push({ desc: `WARNING: user_type differs (${row.user_type}); sector rows of the old type are left in place`, state: "note" });
  }
  if (Object.keys(patch).length) {
    // Service-role writes pass trg_lock_user_type (auth.uid() is null, 01-schema.sql:265-285).
    await act(acc.key, `update profiles: ${fmtChange(row, patch)}`, () =>
      supabase.from("profiles").update(patch).eq("id", userId),
    );
  }
}

// ─── Phase B: subscription ───────────────────────────────────────────────────
async function reconcileSubscription(acc, userId) {
  const rows =
    check(
      await supabase
        .from("subscriptions")
        .select("id, tier, plan_id, status, current_period_end, created_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false }),
      "read subscriptions",
    ) ?? [];

  if (acc.tier === "free") {
    // Free = no paid active row. A signup never writes a free row either
    // (handle_new_user), and getUserTier() answers "free" for none.
    for (const r of rows.filter((r) => r.tier !== "free")) {
      await act(acc.key, `cancel active ${r.tier} subscription ${r.id} (${r.plan_id})`, () =>
        supabase
          .from("subscriptions")
          .update({ status: "cancelled", cancelled_at: nowIso() })
          .eq("id", r.id),
      );
    }
    return;
  }

  if (rows.length === 0) {
    await act(acc.key, `insert subscription tier=${acc.tier} plan=${acc.planId} (active, 1 year, custom, test_seed)`, () =>
      supabase.from("subscriptions").insert({
        user_id: userId,
        plan_id: acc.planId,
        tier: acc.tier,
        billing_cycle: "custom",
        status: "active",
        started_at: nowIso(),
        current_period_start: nowIso(),
        current_period_end: inOneYear(),
        auto_renew: false,
        metadata: SEED_TAG,
      }),
    );
    return;
  }

  // getUserTier() reads the NEWEST active row — make that one right.
  const [newest, ...extras] = rows;
  const patch = diff(newest, { tier: acc.tier, plan_id: acc.planId });
  const end = newest.current_period_end ? Date.parse(newest.current_period_end) : NaN;
  if (!newest.current_period_end || !(end > Date.now())) patch.current_period_end = inOneYear();
  if (Object.keys(patch).length) {
    await act(acc.key, `update subscription ${newest.id}: ${fmtChange(newest, patch)}`, () =>
      supabase.from("subscriptions").update(patch).eq("id", newest.id),
    );
  }
  // dashboard/summary uses .single() on active rows (route.ts:112-119): more
  // than one active row makes it null, so extras are cancelled.
  for (const r of extras) {
    await act(acc.key, `cancel extra active subscription ${r.id} (${r.tier}/${r.plan_id})`, () =>
      supabase
        .from("subscriptions")
        .update({ status: "cancelled", cancelled_at: nowIso() })
        .eq("id", r.id),
    );
  }
}

// ─── Phase C: role rows ──────────────────────────────────────────────────────
async function reconcileUserKeyedProfile(acc, userId, table, desired) {
  const cols = ["user_id", ...Object.keys(desired)].join(", ");
  const row = check(
    await supabase.from(table).select(cols).eq("user_id", userId).maybeSingle(),
    `read ${table}`,
  );
  if (!row) {
    await act(acc.key, `insert ${table}: ${JSON.stringify(desired)}`, () =>
      supabase.from(table).insert({ user_id: userId, ...desired }),
    );
    return;
  }
  const patch = diff(row, desired);
  if (Object.keys(patch).length) {
    await act(acc.key, `update ${table}: ${fmtChange(row, patch)}`, () =>
      supabase.from(table).update(patch).eq("user_id", userId),
    );
  }
}

/**
 * Entity tables keyed by owner_user_id have NO unique constraint on it
 * (only a PK on id — 01-schema.sql:5182, :5566, :5590, :5798), so upsert
 * onConflict owner_user_id cannot work. Select, then update the trigger's
 * placeholder; insert only when there is none. Returns the entity id.
 */
async function reconcileOwnedEntity(acc, userId, table, desired) {
  const cols = ["id", ...Object.keys(desired)].join(", ");
  const rows =
    check(
      await supabase.from(table).select(cols).eq("owner_user_id", userId).order("created_at", { ascending: true }),
      `read ${table}`,
    ) ?? [];
  if (rows.length > 1) {
    throw new SbError(
      `${table}: ${rows.length} rows owned by ${acc.email} — ambiguous, fix by hand (ids ${rows.map((r) => r.id).join(", ")})`,
    );
  }
  if (rows.length === 0) {
    const data = await act(acc.key, `insert ${table}: ${JSON.stringify(desired)}`, () =>
      supabase.from(table).insert({ owner_user_id: userId, ...desired }).select("id").single(),
    );
    return data && data.id ? data.id : null;
  }
  const row = rows[0];
  const patch = diff(row, desired);
  if (Object.keys(patch).length) {
    await act(acc.key, `update ${table} ${row.id}: ${fmtChange(row, patch)}`, () =>
      supabase.from(table).update(patch).eq("id", row.id),
    );
  }
  return row.id;
}

/**
 * Ensures ONE active membership row (entityCol=entityId, user) with `role`.
 * Service-role writes: auth.uid() is null, which is the documented carve-out of
 * entity_member_invitation_answer_guard (01-schema.sql:556-571); the guard is
 * BEFORE UPDATE only, inserts never reach it.
 */
async function ensureMembership(acc, table, entityCol, entityId, userId, role) {
  const row = check(
    await supabase
      .from(table)
      .select(`id, ${entityCol}, role, status, accepted_at`)
      .eq(entityCol, entityId)
      .eq("user_id", userId)
      .maybeSingle(),
    `read ${table}`,
  );
  if (!row) {
    await act(acc.key, `insert ${table}: ${entityCol}=${entityId} role=${role} status=active accepted_at=now`, () =>
      supabase.from(table).insert({
        [entityCol]: entityId,
        user_id: userId,
        role,
        status: "active",
        accepted_at: nowIso(),
      }),
    );
    return;
  }
  const patch = diff(row, { role, status: "active" });
  if (!row.accepted_at) patch.accepted_at = nowIso();
  if (Object.keys(patch).length) {
    await act(acc.key, `update ${table} ${row.id}: ${fmtChange(row, patch)}`, () =>
      supabase.from(table).update(patch).eq("id", row.id),
    );
  }
}

/** Other ACTIVE rows of this user in `table` (not the target entity). */
async function otherActiveMemberships(table, entityCol, userId, keepEntityId) {
  const rows =
    check(
      await supabase
        .from(table)
        .select(`id, ${entityCol}, role, status`)
        .eq("user_id", userId)
        .eq("status", "active"),
      `read ${table}`,
    ) ?? [];
  return rows.filter((r) => r[entityCol] !== keepEntityId);
}

/**
 * corp-legal: the signup trigger gave it its OWN placeholder company (and an
 * owner membership through ensure_business_owner_membership). Owner scope wins
 * over member scope (businessProfileScope.ts:58-78) and useUser/proxy read
 * business_members with .limit(1) and no order (useUser.ts:614-620,
 * proxy.ts:616-622), so it must go. Deleted only when it provably IS the
 * untouched placeholder. FKs into business_profiles: business_members ON DELETE
 * CASCADE (01-schema.sql:8755) and service_requests ON DELETE SET NULL
 * (:10027) — no other table references it and no DELETE trigger exists.
 */
async function removePlaceholderCompany(acc, userId, keepBusinessId) {
  const owned =
    check(
      await supabase
        .from("business_profiles")
        .select("id, company_name_ar, cr_number, verification_status, legal_rep_name")
        .eq("owner_user_id", userId),
      "read business_profiles (owned by member)",
    ) ?? [];
  for (const biz of owned) {
    if (biz.id === keepBusinessId) {
      throw new SbError(`${acc.email} OWNS the company it should only be a member of (${biz.id}) — fix by hand`);
    }
    const reasons = [];
    if (biz.company_name_ar !== PLACEHOLDER_COMPANY_NAME) reasons.push(`name is "${biz.company_name_ar}"`);
    if (biz.cr_number) reasons.push("has a CR number");
    if (biz.legal_rep_name) reasons.push("has a legal representative");
    if (biz.verification_status !== "pending") reasons.push(`verification_status=${biz.verification_status}`);
    const members =
      check(
        await supabase.from("business_members").select("id, user_id").eq("business_id", biz.id),
        "read business_members of placeholder",
      ) ?? [];
    const strangers = members.filter((m) => m.user_id !== userId);
    if (strangers.length) reasons.push(`${strangers.length} other member(s)`);
    const refs = await supabase
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .eq("business_id", biz.id);
    check(refs, "count service_requests referencing placeholder");
    if ((refs.count ?? 0) > 0) reasons.push(`${refs.count} service_requests reference it`);

    if (reasons.length) {
      throw new SbError(
        `company ${biz.id} owned by ${acc.email} is not an untouched signup placeholder (${reasons.join("; ")}) — not deleting; resolve by hand`,
      );
    }
    await act(
      acc.key,
      `delete placeholder business_profiles ${biz.id} ("${biz.company_name_ar}") + its ${members.length} business_members row(s) by cascade`,
      () => supabase.from("business_profiles").delete().eq("id", biz.id),
    );
  }
}

// ─── Per-account reconcile ───────────────────────────────────────────────────
const entityIds = new Map(); // owner key → firm/business id (for member accounts)

async function reconcileAccount(acc, userId) {
  await reconcileProfile(acc, userId);
  await reconcileSubscription(acc, userId);

  if (acc.lawyerProfile) await reconcileUserKeyedProfile(acc, userId, "lawyer_profiles", acc.lawyerProfile);
  if (acc.providerProfile) await reconcileUserKeyedProfile(acc, userId, "provider_profiles", acc.providerProfile);
  if (acc.microProfile) await reconcileUserKeyedProfile(acc, userId, "micro_profiles", acc.microProfile);

  if (acc.firmProfile) {
    const firmId = await reconcileOwnedEntity(acc, userId, "firm_profiles", acc.firmProfile);
    if (firmId) {
      entityIds.set(acc.key, firmId);
      // Normally written by ensure_firm_owner_membership (01-schema.sql:516-527).
      await ensureMembership(acc, "firm_members", "firm_id", firmId, userId, "managing_partner");
    }
  }
  if (acc.businessProfile) {
    const bizId = await reconcileOwnedEntity(acc, userId, "business_profiles", acc.businessProfile);
    if (bizId) {
      entityIds.set(acc.key, bizId);
      // Normally written by ensure_business_owner_membership (01-schema.sql:496-510).
      await ensureMembership(acc, "business_members", "business_id", bizId, userId, "owner");
    }
  }
  if (acc.govProfile) {
    // No government_members row: nothing in src/ reads government_members, and
    // the owner reads its profile through owner_user_id (policy at 01-schema.sql:11730).
    await reconcileOwnedEntity(acc, userId, "government_profiles", acc.govProfile);
  }
  if (acc.ngoProfile) {
    // Same for ngo_members (policy at 01-schema.sql:12201).
    await reconcileOwnedEntity(acc, userId, "ngo_profiles", acc.ngoProfile);
  }

  if (acc.firmMembership) {
    const firmId = entityIds.get(acc.firmMembership.ownerKey);
    if (!firmId) {
      report.get(acc.key).actions.push({
        desc: `firm_members link to ${acc.firmMembership.ownerKey}'s firm — deferred until that firm exists (re-run)`,
        state: EXECUTE ? "FAILED" : "planned",
      });
      if (EXECUTE) fail(acc.key, `firm of ${acc.firmMembership.ownerKey} not resolved; firm_members not written`);
    } else {
      await ensureMembership(acc, "firm_members", "firm_id", firmId, userId, acc.firmMembership.role);
      const others = await otherActiveMemberships("firm_members", "firm_id", userId, firmId);
      for (const o of others) {
        await act(acc.key, `set other firm_members ${o.id} (firm ${o.firm_id}, ${o.role}) to removed`, () =>
          supabase.from("firm_members").update({ status: "removed" }).eq("id", o.id),
        );
      }
    }
  }

  if (acc.businessMembership) {
    const bizId = entityIds.get(acc.businessMembership.ownerKey);
    if (!bizId) {
      report.get(acc.key).actions.push({
        desc: `business_members link to ${acc.businessMembership.ownerKey}'s company — deferred until it exists (re-run)`,
        state: EXECUTE ? "FAILED" : "planned",
      });
      if (EXECUTE) fail(acc.key, `company of ${acc.businessMembership.ownerKey} not resolved; business_members not written`);
    } else {
      // Membership first, delete second: the user is never left with none.
      await ensureMembership(acc, "business_members", "business_id", bizId, userId, acc.businessMembership.role);
      await removePlaceholderCompany(acc, userId, bizId);
      // Any remaining active row elsewhere (not a placeholder we own) → removed.
      const others = await otherActiveMemberships("business_members", "business_id", userId, bizId);
      const ownedIds = new Set(
        (check(
          await supabase.from("business_profiles").select("id").eq("owner_user_id", userId),
          "read business_profiles",
        ) ?? []).map((r) => r.id),
      );
      for (const o of others) {
        if (ownedIds.has(o.business_id)) continue; // handled (deleted) above
        await act(acc.key, `set other business_members ${o.id} (business ${o.business_id}, ${o.role}) to removed`, () =>
          supabase.from("business_members").update({ status: "removed" }).eq("id", o.id),
        );
      }
    }
  }
}

// ─── Verify (read-only) ──────────────────────────────────────────────────────
async function verifyAll() {
  console.log("\n" + "═".repeat(78));
  console.log("  VERIFY — read-only state per account (" + HOST + ")");
  console.log("═".repeat(78));
  const authUsers = await listAllAuthUsers();
  const ownerEntity = new Map();
  const problems = [];

  for (const acc of ACCOUNTS) {
    const issues = [];
    const lines = [];
    const u = authUsers.get(acc.email.toLowerCase());
    if (!u) {
      console.log(`\n■ ${acc.key}  <${acc.email}>\n   auth user: MISSING`);
      problems.push(`${acc.key}: auth user missing`);
      continue;
    }
    try {
      lines.push(`auth user: exists, email ${u.email_confirmed_at ? "confirmed" : "NOT CONFIRMED"}`);
      if (!u.email_confirmed_at) issues.push("email not confirmed");

      const prof = check(
        await supabase
          .from("profiles")
          .select("user_type, display_name, phone, onboarding_completed, verified_at")
          .eq("id", u.id)
          .maybeSingle(),
        "read profiles",
      );
      if (!prof) issues.push("profiles row missing");
      else {
        lines.push(
          `profiles: user_type=${prof.user_type}, phone=${prof.phone ?? "null"}, onboarding_completed=${prof.onboarding_completed}`,
        );
        if (prof.user_type !== acc.userType) issues.push(`user_type ${prof.user_type} ≠ ${acc.userType}`);
        if (prof.phone !== acc.phone) issues.push(`phone ${prof.phone} ≠ ${acc.phone}`);
        if (prof.onboarding_completed !== true) issues.push("onboarding_completed is not true");
      }

      // Server tier exactly as getUserTier() (access-control.ts:94-106).
      const subs =
        check(
          await supabase
            .from("subscriptions")
            .select("tier, plan_id, current_period_end, created_at")
            .eq("user_id", u.id)
            .eq("status", "active")
            .order("created_at", { ascending: false }),
          "read subscriptions",
        ) ?? [];
      const serverTier = subs[0]?.tier ?? "free";
      const metaTier = (u.user_metadata ?? {}).tier ?? "free";
      lines.push(
        `tier: server(getUserTier)=${serverTier}${subs[0] ? ` via ${subs[0].plan_id}, ends ${subs[0].current_period_end ?? "never"}` : " (no active row)"}` +
          `, browser(user_metadata.tier)=${metaTier}, active rows=${subs.length}`,
      );
      if (serverTier !== acc.tier) issues.push(`server tier ${serverTier} ≠ ${acc.tier}`);
      if (metaTier !== acc.tier) issues.push(`browser tier ${metaTier} ≠ ${acc.tier}`);
      if (acc.planId && subs[0] && subs[0].plan_id !== acc.planId) issues.push(`plan ${subs[0].plan_id} ≠ ${acc.planId}`);
      if (subs.length > 1) issues.push(`${subs.length} active subscription rows (want 1)`);
      if (acc.tier === "free" && subs.some((s) => s.tier !== "free")) issues.push("free account holds a paid active row");

      // Role rows.
      if (acc.lawyerProfile) {
        const lp = check(
          await supabase
            .from("lawyer_profiles")
            .select(
              [...new Set(["license_number", "verification_status", "marketplace_visible", "is_accepting_clients", ...Object.keys(acc.lawyerProfile)])].join(", "),
            )
            .eq("user_id", u.id)
            .maybeSingle(),
          "read lawyer_profiles",
        );
        if (!lp) issues.push("lawyer_profiles missing");
        else {
          const listed =
            prof?.user_type === "lawyer" && lp.verification_status === "verified" && lp.marketplace_visible === true;
          lines.push(
            `lawyer_profiles: licence=${lp.license_number}, verification=${lp.verification_status}, marketplace_visible=${lp.marketplace_visible}, accepting=${lp.is_accepting_clients} → directory ${listed ? "LISTED" : "not listed"}`,
          );
          for (const [k, v] of Object.entries(diff(lp, acc.lawyerProfile))) {
            issues.push(`lawyer_profiles.${k}=${JSON.stringify(lp[k])} ≠ ${JSON.stringify(v)}`);
          }
        }
      }
      if (acc.providerProfile) {
        const pp = check(
          await supabase.from("provider_profiles").select("sub_role, verification_status, marketplace_visible").eq("user_id", u.id).maybeSingle(),
          "read provider_profiles",
        );
        if (!pp) issues.push("provider_profiles missing");
        else {
          lines.push(`provider_profiles: sub_role=${pp.sub_role}, verification=${pp.verification_status}, marketplace_visible=${pp.marketplace_visible}`);
          for (const [k, v] of Object.entries(diff(pp, acc.providerProfile))) issues.push(`provider_profiles.${k} ≠ ${JSON.stringify(v)}`);
        }
      }
      if (acc.microProfile) {
        const mp = check(
          await supabase.from("micro_profiles").select("business_name, business_type").eq("user_id", u.id).maybeSingle(),
          "read micro_profiles",
        );
        if (!mp) issues.push("micro_profiles missing");
        else {
          lines.push(`micro_profiles: business_name=${mp.business_name}, business_type=${mp.business_type}`);
          for (const [k, v] of Object.entries(diff(mp, acc.microProfile))) issues.push(`micro_profiles.${k} ≠ ${JSON.stringify(v)}`);
        }
      }
      const ownedSpecs = [
        ["firm_profiles", acc.firmProfile, "name_ar"],
        ["business_profiles", acc.businessProfile, "company_name_ar"],
        ["government_profiles", acc.govProfile, "entity_name_ar"],
        ["ngo_profiles", acc.ngoProfile, "org_name_ar"],
      ];
      for (const [table, spec, nameCol] of ownedSpecs) {
        const rows =
          check(
            await supabase.from(table).select(spec ? ["id", ...Object.keys(spec)].join(", ") : `id, ${nameCol}, verification_status`).eq("owner_user_id", u.id),
            `read ${table}`,
          ) ?? [];
        if (!spec) {
          if (rows.length) {
            lines.push(`${table}: OWNS ${rows.length} row(s) (${rows.map((r) => `"${r[nameCol]}"`).join(", ")})`);
            if (acc.businessMembership && table === "business_profiles") issues.push("member still owns a (placeholder) company");
          }
          continue;
        }
        if (rows.length !== 1) {
          issues.push(`${table}: ${rows.length} owned rows (want 1)`);
          continue;
        }
        ownerEntity.set(acc.key, rows[0].id);
        lines.push(`${table}: "${rows[0][nameCol]}", verification=${rows[0].verification_status}`);
        for (const [k, v] of Object.entries(diff(rows[0], spec))) issues.push(`${table}.${k}=${JSON.stringify(rows[0][k])} ≠ ${JSON.stringify(v)}`);
      }

      // Memberships (the tables the app reads: firm_members, business_members).
      for (const [table, col, nameRel, nameCol] of [
        ["firm_members", "firm_id", "firm_profiles", "name_ar"],
        ["business_members", "business_id", "business_profiles", "company_name_ar"],
      ]) {
        const rows =
          check(
            await supabase.from(table).select(`${col}, role, status, accepted_at, ${nameRel}(${nameCol})`).eq("user_id", u.id),
            `read ${table}`,
          ) ?? [];
        const active = rows.filter((r) => r.status === "active");
        for (const r of rows) {
          const rel = Array.isArray(r[nameRel]) ? r[nameRel][0] : r[nameRel];
          lines.push(`${table}: "${rel?.[nameCol] ?? r[col]}" role=${r.role} status=${r.status} accepted=${r.accepted_at ? "yes" : "no"}`);
        }
        const want =
          table === "firm_members"
            ? acc.firmProfile
              ? { owner: acc.key, role: "managing_partner" }
              : acc.firmMembership
                ? { owner: acc.firmMembership.ownerKey, role: acc.firmMembership.role }
                : null
            : acc.businessProfile
              ? { owner: acc.key, role: "owner" }
              : acc.businessMembership
                ? { owner: acc.businessMembership.ownerKey, role: acc.businessMembership.role }
                : null;
        if (!want) {
          if (active.length) issues.push(`unexpected active ${table} row(s)`);
          continue;
        }
        const wantEntity = ownerEntity.get(want.owner);
        if (active.length !== 1) issues.push(`${table}: ${active.length} active rows (want exactly 1)`);
        const hit = active.find((r) => r[col] === wantEntity);
        if (!hit) issues.push(`${table}: no active row in ${want.owner}'s entity`);
        else {
          if (hit.role !== want.role) issues.push(`${table}.role=${hit.role} ≠ ${want.role}`);
          if (!hit.accepted_at) issues.push(`${table}.accepted_at is null`);
        }
      }
    } catch (err) {
      issues.push(`read failed: ${err instanceof Error ? err.message : err}`);
    }

    console.log(`\n■ ${acc.key}  <${acc.email}>  → ${acc.dashboard}  [${issues.length ? "MISMATCH" : "OK"}]`);
    for (const l of lines) console.log(`   ${l}`);
    for (const i of issues) console.log(`   ✗ ${i}`);
    for (const i of issues) problems.push(`${acc.key}: ${i}`);
  }
  console.log("\n" + "─".repeat(78));
  console.log(problems.length ? `VERIFY: ${problems.length} mismatch(es).` : "VERIFY: all 12 accounts match the spec.");
  return problems;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═".repeat(78));
  console.log("  نظامي — test accounts reconcile");
  console.log(`  target: ${HOST}   service key: present (length ${SERVICE_KEY.length})`);
  console.log(
    `  mode: ${EXECUTE ? "EXECUTE (writes)" : PLAN ? "DRY-RUN (no writes)" : "VERIFY ONLY (no writes)"}` +
      `${VERIFY && PLAN ? " + verify" : ""}${RESET_PASSWORDS ? " + reset-passwords" : ""}${RANDOM_PASSWORDS ? " + random-passwords" : ""}`,
  );
  console.log("═".repeat(78));

  if (PLAN) {
    // Read-only prechecks.
    let authUsers;
    try {
      const planProblems = await checkPlans();
      for (const p of planProblems) globalFailures.push(p);
      authUsers = await listAllAuthUsers();
    } catch (err) {
      console.error(`❌ precheck failed: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
    if (globalFailures.length) {
      for (const f of globalFailures) console.error(`❌ ${f}`);
      process.exit(1);
    }

    const missing = ACCOUNTS.filter((a) => !authUsers.has(a.email.toLowerCase()));
    const needsSeedPw = (missing.length > 0 || RESET_PASSWORDS) && !RANDOM_PASSWORDS && !SEED_PASSWORD;
    if (needsSeedPw) {
      const why = RESET_PASSWORDS ? "--reset-passwords" : `${missing.length} account(s) must be created`;
      if (EXECUTE) {
        console.error(
          `❌ ${why}, but SEED_TEST_PASSWORD is not set. Set it in the environment (not on the command line) ` +
            "or pass --random-passwords.",
        );
        process.exit(1);
      }
      console.log(`⚠️  ${why}: --execute will need SEED_TEST_PASSWORD or --random-passwords.`);
    }
    console.log(`auth users found: ${ACCOUNTS.length - missing.length}/${ACCOUNTS.length}`);

    for (const acc of ACCOUNTS) {
      try {
        const userId = await reconcileAuthUser(acc, authUsers);
        if (!userId) {
          if (!EXECUTE) {
            report.get(acc.key).actions.push({
              desc: "after creation: update the signup trigger's placeholder rows, subscription and memberships (computed on --execute)",
              state: "planned",
            });
          } else if (!report.get(acc.key).failures.length) {
            fail(acc.key, "auth user was not created");
          }
          continue;
        }
        await reconcileAccount(acc, userId);
      } catch (err) {
        fail(acc.key, err instanceof Error ? err.message : String(err));
      }
    }

    // Per-account plan / result.
    for (const acc of ACCOUNTS) {
      const r = report.get(acc.key);
      console.log(`\n■ ${acc.key}  <${acc.email}>  (${acc.userType}, tier ${acc.tier}${acc.planId ? `/${acc.planId}` : ""})`);
      if (!r.actions.length && !r.failures.length) console.log("   no change");
      for (const a of r.actions) {
        const tag = a.state === "planned" ? "WOULD" : a.state === "done" ? "DONE " : a.state === "note" ? "NOTE " : a.state;
        console.log(`   [${tag}] ${a.desc}`);
      }
      for (const f of r.failures) console.log(`   ✗ ${f}`);
    }

    // Summary table.
    console.log("\n" + "═".repeat(78));
    console.log(`  SUMMARY (${EXECUTE ? "applied" : "dry-run — nothing was written"})`);
    console.log("═".repeat(78));
    console.log("| account | changes | failures | status |");
    console.log("|---|---|---|---|");
    for (const acc of ACCOUNTS) {
      const r = report.get(acc.key);
      const changes = r.actions.filter((a) => a.state !== "note").length;
      const status = r.failures.length
        ? "FAILED"
        : changes === 0
          ? "no change"
          : EXECUTE
            ? `${changes} applied`
            : `${changes} planned`;
      console.log(`| ${acc.key} | ${changes} | ${r.failures.length} | ${status} |`);
    }
    for (const f of globalFailures) console.log(`✗ ${f}`);
    if (passwordFile) {
      console.log(`\n🔐 ${passwordLog.length} password(s) written to ${path.relative(ROOT, passwordFile)} (gitignored; not printed).`);
    }
  }

  let verifyProblems = [];
  if (VERIFY) {
    try {
      verifyProblems = await verifyAll();
    } catch (err) {
      verifyProblems = [`verify failed: ${err instanceof Error ? err.message : err}`];
      console.error(`❌ ${verifyProblems[0]}`);
    }
  }

  const anyFailure =
    globalFailures.length > 0 || [...report.values()].some((r) => r.failures.length > 0) || verifyProblems.length > 0;
  process.exit(anyFailure ? 1 : 0);
}

main().catch((err) => {
  console.error("❌ unexpected failure:", err instanceof Error ? err.message : err);
  process.exit(1);
});
