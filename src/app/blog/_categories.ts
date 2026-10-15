/**
 * Blog category labels — pure, so `node --test` can import it.
 *
 * `articles.category` holds three kinds of value, depending on how each
 * article was seeded (blog-toolkit/seed-blog.mjs:252 writes
 * `CATEGORY_AR[folder] || fm.category || folder`):
 *   1. an Arabic label — the folder was one of CATEGORY_AR's keys;
 *   2. a raw section code — the corpus frontmatter uses the OTHER numbering,
 *      the one in the `blog_sections` table (20260716_blog_seo_aeo_geo.sql:
 *      sec_04_civil, sec_05_commercial, sec_07_labor, sec_30_culture…), which
 *      CATEGORY_AR does not key on, so the code itself was stored;
 *   3. a free Arabic label written in the frontmatter.
 * The blog printed case 2 as is — «sec_05_commercial» on the card, the pill
 * and the breadcrumb.
 *
 * Labels are CATEGORY_AR's values (seed-blog.mjs:60-91), copied here because
 * the seeder is a Node script outside `src`. A code from either numbering is
 * resolved by its topic suffix (`sec_NN_<topic>`), so `sec_04_civil` and
 * `sec_03_civil` both read «المعاملات المدنية والأحوال الشخصية والعقود».
 * An unknown `sec_*` code is never printed: it gets no label.
 */

/** seed-blog.mjs CATEGORY_AR — keep in sync with it. */
export const BLOG_CATEGORY_AR: Record<string, string> = {
  sec_00_procedural: "أنظمة المرافعات والإجراءات القضائية والتنفيذ",
  sec_01_criminal: "الأنظمة الجزائية والجرائم الجنائية",
  sec_02_admin: "القضاء الإداري ومنازعات ديوان المظالم",
  sec_03_civil: "المعاملات المدنية والأحوال الشخصية والعقود",
  sec_04_commercial: "الأنظمة التجارية والشركات والإفلاس",
  sec_05_ip: "الملكية الفكرية وبراءات الاختراع والعلامات التجارية",
  sec_06_labor: "أنظمة العمل والعمال والخدمة المدنية",
  sec_07_real_estate_construction: "الأنظمة العقارية والبناء والمقاولات",
  sec_08_financial: "الأنظمة المالية والمصرفية والتمويل",
  sec_09_tax: "الأنظمة الضريبية والزكوية والجمركية",
  sec_10_health: "الأنظمة الصحية والدوائية ومزاولة المهن",
  sec_11_environment: "الأنظمة البيئية والأرصاد وحماية البيئة",
  sec_12_tech: "أنظمة التقنية والاتصالات والأمن السيبراني والذكاء الاصطناعي",
  sec_13_logistics: "الأنظمة اللوجستية والنقل والموانئ والطيران",
  sec_14_energy: "أنظمة الطاقة والتعدين والكهرباء والغاز",
  sec_15_media: "أنظمة الإعلام والنشر والمحتوى الإلكتروني",
  sec_16_industry: "الأنظمة الصناعية والمصانع ومناطق مدن",
  sec_17_constitutional: "الأنظمة الدستورية والإدارية والسيادية",
  sec_18_agriculture_food: "الأنظمة الغذائية والزراعية والمياه والثروة الحيوانية",
  sec_19_investment: "أنظمة الاستثمار الأجنبي والخصخصة والتنافسية",
  sec_20_education: "أنظمة التعليم والجامعات والتدريب",
  sec_21_sports: "أنظمة الرياضة والترفيه والفعاليات",
  sec_22_hajj: "أنظمة الحج والعمرة والخدمات الدينية",
  sec_23_defense: "الأنظمة العسكرية والأمنية والدفاع الوطني",
  sec_24_social: "أنظمة الرعاية الاجتماعية والأسرة والأوقاف",
  sec_25_tourism: "أنظمة السياحة والآثار والفنادق والضيافة",
  sec_26_municipal: "الأنظمة البلدية والتخطيط العمراني وتراخيص البناء",
  sec_27_culture: "الأنظمة الثقافية والتراث الوطني والفنون",
  sec_28_arbitration: "أنظمة التحكيم والوساطة وفض المنازعات البديلة",
  sec_29_international: "الأنظمة والمعاهدات والتحكيم والقضايا الدولية",
};

/** Topic suffix → label: every CATEGORY_AR topic, plus the blog_sections topics it names differently. */
const TOPIC_AR: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [code, label] of Object.entries(BLOG_CATEGORY_AR)) {
    out[code.replace(/^sec_\d+_/, "")] = label;
  }
  // blog_sections spellings with no CATEGORY_AR key of their own.
  out.execution = BLOG_CATEGORY_AR.sec_00_procedural; // «…والتنفيذ»
  out.real_estate = BLOG_CATEGORY_AR.sec_07_real_estate_construction;
  out.construction = BLOG_CATEGORY_AR.sec_07_real_estate_construction;
  out.transport = BLOG_CATEGORY_AR.sec_13_logistics; // «…والنقل…»
  return out;
})();

/** Shown when an article has no usable category at all. */
export const BLOG_CATEGORY_FALLBACK = "مقالات قانونية";

/**
 * The Arabic label for a stored category, or `null` when there is nothing
 * printable (empty, or a `sec_*` code no table knows).
 */
export function blogCategoryLabel(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (BLOG_CATEGORY_AR[value]) return BLOG_CATEGORY_AR[value];
  const m = /^sec_\d+_(.+)$/i.exec(value);
  if (m) return TOPIC_AR[m[1].toLowerCase()] ?? null;
  if (/^sec_/i.test(value)) return null;
  return value;
}

export interface CategoryPill {
  /** The label — what the reader sees and what identifies the pill. */
  id: string;
  label: string;
  /** Every stored `category` value the pill stands for (sent as the filter). */
  values: string[];
  count: number;
}

/**
 * /api/v1/blog/categories tallies the raw column, so one topic can arrive as
 * an Arabic label AND as its code — two pills with the same name. Group by
 * label; a value with no label is left out of the pills (its articles are
 * still listed under «الكل»).
 */
export function groupCategoryPills(rows: { category: string; count: number }[]): CategoryPill[] {
  const byLabel = new Map<string, CategoryPill>();
  for (const row of rows) {
    const label = blogCategoryLabel(row.category);
    if (!label) continue;
    const pill = byLabel.get(label) ?? { id: label, label, values: [], count: 0 };
    pill.values.push(row.category);
    pill.count += row.count;
    byLabel.set(label, pill);
  }
  return [...byLabel.values()].sort((a, b) => b.count - a.count);
}
