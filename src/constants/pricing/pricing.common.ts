import { User, Buildings, Storefront, Scales, Briefcase, Lightning, Users, Brain, ShieldCheck, BookOpen, Gavel, Handshake } from "@phosphor-icons/react";
import { AudienceTab, PayPerUseItem, FaqItem, Plan, ComparisonCategory, BillingNote, CompanySize } from "./pricing.types";

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
  lawyers:     { icon: "🪙", textAr: "نقاط — اشحن واستخدم متى تحتاج (صلاحية ٦-١٢ شهر)", textEn: "Points — top up and use when needed (6-12 month validity)" },
  firms:       { icon: "🏢", textAr: "سنوي + نقاط — اشتراك مقاعد + محفظة نقاط مشتركة", textEn: "Annual + points — seat subscription + shared points wallet" },
  providers:   { icon: "🤝", textAr: "مجاني مع عمولة — أو اشترك سنوياً لتقليل العمولة والاحتفاظ بأرباحك", textEn: "Free with commission — or subscribe annually to reduce commission and keep more earnings" },
};

// ─── Show billing toggle only for audiences that support monthly/yearly ───────
export const audiencesWithBillingToggle: AudienceTab[] = ["individuals"];

export const payPerUseItems: { ar: PayPerUseItem[]; en: PayPerUseItem[] } = {
  ar: [
    { id: "consult-instant",  labelAr: "استشارة فورية On-Demand",  labelEn: "", priceAr: "٧٠٠ ر.س", priceEn: "", noteAr: "محامٍ متاح الآن — ساعة كاملة (+ ١٥٪ رسوم منصة)", noteEn: "", icon: Lightning },
    { id: "consult-inperson", labelAr: "استشارة حضورية",           labelEn: "", priceAr: "٥٠٠ ر.س", priceEn: "", noteAr: "موعد في مكتب المحامي (+ ١٥٪ رسوم منصة)",          noteEn: "", icon: Users },
    { id: "consult-online",   labelAr: "استشارة أونلاين",          labelEn: "", priceAr: "٢٥٠ ر.س", priceEn: "", noteAr: "مكالمة فيديو مجدولة (+ ١٥٪ رسوم منصة)",          noteEn: "", icon: Brain },
    { id: "consult-ai",       labelAr: "استشارة AI فقط",           labelEn: "", priceAr: "١٥٠ ر.س", priceEn: "", noteAr: "AI فقط — بدون محامٍ متخصص",               noteEn: "", icon: Brain },
    { id: "contract-draft",   labelAr: "صياغة عقد",                labelEn: "", priceAr: "٧٠٠ ر.س", priceEn: "", noteAr: "من الصفر — AI + مراجعة محامٍ (+ ١٥٪ رسوم منصة)", noteEn: "", icon: ShieldCheck },
    { id: "review",           labelAr: "مراجعة (عقد أو مذكرة)",   labelEn: "", priceAr: "١٠٠ ر.س", priceEn: "", noteAr: "تدقيق وتعليق فقط (+ ١٥٪ رسوم منصة)",             noteEn: "", icon: BookOpen },
    { id: "letter",           labelAr: "رسالة / إنذار قانوني",    labelEn: "", priceAr: "٣٠ ر.س",  priceEn: "", noteAr: "AI فوري",                       noteEn: "", icon: Lightning },
    { id: "wargaming",        labelAr: "محاكاة (Wargaming)",       labelEn: "", priceAr: "٥٠ ر.س",  priceEn: "", noteAr: "جلسة محاكاة واحدة",            noteEn: "", icon: Gavel },
    { id: "judicial-guide",   labelAr: "المرشد القضائي",           labelEn: "", priceAr: "مجاني",   priceEn: "", noteAr: "٣ طلبات / يوم — للمحامين فقط",  noteEn: "", icon: Scales,   free: true },
    { id: "procedures",       labelAr: "الإجراءات القانونية",      labelEn: "", priceAr: "مجاني",   priceEn: "", noteAr: "٣ طلبات / يوم كحد أقصى",       noteEn: "", icon: Scales,   free: true },
    { id: "litigation",       labelAr: "تمثيل في جلسة واحدة",      labelEn: "", priceAr: "بالتفاوض", priceEn: "", noteAr: "عبر سوق المهنيين (تُخصم ١٥٪ عمولة منصة)",            noteEn: "", icon: Gavel },
    { id: "legal-library",    labelAr: "📚 المكتبة القانونية",     labelEn: "", priceAr: "١,٥٠٠ ر.س/سنة", priceEn: "", noteAr: "أو ١٧٥ ر.س/شهر — مشمولة مجاناً للمحامين", noteEn: "", icon: BookOpen },
  ],
  en: [
    { id: "consult-instant",  labelAr: "", labelEn: "Instant On-Demand Consultation", priceAr: "", priceEn: "SAR 700", noteAr: "", noteEn: "Lawyer available now — full hour (+ 15% platform fee)",   icon: Lightning },
    { id: "consult-inperson", labelAr: "", labelEn: "In-Person Consultation",          priceAr: "", priceEn: "SAR 500", noteAr: "", noteEn: "Appointment at lawyer's office (+ 15% platform fee)",     icon: Users },
    { id: "consult-online",   labelAr: "", labelEn: "Online Consultation",             priceAr: "", priceEn: "SAR 250", noteAr: "", noteEn: "Scheduled video call (+ 15% platform fee)",               icon: Brain },
    { id: "consult-ai",       labelAr: "", labelEn: "AI-Only Consultation",            priceAr: "", priceEn: "SAR 150", noteAr: "", noteEn: "No human lawyer involved",           icon: Brain },
    { id: "contract-draft",   labelAr: "", labelEn: "Contract Drafting",               priceAr: "", priceEn: "SAR 700", noteAr: "", noteEn: "From scratch — AI + lawyer review (+ 15% platform fee)",  icon: ShieldCheck },
    { id: "review",           labelAr: "", labelEn: "Review (Contract or Memo)",       priceAr: "", priceEn: "SAR 100", noteAr: "", noteEn: "Comments and feedback only (+ 15% platform fee)",         icon: BookOpen },
    { id: "letter",           labelAr: "", labelEn: "Legal Letter / Notice",           priceAr: "", priceEn: "SAR 30",  noteAr: "", noteEn: "Instant AI generation",              icon: Lightning },
    { id: "wargaming",        labelAr: "", labelEn: "Wargaming Simulation",            priceAr: "", priceEn: "SAR 50",  noteAr: "", noteEn: "One simulation session",             icon: Gavel },
    { id: "judicial-guide",   labelAr: "", labelEn: "Judicial Guide",                  priceAr: "", priceEn: "Free",    noteAr: "", noteEn: "Max 3 requests/day — Lawyers only",  icon: Scales,   free: true },
    { id: "procedures",       labelAr: "", labelEn: "Legal Procedures",                priceAr: "", priceEn: "Free",    noteAr: "", noteEn: "Max 3 requests/day",                icon: Scales,   free: true },
    { id: "litigation",       labelAr: "", labelEn: "Single Court Session",            priceAr: "", priceEn: "Negotiable", noteAr: "", noteEn: "Via Marketplace (15% fee deducted)",   icon: Gavel },
    { id: "legal-library",    labelAr: "", labelEn: "📚 Legal Library",                priceAr: "", priceEn: "SAR 1,500/year", noteAr: "", noteEn: "Or SAR 175/month — Free for lawyers", icon: BookOpen },
  ],
};

// ─── FAQs ─────────────────────────────────────────────────────────────────────
export const faqs: { ar: FaqItem[]; en: FaqItem[] } = {
  ar: [
    { q: "هل يمكنني إلغاء اشتراكي في أي وقت؟", a: "نعم، يمكنك الإلغاء في أي وقت دون رسوم إضافية. يبقى اشتراكك فعالاً حتى نهاية الفترة المدفوعة." },
    { q: "ما الفرق بين الصائغ القانوني ومحترف العقود؟", a: "الصائغ القانوني متخصص في إنتاج المذكرات القانونية واللوائح والاعتراضات للقضايا، بينما محترف العقود يُعنى بصياغة العقود التجارية ومراجعتها واكتشاف الثغرات فيها." },
    { q: "ماذا يحدث عند الوصول للحد الشهري؟", a: "عند استنفاد عدد المذكرات أو العقود المتاحة شهرياً، يمكنك شراء وحدات إضافية بالعمل القانوني أو الترقية للباقة التالية. سعر المذكرة الإضافية يتراوح بين ٢٥٠-٤٥٠ ر.س حسب باقتك." },
    { q: "هل التراجع أو الترقية بين الباقات مجاني؟", a: "الترقية فورية ومجانية. التراجع يسري من بداية الدورة الفوترة التالية." },
    { q: "هل الترافع يعني حضور المحامي أمام المحكمة فعلياً؟", a: "نعم، الترافع في باقات الشركات يعني حضور محامٍ معتمد من شبكة نظامي أمام المحكمة فعلياً، ويُدار عبر سوق المهنيين." },
    { q: "كيف تعمل خدمة 'الدفع بالعمل القانوني'؟", a: "لا تحتاج اشتراكاً. تختار الخدمة وتدفع مباشرة. المنصة تأخذ ٨٪ عمولة، والباقي يذهب للمزود أو المحامي المختار." },
    { q: "ما هي المكتبة القانونية وكيف أشترك فيها؟", a: "المكتبة القانونية تضم +٥٬٠٠٠ نظام ولائحة ومبدأ قضائي. مشمولة مجاناً لكل المحامين وشركات المحاماة. لغيرهم: ١,٥٠٠ ر.س/سنة أو ١٧٥ ر.س/شهر." },
    { q: "هل المرشد القضائي متاح لغير المحامين؟", a: "لا، المرشد القضائي أداة متخصصة حصرية للمحامين المسجلين فقط." },
  ],
  en: [
    { q: "Can I cancel my subscription at any time?", a: "Yes, cancel anytime with no extra fees. Your subscription remains active until the end of the paid period." },
    { q: "What's the difference between Legal Drafter and Contract Expert?", a: "Legal Drafter creates legal memos, briefs, and objections for cases. Contract Expert handles drafting and reviewing commercial contracts to detect gaps and risks." },
    { q: "What happens when I reach my monthly limit?", a: "Once you exhaust your monthly memos or contracts, you can purchase additional units or upgrade to a higher tier. Extra memo pricing ranges from SAR 250-450 depending on your plan." },
    { q: "Is upgrading or downgrading free?", a: "Upgrades are instant and free. Downgrades take effect from the next billing cycle." },
    { q: "Does litigation mean actual court presence?", a: "Yes, litigation in company plans means a certified Nezamy network lawyer physically attends court, managed via the Professional Marketplace." },
    { q: "How does the Pay-Per-Use service work?", a: "No subscription needed. Choose your service, pay directly. The platform takes an 8% commission; the rest goes to the selected provider or lawyer." },
    { q: "What is the Legal Library and how do I subscribe?", a: "The Legal Library contains 5,000+ laws, regulations, and judicial principles. It's free for all lawyers and law firms. For others: SAR 1,500/year or SAR 175/month." },
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
  return map[audience] ?? map.individuals;
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
