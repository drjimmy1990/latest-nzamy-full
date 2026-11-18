/**
 * servicePages.ts — the <head> of every /services/* page (owner message
 * 18 Nov, item 4.2; SEO audit ح2).
 *
 * Before this map every sub-page inherited src/app/services/layout.tsx — the
 * same title, description and `canonical: /services` — which told Google to
 * fold the twenty sub-pages into one. Each folder under src/app/services that
 * has a page.tsx now has its own server layout.tsx calling
 * `buildMetadata(servicePageSeo("<its path>"))`: a self canonical, a title and
 * a description of its own. servicePages.test.ts walks the folders, so a new
 * service page without an entry here (or without its layout) fails the suite.
 *
 * Titles are Arabic only (audit ن2: the «عربي | English» pair was cut off in
 * results). The copy describes what each page itself says — no promise the
 * page does not make.
 *
 * Pure: no imports, so `node --test` and next.config.ts can load it.
 */

export interface ServicePageSeo {
  titleAr: string;
  descriptionAr: string;
  path: string;
  keywords?: string[];
  /** A sign-in tool page, not a public description of a service. */
  noIndex?: boolean;
}

type Entry = Omit<ServicePageSeo, "path">;

export const SERVICE_PAGES: Readonly<Record<string, Entry>> = Object.freeze({
  "/services/arbitration": {
    titleAr: "التحكيم التجاري",
    descriptionAr: "التحكيم التجاري في السعودية عبر محامين مرخّصين: متى يكون التحكيم أنسب من التقاضي، ومدته، وتكلفته، وخطواته.",
    keywords: ["التحكيم التجاري", "تحكيم", "فض المنازعات"],
  },
  "/services/business": {
    titleAr: "الخدمات القانونية للشركات",
    descriptionAr: "حلول قانونية للشركات: الامتثال التنظيمي، والعقود، وإدارة المخاطر، وتأسيس الشركات وتسجيل العلامات التجارية.",
    keywords: ["خدمات قانونية للشركات", "امتثال", "محامي شركات"],
  },
  "/services/business/company-formation": {
    titleAr: "تأسيس الشركات في السعودية",
    descriptionAr: "تأسيس الشركات في المملكة العربية السعودية: الاستشارة المبدئية، وإعداد المستندات، وخطوات القيد مع محامٍ مرخّص.",
    keywords: ["تأسيس شركة", "سجل تجاري", "عقد تأسيس"],
  },
  "/services/business/trademark": {
    titleAr: "تسجيل العلامات التجارية",
    descriptionAr: "تسجيل العلامات التجارية في المملكة: البحث المسبق عن العلامة، وإعداد الطلب، ومتابعته حتى القيد.",
    keywords: ["تسجيل علامة تجارية", "العلامات التجارية", "حماية العلامة"],
  },
  "/services/cases": {
    titleAr: "القضايا والتقاضي",
    descriptionAr: "رفع القضايا ومتابعتها أمام المحاكم السعودية مع محامٍ مرخّص: دراسة القضية، وإعداد المذكرات، وحضور الجلسات.",
    keywords: ["رفع قضية", "محامي قضايا", "التقاضي"],
  },
  "/services/collection": {
    titleAr: "تحصيل الديون والمطالبات المالية",
    descriptionAr: "تحصيل الديون والمطالبات المالية بالطرق النظامية: المطالبة الودية، ثم التنفيذ والتقاضي عند الحاجة، عبر محامين مرخّصين.",
    keywords: ["تحصيل ديون", "مطالبة مالية", "التنفيذ"],
  },
  "/services/consultations": {
    titleAr: "الاستشارات القانونية",
    descriptionAr: "استشارات قانونية مع محامين مرخّصين في السعودية، كتابية أو صوتية أو مرئية، في المسائل العمالية والتجارية والأسرية وغيرها.",
    keywords: ["استشارة قانونية", "محامي استشارات", "استشارة محامي"],
  },
  "/services/contracts": {
    titleAr: "صياغة العقود ومراجعتها",
    descriptionAr: "صياغة العقود والمستندات ومراجعتها مع محامين مرخّصين، وتقرير مكتوب بمخاطر العقد قبل التوقيع.",
    keywords: ["صياغة عقد", "مراجعة عقد", "عقود"],
  },
  "/services/corporate": {
    titleAr: "الحماية القانونية للمنشآت",
    descriptionAr: "حماية قانونية للمنشآت: الحوكمة، والفحص القانوني الشامل، والمستشار القانوني المنتدب، والعقود التجارية.",
    keywords: ["خدمات قانونية للمنشآت", "حوكمة", "مستشار قانوني"],
  },
  "/services/corporate/governance": {
    titleAr: "حوكمة العقود والموافقات",
    descriptionAr: "حوكمة العقود في المنشأة: مصفوفة موافقات حسب نوع العقد وقيمته، ومراجعة متعددة الإدارات، وتصعيد للمراجعات المتأخرة.",
    keywords: ["حوكمة العقود", "مصفوفة الموافقات", "حوكمة الشركات"],
  },
  "/services/corporate/health-check": {
    titleAr: "الفحص القانوني الشامل للمنشأة",
    descriptionAr: "فحص قانوني لعقود المنشأة وتراخيصها ومستنداتها: تقييم مبدئي، ثم تحديد النطاق وعرض السعر، ثم تقرير بالملاحظات.",
    keywords: ["فحص قانوني", "مراجعة امتثال", "تدقيق قانوني"],
  },
  "/services/corporate/seconded-counsel": {
    titleAr: "المستشار القانوني المنتدب",
    descriptionAr: "مستشار قانوني منتدب لمنشأتك بدوام جزئي أو كامل، دون تكاليف التوظيف.",
    keywords: ["مستشار قانوني منتدب", "محامي معار", "مستشار قانوني للشركة"],
  },
  "/services/creators": {
    titleAr: "الخدمات القانونية لصناع المحتوى",
    descriptionAr: "خدمات قانونية لصناع المحتوى: عقود الإعلانات والرعاية، وحماية الحقوق الفكرية للمحتوى.",
    keywords: ["صناع المحتوى", "عقود إعلانية", "حقوق المحتوى"],
  },
  "/services/individuals": {
    titleAr: "الخدمات القانونية للأفراد",
    descriptionAr: "خدمات قانونية للأفراد بسعر معروف قبل الطلب، ومتابعة الطلب ومستنداته داخل المنصة، واتفاق واضح على الأتعاب.",
    keywords: ["خدمات قانونية للأفراد", "محامي", "استشارة"],
  },
  "/services/labor": {
    titleAr: "القضايا والحقوق العمالية",
    descriptionAr: "حقوقك العمالية في نظام العمل السعودي: المستحقات، والفصل غير المشروع، والشكاوى العمالية، مع محامٍ مرخّص.",
    keywords: ["قضية عمالية", "نظام العمل", "حقوق العامل"],
  },
  "/services/lawyers": {
    titleAr: "أدوات نظامي للمحامين",
    descriptionAr: "أدوات عمل للمحامي المستقل ولمكاتب المحاماة مبنية على الأنظمة السعودية: الصياغة، والمكتبة القانونية، وإدارة المكتب.",
    keywords: ["أدوات المحامي", "برنامج محاماة", "الصائغ القانوني"],
  },
  "/services/lawyers/vault": {
    titleAr: "خزنة المستندات للمحامين",
    descriptionAr: "مساحة عمل المحامي لتحليل المستندات — تتطلب تسجيل الدخول.",
    noIndex: true,
  },
  "/services/legal-representation": {
    titleAr: "التمثيل القضائي",
    descriptionAr: "محامٍ متخصص يمثّلك أمام المحكمة: تقييم القضية، وإسناد المحامي المناسب، وتوقيع الوكالة، والمتابعة حتى الحكم.",
    keywords: ["تمثيل قضائي", "محامي ترافع", "توكيل محامي"],
  },
  "/services/notary": {
    titleAr: "التوثيق الرسمي",
    descriptionAr: "توثيق العقود والمستندات بصورة رسمية معتمدة: عقود العمل، وعقود البيع، والوكالات، وغيرها.",
    keywords: ["توثيق", "موثق", "توثيق عقد"],
  },
  "/services/tracking": {
    titleAr: "تعقيب المعاملات الحكومية",
    descriptionAr: "نتابع إجراءاتك الحكومية نيابةً عنك، ونُبقيك على اطلاع بكل خطوة حتى الإنجاز.",
    keywords: ["تعقيب معاملات", "معاملات حكومية", "معقب"],
  },
});

/** The SeoOptions buildMetadata() takes for a service page; throws on an unknown path (a build-time typo). */
export function servicePageSeo(path: string): ServicePageSeo {
  const entry = SERVICE_PAGES[path];
  if (!entry) throw new Error(`servicePageSeo: no entry for ${path}`);
  return { ...entry, path };
}
