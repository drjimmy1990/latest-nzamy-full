import { Brain, Gavel, Users } from "@phosphor-icons/react";
import { ComparisonCategory } from "./pricing.types";

// Wave 1 task 6, fix round 2 (I6): CorpMind, the AI contract reviewer, the
// compliance radar and the 360° health check are beta-gated or «قريباً»
// pages (src/constants/betaGatedRoutes.ts, DashboardComingSoon), so this
// table sells none of them: one «قريباً» row, as in comparisonGovernment.
// Contract review keeps only the lawyer counts the plan cards
// (pricing.companies.ts) list.
export const comparisonCompanies: { ar: ComparisonCategory[]; en: ComparisonCategory[] } = {
  ar: [
    { category: "أدوات الذكاء الاصطناعي", icon: Brain, rows: [
      { 
        feature: "أدوات الذكاء الاصطناعي",
        "biz-sm-basic": "قريباً", "biz-sm-pro": "قريباً", "biz-sm-full": "قريباً",
        "biz-md-basic": "قريباً", "biz-md-pro": "قريباً", "biz-md-full": "قريباً",
        "biz-lg-basic": "قريباً", "biz-lg-pro": "قريباً", "biz-lg-full": "قريباً",
        "dept-sm-basic": "قريباً", "dept-sm-pro": "قريباً", "dept-sm-full": "قريباً",
        "dept-md-basic": "قريباً", "dept-md-pro": "قريباً", "dept-md-full": "قريباً",
        "dept-lg-basic": "قريباً", "dept-lg-pro": "قريباً", "dept-lg-full": "قريباً",
      },
    ]},
    { category: "الخدمات القانونية", icon: Gavel, rows: [
      { 
        feature: "مراجعة عقود محامٍ",
        "biz-sm-basic": "❌", "biz-sm-pro": "٢/شهر", "biz-sm-full": "٥/شهر",
        "biz-md-basic": "❌", "biz-md-pro": "٥/شهر", "biz-md-full": "١٠/شهر",
        "biz-lg-basic": "❌", "biz-lg-pro": "١٠/شهر", "biz-lg-full": "حسب العقد",
        "dept-sm-basic": "❌", "dept-sm-pro": "❌", "dept-sm-full": "❌",
        "dept-md-basic": "❌", "dept-md-pro": "❌", "dept-md-full": "❌",
        "dept-lg-basic": "❌", "dept-lg-pro": "❌", "dept-lg-full": "❌",
      },
      { 
        feature: "استشارات محامٍ متخصص",
        "biz-sm-basic": "❌", "biz-sm-pro": "ساعتين/شهر", "biz-sm-full": "٥ ساعات/شهر",
        "biz-md-basic": "ساعتين/شهر", "biz-md-pro": "٥ ساعات/شهر", "biz-md-full": "١٠ ساعات/شهر",
        "biz-lg-basic": "٣ ساعات/شهر", "biz-lg-pro": "١٠ ساعات/شهر", "biz-lg-full": "مخصص",
        "dept-sm-basic": "فريق داخلي", "dept-sm-pro": "فريق داخلي", "dept-sm-full": "فريق داخلي",
        "dept-md-basic": "فريق داخلي", "dept-md-pro": "فريق داخلي", "dept-md-full": "فريق داخلي",
        "dept-lg-basic": "فريق داخلي", "dept-lg-pro": "فريق داخلي", "dept-lg-full": "فريق داخلي",
      },
      { 
        feature: "الترافع (قضايا وجلسات)",
        "biz-sm-basic": "خصم فقط", "biz-sm-pro": "قضية (سقف ٥٠ ألف)", "biz-sm-full": "قضيتين (سقف ١٠٠ ألف)",
        "biz-md-basic": "خصم فقط", "biz-md-pro": "قضيتين (سقف ١٥٠ ألف)", "biz-md-full": "٣ قضايا (سقف ٣٠٠ ألف)",
        "biz-lg-basic": "قضية (سقف ١٥٠ ألف)", "biz-lg-pro": "٣ قضايا (سقف ٣٠٠ ألف)", "biz-lg-full": "عقد مخصص",
        "dept-sm-basic": "❌", "dept-sm-pro": "سوق المهنيين", "dept-sm-full": "سوق المهنيين",
        "dept-md-basic": "❌", "dept-md-pro": "سوق المهنيين", "dept-md-full": "سوق المهنيين",
        "dept-lg-basic": "❌", "dept-lg-pro": "انتداب مستشار", "dept-lg-full": "سوق + انتداب",
      },
    ]},
    { category: "الفريق والمنصة", icon: Users, rows: [
      { 
        feature: "المستخدمون",
        "biz-sm-basic": "٣", "biz-sm-pro": "٥", "biz-sm-full": "١٠",
        "biz-md-basic": "٥", "biz-md-pro": "١٥", "biz-md-full": "٢٥",
        "biz-lg-basic": "١٠", "biz-lg-pro": "٣٠", "biz-lg-full": "مخصص",
        "dept-sm-basic": "٢", "dept-sm-pro": "٥", "dept-sm-full": "١٠",
        "dept-md-basic": "٥", "dept-md-pro": "١٠", "dept-md-full": "٢٠",
        "dept-lg-basic": "١٠", "dept-lg-pro": "٢٥", "dept-lg-full": "٥٠",
      },
      { 
        feature: "لوحة Kanban للمهام",
        "biz-sm-basic": "❌", "biz-sm-pro": "١٥ مهمة", "biz-sm-full": "٣٠ مهمة",
        "biz-md-basic": "٢٠ مهمة", "biz-md-pro": "٤٠ مهمة", "biz-md-full": "٨٠ مهمة",
        "biz-lg-basic": "٣٠ مهمة", "biz-lg-pro": "١٠٠ مهمة", "biz-lg-full": "مفتوح",
        "dept-sm-basic": "١٠ مهام", "dept-sm-pro": "٢٥ مهمة", "dept-sm-full": "٥٠ مهمة",
        "dept-md-basic": "٢٥ مهمة", "dept-md-pro": "٥٠ مهمة", "dept-md-full": "١٠٠ مهمة",
        "dept-lg-basic": "٤٠ مهمة", "dept-lg-pro": "١٠٠ مهمة", "dept-lg-full": "٢٠٠ مهمة",
      },
    ]},
  ],
  en: [
    { category: "AI Tools", icon: Brain, rows: [
      { 
        feature: "AI tools",
        "biz-sm-basic": "Soon", "biz-sm-pro": "Soon", "biz-sm-full": "Soon",
        "biz-md-basic": "Soon", "biz-md-pro": "Soon", "biz-md-full": "Soon",
        "biz-lg-basic": "Soon", "biz-lg-pro": "Soon", "biz-lg-full": "Soon",
        "dept-sm-basic": "Soon", "dept-sm-pro": "Soon", "dept-sm-full": "Soon",
        "dept-md-basic": "Soon", "dept-md-pro": "Soon", "dept-md-full": "Soon",
        "dept-lg-basic": "Soon", "dept-lg-pro": "Soon", "dept-lg-full": "Soon",
      },
    ]},
    { category: "Legal Services", icon: Gavel, rows: [
      { 
        feature: "Lawyer Contract Review",
        "biz-sm-basic": "❌", "biz-sm-pro": "2/mo", "biz-sm-full": "5/mo",
        "biz-md-basic": "❌", "biz-md-pro": "5/mo", "biz-md-full": "10/mo",
        "biz-lg-basic": "❌", "biz-lg-pro": "10/mo", "biz-lg-full": "Per contract",
        "dept-sm-basic": "❌", "dept-sm-pro": "❌", "dept-sm-full": "❌",
        "dept-md-basic": "❌", "dept-md-pro": "❌", "dept-md-full": "❌",
        "dept-lg-basic": "❌", "dept-lg-pro": "❌", "dept-lg-full": "❌",
      },
      { 
        feature: "Specialist Lawyer Consultations",
        "biz-sm-basic": "❌", "biz-sm-pro": "2 hrs/mo", "biz-sm-full": "5 hrs/mo",
        "biz-md-basic": "2 hrs/mo", "biz-md-pro": "5 hrs/mo", "biz-md-full": "10 hrs/mo",
        "biz-lg-basic": "3 hrs/mo", "biz-lg-pro": "10 hrs/mo", "biz-lg-full": "Custom",
        "dept-sm-basic": "Internal Team", "dept-sm-pro": "Internal Team", "dept-sm-full": "Internal Team",
        "dept-md-basic": "Internal Team", "dept-md-pro": "Internal Team", "dept-md-full": "Internal Team",
        "dept-lg-basic": "Internal Team", "dept-lg-pro": "Internal Team", "dept-lg-full": "Internal Team",
      },
      { 
        feature: "Litigation (Cases & Hearings)",
        "biz-sm-basic": "Discount only", "biz-sm-pro": "1 Case (Cap 50K)", "biz-sm-full": "2 Cases (Cap 100K)",
        "biz-md-basic": "Discount only", "biz-md-pro": "2 Cases (Cap 150K)", "biz-md-full": "3 Cases (Cap 300K)",
        "biz-lg-basic": "1 Case (Cap 150K)", "biz-lg-pro": "3 Cases (Cap 300K)", "biz-lg-full": "Custom contract",
        "dept-sm-basic": "❌", "dept-sm-pro": "Marketplace", "dept-sm-full": "Marketplace",
        "dept-md-basic": "❌", "dept-md-pro": "Marketplace", "dept-md-full": "Marketplace",
        "dept-lg-basic": "❌", "dept-lg-pro": "Secondment", "dept-lg-full": "Marketplace + Secondment",
      },
    ]},
    { category: "Team & Platform", icon: Users, rows: [
      { 
        feature: "Users",
        "biz-sm-basic": "3", "biz-sm-pro": "5", "biz-sm-full": "10",
        "biz-md-basic": "5", "biz-md-pro": "15", "biz-md-full": "25",
        "biz-lg-basic": "10", "biz-lg-pro": "30", "biz-lg-full": "Custom",
        "dept-sm-basic": "2", "dept-sm-pro": "5", "dept-sm-full": "10",
        "dept-md-basic": "5", "dept-md-pro": "10", "dept-md-full": "20",
        "dept-lg-basic": "10", "dept-lg-pro": "25", "dept-lg-full": "50",
      },
      { 
        feature: "Kanban Task Board",
        "biz-sm-basic": "❌", "biz-sm-pro": "15 tasks", "biz-sm-full": "30 tasks",
        "biz-md-basic": "20 tasks", "biz-md-pro": "40 tasks", "biz-md-full": "80 tasks",
        "biz-lg-basic": "30 tasks", "biz-lg-pro": "100 tasks", "biz-lg-full": "Unlimited",
        "dept-sm-basic": "10 tasks", "dept-sm-pro": "25 tasks", "dept-sm-full": "50 tasks",
        "dept-md-basic": "25 tasks", "dept-md-pro": "50 tasks", "dept-md-full": "100 tasks",
        "dept-lg-basic": "40 tasks", "dept-lg-pro": "100 tasks", "dept-lg-full": "200 tasks",
      },
    ]},
  ],
};
