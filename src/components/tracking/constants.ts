import {
  Buildings,
  IdentificationCard,
  Briefcase,
  Scales,
  IdentificationBadge,
  FileMagnifyingGlass,
} from "@phosphor-icons/react";
import { ServiceCard, TrackingStep, GovEntity, PricingTier, FAQ } from "./types";

export const serviceCards: ServiceCard[] = [
  {
    icon: Briefcase,
    ar: "تجديد تراخيص",
    en: "License Renewal",
    desc_ar: "متابعة تجديد التراخيص التجارية والمهنية قبل انتهائها",
    desc_en: "Follow up on commercial and professional license renewals before expiry",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    icon: FileMagnifyingGlass,
    ar: "استخراج وثائق",
    en: "Document Extraction",
    desc_ar: "استخراج الوثائق الرسمية من الجهات الحكومية المختلفة",
    desc_en: "Extract official documents from various government entities",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    icon: Scales,
    ar: "متابعة قضايا",
    en: "Case Follow-up",
    desc_ar: "تتبع مستجدات القضايا القضائية والإدارية",
    desc_en: "Track updates on judicial and administrative cases",
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  {
    icon: Buildings,
    ar: "تسجيل شركات",
    en: "Company Registration",
    desc_ar: "متابعة إجراءات تأسيس وتسجيل الشركات",
    desc_en: "Follow up on company incorporation and registration procedures",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  {
    icon: IdentificationCard,
    ar: "تحديث سجلات",
    en: "Record Updates",
    desc_ar: "تحديث البيانات والسجلات الرسمية في الأنظمة الحكومية",
    desc_en: "Update data and official records in government systems",
    color: "text-rose-500",
    bg: "bg-rose-500/10",
  },
  {
    icon: IdentificationBadge,
    ar: "خدمات جوازات",
    en: "Passport Services",
    desc_ar: "متابعة إجراءات الجوازات والوثائق السفر",
    desc_en: "Follow up on passport and travel document procedures",
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
  },
];

export const trackingSteps: TrackingStep[] = [
  {
    ar: "استلام الطلب",
    en: "Request Received",
    status: "done",
    time_ar: "الإثنين ٩:٠٠ ص",
    time_en: "Monday 9:00 AM",
  },
  {
    ar: "مراجعة الوثائق",
    en: "Document Review",
    status: "done",
    time_ar: "الإثنين ١١:٣٠ ص",
    time_en: "Monday 11:30 AM",
  },
  {
    ar: "تقديم للجهة الحكومية",
    en: "Submitted to Authority",
    status: "active",
    time_ar: "قيد التنفيذ",
    time_en: "In Progress",
  },
  {
    ar: "استلام الموافقة",
    en: "Approval Received",
    status: "pending",
    time_ar: "متوقع الأربعاء",
    time_en: "Expected Wednesday",
  },
];

export const govEntities: GovEntity[] = [
  { ar: "وزارة العدل", en: "Ministry of Justice", short: "MoJ" },
  { ar: "وزارة التجارة", en: "Ministry of Commerce", short: "MoC" },
  { ar: "أمانة الرياض", en: "Riyadh Municipality", short: "ARM" },
  { ar: "هيئة الزكاة والضريبة", en: "ZATCA", short: "ZTC" },
  { ar: "وزارة الموارد البشرية", en: "HRSD", short: "HRS" },
  { ar: "الجوازات", en: "Passports", short: "PAS" },
  { ar: "الأحوال المدنية", en: "Civil Affairs", short: "CVL" },
  { ar: "هيئة الاستثمار", en: "SAGIA", short: "SAG" },
];

export const pricingTiers: PricingTier[] = [
  {
    name_ar: "أساسي",
    name_en: "Basic",
    price: "٩٩",
    price_num: "99",
    currency: "ر.س",
    period_ar: "/ خدمة",
    period_en: "/ service",
    features_ar: [
      "متابعة معاملة واحدة",
      "تقارير أسبوعية",
      "دعم عبر البريد الإلكتروني",
      "مدة الإنجاز: ٧–١٠ أيام",
    ],
    features_en: [
      "1 transaction follow-up",
      "Weekly reports",
      "Email support",
      "Completion: 7–10 days",
    ],
    highlight: false,
    color: "border-gray-200 dark:border-white/10",
    btnClass: "bg-gray-900 dark:bg-white/10 text-white",
  },
  {
    name_ar: "قياسي",
    name_en: "Standard",
    price: "٢٤٩",
    price_num: "249",
    currency: "ر.س",
    period_ar: "/ خدمة",
    period_en: "/ service",
    features_ar: [
      "حتى ٣ معاملات",
      "تقارير يومية",
      "دعم هاتفي وبريد",
      "مدة الإنجاز: ٣–٥ أيام",
      "تتبع مباشر في التطبيق",
    ],
    features_en: [
      "Up to 3 transactions",
      "Daily reports",
      "Phone & email support",
      "Completion: 3–5 days",
      "Live in-app tracking",
    ],
    highlight: true,
    color: "border-[#0B3D2E] dark:border-[#C8A762]/50",
    btnClass: "bg-[#0B3D2E] text-white",
  },
  {
    name_ar: "سريع",
    name_en: "Express",
    price: "٤٩٩",
    price_num: "499",
    currency: "ر.س",
    period_ar: "/ خدمة",
    period_en: "/ service",
    features_ar: [
      "معاملات غير محدودة",
      "تقارير فورية",
      "مدير حساب مخصص",
      "مدة الإنجاز: ٢٤–٤٨ ساعة",
      "أولوية قصوى",
    ],
    features_en: [
      "Unlimited transactions",
      "Real-time reports",
      "Dedicated account manager",
      "Completion: 24–48 hours",
      "Top priority handling",
    ],
    highlight: false,
    color: "border-[#C8A762]/40 dark:border-[#C8A762]/30",
    btnClass: "bg-[#C8A762] text-[#0B3D2E]",
  },
];

export const faqs: FAQ[] = [
  {
    q_ar: "كيف يمكنني متابعة حالة معاملتي؟",
    q_en: "How can I track my transaction status?",
    a_ar:
      "بعد تسجيل الطلب، ستحصل على رقم تتبع فريد وصلاحية دخول إلى لوحة تتبع مباشرة تُحدَّث في الوقت الفعلي.",
    a_en:
      "After registering your request, you receive a unique tracking number and access to a live tracking dashboard updated in real time.",
  },
  {
    q_ar: "هل تتعاملون مع جميع الجهات الحكومية؟",
    q_en: "Do you work with all government entities?",
    a_ar:
      "نغطي أكثر من ٢٠ جهة حكومية رئيسية في المملكة، من وزارات ومصالح حكومية وبلديات.",
    a_en:
      "We cover more than 20 major government entities in the Kingdom, including ministries, agencies, and municipalities.",
  },
  {
    q_ar: "ماذا يحدث إن تأخرت المعاملة عن الموعد المتوقع؟",
    q_en: "What happens if a transaction is delayed beyond the expected date?",
    a_ar:
      "يتواصل فريقنا فوراً مع الجهة المعنية ويُبلغك بالتحديثات، مع خطة بديلة لتسريع الإنجاز.",
    a_en:
      "Our team immediately contacts the relevant authority and notifies you of updates, with an alternative plan to expedite completion.",
  },
  {
    q_ar: "هل يمكنني طلب خدمة تعقيب لأكثر من معاملة في آنٍ واحد؟",
    q_en: "Can I request tracking for multiple transactions simultaneously?",
    a_ar:
      "نعم، الباقة القياسية تدعم حتى ٣ معاملات والباقة السريعة تدعم عدداً غير محدود في آنٍ واحد.",
    a_en:
      "Yes, the Standard plan supports up to 3 transactions and the Express plan supports unlimited concurrent transactions.",
  },
];
