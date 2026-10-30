import { User, Buildings, Storefront, Scales, Briefcase, Users, Gavel, Handshake } from "@phosphor-icons/react";
import { AudienceTab, FaqItem, Plan, ComparisonCategory, BillingNote, CompanySize } from "./pricing.types";
import { bookPriceText } from "../../lib/pricing/priceBook";

const libAr = (id: string) => bookPriceText(id, "once", "ar");
const libEn = (id: string) => bookPriceText(id, "once", "en");

import { plansIndividuals, comparisonIndividuals } from "./pricing.individuals";
import { plansLawyers, comparisonLawyers } from "./pricing.lawyers";
import { plansFirms, comparisonFirms } from "./pricing.firms";
import { plansCompanies } from "./pricing.companies";
import { plansCompaniesLegalDept } from "./pricing.companies.legaldept";
import { comparisonCompanies } from "./pricing.companies.comparison";
import { plansMicro, comparisonMicro } from "./pricing.micro";
import { plansNgo, comparisonNgo } from "./pricing.ngo";
import { plansGovernment, comparisonGovernment } from "./pricing.government";
import { plansProviders, comparisonProviders } from "./pricing.providers";
import { plansLibrary, plansFirmsLibrary } from "./pricing.library";

export const audienceTabs: { id: AudienceTab; labelAr: string; labelEn: string; icon: React.ElementType }[] = [
  { id: "individuals", labelAr: "أفراد",           labelEn: "Individuals",      icon: User       },
  { id: "companies",   labelAr: "شركات",            labelEn: "Companies",        icon: Buildings  },
  { id: "micro",       labelAr: "منشآت صغيرة",     labelEn: "Small Business",   icon: Storefront },
  { id: "ngo",         labelAr: "الجمعيات الخيرية", labelEn: "NGOs",             icon: Users      },
  { id: "government",  labelAr: "الجهات الحكومية",  labelEn: "Government",       icon: Gavel      },
  { id: "lawyers",     labelAr: "محامون",           labelEn: "Lawyers",          icon: Scales     },
  { id: "firms",       labelAr: "مكاتب المحاماة",  labelEn: "Law Firms",        icon: Briefcase  },
  { id: "providers",   labelAr: "مقدمي الخدمات",   labelEn: "Service Providers", icon: Handshake  },
];

// ─── Billing Notes per audience (shown in info bar) ───────────────────────────
export const billingNotes: Record<AudienceTab, BillingNote> = {
  individuals: { icon: "📅", textAr: "شهري أو سنوي — اختر ما يناسب ميزانيتك", textEn: "Monthly or yearly — choose what fits your budget" },
  micro:       { icon: "🛡", textAr: "اشتراك سنوي — ضامنك القانوني بـ~٢٠٨ ر.س/شهر", textEn: "Annual subscription — your legal shield at ~208 SAR/mo" },
  companies:   { icon: "🏢", textAr: "اشتراك سنوي — حسب حجم شركتك وطبيعة فريقك القانوني", textEn: "Annual subscription — based on your company size and legal team" },
  ngo:         { icon: "💚", textAr: "اشتراك سنوي — أسعار مخفضة لدعم القطاع الثالث", textEn: "Annual subscription — discounted rates for the third sector" },
  government:  { icon: "🏛", textAr: "عقد سنوي — ترخيص مؤسسي رسمي", textEn: "Annual contract — official institutional license" },
  // §2 rule 1: professionals are offered quarterly / half-yearly / yearly — no monthly on /pricing.
  // Owner ٢٩١ (26 Oct 2026): a subscription comes with no points; points come from top-ups only.
  lawyers:     { icon: "🪙", textAr: "اشتراك سنوي، والنقاط بحزم شحن مستقلة عند الحاجة", textEn: "Yearly subscription; points come from separate top-ups when needed" },
  firms:       { icon: "🏢", textAr: "اشتراك سنوي بمقاعد مشمولة للمكتب أو الشركة", textEn: "Yearly subscription with seats included for the office or firm" },
  providers:   { icon: "🤝", textAr: "مجاني مع عمولة — أو اشترك سنوياً لتقليل العمولة والاحتفاظ بأرباحك", textEn: "Free with commission — or subscribe annually to reduce commission and keep more earnings" },
};

// ─── FAQs ─────────────────────────────────────────────────────────────────────
export const faqs: { ar: FaqItem[]; en: FaqItem[] } = {
  ar: [
    { q: "هل يمكنني إلغاء اشتراكي في أي وقت؟", a: "نعم، يمكنك الإلغاء في أي وقت دون رسوم إضافية. يبقى اشتراكك فعالاً حتى نهاية الفترة المدفوعة." },
    { q: "ما الفرق بين الصائغ القانوني ومحترف العقود؟", a: "الصائغ القانوني متخصص في إنتاج المذكرات القانونية واللوائح والاعتراضات للقضايا، بينما محترف العقود يُعنى بصياغة العقود التجارية ومراجعتها واكتشاف الثغرات فيها." },
    { q: "ماذا يحدث عند نفاد نقاطي؟", a: `النقاط لا تأتي مع الاشتراك ولا تتجدد كل شهر: تشتري حزمة شحن تبدأ من ${bookPriceText("topup-100", "once", "ar")} ر.س للأفراد ومن ${bookPriceText("topup-500", "once", "ar")} ر.س للمهنيين، ولكل حزمة مدة صلاحية معلنة. وتكلفة كل أداة بالنقاط معلنة في جدول الأسعار.` },
    { q: "هل يمكنني الترقية أو التغيير بين الباقات؟", a: "يمكنك طلب الترقية أو التغيير في أي وقت؛ يراجع الفريق الطلب ويفعّله يدوياً." },
    { q: "هل الترافع يعني حضور المحامي أمام المحكمة فعلياً؟", a: "نعم، الترافع في باقات الشركات يعني حضور محامٍ مرخّص من مكتب نظامي أو من مكتب شريك معتمد أمام المحكمة فعلياً." },
    { q: "كيف تعمل خدمة 'الدفع بالعمل القانوني'؟", a: "لا تحتاج اشتراكاً. تختار الخدمة، وتدفع أتعابها لمكتب المحاماة المرخّص مباشرة عبر بوابة دفع مرخّصة من البنك المركزي. ولا تحتفظ المنصة بأي أموال." },
    { q: "ما هي المكتبة القانونية وكيف أشترك فيها؟", a: `المكتبة القانونية تضم الأنظمة واللوائح والمبادئ القضائية. الاشتراك: ${libAr("lib-q1")} ر.س لثلاثة أشهر، أو ${libAr("lib-q2")} ر.س لستة أشهر، أو ${libAr("lib-annual")} ر.س للسنة.` },
    { q: "هل المرشد القضائي متاح لغير المحامين؟", a: "لا، المرشد القضائي أداة متخصصة حصرية للمحامين المسجلين فقط." },
  ],
  en: [
    { q: "Can I cancel my subscription at any time?", a: "Yes, cancel anytime with no extra fees. Your subscription remains active until the end of the paid period." },
    { q: "What's the difference between Legal Drafter and Contract Expert?", a: "Legal Drafter creates legal memos, briefs, and objections for cases. Contract Expert handles drafting and reviewing commercial contracts to detect gaps and risks." },
    { q: "What happens when my points run out?", a: `Points do not come with the subscription and do not renew each month: buy a top-up — from SAR ${bookPriceText("topup-100", "once", "en")} for individuals and SAR ${bookPriceText("topup-500", "once", "en")} for professionals; each top-up has a stated validity. Each tool's cost in points is listed in the price table.` },
    { q: "Can I upgrade or change my plan?", a: "You can request an upgrade or a change at any time; the team reviews the request and activates it manually." },
    { q: "Does litigation mean actual court presence?", a: "Yes, litigation in company plans means a certified Nezamy network lawyer physically attends court, managed via the Professional Marketplace." },
    { q: "How does the Pay-Per-Use service work?", a: "No subscription needed. Choose the service and pay the fee directly to the licensed law office through a SAMA-licensed payment gateway. The platform holds no funds." },
    { q: "What is the Legal Library and how do I subscribe?", a: `The Legal Library contains laws, regulations, and judicial principles. Subscriptions are SAR ${libEn("lib-q1")} per quarter, SAR ${libEn("lib-q2")} per half-year or SAR ${libEn("lib-annual")} per year.` },
    { q: "Is the Judicial Guide available for non-lawyers?", a: "No, the Judicial Guide is an exclusive tool available only to registered lawyers." },
  ],
};

// ─── Helper Functions ─────────────────────────────────────────────────────────

/** Get plans for an audience. For companies, supports filtering by legal dept and size.
 *  Pass libraryMode: true to get library-only plans for lawyers/firms. */
export function getPlanList(
  audience: AudienceTab,
  isAr: boolean,
  opts?: { hasLegalDept?: boolean; companySize?: CompanySize; libraryMode?: boolean },
): Plan[] {
  // Library mode: lawyers and firms see library subscription plans instead
  if (opts?.libraryMode && (audience === "lawyers" || audience === "firms")) {
    if (audience === "firms") {
      return isAr ? plansFirmsLibrary.ar : plansFirmsLibrary.en;
    }
    return isAr ? plansLibrary.ar : plansLibrary.en;
  }
  // Companies: switch to legal-dept plan set if hasLegalDept, otherwise standard plans
  if (audience === "companies") {
    const baseSet = opts?.hasLegalDept
      ? (isAr ? plansCompaniesLegalDept.ar : plansCompaniesLegalDept.en)
      : (isAr ? plansCompanies.ar          : plansCompanies.en);

    // Optionally filter by company size within the selected set
    if (opts?.companySize) {
      const sz = opts.companySize;
      const sized = baseSet.filter(p => {
        if (!p.companySize) return true;
        if (Array.isArray(p.companySize)) return p.companySize.includes(sz);
        return p.companySize === sz;
      });
      return sized.length > 0 ? sized : baseSet;
    }
    return baseSet;
  }

  const map: Record<string, Plan[]> = {
    individuals: isAr ? plansIndividuals.ar : plansIndividuals.en,
    lawyers:     isAr ? plansLawyers.ar     : plansLawyers.en,
    firms:       isAr ? plansFirms.ar       : plansFirms.en,
    micro:       isAr ? plansMicro.ar       : plansMicro.en,
    ngo:         isAr ? plansNgo.ar         : plansNgo.en,
    government:  isAr ? plansGovernment.ar   : plansGovernment.en,
    providers:   isAr ? plansProviders.ar   : plansProviders.en,
  };
  // Hidden plans remain as product proposals, but must never be rendered as
  // purchasable offers until their legal copy, server-side catalogue,
  // checkout, entitlement workflow, and acceptance evidence are approved.
  return (map[audience] ?? map.individuals).filter((plan) => !plan.isBetaHidden);
}

export function getComparisonList(audience: AudienceTab, isAr: boolean): ComparisonCategory[] {
  const map: Record<string, ComparisonCategory[]> = {
    individuals: isAr ? comparisonIndividuals.ar : comparisonIndividuals.en,
    companies:   isAr ? comparisonCompanies.ar   : comparisonCompanies.en,
    lawyers:     isAr ? comparisonLawyers.ar     : comparisonLawyers.en,
    firms:       isAr ? comparisonFirms.ar       : comparisonFirms.en,
    micro:       isAr ? comparisonMicro.ar       : comparisonMicro.en,
    ngo:         isAr ? comparisonNgo.ar         : comparisonNgo.en,
    government:  isAr ? comparisonGovernment.ar   : comparisonGovernment.en,
    providers:   isAr ? comparisonProviders.ar   : comparisonProviders.en,
  };
  return map[audience] ?? map.individuals;
}
