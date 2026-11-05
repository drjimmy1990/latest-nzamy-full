export type LawyerAiPermission =
  | "ai:consult"
  | "ai:quick-answer"
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
  // No point cost here (owner answer ٢١٦, 2026-10-18): a tool's price is what
  // the AI registry charges, read through TOOL_POINT_SOURCES
  // (lawyerAiBadges.ts). The old `pointCost` figures (500 / 300 / 100 …
  // points) contradicted the server.
  betaStatus: LawyerAiBetaStatus;
  sidebarPlacement: LawyerAiSidebarPlacement;
  adminPricingKey: string;
  /**
   * The page behind `href` renders DashboardComingSoon — it has no backend
   * yet. The tool KEEPS its row here (its permission and its admin pricing
   * key are real and the page must stay reachable to say
   * «قريباً»), but `getLawyerAiBadge` refuses to price it on the hub: a
   * «١٠٠ نقطة» pill over a page that cannot answer is the same false promise
   * a «جديد» nav badge is, which is what src/lib/services/navComingSoon.test.ts
   * exists to stop.
   */
  comingSoon?: true;
}

export const LAWYER_AI_TOOLS: readonly LawyerAiTool[] = [
  {
    permission: "ai:consult",
    href: "/ai/consult",
    titleAr: "المستشار الذكي",
    titleEn: "AI Advisor",
    betaStatus: "beta-free",
    sidebarPlacement: "hub-only",
    adminPricingKey: "lawyer.ai.consult",
    // Wave 1 task 6: /ai/consult starts no AI run — every answer ends at the
    // beta gate's "not available" card (betaGatedRoutes.ts). So no «بيتا
    // مجاني»: a free tool that answers nothing is «قريباً».
    comingSoon: true,
  },
  {
    permission: "ai:quick-answer",
    href: "/ai/quick-answer",
    titleAr: "سؤال قانوني سريع",
    titleEn: "Quick Legal Q&A",
    betaStatus: "priced",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.quick_answer",
  },
  {
    permission: "ai:draft",
    href: "/ai/draft",
    titleAr: "الصائغ القانوني",
    titleEn: "Legal Drafter",
    betaStatus: "priced",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.draft",
  },
  {
    permission: "ai:brief-check",
    href: "/ai/brief-check",
    // Was «فاحص المذكرات» / "Brief Auditor" — the name of an automatic
    // checker that never existed (the page showed five fixed findings after a
    // timer). /ai/brief-check now places an order the TEAM fulfils (owner
    // decision Q77), under the owner's own name for the service.
    titleAr: "مراجعة وتدقيق مذكرة",
    titleEn: "Brief Review",
    // The registry charges every run (src/lib/ai/tools.ts), so the hub shows
    // that price, not «بيتا مجاني» (Wave 1 task 4).
    betaStatus: "priced",
    sidebarPlacement: "hub-only",
    adminPricingKey: "lawyer.ai.brief_check",
  },
  {
    permission: "ai:collector",
    href: "/ai/collector",
    titleAr: "المجمع البحثي",
    titleEn: "Research Collector",
    betaStatus: "free",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.collector",
  },
  {
    permission: "ai:contracts",
    href: "/ai/contracts",
    titleAr: "محترف العقود",
    titleEn: "Contract Pro",
    betaStatus: "priced",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.contracts",
  },
  {
    permission: "ai:contract-drafter",
    href: "/ai/contract-drafter",
    titleAr: "محترف العقود المختصر",
    titleEn: "Contract Drafter Lite",
    // The registry charges every run (src/lib/ai/tools.ts), so the hub shows
    // that price, not «بيتا مجاني» (Wave 1 task 4).
    betaStatus: "priced",
    sidebarPlacement: "hub-only",
    adminPricingKey: "lawyer.ai.contract_drafter_lite",
  },
  {
    permission: "ai:wargaming",
    href: "/ai/wargaming",
    titleAr: "المحاكي الشامل",
    titleEn: "Litigation Studio",
    betaStatus: "priced",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.wargaming",
  },
  {
    permission: "ai:analyze-strength",
    href: "/ai/analyze-strength",
    titleAr: "محلل قوة الموقف",
    titleEn: "Position Strength Analyzer",
    // Wave 4: a real points job now (owner's 25-Oct price list), so it is
    // no longer described as free; its badge reads the registry's price.
    betaStatus: "priced",
    sidebarPlacement: "hub-only",
    adminPricingKey: "lawyer.ai.analyze_strength",
  },
  {
    permission: "ai:analyze",
    href: "/ai/analyze",
    titleAr: "عصارة المرفقات",
    titleEn: "Attachment Analyzer",
    betaStatus: "priced",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.analyze",
  },
  {
    permission: "ai:legal-opinion",
    href: "/ai/legal-opinion",
    titleAr: "الرأي الفصل",
    titleEn: "Al-Ra'y Al-Fasl",
    betaStatus: "priced",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.legal_opinion",
  },
  {
    permission: "ai:procedures",
    href: "/ai/procedures",
    titleAr: "المرشد القضائي",
    titleEn: "Court Guide",
    betaStatus: "free",
    sidebarPlacement: "more-tools",
    adminPricingKey: "lawyer.ai.procedures",
  },
  {
    permission: "ai:fee-calculator",
    href: "/ai/fee-calculator",
    titleAr: "الحاسبة القانونية",
    titleEn: "Legal Calculator",
    betaStatus: "free",
    sidebarPlacement: "more-tools",
    adminPricingKey: "lawyer.ai.fee_calculator",
  },
  {
    permission: "ai:najiz-optimizer",
    href: "/ai/najiz-optimizer",
    titleAr: "منقح ناجز",
    titleEn: "Najiz Optimizer",
    betaStatus: "priced",
    sidebarPlacement: "more-tools",
    adminPricingKey: "lawyer.ai.najiz_optimizer",
  },
  {
    permission: "ai:direction-support",
    href: "/ai/direction-support",
    titleAr: "داعم الاتجاه",
    titleEn: "Direction Support",
    betaStatus: "priced",
    sidebarPlacement: "more-tools",
    adminPricingKey: "lawyer.ai.direction_support",
    // UAT-LIVE-AI-001 — every نص/سابقة this page returned was a module
    // constant; it now renders DashboardComingSoon. The row stays so the
    // permission keeps existing (without it `ai/layout.tsx` would refuse the
    // lawyer the «قريباً» page itself) and so the admin pricing screen keeps
    // its key — only the hub badge stops claiming a price.
    comingSoon: true,
  },
  {
    permission: "ai:legal-translate",
    href: "/ai/legal-translate",
    titleAr: "المترجم القانوني",
    titleEn: "Legal Translator",
    betaStatus: "priced",
    sidebarPlacement: "more-tools",
    adminPricingKey: "lawyer.ai.legal_translate",
    // Owner answer ١١٥ — the page printed one fixed "translation" whatever was
    // typed in; it renders DashboardComingSoon now. The row stays for the same
    // reasons as direction-support's above.
    comingSoon: true,
  },
  {
    permission: "ai:transcriber",
    href: "/ai/transcriber",
    titleAr: "المفرغ الذكي",
    titleEn: "Transcriber",
    betaStatus: "priced",
    sidebarPlacement: "more-tools",
    adminPricingKey: "lawyer.ai.transcriber",
    // Owner answer ١١٥ — both modes printed a fixed transcript of a hearing
    // nobody uploaded; the page renders DashboardComingSoon now, so it is
    // unpriced (the owner's ٥ is recorded above TOOL_POINT_SOURCES in
    // lawyerAiBadges.ts).
    comingSoon: true,
  },
  {
    permission: "ai:compare",
    href: "/ai/compare",
    titleAr: "المقارن الذكي",
    titleEn: "Smart Comparator",
    betaStatus: "priced",
    sidebarPlacement: "more-tools",
    adminPricingKey: "lawyer.ai.compare",
    // Owner answer ١١٥ — every difference and issue was a fixture; the page
    // renders DashboardComingSoon now.
    comingSoon: true,
  },
  {
    permission: "ai:secretary",
    href: "/ai/secretary",
    titleAr: "السكرتير الذكي",
    titleEn: "AI Secretary",
    betaStatus: "priced",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.secretary",
    // Owner answer ١١٥, fix round 1 — the page itself says «مؤجّل بقرار المالك
    // (قريباً)»: its rules, decisions and activity were literals.
    comingSoon: true,
  },
  {
    permission: "ai:monitor",
    href: "/ai/monitor",
    titleAr: "راصد التشريعات",
    titleEn: "Law Monitor",
    // Free (2026-10-04): /ai/monitor is a live library feed that charges
    // nothing, so the hub's old «10 نقطة» pill priced a tool with no price.
    // The badge is display-only — no route debits points — so «مجاني» changes
    // nothing else.
    betaStatus: "free",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.monitor",
  },
  {
    permission: "ai:communicate",
    href: "/ai/communicate",
    titleAr: "المتحدث الذكي",
    titleEn: "Smart Communicator",
    // The registry charges every run (src/lib/ai/tools.ts), so the hub shows
    // that price, not «بيتا مجاني» (Wave 1 task 4).
    betaStatus: "priced",
    sidebarPlacement: "hub-only",
    adminPricingKey: "lawyer.ai.communicate",
  },
  {
    permission: "ai:assistant",
    href: "/ai/assistant",
    titleAr: "المساعد المتقدم",
    titleEn: "Advanced Assistant",
    // The registry charges every run (src/lib/ai/tools.ts), so the hub shows
    // that price, not «بيتا مجاني» (Wave 1 task 4).
    betaStatus: "priced",
    sidebarPlacement: "hub-only",
    adminPricingKey: "lawyer.ai.assistant",
  },
];

export const LAWYER_AI_PERMISSION_KEYS = LAWYER_AI_TOOLS.map((tool) => tool.permission);

export const LAWYER_AI_TOOL_BY_PERMISSION = Object.fromEntries(
  LAWYER_AI_TOOLS.map((tool) => [tool.permission, tool]),
) as Record<LawyerAiPermission, LawyerAiTool>;

// The hub's point badges (TOOL_POINT_SOURCES, TOOL_POINT_LABELS,
// getLawyerAiBadge) live in lawyerAiBadges.ts: they read the AI registry, and
// this file stays free of it because useUser loads it on every page.
