/**
 * Beta Configuration — Single Source of Truth
 * ─────────────────────────────────────────────
 * This file controls ALL beta-phase behavior across the platform.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * BETA LAUNCH SCOPE (Decision: 2026-05-17)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * ✅ ACTIVE & PUBLIC (navigation/service flow stays open):
 *   • Individual Client (عميل فرد)  → Full experience; only legal-data AI outputs are gated
 *   • Corporate (شركة تجارية)       → Active; dashboards stay open, legal-data AI outputs gated
 *
 * 🔒 ACTIVE + GATED (AI review overlay ON):
 *   • Lawyer (محامي فرد + مكتب محاماة) → BetaReviewGate wraps AI outputs only
 *     Reason: output quality assurance before delivery to real clients
 *
 * ⚪ BUILT BUT NOT PROMOTED (exists in code, 100% complete, will launch later):
 *   • Micro Business (منشأة صغيرة)
 *   • NGO (جمعية خيرية)
 *   • Government (جهة حكومية)
 *   • Notary / Bailiff / Arbitrator (مقدمو خدمات)
 *   These will launch with FULL versions (no beta gates) in a future release.
 *   They are NOT mentioned or promoted on the website during this phase.
 *   During beta, any output grounded in legal data/RAG/statutory sources is temporarily gated.
 *
 * HOW TO EXIT BETA:
 *   • Set BETA_REVIEW_MODE = false  → removes AI review overlay from lawyer pages
 *   • Set BETA_MONOPOLY_MODE = false → restores full multi-vendor marketplace
 *   • Delete this file entirely → everything defaults to OFF, zero side effects
 *
 * This file is designed to be SAFELY DELETABLE.
 */

// ── Gate 1: AI Review Overlay ─────────────────────────────────────────────────
// Applies to: Lawyer / Firm dashboards ONLY
// true  → AI outputs on lawyer pages show "submitted for review" card
// false → Raw AI output shown immediately to lawyers
// Individual client and corporate are NOT affected by this gate.
export const BETA_REVIEW_MODE = true;

// ── Gate 2: Single-Firm Monopoly ──────────────────────────────────────────────
// true  → Platform hides marketplace, multi-vendor features
//         Only Nzamy firm visible as service provider (no external lawyers listed)
// false → Full multi-vendor marketplace restored
export const BETA_MONOPOLY_MODE = true;

// ── Who is GATED (BetaReviewGate wraps their AI output pages) ─────────────────
// Only add user types whose AI outputs need human review before delivery.
// Individual client is intentionally NOT in this list — they get full experience.
export const BETA_GATED_ROLES: string[] = [
  "lawyer",   // محامي فرد — AI drafting outputs gated
  "firm",     // مكتب محاماة — AI drafting outputs gated
];

// ── Demo Bypass Accounts ──────────────────────────────────────────────────────
// These demo session keys bypass BOTH Gate 1 and Gate 2 above.
// They see: raw AI output + full marketplace + all multi-vendor UI
// Purpose: internal testing + investor/partner demos
// NOTE: demo-login is internal only — not linked from the public site.
export const DEMO_BYPASS_KEYS: string[] = [
  // ─ Gated (bypass the gate for internal testing)
  "admin",               // مدير النظام — full access always
  "lawyer_bypass",       // محامي فرد — مفتوح
  "lawyer_notary",       // محامي + موثق
  "lawyer_reviewer",     // محامي + معقب/مراجع
  "lawyer_arbitrator",   // محامي + محكم
  "lawyer_all",          // محامي شامل
  "firm",                // مكتب محاماة
  // ─ Already ungated but included for completeness
  "corporate",           // مدير شركة
  // ─ Built & complete — will launch fully later (not promoted now)
  "notary",              // موثّق رسمي
  "gov_reviewer",        // معقّب / مراجع حكومي
  "standalone_arbitrator", // محكّم مستقل
  "individual_premium",  // عميل فرد PRO
  "micro_smart",         // منشأة ذكية
  "ngo",                 // جمعية خيرية
  "government_judge",    // قاضي
];

export type BetaReviewToolRisk = "legal-data" | "rag" | "statutory-source";

export interface LegalDataReviewGatedTool {
  id: string;
  route: string;
  label: string;
  risk: BetaReviewToolRisk;
  teardown: string;
}

export const LEGAL_DATA_REVIEW_GATED_TOOLS: LegalDataReviewGatedTool[] = [
  { id: "draft.defenses", route: "/ai/draft", label: "Legal defenses extraction", risk: "legal-data", teardown: "Remove the BetaReviewGate wrapper from StepDefenses after legal RAG QA is live." },
  { id: "draft.laws", route: "/ai/draft", label: "Statutory texts and precedents suggestion", risk: "rag", teardown: "Remove the BetaReviewGate wrapper from StepLaws after source-grounded retrieval is verified." },
  { id: "draft.final", route: "/ai/draft", label: "Final legal drafting", risk: "legal-data", teardown: "Remove the BetaReviewGate wrapper from StepDrafting after lawyer QA handoff is replaced by live review policy." },
  { id: "draft.review", route: "/ai/draft", label: "Memo quality review and litigation simulation", risk: "legal-data", teardown: "Remove the BetaReviewGate wrapper from StepReview after live QA policy is approved." },
  { id: "legal-opinion.result", route: "/ai/legal-opinion", label: "Legal opinion with laws and precedents", risk: "rag", teardown: "Remove the ResultView BetaReviewGate wrapper after legal-opinion RAG citations are production-verified." },
  { id: "contract-drafter.result", route: "/ai/contract-drafter", label: "Contract draft and quick legal review", risk: "legal-data", teardown: "Remove the StepContractResult BetaReviewGate wrapper after contract source policy is live." },
  { id: "contract-reviewer.result", route: "/ai/contract-reviewer", label: "Contract legal risk report", risk: "legal-data", teardown: "Remove the contract reviewer BetaReviewGate wrapper after live review/RAG validation." },
  { id: "gov.judgment-drafter", route: "/ai/gov/judgment-drafter", label: "Government judgment draft", risk: "statutory-source", teardown: "Remove the result wrapper after government legal-source review is live." },
  { id: "gov.jurisdiction-analyzer", route: "/ai/gov/jurisdiction-analyzer", label: "Jurisdiction analysis", risk: "statutory-source", teardown: "Remove the result wrapper after jurisdiction source validation is live." },
  { id: "gov.legal-opinion-drafter", route: "/ai/gov/legal-opinion-drafter", label: "Government legal opinion", risk: "statutory-source", teardown: "Remove the result wrapper after government opinion RAG validation is live." },
  { id: "gov.procurement-reviewer", route: "/ai/gov/procurement-reviewer", label: "Government procurement review", risk: "statutory-source", teardown: "Remove the result wrapper after procurement source validation is live." },
  { id: "gov.procedure-guide", route: "/ai/gov/procedure-guide", label: "Government/security procedure guide", risk: "statutory-source", teardown: "Remove the result wrapper after procedure-source validation is live." },
  { id: "gov.rights-reminder", route: "/ai/gov/rights-reminder", label: "Rights and guarantees checklist", risk: "statutory-source", teardown: "Remove the result wrapper after guarantees source validation is live." },
  { id: "gov.contract-reviewer", route: "/ai/gov/contract-reviewer", label: "Government contract review", risk: "statutory-source", teardown: "Remove the result wrapper after government contract review sources are live." },
  { id: "gov.evidence-analyzer", route: "/ai/gov/evidence-analyzer", label: "Government evidence analysis", risk: "statutory-source", teardown: "Remove the result wrapper after evidence-source validation is live." },
  { id: "gov.guarantees-checker", route: "/ai/gov/guarantees-checker", label: "Procedural guarantees checker", risk: "statutory-source", teardown: "Remove the result wrapper after procedural guarantees validation is live." },
  { id: "gov.judgment-weigher", route: "/ai/gov/judgment-weigher", label: "Judgment/evidence weighing", risk: "statutory-source", teardown: "Remove the result wrapper after judicial weighting QA is live." },
  { id: "gov.judicial-search", route: "/ai/gov/judicial-search", label: "Judicial principles search", risk: "rag", teardown: "Remove the result wrapper after judicial precedent search is production-backed." },
  { id: "gov.arrest-forms", route: "/ai/gov/arrest-forms", label: "Arrest and search forms", risk: "statutory-source", teardown: "Remove the result wrapper after official form-source validation is live." },
  { id: "gov.detention-records", route: "/ai/gov/detention-records", label: "Detention record drafting", risk: "statutory-source", teardown: "Remove the result wrapper after detention procedure validation is live." },
  { id: "gov.indictment-drafter", route: "/ai/gov/indictment-drafter", label: "Indictment drafting", risk: "statutory-source", teardown: "Remove the result wrapper after prosecution drafting QA is live." },
  { id: "gov.verdict-drafter", route: "/ai/gov/verdict-drafter", label: "Verdict drafting", risk: "statutory-source", teardown: "Remove the result wrapper after judicial drafting QA is live." },
  { id: "gov.investigation-forms", route: "/ai/gov/investigation-forms", label: "Investigation forms", risk: "statutory-source", teardown: "Remove the result wrapper after investigation form validation is live." },
  { id: "gov.incident-report", route: "/ai/gov/incident-report", label: "Official incident report", risk: "statutory-source", teardown: "Remove the result wrapper after incident report procedure validation is live." },
  { id: "gov.compliance-checker", route: "/ai/gov/compliance-checker", label: "Government compliance checker", risk: "statutory-source", teardown: "Remove the result wrapper after government compliance rules are backend-backed." },
  { id: "gov.deadline-calculator", route: "/ai/gov/deadline-calculator", label: "Procedural deadline calculator", risk: "statutory-source", teardown: "Remove the result wrapper after deadline rules are production-verified." },
  { id: "corp.compliance-monitor", route: "/ai/corp/compliance-monitor", label: "Corporate compliance monitor", risk: "statutory-source", teardown: "Remove the result wrapper after compliance rules are backend-backed." },
  { id: "corp.compliance", route: "/ai/corp/compliance", label: "Corporate compliance details", risk: "statutory-source", teardown: "Remove the result wrapper after corporate compliance source rules are live." },
  { id: "corp.advisor", route: "/ai/corp/advisor", label: "Corporate legal advisor", risk: "rag", teardown: "Remove the result wrapper after corporate advisor citations are production-verified." },
  { id: "corp.hr", route: "/ai/corp/hr", label: "Corporate labor advisor", risk: "statutory-source", teardown: "Remove the result wrapper after labor-law source validation is live." },
  { id: "corp.contracts", route: "/ai/corp/contracts", label: "Corporate contract drafting", risk: "legal-data", teardown: "Remove the result wrapper after corporate contract review policy is live." },
  { id: "corp.risk-assessment", route: "/ai/corp/risk-assessment", label: "Corporate legal risk assessment", risk: "legal-data", teardown: "Remove the result wrapper after legal-risk source validation is live." },
  { id: "corp.deal-intel", route: "/ai/corp/deal-intel", label: "Deal intelligence legal report", risk: "rag", teardown: "Remove the result wrapper after deal-intel legal and regulatory sources are production-backed." },
  { id: "corp.corpmind", route: "/ai/corp/corpmind", label: "CorpMind contract analysis", risk: "legal-data", teardown: "Remove the result wrapper after CorpMind contract-analysis QA is live." },
  { id: "ngo.volunteer-contract", route: "/ai/ngo/volunteer-contract", label: "NGO volunteer contract", risk: "legal-data", teardown: "Remove the result wrapper after NGO contract policy is live." },
  { id: "ngo.donation-analyzer", route: "/ai/ngo/donation-analyzer", label: "NGO donation compliance analysis", risk: "statutory-source", teardown: "Remove the result wrapper after donation compliance data is backend-backed." },
  { id: "ngo.report-generator", route: "/ai/ngo/report-generator", label: "NGO statutory report generator", risk: "legal-data", teardown: "Remove the result wrapper after NGO reporting source validation is live." },
  { id: "micro.result", route: "/ai/micro", label: "Micro-business legal document generator", risk: "legal-data", teardown: "Remove the result wrapper after micro legal templates are backend-backed." },
  { id: "analyze.smart.result", route: "/ai/analyze", label: "Smart legal position analysis", risk: "legal-data", teardown: "Remove the result wrapper after client analysis QA is live." },
  { id: "case-brief.result", route: "/ai/case-brief", label: "Case brief/paralegal output", risk: "rag", teardown: "Remove the result wrapper after case-brief RAG validation is live." },
  { id: "brief-check.result", route: "/ai/brief-check", label: "Brief source and precedent checker", risk: "rag", teardown: "Remove the result wrapper after precedent checking is production-verified." },
  { id: "quick-answer.result", route: "/ai/quick-answer", label: "Quick legal answer", risk: "rag", teardown: "Remove the result wrapper after sourced legal Q&A is production-verified." },
  { id: "consult.result", route: "/ai/consult", label: "AI legal consultation answer", risk: "rag", teardown: "Remove the message-level wrapper after legal consult citations are production-verified." },
  { id: "procedures.smart-answer", route: "/ai/procedures", label: "Smart court procedure answer", risk: "rag", teardown: "Remove the result wrapper after procedure answer sources are production-verified." },
  { id: "procedures.manual-guide", route: "/ai/procedures", label: "Court procedure guide", risk: "statutory-source", teardown: "Remove the result wrapper after procedure guide rules are production-backed." },
  { id: "wargaming.result", route: "/ai/wargaming", label: "Litigation simulation and memo improvement", risk: "legal-data", teardown: "Remove the result wrapper after simulation QA is live." },
  { id: "transcriber.legal-result", route: "/ai/transcriber", label: "Legal facts extraction from transcript", risk: "legal-data", teardown: "Remove the result wrapper after legal extraction QA is live." },
  { id: "contract-negotiator.result", route: "/ai/contract-negotiator", label: "Contract negotiation strategy", risk: "legal-data", teardown: "Remove the result wrapper after negotiation strategy QA is live." },
];

export const LEGAL_DATA_REVIEW_GATED_TOOL_IDS = LEGAL_DATA_REVIEW_GATED_TOOLS.map((tool) => tool.id);

export function isLegalDataReviewGatedTool(toolId?: string): boolean {
  return Boolean(toolId && LEGAL_DATA_REVIEW_GATED_TOOL_IDS.includes(toolId));
}

// ── Estimated delivery time shown to the user ─────────────────────────────────
export const BETA_REVIEW_HOURS = "4-24";

// ── Contact channel for beta inquiries ────────────────────────────────────────
export const BETA_WHATSAPP_NUMBER = "966XXXXXXXXX"; // Update with real number
