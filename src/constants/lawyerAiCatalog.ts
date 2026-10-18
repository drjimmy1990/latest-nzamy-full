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
  // No point cost here (owner answer ٢١٦, 2026-10-18): a tool's price is the
  // services price list's, read through TOOL_POINT_LABELS below. The old
  // `pointCost` figures (500 / 300 / 100 … points) contradicted that list.
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
    permission: "ai:case-brief",
    href: "/ai/case-brief",
    titleAr: "الموجز القضائي",
    titleEn: "ParaLegal Briefing",
    betaStatus: "priced",
    sidebarPlacement: "core",
    adminPricingKey: "lawyer.ai.case_brief",
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
    betaStatus: "beta-free",
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
    betaStatus: "beta-free",
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
    betaStatus: "beta-free",
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
    // Owner answer ١١٥, fix round 1 — the lawyer flow (AttachmentSqueezer)
    // printed one fixed report for any files and renders DashboardComingSoon
    // now. The route stays live for clients (SmartAnalyzer), but this row is
    // the LAWYER tool, so it is «قريباً», unpriced and off the quick tiles.
    comingSoon: true,
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
    // unpriced (the owner's ٥ is recorded above TOOL_POINT_LABELS).
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
    betaStatus: "beta-free",
    sidebarPlacement: "hub-only",
    adminPricingKey: "lawyer.ai.communicate",
  },
  {
    permission: "ai:assistant",
    href: "/ai/assistant",
    titleAr: "المساعد المتقدم",
    titleEn: "Advanced Assistant",
    betaStatus: "beta-free",
    sidebarPlacement: "hub-only",
    adminPricingKey: "lawyer.ai.assistant",
  },
];

export const LAWYER_AI_PERMISSION_KEYS = LAWYER_AI_TOOLS.map((tool) => tool.permission);

export const LAWYER_AI_TOOL_BY_PERMISSION = Object.fromEntries(
  LAWYER_AI_TOOLS.map((tool) => [tool.permission, tool]),
) as Record<LawyerAiPermission, LawyerAiTool>;

/**
 * A priced tool's cost on the hub, keyed by catalog id (owner answers ١٧٨ and
 * ٢١٦). These are the labels of the rows of `lawyerServicesTable`
 * (src/constants/pricing/pricing.lawyers.ts) that carry the same id in their
 * `tools` — the price list under the lawyer cards on /pricing.
 * pricingApprovals.test.ts holds the two equal both ways round. The map lives
 * here, not there, because this file must stay loadable by `node --test` and
 * pricing.lawyers.ts imports React icons.
 *
 * A priced tool with no entry gets no badge: a missing price is better than a
 * guessed one. That is quick-answer and case-brief (the owner has not priced
 * them), and compare and legal-translate (both returned canned output and are
 * «قريباً» now, owner ١١٥ — the owner's ٢١٦ range is not shown until they
 * work). A `comingSoon` tool shows «قريباً» whatever this map holds.
 *
 * UNPRICED UNTIL THEY WORK (owner ١١٥, fix round 1). These tools are
 * `comingSoon`, so neither this map nor lawyerServicesTable sells them. The
 * owner's approved prices, to restore (here AND as a table row with the same
 * `tools` ids) once each page really answers:
 *   - "ai:analyze": "٨" — row «عصارة المرفقات وتلخيص ملف القضية واستخلاص
 *     النزاع», points 8; the lawyer card also listed «عصارة المرفقات وتلخيص
 *     ملف القضية: ٨ نقاط» / "Attachment digest and case summary: 8 points".
 *   - "ai:transcriber": "٥" and "ai:secretary": "٥" — one shared row,
 *     «التفريغ الصوتي الذكي وأوامر السكرتير», points 5.
 */
export const TOOL_POINT_LABELS: Record<string, string> = {
  "ai:draft": "١٥",
  "ai:contracts": "١٠",
  "ai:najiz-optimizer": "٥–٨",
  "ai:wargaming": "١٥–٢٠",
  "ai:legal-opinion": "١٥–٢٠",
};

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** «١٥–٢٠» → "15–20". */
function latinDigits(label: string): string {
  return label.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/**
 * The noun after a points label: «نقاط» after 3–10 («٨ نقاط», «٥–٨ نقاط»),
 * «نقطة» otherwise («١٥ نقطة», «١٥–٢٠ نقطة»). A range agrees with its upper
 * bound, the number read last.
 */
function pointsNounAr(label: string): string {
  const numbers = latinDigits(label).match(/\d+/g) ?? [];
  const last = Number(numbers[numbers.length - 1]);
  return last >= 3 && last <= 10 ? "نقاط" : "نقطة";
}

export function getLawyerAiBadge(tool: LawyerAiTool, lang: "ar" | "en"): string | null {
  // Checked FIRST, before any price: a tool with no working page is not
  // "100 points", it is not available. See `comingSoon` on LawyerAiTool.
  if (tool.comingSoon) return lang === "ar" ? "قريباً" : "Coming soon";
  if (tool.betaStatus === "beta-free") return lang === "ar" ? "بيتا مجاني" : "Beta free";
  if (tool.betaStatus === "free") return lang === "ar" ? "مجاني" : "Free";
  const label = TOOL_POINT_LABELS[tool.permission];
  if (!label) return null;
  return lang === "ar" ? `${label} ${pointsNounAr(label)}` : `${latinDigits(label)} pts`;
}
