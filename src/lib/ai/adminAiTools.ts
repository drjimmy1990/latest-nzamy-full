/**
 * adminAiTools.ts — N2 (owner F02 §5 #63, register 14; batch l12 P0-1/P0-2):
 * the platform admin sees the whole platform with every AI tool open, the legal
 * drafter first and محترف العقود second, and tools still being built open and
 * untagged (no «قريباً», no price badge).
 *
 * DISPLAY ONLY. Nothing here opens a run: the server's mode switch still
 * decides (aiToolsConfig.toolAvailability), so a tool in mode "off" refuses the
 * admin with 423 before any charge and only a tool switched on for staff (or
 * live) spends AI cost. Owner question ١٥٦ (whether a switched-off tool should
 * really run for him) is open; until it is answered «staff» is the switch.
 *
 * Not opened for him either: the canned golden steps (Q-T1 open, owner ١١٥),
 * GatedToolScreen, and the «قريباً» pages, which have nothing behind them —
 * their card opens the page, which says what it is.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */
import { LAWYER_AI_TOOLS } from "../../constants/lawyerAiCatalog.ts";
import type { SidebarGroup, SidebarItem } from "../../constants/navigation.types.ts";

/** The two tools the owner puts first for the admin, in his order. */
export const ADMIN_AI_FIRST: readonly string[] = ["/ai/draft", "/ai/contracts"];

/**
 * Does the admin display apply? A real admin, not previewing a role's limits
 * («محاكاة القيود», adminSimulation.ts: then he must see what that role sees),
 * and working in the lawyer or the firm workspace (an admin drawn as an
 * individual or a company sees that account's tools). The hook is
 * src/hooks/useAdminToolsView.ts.
 */
export function adminToolsShown(realAdmin: boolean, bypassesUiGates: boolean, drawnView: string | null | undefined): boolean {
  return realAdmin && bypassesUiGates && (drawnView === "lawyer" || drawnView === "firm");
}

/** The admin's order: the drafter, then محترف العقود, then the rest as listed. Stable. */
export function adminAiOrder<T extends { href: string }>(tools: readonly T[]): T[] {
  const rank = (t: T) => {
    const i = ADMIN_AI_FIRST.indexOf(t.href);
    return i < 0 ? ADMIN_AI_FIRST.length : i;
  };
  return tools.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i).map(({ t }) => t);
}

const ICON_BY_HREF: Readonly<Record<string, string>> = {
  "/ai/draft": "PencilSimple",
  "/ai/contracts": "FileText",
  "/ai/consult": "ChatCircle",
  "/ai/quick-answer": "ChatCircle",
  "/ai/brief-check": "MagnifyingGlass",
  "/ai/collector": "Tray",
  "/ai/contract-drafter": "FileText",
  "/ai/wargaming": "Gavel",
  "/ai/analyze-strength": "ChartLine",
  "/ai/analyze": "Scan",
  "/ai/legal-opinion": "Lightbulb",
  "/ai/procedures": "MapTrifold",
  "/ai/fee-calculator": "Calculator",
  "/ai/najiz-optimizer": "Broom",
  "/ai/direction-support": "Compass",
  "/ai/legal-translate": "Translate",
  "/ai/transcriber": "Microphone",
  "/ai/compare": "ArrowsLeftRight",
  "/ai/secretary": "Robot",
  "/ai/monitor": "Bell",
  "/ai/communicate": "Envelope",
  "/ai/assistant": "Robot",
};

/** The admin's own AI group: every catalog tool plus the negotiator, his order, no badge. */
export function adminAiSidebarGroup(): SidebarGroup {
  const rows: SidebarItem[] = LAWYER_AI_TOOLS.map((t) => ({
    label: t.titleAr,
    labelEn: t.titleEn,
    href: t.href,
    icon: ICON_BY_HREF[t.href] ?? "Brain",
  }));
  // «مفاوض العقود» has a page and a registry tool but no catalog row.
  rows.push({ label: "مفاوض العقود", labelEn: "Contract Negotiator", href: "/ai/contract-negotiator", icon: "ArrowsLeftRight" });
  return {
    title: "كل أدوات الذكاء (للإدارة)",
    titleEn: "All AI tools (admin)",
    collapsible: true,
    defaultOpen: true,
    items: adminAiOrder(rows),
  };
}

/**
 * The menu drawn for a real admin (not previewing a role's limits) in the
 * lawyer or the firm workspace: his own AI group goes first after the overview.
 * Any other menu — the console, another account type's dashboard — is returned
 * as it is.
 */
export function withAdminAiGroup(groups: SidebarGroup[], showAdminTools: boolean, drawnType: string | null | undefined): SidebarGroup[] {
  if (!adminToolsShown(showAdminTools, true, drawnType) || groups.length === 0) return groups;
  return [groups[0], adminAiSidebarGroup(), ...groups.slice(1)];
}
