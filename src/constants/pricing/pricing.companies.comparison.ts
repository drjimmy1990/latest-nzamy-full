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
        "biz-sm-basic": "❌", "biz-sm-pro": "قريباً", "biz-sm-full": "قريباً",
        "biz-md-basic": "❌", "biz-md-pro": "قريباً", "biz-md-full": "قريباً",
        "biz-lg-basic": "❌", "biz-lg-pro": "قريباً", "biz-lg-full": "قريباً",
        "dept-sm-basic": "❌", "dept-sm-pro": "❌", "dept-sm-full": "❌",
        "dept-md-basic": "❌", "dept-md-pro": "❌", "dept-md-full": "❌",
        "dept-lg-basic": "❌", "dept-lg-pro": "❌", "dept-lg-full": "❌",
      },
      { 
        feature: "استشارات محامٍ متخصص",
        "biz-sm-basic": "❌", "biz-sm-pro": "قريباً", "biz-sm-full": "قريباً",
        "biz-md-basic": "قريباً", "biz-md-pro": "قريباً", "biz-md-full": "قريباً",
        "biz-lg-basic": "قريباً", "biz-lg-pro": "قريباً", "biz-lg-full": "قريباً",
        "dept-sm-basic": "فريق داخلي", "dept-sm-pro": "فريق داخلي", "dept-sm-full": "فريق داخلي",
        "dept-md-basic": "فريق داخلي", "dept-md-pro": "فريق داخلي", "dept-md-full": "فريق داخلي",
        "dept-lg-basic": "فريق داخلي", "dept-lg-pro": "فريق داخلي", "dept-lg-full": "فريق داخلي",
      },
      { 
        feature: "الترافع (قضايا وجلسات)",
        "biz-sm-basic": "قريباً", "biz-sm-pro": "قريباً", "biz-sm-full": "قريباً",
        "biz-md-basic": "قريباً", "biz-md-pro": "قريباً", "biz-md-full": "قريباً",
        "biz-lg-basic": "قريباً", "biz-lg-pro": "قريباً", "biz-lg-full": "قريباً",
        "dept-sm-basic": "❌", "dept-sm-pro": "قريباً", "dept-sm-full": "قريباً",
        "dept-md-basic": "❌", "dept-md-pro": "قريباً", "dept-md-full": "قريباً",
        "dept-lg-basic": "❌", "dept-lg-pro": "قريباً", "dept-lg-full": "قريباً",
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
        "biz-sm-basic": "❌", "biz-sm-pro": "قريباً", "biz-sm-full": "قريباً",
        "biz-md-basic": "قريباً", "biz-md-pro": "قريباً", "biz-md-full": "قريباً",
        "biz-lg-basic": "قريباً", "biz-lg-pro": "قريباً", "biz-lg-full": "قريباً",
        "dept-sm-basic": "قريباً", "dept-sm-pro": "قريباً", "dept-sm-full": "قريباً",
        "dept-md-basic": "قريباً", "dept-md-pro": "قريباً", "dept-md-full": "قريباً",
        "dept-lg-basic": "قريباً", "dept-lg-pro": "قريباً", "dept-lg-full": "قريباً",
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
        "biz-sm-basic": "❌", "biz-sm-pro": "Soon", "biz-sm-full": "Soon",
        "biz-md-basic": "❌", "biz-md-pro": "Soon", "biz-md-full": "Soon",
        "biz-lg-basic": "❌", "biz-lg-pro": "Soon", "biz-lg-full": "Soon",
        "dept-sm-basic": "❌", "dept-sm-pro": "❌", "dept-sm-full": "❌",
        "dept-md-basic": "❌", "dept-md-pro": "❌", "dept-md-full": "❌",
        "dept-lg-basic": "❌", "dept-lg-pro": "❌", "dept-lg-full": "❌",
      },
      { 
        feature: "Specialist Lawyer Consultations",
        "biz-sm-basic": "❌", "biz-sm-pro": "Soon", "biz-sm-full": "Soon",
        "biz-md-basic": "Soon", "biz-md-pro": "Soon", "biz-md-full": "Soon",
        "biz-lg-basic": "Soon", "biz-lg-pro": "Soon", "biz-lg-full": "Soon",
        "dept-sm-basic": "Internal Team", "dept-sm-pro": "Internal Team", "dept-sm-full": "Internal Team",
        "dept-md-basic": "Internal Team", "dept-md-pro": "Internal Team", "dept-md-full": "Internal Team",
        "dept-lg-basic": "Internal Team", "dept-lg-pro": "Internal Team", "dept-lg-full": "Internal Team",
      },
      { 
        feature: "Litigation (Cases & Hearings)",
        "biz-sm-basic": "Soon", "biz-sm-pro": "Soon", "biz-sm-full": "Soon",
        "biz-md-basic": "Soon", "biz-md-pro": "Soon", "biz-md-full": "Soon",
        "biz-lg-basic": "Soon", "biz-lg-pro": "Soon", "biz-lg-full": "Soon",
        "dept-sm-basic": "❌", "dept-sm-pro": "Soon", "dept-sm-full": "Soon",
        "dept-md-basic": "❌", "dept-md-pro": "Soon", "dept-md-full": "Soon",
        "dept-lg-basic": "❌", "dept-lg-pro": "Soon", "dept-lg-full": "Soon",
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
        "biz-sm-basic": "❌", "biz-sm-pro": "Soon", "biz-sm-full": "Soon",
        "biz-md-basic": "Soon", "biz-md-pro": "Soon", "biz-md-full": "Soon",
        "biz-lg-basic": "Soon", "biz-lg-pro": "Soon", "biz-lg-full": "Soon",
        "dept-sm-basic": "Soon", "dept-sm-pro": "Soon", "dept-sm-full": "Soon",
        "dept-md-basic": "Soon", "dept-md-pro": "Soon", "dept-md-full": "Soon",
        "dept-lg-basic": "Soon", "dept-lg-pro": "Soon", "dept-lg-full": "Soon",
      },
    ]},
  ],
};
