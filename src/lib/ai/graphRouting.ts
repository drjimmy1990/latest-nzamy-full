/**
 * graphRouting.ts — the labels the legal graph routes by (20261116 batch).
 *
 * Laws: the library files every law under one of 30 sections (laws.section_code,
 * "00".."29"). A question about a civil matter should lean on the civil
 * section; an exception, a reference or a penalty that crosses sections still
 * comes through its explicit link (retrieve decides that, not this file).
 *
 * Judicial principles: every collection has a track (judicial_collections.track):
 *   admin     ديوان المظالم — administrative by default. Before the transfer of
 *             jurisdiction the Board also judged commercial and criminal cases;
 *             its commercial / criminal circuits are routed by that subject.
 *   ordinary  المبادئ والقرارات القضائية، تقريرات محكمة التمييز، السوابق القضائية
 *             (وزارة العدل): everything except administrative questions.
 *   semi      quasi-judicial committees: each governs specific laws (customs,
 *             banking, securities…). COMMITTEE_FAMILIES names them; the laws are
 *             found by title in the library itself, so no slug is hard-coded.
 *
 * Pure (no imports) so `node --test` runs it and the watchdog and the explorer
 * share one definition. Nothing here enters embedded text: these labels go to
 * node metadata only, so they never cost a re-embedding.
 */

// ─── Sections ─────────────────────────────────────────────────────────────────

export const SECTION_LABELS: Readonly<Record<string, string>> = {
  "00": "الإجرائي والقضائي",
  "01": "الجنائي والعقوبات",
  "02": "الإداري والخدمة المدنية",
  "03": "المدني والأحوال الشخصية",
  "04": "التجاري والشركات",
  "05": "الملكية الفكرية",
  "06": "العمل والتأمينات",
  "07": "العقاري والبناء والمقاولات",
  "08": "المالي والمصرفي",
  "09": "الضريبي والزكوي والجمركي",
  "10": "الصحي والدوائي",
  "11": "البيئة والمياه والزراعة",
  "12": "التقنية والاتصالات والفضاء",
  "13": "النقل والخدمات اللوجستية",
  "14": "الطاقة",
  "15": "الإعلام والنشر",
  "16": "الصناعة والتعدين",
  "17": "الدستوري والسيادي",
  "18": "الغذائي والزراعي والحيواني",
  "19": "الاستثمار والتخصيص",
  "20": "التعليم والتدريب",
  "21": "الرياضة والشباب",
  "22": "الحج والعمرة",
  "23": "الدفاع والأمن الوطني",
  "24": "الاجتماعي والقطاع الثالث والأوقاف",
  "25": "السياحة والضيافة",
  "26": "الشؤون البلدية والتخطيط الحضري",
  "27": "الثقافة والترفيه",
  "28": "التحكيم وتسوية النزاعات",
  "29": "العلاقات الدولية والاتفاقيات",
};

/** The section every other section relies on (procedure): never routed away. */
export const PROCEDURAL_SECTION = "00";
/** International agreements: filed by form, not subject — never votes for a question's section. */
export const AGREEMENTS_SECTION = "29";
export const ADMINISTRATIVE_SECTION = "02";

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** "06" / "6" / "SA-06" / "٠٦" → "06"; anything outside 00..29 (or "غير_مصنف") → null. */
export function normalizeSectionCode(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw)
    .trim()
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/^SA-/i, "");
  if (!/^\d{1,2}$/.test(text)) return null;
  const code = text.padStart(2, "0");
  return code in SECTION_LABELS ? code : null;
}

// ─── Judicial tracks ──────────────────────────────────────────────────────────

export type TrackClass = "admin" | "ordinary" | "semi";

export interface TrackRouting {
  track_class: TrackClass | null;
  /**
   * A Board of Grievances circuit that judged a non-administrative subject
   * (before the transfer of jurisdiction): routed like that subject's section.
   */
  subject_section: string | null;
}

const ADMIN_TRACK = /^(admin|administrative|إداري|اداري|القضاء الإداري)$/i;
const ORDINARY_TRACK = /^(ordinary|general|عادي|القضاء العام|القضاء العادي)$/i;
const SEMI_TRACK = /^(semi|quasi|quasi[-_ ]judicial|شبه قضائي|لجان شبه قضائية)$/i;

/** The track of a collection, from its stored code, else from its court and title. */
export function classifyTrack(input: { track?: string | null; court?: string | null; title?: string | null }): TrackRouting {
  const track = (input.track ?? "").trim();
  const where = `${input.court ?? ""} ${input.title ?? ""}`;
  let cls: TrackClass | null = null;
  if (ADMIN_TRACK.test(track)) cls = "admin";
  else if (ORDINARY_TRACK.test(track)) cls = "ordinary";
  else if (SEMI_TRACK.test(track)) cls = "semi";
  else if (/ديوان المظالم|المحكمة الإدارية|المحاكم الإدارية|القضاء الإداري/.test(where)) cls = "admin";
  else if (/لجن[ةه]|اللجان|الأمانة العامة للجان/.test(where)) cls = "semi";
  else if (track || where.trim()) cls = "ordinary";

  let subject: string | null = null;
  if (cls === "admin") {
    if (/الدوائر التجارية|الأحكام والمبادئ التجارية|التجارية بديوان المظالم/.test(where)) subject = "04";
    else if (/الدوائر الجزائية|الأحكام والمبادئ الجزائية/.test(where)) subject = "01";
  }
  return { track_class: cls, subject_section: subject };
}

// ─── Quasi-judicial committees → the laws they apply ──────────────────────────

export interface CommitteeFamily {
  id: string;
  label: string;
  /** Matched against the collection's court + title. */
  trigger: RegExp;
  /** Law titles this committee applies (matched against library law titles). */
  laws: readonly RegExp[];
  /** Law titles that look alike but belong elsewhere. */
  exclude?: RegExp;
}

// No `\b` in these patterns: JavaScript's word boundary is ASCII-only, so it never
// matches next to an Arabic letter.
export const COMMITTEE_FAMILIES: readonly CommitteeFamily[] = [
  {
    id: "insurance",
    label: "لجان الفصل في المنازعات والمخالفات التأمينية",
    trigger: /الت[أا]مينية|منازعات الت[أا]مين|مخالفات الت[أا]مين/,
    laws: [/الت[أا]مين التعاوني/, /مراقبة شركات الت[أا]مين/, /الضمان الصحي التعاوني/, /وسطاء الت[أا]مين|وساطة الت[أا]مين/, /نظام الت[أا]مين/],
    exclude: /الت[أا]مينات الاجتماعية|التعطل عن العمل/,
  },
  {
    id: "customs",
    label: "اللجان الجمركية",
    trigger: /جمرك|الجمارك/,
    laws: [/نظام الجمارك|قانون الجمارك|الجمارك الموحد|الرسوم الجمركية|الإجراءات الجمركية|التعريفة الجمركية|التخليص الجمركي|المنافذ الجمركية|الاستشارات الجمركية/],
  },
  {
    id: "zakat",
    label: "اللجان الزكوية",
    trigger: /زكوي|الزكاة|الزكوية/,
    laws: [/جباية الزكاة|لائحة الزكاة|محاسبة الزكاة/],
  },
  {
    id: "income_tax",
    label: "لجان ضريبة الدخل",
    trigger: /ضريبة الدخل|اللجان الضريبية|الدعاوى الضريبية|المنازعات الضريبية|الزكوية والضريبية/,
    laws: [/ضريبة الدخل/],
  },
  {
    id: "vat",
    label: "لجان ضريبة القيمة المضافة",
    trigger: /القيمة المضافة|اللجان الضريبية|الدعاوى الضريبية|المنازعات الضريبية|الزكوية والضريبية/,
    laws: [/القيمة المضافة/],
  },
  {
    id: "excise",
    label: "لجان الضريبة الانتقائية",
    trigger: /السلع الانتقائية|الضريبة الانتقائية|اللجان الضريبية|الزكوية والضريبية/,
    laws: [/الانتقائية/],
  },
  {
    id: "real_estate_tax",
    label: "لجان ضريبة التصرفات العقارية",
    trigger: /التصرفات العقارية|الضريبة العقارية|اللجان الضريبية|الزكوية والضريبية/,
    laws: [/التصرفات العقارية/],
  },
  {
    id: "tax_procedure",
    label: "الإجراءات أمام اللجان الزكوية والضريبية والجمركية",
    trigger: /زكوي|ضريب|جمرك/,
    laws: [/المخالفات والمنازعات الضريبية|الخلافات والمنازعات الزكوية|قواعد عمل لجان الفصل/, /الإجراءات الزكوية|الإجراءات الضريبية/],
  },
  {
    id: "banking",
    label: "لجان المنازعات والمخالفات المصرفية والتمويلية",
    trigger: /المصرفي|التمويلي|البنوك/,
    laws: [/مراقبة البنوك/, /نظام البنك المركزي|نظام مؤسسة النقد/, /مراقبة شركات التمويل/, /الإيجار التمويلي/, /التمويل العقاري/, /المدفوعات وخدماتها/, /التمويل الاستهلاكي/],
    exclude: /غسل الأموال|تمويل الإرهاب/,
  },
  {
    id: "commercial_papers",
    label: "لجان الفصل في منازعات الأوراق التجارية",
    trigger: /الأوراق التجارية/,
    laws: [/الأوراق التجارية/],
  },
  {
    id: "securities",
    label: "لجنة الفصل في منازعات الأوراق المالية",
    trigger: /الأوراق المالية|صناديق الاستثمار|السوق المالية/,
    laws: [/نظام السوق المالية|لائحة[^،]*السوق المالية|قواعد[^،]*السوق المالية/, /صناديق الاستثمار/, /الأوراق المالية/, /حوكمة الشركات/, /سلوكيات السوق/, /الاندماج والاستحواذ/],
    exclude: /غسل الأموال|الإرهاب|المحتوى المحلي|تعاقد الجهات الحكومية/,
  },
  {
    id: "intellectual_property",
    label: "لجان الملكية الفكرية",
    trigger: /الملكية الفكرية|حقوق المؤلف|العلامات التجارية|براءات/,
    laws: [/حقوق المؤلف/, /العلامات التجارية/, /براءات الاختراع/, /التصميمات/, /الملكية الفكرية/],
  },
  {
    id: "procurement_grievances",
    label: "لجنة النظر في التظلمات وطلبات تعديل الأسعار",
    trigger: /التظلمات وطلبات تعديل الأسعار|تعديل الأسعار/,
    laws: [/المنافسات والمشتريات الحكومية/],
  },
  {
    id: "labor",
    label: "هيئات تسوية الخلافات العمالية",
    trigger: /الخلافات العمالية|القضايا العمالية/,
    laws: [/(^نظام|لنظام) العمل($|\s+(لعام|الصادر|ولائحته|وملحقاتها|\())/],
  },
  {
    id: "competition",
    label: "لجنة الفصل في مخالفات نظام المنافسة",
    trigger: /نظام المنافسة|مخالفات المنافسة|الهيئة العامة للمنافسة/,
    laws: [/نظام المنافسة/],
  },
  {
    id: "commercial_fraud",
    label: "لجان مكافحة الغش التجاري",
    trigger: /الغش التجاري/,
    laws: [/الغش التجاري/],
  },
  {
    id: "media",
    label: "لجان مخالفات المطبوعات والنشر والإعلام",
    trigger: /المطبوعات والنشر|الإعلام المرئي|المرئي والمسموع/,
    laws: [/المطبوعات والنشر/, /الإعلام المرئي والمسموع/],
  },
  {
    id: "telecom",
    label: "لجان مخالفات الاتصالات",
    trigger: /مخالفات الاتصالات|نظام الاتصالات|هيئة الاتصالات/,
    laws: [/نظام الاتصالات|لنظام الاتصالات|تنظيم هيئة الاتصالات/],
  },
  {
    id: "health_professions",
    label: "الهيئات الصحية الشرعية",
    trigger: /الهيئة الصحية الشرعية|الهيئات الصحية|المهن الصحية/,
    laws: [/مزاولة المهن الصحية/, /المؤسسات الصحية الخاصة/],
  },
  {
    id: "lawyers_discipline",
    label: "لجنة تأديب المحامين",
    trigger: /تأديب المحامين|المحاماة/,
    laws: [/نظام المحاماة|لنظام المحاماة/],
  },
  {
    id: "municipal",
    label: "لجان المخالفات البلدية",
    trigger: /المخالفات البلدية/,
    laws: [/المخالفات البلدية/],
  },
];

/** The committee families a semi-judicial collection belongs to (by its court and title). */
export function committeeFamilies(court: string | null | undefined, title: string | null | undefined): string[] {
  const where = `${court ?? ""} ${title ?? ""}`;
  return COMMITTEE_FAMILIES.filter((f) => f.trigger.test(where)).map((f) => f.id);
}

/** Agency names inside decree titles ("…هيئة الزكاة والضريبة والجمارك رقم…") are not the law's subject. */
const AUTHORITY_NAMES =
  /هيئة الزكاة والضريبة والجمارك|الهيئة العامة للزكاة والدخل|مصلحة الزكاة والدخل|هيئة السوق المالية|البنك المركزي السعودي|مؤسسة النقد العربي السعودي|الهيئة السعودية للملكية الفكرية|هيئة الاتصالات والفضاء والتقنية|هيئة الاتصالات وتقنية المعلومات/g;

/** Library laws (slugs) a committee applies: law titles matched against its families' patterns. */
export function resolveCommitteeLaws(
  families: readonly string[],
  laws: Iterable<{ slug: string; title: string | null }>,
): string[] {
  const chosen = COMMITTEE_FAMILIES.filter((f) => families.includes(f.id));
  if (chosen.length === 0) return [];
  const out = new Set<string>();
  for (const law of laws) {
    const title = (law.title ?? "").replace(AUTHORITY_NAMES, " ").trim();
    if (!title) continue;
    for (const f of chosen) {
      if (f.exclude?.test(title)) continue;
      if (f.laws.some((re) => re.test(title))) {
        out.add(law.slug);
        break;
      }
    }
  }
  return [...out].sort();
}

/** At most this many governing laws are stored per collection (node metadata stays small). */
export const MAX_GOVERNING_LAWS = 60;
/** A law a collection cites at least this often, and in at least this share of its citations, governs it. */
export const LEARNED_MIN_CITES = 2;
export const LEARNED_MIN_SHARE = 0.05;
export const MAX_LEARNED_LAWS = 30;

/**
 * The laws a collection's own principles cite (one entry per `INTERPRETS_ARTICLE`
 * link, by the cited article's law): the ones cited often enough to say the
 * collection applies them. This is how a collection with no known committee —
 * or a committee whose list misses a law — still gets its laws.
 */
export function learnCollectionLaws(citedLawSlugs: Iterable<string | null | undefined>): string[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const slug of citedLawSlugs) {
    if (!slug) continue;
    total += 1;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= LEARNED_MIN_CITES && n / total >= LEARNED_MIN_SHARE)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_LEARNED_LAWS)
    .map(([slug]) => slug);
}

/** The learned laws first (proven by the collection's own citations), then the committee's; at most MAX_GOVERNING_LAWS. */
export function mergeGoverningLaws(committee: readonly string[], learned: readonly string[]): string[] {
  const out: string[] = [];
  for (const slug of [...learned, ...committee]) {
    if (!out.includes(slug)) out.push(slug);
    if (out.length >= MAX_GOVERNING_LAWS) break;
  }
  return out;
}
