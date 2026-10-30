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
 * e.g. the micro business's requests, contracts and wallet (the wallet page
 * re-exports the client wallet, which reads wallet_transactions), the firm's
 * cases, clients, team and notes, and the legal library.
 *
 * The same list drives two surfaces: the panel at the top of each sector home
 * (UnfinishedModulesPanel) and the banner on each module's own page
 * (UnfinishedModuleNote, looked up by `hrefs`). When a module is built,
 * delete its line here and its banner in the same commit.
 *
 * Kept import-free so `node --test` can load it.
 */

export type UnfinishedSector = "firm" | "government" | "ngo" | "micro";

export interface UnfinishedModule {
  /** The module's name as the sidebar shows it. */
  name: string;
  /** What is missing, said plainly. */
  state: string;
  /**
   * The module's own dashboard routes. Each one either renders the honest
   * «قريباً» gate or carries <UnfinishedModuleNote href=…> (pinned by
   * ownerPackage20261030.wiring.test.ts). Empty when there is no page yet.
   */
  hrefs: string[];
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
      { name: "محفظة نقاط المكتب", state: "غير مكتملة — لا رصيد ولا خصم فعلي.", hrefs: ["/dashboard/firm/wallet"] },
      { name: "المالية والفوترة", state: "غير مكتملة — لا تُصدر فواتير ولا تُسجّل مدفوعات.", hrefs: ["/dashboard/firm/finance"] },
      { name: "الأتعاب", state: "صفحة عرض بأرقام ثابتة — لا يُحفظ شيء.", hrefs: ["/dashboard/firm/fees"] },
      { name: "الأدوار والصلاحيات التفصيلية", state: "للعرض فقط — لا تقيّد الوصول على الخادم بعد.", hrefs: ["/dashboard/firm/team/roles"] },
      { name: "الحوكمة والأسوار الصينية والتحقق من العملاء (KYC)", state: "غير مكتملة — لا سجل تدقيق ولا حجب فعلي.", hrefs: ["/dashboard/firm/governance", "/dashboard/firm/compliance/walls", "/dashboard/firm/compliance/kyc"] },
      { name: "الأقسام والفروع", state: "صفحات عرض — لا تُحفظ الأقسام ولا الفروع.", hrefs: ["/dashboard/firm/departments", "/dashboard/firm/branches"] },
      { name: "التحليلات والتقارير", state: "أرقام ثابتة — لا تُحسب من بياناتك.", hrefs: ["/dashboard/firm/analytics"] },
      { name: "بوابة العميل والغرف المشتركة", state: "صفحات عرض — لا مشاركة فعلية مع أحد.", hrefs: ["/dashboard/firm/client-portal", "/dashboard/firm/shared-rooms"] },
      { name: "سوق المهنيين والإعارات والإحالات والمستشارون", state: "غير متاحة بعد — لا نشر ولا استقبال ولا تعاقد.", hrefs: ["/dashboard/firm/marketplace", "/dashboard/firm/secondment/new", "/dashboard/firm/referrals", "/dashboard/firm/of-counsel"] },
    ],
  },
  government: {
    title: "وحدات لم تكتمل بعد في لوحة الجهة الحكومية",
    intro: "الوحدات التالية لم تكتمل، فلا تعتمد عليها في عمل حقيقي:",
    modules: [
      { name: "القضايا", state: "صفحة عرض — لا تُحفظ القضايا.", hrefs: ["/dashboard/government/cases"] },
      { name: "الامتثال", state: "صفحة عرض — لا يُحفظ التقييم.", hrefs: ["/dashboard/government/compliance"] },
      { name: "العقود", state: "صفحة عرض — لا تُحفظ العقود.", hrefs: ["/dashboard/government/contracts"] },
      { name: "المستشارون الخارجيون", state: "صفحة عرض — لا تعاقد ولا حفظ.", hrefs: ["/dashboard/government/external-counsel"] },
      { name: "التقارير المؤسسية", state: "أرقام ثابتة — لا تُحسب من بياناتك.", hrefs: ["/dashboard/government/reports"] },
      { name: "الأدوار التفصيلية والدخول الموحّد (SSO)", state: "غير مكتملة.", hrefs: [] },
    ],
  },
  ngo: {
    title: "وحدات لم تكتمل بعد في لوحة الجمعية",
    intro: "الوحدات التالية لم تكتمل، فلا تعتمد عليها في عمل حقيقي:",
    modules: [
      { name: "التبرعات", state: "غير مربوطة — لا يُسجَّل تبرع ولا يُستقبل.", hrefs: [] },
      { name: "المتطوعون", state: "لا يُحفظ المتطوع بعد — النموذج يتحقق من صيغة البيانات فقط.", hrefs: ["/dashboard/ngo/volunteers"] },
      { name: "البرامج", state: "صفحة عرض — لا تُحفظ البرامج.", hrefs: ["/dashboard/ngo/programs"] },
      { name: "العقود", state: "صفحة عرض — لا تُحفظ العقود.", hrefs: ["/dashboard/ngo/contracts"] },
      { name: "المالية", state: "أرقام ثابتة — لا تُسجّل حركة مالية.", hrefs: ["/dashboard/ngo/finance"] },
      { name: "الامتثال والحوكمة", state: "لا يُحفظ التقييم — مدقق الحوكمة حساب مؤقت يضيع عند تحديث الصفحة.", hrefs: ["/dashboard/ngo/compliance"] },
      { name: "التقارير الدورية", state: "لا رفع فعلي للتقارير.", hrefs: ["/dashboard/ngo/reports"] },
      { name: "الأوقاف ومجلس الإدارة", state: "قريباً.", hrefs: ["/dashboard/ngo/awqaf", "/dashboard/ngo/board"] },
    ],
  },
  micro: {
    title: "وحدات لم تكتمل بعد في لوحة المنشأة",
    intro: "طلباتك وعقودك ومحفظتك تعمل على بياناتك الفعلية. الوحدات التالية لم تكتمل، فلا تعتمد عليها في عمل حقيقي:",
    modules: [
      { name: "الاشتراطات والرخص", state: "لا تُقرأ حالة اشتراطاتك من أي جهة — لا تنبيه بانتهاء رخصة.", hrefs: ["/dashboard/micro/requirements"] },
      { name: "المستندات", state: "صفحة عرض — لا يُرفع مستند ولا يُحفظ.", hrefs: ["/dashboard/micro/documents"] },
      { name: "القضايا", state: "صفحة عرض — لا تُحفظ القضايا.", hrefs: ["/dashboard/micro/cases"] },
      { name: "سوق المهنيين", state: "غير متاح بعد.", hrefs: [] },
    ],
  },
};

/** Shown only in demo mode, where the home pages still draw fixed figures. */
export const DEMO_SAMPLES_NOTE =
  "وضع العرض: الأرقام والقوائم في هذه الصفحة أمثلة ثابتة وليست بياناتك.";

/** The note a production home page shows where it used to draw fixed figures. */
export const NOT_FROM_YOUR_RECORDS_NOTE =
  "لا تُعرض هنا أرقام بعد — هذه الوحدة لا تقرأ من سجلاتك حتى الآن.";

/** The second sentence of the banner on an unfinished module's own page. */
export const MODULE_PAGE_NOTE =
  "لا تعتمد على هذه الصفحة في عمل حقيقي: ما يظهر فيها أمثلة ثابتة وليست بياناتك، ولا يُحفظ ما تدخله.";

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

/** The unfinished module whose page is `href`, or null when it is not listed. */
export function unfinishedModuleAt(href: string): UnfinishedModule | null {
  for (const copy of Object.values(SECTOR_UNFINISHED)) {
    const hit = copy.modules.find((m) => m.hrefs.includes(href));
    if (hit) return hit;
  }
  return null;
}
