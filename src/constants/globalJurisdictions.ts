/**
 * globalJurisdictions.ts — سجل الولايات القضائية الدولية ("نظامي عالمي")
 * ──────────────────────────────────────────────────────────────────────────
 * مصدر الحقيقة لنموذج "البحث الحي قبل قاعدة البيانات" (Research-First).
 *
 * هذا الملف backend-ready: حين يتوفر الباك إند، تُستبدل قوائم المصادر بمزوّد
 * بحث حي (Search API) وتُحدَّث تواريخ التحقق آلياً، لكن العقد (الـ types) يبقى ثابتاً.
 *
 * قاعدة المصداقية: كل مصدر له "طبقة ثقة" (tier). الإجابة لا تُبنى إلا على مصادر
 * من طبقة موثوقة، ولا يُعرض ادعاء بلا مصدر قابل للنقر (No source = no claim).
 */

// ─── الأنواع (Contracts) ────────────────────────────────────────────────────

/** طبقة مصداقية المصدر — حكومي أعلى من تجاري */
export type SourceTier =
  | "government"       // موقع حكومي رسمي (وزارة، هيئة)
  | "official_gazette" // الجريدة الرسمية / نشر التشريع
  | "judicial"         // محاكم / مبادئ قضائية منشورة
  | "academic"         // أكاديمي / بحثي محكّم
  | "law_firm"         // مكاتب محاماة معتمدة (مقالات)
  | "commercial";      // مصادر تجارية عامة (أدنى ثقة)

/** درجة جاهزية المنصة في هذه الولاية */
export type ReadinessLevel =
  | "live_research" // بحث حي فقط — لا قاعدة بيانات محلية بعد
  | "partial_db"    // قاعدة بيانات جزئية + شراكات
  | "full_presence";// تواجد كامل (مثل السعودية)

export interface TrustedSource {
  nameAr: string;
  /** النطاق الرسمي للمصدر (يُعرض كدليل شفافية) */
  domain: string;
  tier: SourceTier;
  /** نطاق التغطية: عمل/عقاري/تجاري… (للترتيب حسب السياق) */
  scopeAr?: string;
}

export interface SubJurisdiction {
  id: string;
  nameAr: string;
  /** ملاحظة تميّزه — مثل "نظام قانوني مستقل عن الاتحادي" */
  noteAr?: string;
  /** هل هو إطار قانون عام (Common Law) داخل دولة مدنية؟ */
  isCommonLaw?: boolean;
}

export interface Jurisdiction {
  id: string;            // رمز الدولة (ae, eg, jo…)
  /** رمز من حرفين يُعرض كشارة بدل علم emoji (التزاماً بقاعدة لا-إيموجي) */
  code: string;
  nameAr: string;
  nameEn: string;
  phase: 1 | 2 | 3;      // مرحلة التوسع حسب الخطة
  readiness: ReadinessLevel;
  legalSystemAr: string; // وصف النظام القانوني
  primaryLangAr: string;
  /** هل توجد شبكة محامين شركاء للإحالة؟ */
  referralAvailable: boolean;
  sources: TrustedSource[];
  subJurisdictions?: SubJurisdiction[];
  exampleQuestions: string[];
  /** إخلاء مسؤولية مخصّص لهذه الولاية (يظهر تلقائياً) */
  disclaimerAr: string;
}

// ─── دوال مساعدة ───────────────────────────────────────────────────────────

export const SOURCE_TIER_META: Record<
  SourceTier,
  { labelAr: string; weight: number; color: string }
> = {
  government:       { labelAr: "حكومي رسمي", weight: 100, color: "#10b981" },
  official_gazette: { labelAr: "الجريدة الرسمية", weight: 95, color: "#059669" },
  judicial:         { labelAr: "قضائي", weight: 90, color: "#3b82f6" },
  academic:         { labelAr: "أكاديمي محكّم", weight: 70, color: "#8b5cf6" },
  law_firm:         { labelAr: "مكتب محاماة معتمد", weight: 55, color: "#C8A762" },
  commercial:       { labelAr: "مصدر عام", weight: 30, color: "#a1a1aa" },
};

export const READINESS_META: Record<
  ReadinessLevel,
  { labelAr: string; descAr: string; color: string }
> = {
  live_research: {
    labelAr: "بحث حي",
    descAr: "نعتمد على البحث الآني في المصادر الرسمية — لا توجد قاعدة بيانات محلية كاملة بعد.",
    color: "#3b82f6",
  },
  partial_db: {
    labelAr: "قاعدة جزئية + شركاء",
    descAr: "أنظمة أساسية مهيكلة محلياً + شبكة محامين شركاء + بحث حي تكميلي.",
    color: "#C8A762",
  },
  full_presence: {
    labelAr: "تواجد كامل",
    descAr: "مكتبة قانونية شاملة + محامون مرخصون + خدمات تنفيذ كاملة.",
    color: "#10b981",
  },
};

export function getJurisdiction(id: string): Jurisdiction | undefined {
  return JURISDICTIONS.find((j) => j.id === id);
}

// ─── السجل (الخليج + الدول العربية الكبرى) ───────────────────────────────────

export const JURISDICTIONS: Jurisdiction[] = [
  // ───────────────── المرحلة 1 — الخليج ─────────────────
  {
    id: "ae",
    code: "AE",
    nameAr: "الإمارات العربية المتحدة",
    nameEn: "United Arab Emirates",
    phase: 1,
    readiness: "live_research",
    legalSystemAr: "مدني اتحادي مستمد من الشريعة + مناطق حرة بقوانين مستقلة (Common Law)",
    primaryLangAr: "العربية / الإنجليزية",
    referralAvailable: true,
    subJurisdictions: [
      { id: "federal", nameAr: "القانون الاتحادي", noteAr: "يسري على كل الإمارات ما لم تستثنِه منطقة حرة" },
      { id: "dubai", nameAr: "إمارة دبي", noteAr: "تشريعات محلية إضافية (مثل قوانين الإيجار)" },
      { id: "abudhabi", nameAr: "إمارة أبوظبي", noteAr: "تشريعات محلية إضافية" },
      { id: "difc", nameAr: "مركز دبي المالي العالمي (DIFC)", noteAr: "نظام قانوني مستقل ومحاكم خاصة", isCommonLaw: true },
      { id: "adgm", nameAr: "سوق أبوظبي العالمي (ADGM)", noteAr: "يطبّق القانون الإنجليزي مباشرة", isCommonLaw: true },
    ],
    sources: [
      { nameAr: "البوابة الرسمية لحكومة الإمارات", domain: "u.ae", tier: "government" },
      { nameAr: "وزارة العدل الإماراتية", domain: "moj.gov.ae", tier: "government" },
      { nameAr: "دائرة الأراضي والأملاك بدبي", domain: "dubailand.gov.ae", tier: "government", scopeAr: "عقاري" },
      { nameAr: "محاكم مركز دبي المالي العالمي", domain: "difccourts.ae", tier: "judicial", scopeAr: "DIFC" },
      { nameAr: "سوق أبوظبي العالمي", domain: "adgm.com", tier: "government", scopeAr: "ADGM" },
    ],
    exampleQuestions: [
      "صاحب العقار يريد إخلائي قبل نهاية عقد الإيجار في دبي — ما حقوقي؟",
      "ما مدة الإشعار القانونية لإنهاء عقد عمل غير محدد المدة في الإمارات؟",
      "ما الفرق بين تأسيس شركة في DIFC والقانون الاتحادي؟",
    ],
    disclaimerAr:
      "تختلف الأحكام جوهرياً بين القانون الاتحادي والمناطق الحرة (DIFC / ADGM). تأكّد من تحديد الولاية الصحيحة، واستشر محامياً مرخصاً في الإمارة المعنية.",
  },
  {
    id: "qa",
    code: "QA",
    nameAr: "قطر",
    nameEn: "Qatar",
    phase: 1,
    readiness: "live_research",
    legalSystemAr: "مدني مستمد من الشريعة + مركز قطر للمال (QFC) بنظام مستقل",
    primaryLangAr: "العربية / الإنجليزية",
    referralAvailable: false,
    subJurisdictions: [
      { id: "state", nameAr: "قوانين دولة قطر" },
      { id: "qfc", nameAr: "مركز قطر للمال (QFC)", noteAr: "نظام قانوني مستقل", isCommonLaw: true },
    ],
    sources: [
      { nameAr: "الميزان — البوابة القانونية القطرية", domain: "almeezan.qa", tier: "official_gazette" },
      { nameAr: "حكومي (Hukoomi)", domain: "hukoomi.gov.qa", tier: "government" },
      { nameAr: "مركز قطر للمال", domain: "qfc.qa", tier: "government", scopeAr: "QFC" },
    ],
    exampleQuestions: [
      "ما حقوق العامل عند إنهاء الخدمة في قانون العمل القطري؟",
      "كيف أسجّل شركة في مركز قطر للمال؟",
    ],
    disclaimerAr:
      "قد تختلف الأحكام بين قوانين الدولة ومركز قطر للمال (QFC). استشر محامياً مرخصاً في قطر.",
  },
  {
    id: "kw",
    code: "KW",
    nameAr: "الكويت",
    nameEn: "Kuwait",
    phase: 1,
    readiness: "live_research",
    legalSystemAr: "مدني مستمد من الشريعة",
    primaryLangAr: "العربية",
    referralAvailable: false,
    sources: [
      { nameAr: "بوابة الكويت الرسمية", domain: "e.gov.kw", tier: "government" },
      { nameAr: "وزارة العدل الكويتية", domain: "moj.gov.kw", tier: "government" },
    ],
    exampleQuestions: [
      "ما مدة الإجازة السنوية في قانون العمل الكويتي للقطاع الأهلي؟",
      "ما إجراءات رفع دعوى تعويض ضد شركة في الكويت؟",
    ],
    disclaimerAr:
      "توجد قيود على ممارسة المحاماة من غير المرخصين في الكويت. هذه معلومات عامة وليست تمثيلاً قانونياً.",
  },
  {
    id: "bh",
    code: "BH",
    nameAr: "البحرين",
    nameEn: "Bahrain",
    phase: 1,
    readiness: "live_research",
    legalSystemAr: "مدني مستمد من الشريعة — بيئة تنظيمية متطورة",
    primaryLangAr: "العربية / الإنجليزية",
    referralAvailable: false,
    sources: [
      { nameAr: "البوابة الوطنية للحكومة البحرينية", domain: "bahrain.bh", tier: "government" },
      { nameAr: "هيئة التشريع والرأي القانوني", domain: "legalaffairs.gov.bh", tier: "official_gazette" },
    ],
    exampleQuestions: [
      "ما شروط فصل الموظف في قانون العمل البحريني؟",
      "ما إجراءات تأسيس شركة ذات مسؤولية محدودة في البحرين؟",
    ],
    disclaimerAr:
      "هذه معلومات عامة مبنية على مصادر رسمية بحرينية. استشر محامياً مرخصاً في البحرين قبل أي إجراء.",
  },
  {
    id: "om",
    code: "OM",
    nameAr: "سلطنة عُمان",
    nameEn: "Oman",
    phase: 1,
    readiness: "live_research",
    legalSystemAr: "مدني مستمد من الشريعة — تشابه كبير مع النظام السعودي",
    primaryLangAr: "العربية",
    referralAvailable: false,
    sources: [
      { nameAr: "الجريدة الرسمية العُمانية / قاعدة التشريعات (QANOON)", domain: "qanoon.om", tier: "official_gazette" },
      { nameAr: "البوابة الحكومية العُمانية", domain: "oman.om", tier: "government" },
    ],
    exampleQuestions: [
      "ما مكافأة نهاية الخدمة في قانون العمل العُماني الجديد؟",
      "ما إجراءات التقاضي التجاري في سلطنة عُمان؟",
    ],
    disclaimerAr:
      "هذه معلومات عامة مبنية على مصادر رسمية عُمانية. استشر محامياً مرخصاً في السلطنة.",
  },

  // ───────────────── المرحلة 2 — الدول العربية الكبرى ─────────────────
  {
    id: "eg",
    code: "EG",
    nameAr: "جمهورية مصر العربية",
    nameEn: "Egypt",
    phase: 2,
    readiness: "live_research",
    legalSystemAr: "مدني (مستمد من القانون الفرنسي) + أحوال شخصية شرعية",
    primaryLangAr: "العربية",
    referralAvailable: true,
    sources: [
      { nameAr: "بوابة الحكومة المصرية", domain: "egypt.gov.eg", tier: "government" },
      { nameAr: "منشورات قانونية (مجلس الدولة / التشريعات)", domain: "manshurat.org", tier: "official_gazette" },
      { nameAr: "وزارة العدل المصرية", domain: "moj.gov.eg", tier: "government" },
    ],
    exampleQuestions: [
      "كم مدة الإجازة السنوية للموظف في مصر؟",
      "ما إجراءات فسخ عقد الإيجار القديم في القانون المصري؟",
      "ما الحد الأدنى لرأس مال الشركة المساهمة في مصر؟",
    ],
    disclaimerAr:
      "بعض القوانين المصرية قديمة وعليها تعديلات متعددة — تأكّد من آخر تعديل ساري. هذه معلومات عامة وليست مشورة قانونية ملزمة.",
  },
  {
    id: "jo",
    code: "JO",
    nameAr: "المملكة الأردنية الهاشمية",
    nameEn: "Jordan",
    phase: 2,
    readiness: "live_research",
    legalSystemAr: "مدني مستمد من القانون الفرنسي/المصري + أحوال شخصية شرعية",
    primaryLangAr: "العربية",
    referralAvailable: true,
    sources: [
      { nameAr: "ديوان التشريع والرأي — قاعدة التشريعات", domain: "lob.gov.jo", tier: "official_gazette" },
      { nameAr: "وزارة العدل الأردنية", domain: "moj.gov.jo", tier: "government" },
    ],
    exampleQuestions: [
      "ما حقوق العامل عند الفصل التعسفي في قانون العمل الأردني؟",
      "ما إجراءات تسجيل شركة ذات مسؤولية محدودة في الأردن؟",
    ],
    disclaimerAr:
      "هذه معلومات عامة مبنية على مصادر رسمية أردنية. استشر محامياً مرخصاً (نقابة المحامين الأردنيين) قبل أي إجراء.",
  },
  {
    id: "ma",
    code: "MA",
    nameAr: "المملكة المغربية",
    nameEn: "Morocco",
    phase: 2,
    readiness: "live_research",
    legalSystemAr: "مدني (فرنسي) + أحوال شخصية (مدونة الأسرة)",
    primaryLangAr: "العربية / الفرنسية",
    referralAvailable: false,
    sources: [
      { nameAr: "الأمانة العامة للحكومة — التشريع", domain: "sgg.gov.ma", tier: "official_gazette" },
      { nameAr: "البوابة الوطنية للمغرب", domain: "maroc.ma", tier: "government" },
    ],
    exampleQuestions: [
      "ما مدة التعويض عن الفصل في مدونة الشغل المغربية؟",
      "ما إجراءات إنشاء شركة في المغرب؟",
    ],
    disclaimerAr:
      "كثير من النصوص المغربية تصدر بالفرنسية — قد تختلف الترجمة العربية في الدقة. استشر محامياً مرخصاً في المغرب.",
  },
];

/** الدول المتاحة للبحث الآن (حسب المرحلة التجريبية: الإمارات + مصر + الأردن أولاً) */
export const PILOT_JURISDICTION_IDS = ["ae", "eg", "jo"];

/** نص إخلاء المسؤولية العام (يُدمج مع الخاص بالولاية) */
export const GLOBAL_DISCLAIMER_AR =
  "هذه المعلومات ناتجة عن بحث آلي في مصادر متاحة وليست مشورة قانونية مهنية. القوانين تتغير باستمرار وقد لا تعكس آخر التعديلات. للحصول على رأي ملزم، استشر محامياً مرخصاً في الدولة المعنية.";
