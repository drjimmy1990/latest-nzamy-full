export type LawyerAiPermission =
  | "ai:consult"
  | "ai:quick-answer"
  | "ai:case-brief"
  | "ai:draft"
  | "ai:brief-check"
  | "ai:collector"
  | "ai:contracts"
  | "ai:contract-drafter"
  | "ai:wargaming"
  | "ai:analyze-strength"
  | "ai:analyze"
  | "ai:legal-opinion"
  | "ai:procedures"
  | "ai:fee-calculator"
  | "ai:najiz-optimizer"
  | "ai:direction-support"
  | "ai:legal-translate"
  | "ai:transcriber"
  | "ai:compare"
  | "ai:secretary"
  | "ai:monitor"
  | "ai:communicate"
  | "ai:assistant";

export type LawyerAiBetaStatus = "priced" | "beta-free" | "free";
export type LawyerAiSidebarPlacement = "core" | "more-tools" | "hub-only";

export interface LawyerAiTool {
  permission: LawyerAiPermission;
  href: string;
  titleAr: string;
  titleEn: string;
  pointCost: number;
  betaStatus: LawyerAiBetaStatus;
  sidebarPlacement: LawyerAiSidebarPlacement;
  adminPricingKey: string;
}

export const LAWYER_AI_TOOLS: readonly LawyerAiTool[] = [
  {
    permission: "ai:consult",
    href: "/ai/consult",
    titleAr: "المستشار الذكي",
    titleEn: "AI Advisor",
    pointCost: 0,
    betaStatus: "beta-free",
    sidebarPlacement: "hub-only",
    adminPricingKey: "lawyer.ai.consult",
  },
  {
    permission: "ai:quick-answer",
    href: "/ai/quick-answer",
    titleAr: "سؤال قانوني سريع",
    titleEn: "Quick Legal Q&A",
    pointCost: 20,
    betaStatus: "priced",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.quick_answer",
  },
  {
    permission: "ai:case-brief",
    href: "/ai/case-brief",
    titleAr: "ParaLegal",
    titleEn: "ParaLegal Briefing",
    pointCost: 20,
    betaStatus: "priced",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.case_brief",
  },
  {
    permission: "ai:draft",
    href: "/ai/draft",
    titleAr: "الصائغ القانوني",
    titleEn: "Legal Drafter",
    pointCost: 500,
    betaStatus: "priced",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.draft",
  },
  {
    permission: "ai:brief-check",
    href: "/ai/brief-check",
    titleAr: "فاحص المذكرات",
    titleEn: "Brief Auditor",
    pointCost: 0,
    betaStatus: "beta-free",
    sidebarPlacement: "hub-only",
    adminPricingKey: "lawyer.ai.brief_check",
  },
  {
    permission: "ai:collector",
    href: "/ai/collector",
    titleAr: "المجمع البحثي",
    titleEn: "Research Collector",
    pointCost: 0,
    betaStatus: "free",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.collector",
  },
  {
    permission: "ai:contracts",
    href: "/ai/contracts",
    titleAr: "محترف العقود",
    titleEn: "Contract Pro",
    pointCost: 500,
    betaStatus: "priced",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.contracts",
  },
  {
    permission: "ai:contract-drafter",
    href: "/ai/contract-drafter",
    titleAr: "محترف العقود لايت",
    titleEn: "Contract Drafter Lite",
    pointCost: 0,
    betaStatus: "beta-free",
    sidebarPlacement: "hub-only",
    adminPricingKey: "lawyer.ai.contract_drafter_lite",
  },
  {
    permission: "ai:wargaming",
    href: "/ai/wargaming",
    titleAr: "المحاكي الشامل",
    titleEn: "Litigation Studio",
    pointCost: 30,
    betaStatus: "priced",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.wargaming",
  },
  {
    permission: "ai:analyze-strength",
    href: "/ai/analyze-strength",
    titleAr: "محلل قوة الموقف",
    titleEn: "Position Strength Analyzer",
    pointCost: 0,
    betaStatus: "beta-free",
    sidebarPlacement: "hub-only",
    adminPricingKey: "lawyer.ai.analyze_strength",
  },
  {
    permission: "ai:analyze",
    href: "/ai/analyze",
    titleAr: "عصارة المرفقات",
    titleEn: "Attachment Analyzer",
    pointCost: 300,
    betaStatus: "priced",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.analyze",
  },
  {
    permission: "ai:legal-opinion",
    href: "/ai/legal-opinion",
    titleAr: "الرأي الفصل",
    titleEn: "Al-Ra'y Al-Fasl",
    pointCost: 100,
    betaStatus: "priced",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.legal_opinion",
  },
  {
    permission: "ai:procedures",
    href: "/ai/procedures",
    titleAr: "المرشد القضائي",
    titleEn: "Court Guide",
    pointCost: 0,
    betaStatus: "free",
    sidebarPlacement: "more-tools",
    adminPricingKey: "lawyer.ai.procedures",
  },
  {
    permission: "ai:fee-calculator",
    href: "/ai/fee-calculator",
    titleAr: "الحاسبة القانونية",
    titleEn: "Legal Calculator",
    pointCost: 0,
    betaStatus: "free",
    sidebarPlacement: "more-tools",
    adminPricingKey: "lawyer.ai.fee_calculator",
  },
  {
    permission: "ai:najiz-optimizer",
    href: "/ai/najiz-optimizer",
    titleAr: "منقح ناجز",
    titleEn: "Najiz Optimizer",
    pointCost: 10,
    betaStatus: "priced",
    sidebarPlacement: "more-tools",
    adminPricingKey: "lawyer.ai.najiz_optimizer",
  },
  {
    permission: "ai:direction-support",
    href: "/ai/direction-support",
    titleAr: "داعم الاتجاه",
    titleEn: "Direction Support",
    pointCost: 100,
    betaStatus: "priced",
    sidebarPlacement: "more-tools",
    adminPricingKey: "lawyer.ai.direction_support",
  },
  {
    permission: "ai:legal-translate",
    href: "/ai/legal-translate",
    titleAr: "المترجم القانوني",
    titleEn: "Legal Translator",
    pointCost: 50,
    betaStatus: "priced",
    sidebarPlacement: "more-tools",
    adminPricingKey: "lawyer.ai.legal_translate",
  },
  {
    permission: "ai:transcriber",
    href: "/ai/transcriber",
    titleAr: "المفرغ الذكي",
    titleEn: "Transcriber",
    pointCost: 10,
    betaStatus: "priced",
    sidebarPlacement: "more-tools",
    adminPricingKey: "lawyer.ai.transcriber",
  },
  {
    permission: "ai:compare",
    href: "/ai/compare",
    titleAr: "المقارن الذكي",
    titleEn: "Smart Comparator",
    pointCost: 5,
    betaStatus: "priced",
    sidebarPlacement: "more-tools",
    adminPricingKey: "lawyer.ai.compare",
  },
  {
    permission: "ai:secretary",
    href: "/ai/secretary",
    titleAr: "السكرتير الذكي",
    titleEn: "AI Secretary",
    pointCost: 5,
    betaStatus: "priced",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.secretary",
  },
  {
    permission: "ai:monitor",
    href: "/ai/monitor",
    titleAr: "راصد التشريعات",
    titleEn: "Law Monitor",
    pointCost: 10,
    betaStatus: "priced",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.monitor",
  },
  {
    permission: "ai:communicate",
    href: "/ai/communicate",
    titleAr: "المتحدث الذكي",
    titleEn: "Smart Communicator",
    pointCost: 0,
    betaStatus: "beta-free",
    sidebarPlacement: "hub-only",
    adminPricingKey: "lawyer.ai.communicate",
  },
  {
    permission: "ai:assistant",
    href: "/ai/assistant",
    titleAr: "المساعد المتقدم",
    titleEn: "Advanced Assistant",
    pointCost: 0,
    betaStatus: "beta-free",
    sidebarPlacement: "hub-only",
    adminPricingKey: "lawyer.ai.assistant",
  },
];

export const LAWYER_AI_PERMISSION_KEYS = LAWYER_AI_TOOLS.map((tool) => tool.permission);

export const LAWYER_AI_TOOL_BY_PERMISSION = Object.fromEntries(
  LAWYER_AI_TOOLS.map((tool) => [tool.permission, tool]),
) as Record<LawyerAiPermission, LawyerAiTool>;

export function getLawyerAiBadge(tool: LawyerAiTool, lang: "ar" | "en") {
  if (tool.betaStatus === "beta-free") return lang === "ar" ? "بيتا مجاني" : "Beta free";
  if (tool.betaStatus === "free") return lang === "ar" ? "مجاني" : "Free";
  return lang === "ar" ? `${tool.pointCost} نقطة` : `${tool.pointCost} pts`;
}
