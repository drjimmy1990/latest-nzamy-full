/**
 * scripts/parsers/parse-circuits-directory.mjs
 * ─────────────────────────────────────────────────────────────
 * Parser for Ministry of Justice Circuits & Entities Email Directory
 * Ingests 2,192 judicial records across 112 pages from the official Markdown archive.
 * ─────────────────────────────────────────────────────────────
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

const SOURCE_PATH = path.resolve(
  "C:/Users/LOQ/Downloads/حزمة_تسليم_المبرمج_محدثة_2026-10-09/03_المرفقات_والبيانات_المفقودة/دليل_البريد_الإلكتروني_للجهات_والإدارات_والدوائر_القضائية_وزارة_العدل.md"
);

const OUTPUT_PATH = path.resolve(projectRoot, "src/data/circuits-directory.json");

// Regions list in Saudi Arabia
const SAUDI_REGIONS = [
  "منطقة الرياض",
  "منطقة مكة المكرمة",
  "المنطقة الشرقية",
  "منطقة المدينة المنورة",
  "منطقة القصيم",
  "منطقة عسير",
  "منطقة تبوك",
  "منطقة حائل",
  "منطقة الحدود الشمالية",
  "منطقة جازان",
  "منطقة نجران",
  "منطقة الباحة",
  "منطقة الجوف"
];

// Major cities to region mapping
const CITY_TO_REGION = {
  "الرياض": "منطقة الرياض",
  "الخرج": "منطقة الرياض",
  "الدرعية": "منطقة الرياض",
  "المجمعة": "منطقة الرياض",
  "الدوادمي": "منطقة الرياض",
  "وادي الدواسر": "منطقة الرياض",
  "الأفلاج": "منطقة الرياض",
  "شقراء": "منطقة الرياض",
  "حوطة بني تميم": "منطقة الرياض",
  "عفيف": "منطقة الرياض",
  "الجمش": "منطقة الرياض",
  "القويعية": "منطقة الرياض",
  "رماح": "منطقة الرياض",
  "ثادق": "منطقة الرياض",
  "حريملاء": "منطقة الرياض",
  "السليل": "منطقة الرياض",
  "ضرما": "منطقة الرياض",
  "المزاحمية": "منطقة الرياض",

  "مكة": "منطقة مكة المكرمة",
  "مكة المكرمة": "منطقة مكة المكرمة",
  "جدة": "منطقة مكة المكرمة",
  "الطائف": "منطقة مكة المكرمة",
  "القنفذة": "منطقة مكة المكرمة",
  "الليث": "منطقة مكة المكرمة",
  "رابغ": "منطقة مكة المكرمة",
  "خليص": "منطقة مكة المكرمة",
  "رنية": "منطقة مكة المكرمة",
  "تربة": "منطقة مكة المكرمة",
  "الخرمة": "منطقة مكة المكرمة",
  "الكامل": "منطقة مكة المكرمة",

  "الدمام": "المنطقة الشرقية",
  "الخبر": "المنطقة الشرقية",
  "الأحساء": "المنطقة الشرقية",
  "الاحساء": "المنطقة الشرقية",
  "الهفوف": "المنطقة الشرقية",
  "المبرز": "المنطقة الشرقية",
  "الجبيل": "المنطقة الشرقية",
  "القطيف": "المنطقة الشرقية",
  "حفر الباطن": "المنطقة الشرقية",
  "الخفجي": "المنطقة الشرقية",
  "بقيق": "المنطقة الشرقية",
  "النعيرية": "المنطقة الشرقية",
  "رأس تنورة": "المنطقة الشرقية",
  "قرية العليا": "المنطقة الشرقية",

  "المدينة": "منطقة المدينة المنورة",
  "المدينة المنورة": "منطقة المدينة المنورة",
  "ينبع": "منطقة المدينة المنورة",
  "العلا": "منطقة المدينة المنورة",
  "مهد الذهب": "منطقة المدينة المنورة",
  "بدر": "منطقة المدينة المنورة",
  "خيبر": "منطقة المدينة المنورة",
  "الحناكية": "منطقة المدينة المنورة",

  "بريدة": "منطقة القصيم",
  "عنيزة": "منطقة القصيم",
  "الرس": "منطقة القصيم",
  "المذنب": "منطقة القصيم",
  "البكيرية": "منطقة القصيم",
  "البدائع": "منطقة القصيم",
  "الأسياح": "منطقة القصيم",
  "عيون الجواء": "منطقة القصيم",
  "رياض الخبراء": "منطقة القصيم",
  "الشماسية": "منطقة القصيم",

  "أبها": "منطقة عسير",
  "خميس مشيط": "منطقة عسير",
  "بيشة": "منطقة عسير",
  "محايل عسير": "منطقة عسير",
  "محايل": "منطقة عسير",
  "النماص": "منطقة عسير",
  "أحد رفيدة": "منطقة عسير",
  "ظهران الجنوب": "منطقة عسير",
  "بلقرن": "منطقة عسير",
  "سراة عبيدة": "منطقة عسير",
  "رجال ألمع": "منطقة عسير",
  "تثليث": "منطقة عسير",
  "طريب": "منطقة عسير",

  "تبوك": "منطقة تبوك",
  "تيماء": "منطقة تبوك",
  "ضباء": "منطقة تبوك",
  "الوجه": "منطقة تبوك",
  "حقل": "منطقة تبوك",
  "أملج": "منطقة تبوك",

  "حائل": "منطقة حائل",
  "بقعاء": "منطقة حائل",
  "الغزالة": "منطقة حائل",
  "الشنان": "منطقة حائل",

  "عرعر": "منطقة الحدود الشمالية",
  "رفحاء": "منطقة الحدود الشمالية",
  "طريف": "منطقة الحدود الشمالية",
  "العويقيلة": "منطقة الحدود الشمالية",

  "جازان": "منطقة جازان",
  "صبيا": "منطقة جازان",
  "أبو عريش": "منطقة جازان",
  "صامطة": "منطقة جازان",
  "بيش": "منطقة جازان",
  "الدرب": "منطقة جازان",
  "فرسان": "منطقة جازان",
  "ضمد": "منطقة جازان",
  "الشقيق": "منطقة جازان",
  "فيفاء": "منطقة جازان",
  "العيدابي": "منطقة جازان",
  "أحد المسارحة": "منطقة جازان",

  "نجران": "منطقة نجران",
  "شرورة": "منطقة نجران",
  "حبونا": "منطقة نجران",
  "بدر الجنوب": "منطقة نجران",
  "يدمة": "منطقة نجران",

  "الباحة": "منطقة الباحة",
  "بلجرشي": "منطقة الباحة",
  "المندق": "منطقة الباحة",
  "المخواة": "منطقة الباحة",
  "قلوة": "منطقة الباحة",
  "العقيق": "منطقة الباحة",

  "سكاكا": "منطقة الجوف",
  "القريات": "منطقة الجوف",
  "دومة الجندل": "منطقة الجوف",
  "طبرجل": "منطقة الجوف"
};

function detectCategory(name) {
  if (name.includes("استئناف")) return "استئناف";
  if (name.includes("تجارية")) return "محكمة تجارية";
  if (name.includes("عمالية")) return "محكمة عمالية";
  if (name.includes("أحوال شخصية")) return "محكمة أحوال شخصية";
  if (name.includes("جزائية")) return "محكمة جزائية";
  if (name.includes("تنفيذ")) return "محكمة تنفيذ";
  if (name.includes("المحكمة العامة") || name.includes("العامة")) return "محكمة عامة";
  if (name.includes("كتابة العدل") || name.includes("كتابة عدل")) return "كتابة عدل";
  if (name.includes("فرع") || name.includes("وكالة") || name.includes("إدارة") || name.includes("مكتب")) return "إدارة وفروع الوزارة";
  return "محاكم ودوائر قضائية";
}

function detectRegionAndCity(name, rawRegion) {
  if (rawRegion && rawRegion.trim()) {
    let clean = rawRegion.trim();
    if (clean === "المنطقة الشرقية" || clean.includes("الشرقية")) return { region: "المنطقة الشرقية", city: "المنطقة الشرقية" };
    if (!clean.startsWith("منطقة") && !clean.includes("الشرقية")) clean = "منطقة " + clean;
    return { region: clean, city: rawRegion.trim() };
  }

  // Detect city from name
  for (const [city, region] of Object.entries(CITY_TO_REGION)) {
    // Regex looking for 'بـ' or 'في' followed by city name
    const pattern = new RegExp(`(?:ب|في\\s+|محافظة\\s+|مدينة\\s+|منطقة\\s+)${city}\\b`, "i");
    if (pattern.test(name) || name.endsWith(" " + city)) {
      return { region, city };
    }
  }

  return { region: "منطقة الرياض", city: "الرياض" }; // fallback
}

export function parseCircuitsDirectory() {
  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(`Source file not found at: ${SOURCE_PATH}`);
  }

  const content = fs.readFileSync(SOURCE_PATH, "utf8");

  // 1. Parse the 36 known verification cases
  const verificationMap = new Map();
  const warningSectionMatch = content.match(/## ⚠️ حالات تتطلب تحققاً يدوياً قبل الاستخدام[\s\S]*?(?=\n\*\*\*)/);
  if (warningSectionMatch) {
    const warningLines = warningSectionMatch[0].split("\n");
    for (const line of warningLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        const cols = trimmed.split("|").slice(1, -1).map(c => c.trim().replace(/`/g, ""));
        if (cols.length >= 6 && /^\d+$/.test(cols[0])) {
          const page = parseInt(cols[1], 10);
          const name = cols[2];
          const printed = cols[3];
          const suggested = cols[4];
          const status = cols[5];
          verificationMap.set(`${page}::${printed}`, { suggested, status, name });
        }
      }
    }
  }

  // 2. Parse Pages Section
  const parts = content.split("## صفحات الدليل (نسخ حرفي كامل، صفحة بصفحة)");
  if (parts.length < 2) {
    throw new Error("Could not find pages section in source file");
  }

  const pagesText = parts[1];
  const lines = pagesText.split("\n");

  const circuits = [];
  let currentPage = 1;
  let counter = 1;

  for (const line of lines) {
    const pageMatch = line.match(/<!-- ARTICLE_START.*?"number":\s*"(\d+)".*?-->/);
    if (pageMatch) {
      currentPage = parseInt(pageMatch[1], 10);
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cols = trimmed.split("|").slice(1, -1).map(c => c.trim());
      // Skip header and separator rows
      if (cols.every(c => /^[-:]+$/.test(c))) continue;
      if (cols.includes("الجهة") && cols.some(c => c.includes("البريد"))) continue;

      let name = "";
      let regionRaw = "";
      let emailRaw = "";

      if (cols.length === 3) {
        name = cols[0];
        regionRaw = cols[1];
        emailRaw = cols[2];
      } else if (cols.length === 2) {
        name = cols[0];
        regionRaw = "";
        emailRaw = cols[1];
      } else {
        continue;
      }

      // Clean and parse email
      let cleanEmail = emailRaw.replace(/`/g, "").trim();
      let hasWarningMarker = emailRaw.includes("⚠️");
      let printedEmail = cleanEmail;
      let suggestedEmail = null;
      let verificationStatus = "معتمد";

      if (hasWarningMarker) {
        const printedMatch = emailRaw.match(/⚠️\s*`?([^\s`*(]+)`?/);
        const suggestedMatch = emailRaw.match(/الصيغة المرجّحة:\s*`?([^\s`*)]+)`?/);
        const noteMatch = emailRaw.match(/\*\((.*?)\)\*/);

        if (printedMatch) {
          printedEmail = printedMatch[1].trim();
        }
        if (suggestedMatch) {
          suggestedEmail = suggestedMatch[1].trim();
        }
        if (noteMatch) {
          verificationStatus = noteMatch[1].trim();
        } else {
          verificationStatus = "يحتاج تحققاً يدوياً";
        }
      }

      // Check if this row is in the 36 known verification cases from the header table
      const key = `${currentPage}::${printedEmail}`;
      const verifyInfo = verificationMap.get(key);

      if (verifyInfo) {
        suggestedEmail = verifyInfo.suggested;
        verificationStatus = verifyInfo.status;
      }

      const category = detectCategory(name);
      const { region, city } = detectRegionAndCity(name, regionRaw);

      const id = `moj-cir-${String(counter).padStart(4, "0")}`;
      counter++;

      const entry = {
        id,
        page: currentPage,
        name,
        category,
        region,
        city,
        email: suggestedEmail || printedEmail,
        rawEmail: printedEmail,
        needsVerification: hasWarningMarker || !!verifyInfo,
        suggestedEmail: suggestedEmail,
        verificationStatus: verificationStatus
      };

      circuits.push(entry);
    }
  }

  // Write output JSON
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const payload = {
    metadata: {
      title: "دليل البريد الإلكتروني للجهات والإدارات والدوائر القضائية",
      source: "وزارة العدل — المملكة العربية السعودية",
      totalCount: circuits.length,
      extractedAt: new Date().toISOString(),
      verifiedCount: circuits.filter(c => !c.needsVerification).length,
      needsVerificationCount: circuits.filter(c => c.needsVerification).length,
      categoriesCount: Array.from(new Set(circuits.map(c => c.category))).length,
      regionsCount: Array.from(new Set(circuits.map(c => c.region))).length
    },
    circuits
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf8");
  console.log(`✔ Successfully parsed ${circuits.length} circuits.`);
  console.log(`✔ Verified: ${payload.metadata.verifiedCount}, Needs verification: ${payload.metadata.needsVerificationCount}`);
  console.log(`✔ Output saved to: ${OUTPUT_PATH}`);

  return payload;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  parseCircuitsDirectory();
}
