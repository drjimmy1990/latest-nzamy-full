/**
 * LIVE-F07 (owner package 2026-10-30) — the plain list of what is NOT finished
 * on each sector dashboard (firm, government, NGO, micro business).
 *
 * The dashboards used to open with a "readiness" panel: «جاهزية …» titles,
 * "Backend-ready" / "Beta local" badges, metrics read from the browser's
 * admin-settings copy (seats, points, volunteers, board seats, a requirements
 * score), a points-spend bar, and chips coloured by labels that were not
 * reliable (real modules marked unfinished and the reverse). The owner's live
 * test read that as a readiness claim. This list replaces it.
 *
 * Every entry was checked against the page source on 2026-10-30: a module is
 * listed here only when its screen makes no API call (fixed figures, nothing
 * saved) or renders the honest «قريباً» gate. Real modules are NOT listed —
 * e.g. the micro business's requests and contracts, the firm's cases, clients,
 * team and notes, and the legal library, all read and write real rows.
 *
 * When a module is built, delete its line here in the same commit.
 *
 * Kept import-free so `node --test` can load it.
 */

export type UnfinishedSector = "firm" | "government" | "ngo" | "micro";

export interface UnfinishedModule {
  /** The module's name as the sidebar shows it. */
  name: string;
  /** What is missing, said plainly. */
  state: string;
}

export interface SectorUnfinishedCopy {
  title: string;
  intro: string;
  modules: UnfinishedModule[];
}

export const SECTOR_UNFINISHED: Record<UnfinishedSector, SectorUnfinishedCopy> = {
  firm: {
    title: "وحدات لم تكتمل بعد في لوحة المكتب",
    intro: "القضايا والعملاء والفريق والملاحظات والمكتبة القانونية تعمل على بيانات مكتبك الفعلية. الوحدات التالية لم تكتمل، فلا تعتمد عليها في عمل حقيقي:",
    modules: [
      { name: "محفظة نقاط المكتب", state: "غير مكتملة — لا رصيد ولا خصم فعلي." },
      { name: "المالية والفوترة", state: "غير مكتملة — لا تُصدر فواتير ولا تُسجّل مدفوعات." },
      { name: "الأتعاب", state: "صفحة عرض بأرقام ثابتة — لا يُحفظ شيء." },
      { name: "الأدوار والصلاحيات التفصيلية", state: "للعرض فقط — لا تقيّد الوصول على الخادم بعد." },
      { name: "الحوكمة والأسوار الصينية والتحقق من العملاء (KYC)", state: "غير مكتملة — لا سجل تدقيق ولا حجب فعلي." },
      { name: "الأقسام والفروع", state: "صفحات عرض — لا تُحفظ الأقسام ولا الفروع." },
      { name: "التحليلات والتقارير", state: "أرقام ثابتة — لا تُحسب من بياناتك." },
      { name: "بوابة العميل والغرف المشتركة", state: "صفحات عرض — لا مشاركة فعلية مع أحد." },
      { name: "سوق المهنيين والإعارات والإحالات والمستشارون", state: "غير متاحة بعد — لا نشر ولا استقبال ولا تعاقد." },
    ],
  },
  government: {
    title: "وحدات لم تكتمل بعد في لوحة الجهة الحكومية",
    intro: "الوحدات التالية لم تكتمل، فلا تعتمد عليها في عمل حقيقي:",
    modules: [
      { name: "القضايا", state: "صفحة عرض — لا تُحفظ القضايا." },
      { name: "الامتثال", state: "صفحة عرض — لا يُحفظ التقييم." },
      { name: "العقود", state: "صفحة عرض — لا تُحفظ العقود." },
      { name: "المستشارون الخارجيون", state: "صفحة عرض — لا تعاقد ولا حفظ." },
      { name: "التقارير المؤسسية", state: "أرقام ثابتة — لا تُحسب من بياناتك." },
      { name: "الأدوار التفصيلية والدخول الموحّد (SSO)", state: "غير مكتملة." },
    ],
  },
  ngo: {
    title: "وحدات لم تكتمل بعد في لوحة الجمعية",
    intro: "الوحدات التالية لم تكتمل، فلا تعتمد عليها في عمل حقيقي:",
    modules: [
      { name: "التبرعات", state: "غير مربوطة — لا يُسجَّل تبرع ولا يُستقبل." },
      { name: "المتطوعون", state: "لا يُحفظ المتطوع بعد — النموذج يتحقق من صيغة البيانات فقط." },
      { name: "البرامج", state: "صفحة عرض — لا تُحفظ البرامج." },
      { name: "العقود", state: "صفحة عرض — لا تُحفظ العقود." },
      { name: "المالية", state: "أرقام ثابتة — لا تُسجّل حركة مالية." },
      { name: "الامتثال والحوكمة", state: "لا يُحفظ التقييم — مدقق الحوكمة حساب مؤقت يضيع عند تحديث الصفحة." },
      { name: "التقارير الدورية", state: "لا رفع فعلي للتقارير." },
      { name: "الأوقاف ومجلس الإدارة", state: "قريباً." },
    ],
  },
  micro: {
    title: "وحدات لم تكتمل بعد في لوحة المنشأة",
    intro: "طلباتك وعقودك تعمل على بياناتك الفعلية. الوحدات التالية لم تكتمل، فلا تعتمد عليها في عمل حقيقي:",
    modules: [
      { name: "الاشتراطات والرخص", state: "لا تُقرأ حالة اشتراطاتك من أي جهة — لا تنبيه بانتهاء رخصة." },
      { name: "المستندات", state: "صفحة عرض — لا يُرفع مستند ولا يُحفظ." },
      { name: "القضايا", state: "صفحة عرض — لا تُحفظ القضايا." },
      { name: "المحفظة والفوترة", state: "غير مكتملة — لا رصيد ولا فواتير." },
      { name: "سوق المهنيين", state: "غير متاح بعد." },
    ],
  },
};

/** Shown only in demo mode, where the home pages still draw fixed figures. */
export const DEMO_SAMPLES_NOTE =
  "وضع العرض: الأرقام والقوائم في هذه الصفحة أمثلة ثابتة وليست بياناتك.";

/** The note a production home page shows where it used to draw fixed figures. */
export const NOT_FROM_YOUR_RECORDS_NOTE =
  "لا تُعرض هنا أرقام بعد — هذه الوحدة لا تقرأ من سجلاتك حتى الآن.";

/** Words a readiness claim is made of; the copy above must not use them. */
export const READINESS_CLAIM_WORDS = [
  "جاهزية",
  "جاهز",
  "Backend-ready",
  "Beta",
  "متوافق",
  "دائماً في أمان",
  "تحديث فوري",
  "موثّقة",
  "الموثقة",
] as const;

export function unfinishedModulesFor(sector: UnfinishedSector): SectorUnfinishedCopy {
  return SECTOR_UNFINISHED[sector];
}
