#!/usr/bin/env node
/**
 * scripts/seed-test-lawyers.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates or updates 10 realistic test lawyer accounts on self-hosted Supabase
 * with known emails and passwords, verified profiles, and active pro subscriptions.
 *
 * Usage:
 *   node scripts/seed-test-lawyers.mjs                # dry-run (preview only)
 *   node scripts/seed-test-lawyers.mjs --execute      # creates the accounts
 *   node scripts/seed-test-lawyers.mjs --execute --password="CustomPassword123!"
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Environment Loading (.env.local) ─────────────────────────────────────────
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

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
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
  console.error(`⛔ Refusing to run: target host ${HOST} is cloud Supabase.`);
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── CLI Arguments ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute");

let customPassword = null;
const pwArg = argv.find((a) => a.startsWith("--password="));
if (pwArg) {
  customPassword = pwArg.slice("--password=".length).trim();
} else if (process.env.SEED_LAWYER_PASSWORD) {
  customPassword = process.env.SEED_LAWYER_PASSWORD.trim();
}

const DEFAULT_PASSWORD = customPassword || "NezamyLawyer2026!";

// ─── 10 Diverse Saudi Lawyer Profiles ────────────────────────────────────────
const LAWYERS_DATA = [
  {
    num: 1,
    nameAr: "المحامي صالح جمعان القارحي",
    nameEn: "Saleh Jumaan Al-Qarhi",
    specialties: ["قضايا تجارية", "شركات", "تحكيم منازعات"],
    bioAr: "محامٍ ومحكم تجاري معتمد، خبرة في صياغة العقود التجارية وتسوية المنازعات ومحاكم الاستئناف التجارية.",
    license: "1448-LAW-001",
    experience: 11,
    phone: "+966510000001",
  },
  {
    num: 2,
    nameAr: "المحامي عبدالعزيز احمد العمودي",
    nameEn: "Abdulaziz Ahmed Al-Amoudi",
    specialties: ["ملكية فكرية", "تقنية المعلومات", "استثمار أجنبي"],
    bioAr: "مستشار قانوني متخصص في حماية العلامات التجارية، براءات الاختراع وتراخيص الاستثمار لوزارة الاستثمار.",
    license: "1448-LAW-002",
    experience: 8,
    phone: "+966510000002",
  },
  {
    num: 3,
    nameAr: "الأستاذة مانعه القحطاني",
    nameEn: "Manea Al-Qahtani",
    specialties: ["قضايا عمالية", "تأمينات اجتماعية", "لوائح عمل"],
    bioAr: "خبيرة النزاعات العمالية وصياغة لوائح تنظيم العمل للمنشآت والمرافعة أمام المحاكم العمالية ولجان التأمينات.",
    license: "1448-LAW-003",
    experience: 9,
    phone: "+966510000003",
  },
  {
    num: 4,
    nameAr: "المحامي محمد اسامه كمال",
    nameEn: "Mohammed Osama Kamal",
    specialties: ["أحوال شخصية", "تركات وقسمة أموال", "وصايا وأوقاف"],
    bioAr: "محامٍ متخصص في قضايا الأحوال الشخصية، تصفية التركات الكبرى وتأسيس الأوقاف العائلية أمام محاكم الأحوال.",
    license: "1448-LAW-004",
    experience: 12,
    phone: "+966510000004",
  },
  {
    num: 5,
    nameAr: "المحامي محمد البوقرين",
    nameEn: "Mohammed Al-Buqrin",
    specialties: ["نزاعات عقارية", "عقود مقاولات", "مساهمات عقارية"],
    bioAr: "محامٍ مرخص متخصص في المنازعات العقارية، عقود الفيديك (FIDIC) والمرافعة في تصفية المساهمات وتوثيق الملكيات.",
    license: "1448-LAW-005",
    experience: 14,
    phone: "+966510000005",
  },
  {
    num: 6,
    nameAr: "أ. نورة بنت فهد العتيبي",
    nameEn: "Noura Al-Otaibi",
    specialties: ["منازعات ضريبية", "جمارك", "بنوك وتمويل"],
    bioAr: "مستشارة معتمدة في لجان الزكاة والضريبة والجمارك ولجان المنازعات المصرفية والتمويلية بالمملكة.",
    license: "1448-LAW-006",
    experience: 7,
    phone: "+966510000006",
  },
  {
    num: 7,
    nameAr: "أ. تركي بن صالح الغامدي",
    nameEn: "Turki Al-Ghamdi",
    specialties: ["قضايا جنائية", "جرائم معلوماتية", "مكافحة غسل الأموال"],
    bioAr: "محامٍ مترافع أمام المحاكم الجزائية ومحاكم الاستئناف، خبير بالجرائم السيبرانية ونظام مكافحة الاحتيال المالي.",
    license: "1448-LAW-007",
    experience: 10,
    phone: "+966510000007",
  },
  {
    num: 8,
    nameAr: "أ. هند بنت سليمان المطيري",
    nameEn: "Hind Al-Mutairi",
    specialties: ["عقود إدارية", "منافسات حكومية", "ديوان المظالم"],
    bioAr: "مستشارة قانونية متخصصة في نظام المنافسات والمشتريات الحكومية والتظلمات أمام المحاكم الإدارية بديوان المظالم.",
    license: "1448-LAW-008",
    experience: 13,
    phone: "+966510000008",
  },
  {
    num: 9,
    nameAr: "أ. عمر بن إبراهيم الزهراني",
    nameEn: "Omar Al-Zahrani",
    specialties: ["حوكمة شركات", "امتثال نظامي", "اندماج واستحواذ"],
    bioAr: "محامٍ متخصص في صفقات الاندماج والاستحواذ، لوائح الحوكمة، وإعادة الهيكلة المالية وفق نظام الإفلاس.",
    license: "1448-LAW-009",
    experience: 15,
    phone: "+966510000009",
  },
  {
    num: 10,
    nameAr: "أ. لمى بنت طارق الشهري",
    nameEn: "Lama Al-Shehri",
    specialties: ["سوق مال وأسهم", "تأمين", "حماية مستهلك"],
    bioAr: "محامية متخصصة في منازعات الأوراق المالية ولجنة الفصل في منازعات التأمين وقضايا الامتياز التجاري.",
    license: "1448-LAW-010",
    experience: 6,
    phone: "+966510000010",
  },
];

const nowIso = () => new Date().toISOString();
function inOneYear() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

async function run() {
  console.log("══════════════════════════════════════════════════════════════════════════════");
  console.log(`  نظامي — إنشاء / تحديث 10 حسابات محامين اختبارية`);
  console.log(`  Target: ${HOST} | Mode: ${EXECUTE ? "EXECUTE (Applying changes)" : "DRY-RUN (Preview only)"}`);
  console.log(`  Password for all 10 accounts: ${DEFAULT_PASSWORD}`);
  console.log("══════════════════════════════════════════════════════════════════════════════\n");

  // 1. Fetch existing auth users
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) {
    console.error("❌ Failed to list auth users:", listErr.message);
    process.exit(1);
  }
  const existingUsersByEmail = new Map(listData.users.map((u) => [u.email.toLowerCase(), u]));

  const summary = [];

  for (const lawyer of LAWYERS_DATA) {
    const email = `lawyer${lawyer.num}@nezamy.sa`;
    const existing = existingUsersByEmail.get(email.toLowerCase());
    let userId = existing?.id;

    console.log(`\n👨‍⚖️ [${lawyer.num}/10] ${email} — ${lawyer.nameAr}`);

    if (!EXECUTE) {
      console.log(`   [DRY-RUN] Will ${existing ? "update existing user" : "create new user"} with password: ${DEFAULT_PASSWORD}`);
      console.log(`   [DRY-RUN] Tier: pro (lawyer-pro) | Verified: YES | Visible: YES | License: ${lawyer.license}`);
      summary.push({ email, password: DEFAULT_PASSWORD, name: lawyer.nameAr, status: existing ? "Will Update" : "Will Create" });
      continue;
    }

    // Phase 1: Auth User
    if (!existing) {
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          user_type: "lawyer",
          full_name: lawyer.nameAr,
          display_name: lawyer.nameAr,
          display_name_en: lawyer.nameEn,
          tier: "pro",
          phone: lawyer.phone,
        },
      });
      if (createErr) {
        console.error(`   ❌ Failed to create auth user: ${createErr.message}`);
        continue;
      }
      userId = newUser.user.id;
      console.log(`   ✓ Auth user created (ID: ${userId})`);
    } else {
      const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          ...existing.user_metadata,
          user_type: "lawyer",
          full_name: lawyer.nameAr,
          display_name: lawyer.nameAr,
          display_name_en: lawyer.nameEn,
          tier: "pro",
          phone: lawyer.phone,
        },
      });
      if (updateErr) {
        console.error(`   ❌ Failed to update auth user: ${updateErr.message}`);
        continue;
      }
      console.log(`   ✓ Auth user updated & password reset`);
    }

    // Phase 2: Profiles Table
    const { error: profileErr } = await supabase.from("profiles").upsert({
      id: userId,
      user_type: "lawyer",
      display_name: lawyer.nameAr,
      display_name_en: lawyer.nameEn,
      phone: lawyer.phone,
      onboarding_completed: true,
      verified_at: nowIso(),
    });
    if (profileErr) {
      console.error(`   ❌ Failed to update profile: ${profileErr.message}`);
    } else {
      console.log(`   ✓ Profile updated (onboarding=true, verified)`);
    }

    // Phase 3: Lawyer Profiles Table
    const { error: lawyerProfErr } = await supabase.from("lawyer_profiles").upsert({
      user_id: userId,
      license_number: lawyer.license,
      years_experience: lawyer.experience,
      specialties: lawyer.specialties,
      bio_ar: lawyer.bioAr,
      is_accepting_clients: true,
      marketplace_visible: true,
      verification_status: "verified",
      updated_at: nowIso(),
    });
    if (lawyerProfErr) {
      console.error(`   ❌ Failed to update lawyer_profile: ${lawyerProfErr.message}`);
    } else {
      console.log(`   ✓ Lawyer profile set (License: ${lawyer.license}, Marketplace: Visible)`);
    }

    // Phase 4: Subscriptions Table
    const { data: subRows } = await supabase
      .from("subscriptions")
      .select("id, status")
      .eq("user_id", userId)
      .eq("status", "active");

    if (!subRows || subRows.length === 0) {
      const { error: subErr } = await supabase.from("subscriptions").insert({
        user_id: userId,
        plan_id: "lawyer-pro",
        tier: "pro",
        billing_cycle: "custom",
        status: "active",
        started_at: nowIso(),
        current_period_start: nowIso(),
        current_period_end: inOneYear(),
        auto_renew: false,
        metadata: { method: "test_seed", purpose: "test_lawyers_10" },
      });
      if (subErr) {
        console.error(`   ❌ Failed to insert subscription: ${subErr.message}`);
      } else {
        console.log(`   ✓ Active pro subscription granted (1 year)`);
      }
    } else {
      console.log(`   ✓ Existing active subscription retained`);
    }

    summary.push({
      email,
      password: DEFAULT_PASSWORD,
      name: lawyer.nameAr,
      status: "Ready",
      license: lawyer.license,
    });
  }

  // ─── Save Credentials Markdown File ──────────────────────────────────────────
  const outDir = path.join(ROOT, "outputs", "test-accounts");
  fs.mkdirSync(outDir, { recursive: true });
  const credentialsPath = path.join(outDir, "lawyers-10-credentials.md");

  let mdContent = `# ⚖️ قائمة حسابات المحامين الـ 10 للاختبار (Test Lawyers)\n\n`;
  mdContent += `**الخادم:** \`${HOST}\`\n`;
  mdContent += `**تاريخ الإنشاء:** ${new Date().toLocaleString("ar-SA")}\n`;
  mdContent += `**لوحة الدخول:** \`/dashboard/lawyer\`\n\n`;
  mdContent += `| # | البريد الإلكتروني | كلمة المرور | الاسم | التخصصات الرئيسية | رقم الرخصة |\n`;
  mdContent += `|:---:|---|---|---|---|:---:|\n`;

  LAWYERS_DATA.forEach((l, idx) => {
    const email = `lawyer${l.num}@nezamy.sa`;
    mdContent += `| ${l.num} | \`${email}\` | \`${DEFAULT_PASSWORD}\` | ${l.nameAr} | ${l.specialties.join("، ")} | \`${l.license}\` |\n`;
  });

  mdContent += `\n> **ملاحظة:** جميع الحسابات موثقة (Verified)، ذات باقة برو نشطة (Pro)، وظاهرة في دليل وسوق المحامين.\n`;

  fs.writeFileSync(credentialsPath, mdContent, "utf-8");
  console.log(`\n📄 Credentials saved to: outputs/test-accounts/lawyers-10-credentials.md`);

  if (!EXECUTE) {
    console.log(`\n💡 To execute and create these accounts on ${HOST}, run:`);
    console.log(`   node scripts/seed-test-lawyers.mjs --execute\n`);
  }
}

run().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
