/**
 * lawyerQuickTools.ts — the registry behind «أدوات نظامي — وصول سريع» on the
 * lawyer dashboard (owner item T28-30): which tools a lawyer may pin there,
 * which four are pinned by default, and the 3..8 rule for a saved choice.
 * ─────────────────────────────────────────────────────────
 * The choice itself is stored in `user_settings.preferences.quickTools`
 * (PATCH /api/v1/settings/preferences, validated in preferencesMerge.ts —
 * which imports THIS module, so the allow-list of ids exists once). Never in
 * localStorage: it is a user setting, not a browser convenience.
 *
 * Only real pages are listed. Every `href` below was checked to have a
 * `src/app<href>/page.tsx` that does not render DashboardComingSoon, and
 * lawyerQuickTools.test.ts re-checks that on every run, so a tool that is
 * turned into «قريباً» later fails the suite instead of sitting on the
 * dashboard as a live-looking tile. Deliberately absent:
 *   • /ai/direction-support — renders DashboardComingSoon (UAT-LIVE-AI-001);
 *   • /ai/secretary         — built on literals (see the note on the removed
 *                             «AI Secretary Notice» in dashboard/lawyer/page.tsx);
 *   • /ai/research          — only a redirect to /ai/legal-opinion.
 *
 * `icon` is a string key, not a Phosphor component: this module is imported
 * by the preferences validator and by `node --test`, neither of which should
 * load React. The dashboard maps the key to a component.
 *
 * No `@/` imports and no runtime imports at all — keep it that way.
 */

export type QuickToolGroup = "operational" | "ai";

export type QuickToolIcon =
  | "Gavel" | "CalendarCheck" | "Timer" | "Folder" | "Money" | "ChatDots"
  | "AddressBook" | "CheckSquare" | "FileText"
  | "PencilSimple" | "FileMagnifyingGlass" | "MagnifyingGlass" | "Tray"
  | "Lightbulb" | "Sword" | "Handshake" | "Calculator";

export interface QuickTool {
  id: string;
  label: string;
  /** one short line under the label on the tile */
  desc: string;
  href: string;
  group: QuickToolGroup;
  icon: QuickToolIcon;
}

export const QUICK_TOOLS_MIN = 3;
export const QUICK_TOOLS_MAX = 8;

export const QUICK_TOOL_GROUP_LABELS: Record<QuickToolGroup, string> = {
  operational: "أدوات المكتب",
  ai: "أدوات الذكاء الاصطناعي",
};

export const LAWYER_QUICK_TOOLS: readonly QuickTool[] = [
  // ── أدوات المكتب ─────────────────────────────────────────────────────────
  { id: "cases",         label: "القضايا",            desc: "ملف القضايا",              href: "/dashboard/lawyer/cases",         group: "operational", icon: "Gavel" },
  { id: "hearings",      label: "المواعيد والجلسات",  desc: "جدول الجلسات",             href: "/dashboard/lawyer/hearings",      group: "operational", icon: "CalendarCheck" },
  { id: "deadlines",     label: "رادار المهل",        desc: "المهل النظامية",           href: "/dashboard/lawyer/deadlines",     group: "operational", icon: "Timer" },
  { id: "documents",     label: "المستندات",          desc: "مستندات المكتب",           href: "/dashboard/lawyer/documents",     group: "operational", icon: "Folder" },
  { id: "finance",       label: "الإيرادات والفواتير", desc: "الفواتير والمدفوعات",      href: "/dashboard/lawyer/finance",       group: "operational", icon: "Money" },
  { id: "consultations", label: "الاستشارات",         desc: "طلبات الاستشارة",          href: "/dashboard/lawyer/consultations", group: "operational", icon: "ChatDots" },
  { id: "clients",       label: "دليل العملاء",       desc: "ملفات الموكلين",           href: "/dashboard/lawyer/clients",       group: "operational", icon: "AddressBook" },
  { id: "tasks",         label: "مهامي",              desc: "المهام والمتابعة",         href: "/dashboard/lawyer/tasks",         group: "operational", icon: "CheckSquare" },
  { id: "contracts",     label: "مدير العقود",        desc: "عقود الموكلين",            href: "/dashboard/lawyer/contracts",     group: "operational", icon: "FileText" },
  // ── أدوات الذكاء الاصطناعي ───────────────────────────────────────────────
  { id: "draft",         label: "الصائغ القانوني",    desc: "مذكرات ولوائح",            href: "/ai/draft",                       group: "ai",          icon: "PencilSimple" },
  { id: "brief-check",   label: "مراجعة المذكرات",    desc: "يراجعها فريق نظامي",       href: "/ai/brief-check",                 group: "ai",          icon: "FileMagnifyingGlass" },
  { id: "analyze",       label: "عصارة المرفقات",     desc: "تحليل المستندات",          href: "/ai/analyze",                     group: "ai",          icon: "MagnifyingGlass" },
  { id: "collector",     label: "المجمّع البحثي",      desc: "جمع المواد البحثية",       href: "/ai/collector",                   group: "ai",          icon: "Tray" },
  { id: "legal-opinion", label: "الرأي الفصل",        desc: "رأي قانوني مسبَّب",         href: "/ai/legal-opinion",               group: "ai",          icon: "Lightbulb" },
  { id: "wargaming",     label: "المحاكي الشامل",     desc: "محاكاة المرافعة",          href: "/ai/wargaming",                   group: "ai",          icon: "Sword" },
  { id: "contracts-ai",  label: "محترف العقود",       desc: "صياغة العقود ومراجعتها",   href: "/ai/contracts",                   group: "ai",          icon: "Handshake" },
  { id: "calculator",    label: "الحاسبة القانونية",  desc: "رسوم وأتعاب وحقوق",        href: "/ai/fee-calculator",              group: "ai",          icon: "Calculator" },
];

const TOOL_BY_ID = new Map(LAWYER_QUICK_TOOLS.map((tool) => [tool.id, tool]));

/**
 * The owner's default (T28-30): القضايا، الصائغ، مراجعة المذكرات، الحاسبة.
 * All four exist today; if one is ever removed from the registry the
 * fallback in `defaultQuickToolIds` fills the set back up to four.
 */
const OWNER_DEFAULT_IDS = ["cases", "draft", "brief-check", "calculator"] as const;
/** Next-best existing tools, in order, used only to top the default up to four. */
const DEFAULT_FILL_ORDER = ["hearings", "deadlines", "legal-opinion", "documents"] as const;

function defaultQuickToolIds(): string[] {
  const ids: string[] = OWNER_DEFAULT_IDS.filter((id) => TOOL_BY_ID.has(id));
  for (const id of DEFAULT_FILL_ORDER) {
    if (ids.length >= 4) break;
    if (TOOL_BY_ID.has(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export const DEFAULT_QUICK_TOOLS: readonly string[] = Object.freeze(defaultQuickToolIds());

export function isKnownQuickToolId(id: unknown): id is string {
  return typeof id === "string" && TOOL_BY_ID.has(id);
}

/**
 * Validates a saved/submitted choice: an array of 3..8 unique ids, every one
 * of them in the registry. Returns the ids (order kept) or an Arabic error.
 */
export function validateQuickToolIds(value: unknown): string[] | { error: string } {
  if (!Array.isArray(value)) return { error: "قائمة الأدوات السريعة يجب أن تكون قائمة." };
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || !TOOL_BY_ID.has(id)) {
      return { error: `أداة غير معروفة في الوصول السريع: ${String(id)}` };
    }
    if (seen.has(id)) return { error: `الأداة «${TOOL_BY_ID.get(id)!.label}» مكررة في الوصول السريع.` };
    seen.add(id);
  }
  if (seen.size < QUICK_TOOLS_MIN || seen.size > QUICK_TOOLS_MAX) {
    return { error: `اختر من ${QUICK_TOOLS_MIN} إلى ${QUICK_TOOLS_MAX} أدوات للوصول السريع.` };
  }
  return [...seen];
}

/**
 * The ids to show for a stored value. Unknown ids (a tool removed from the
 * registry since the choice was saved) and duplicates are dropped; if fewer
 * than three survive — or nothing valid was stored — the defaults are used.
 * The result is always something `validateQuickToolIds` accepts, so the
 * customizer can be seeded with it and saved unchanged.
 */
export function resolveQuickToolIds(stored: unknown): string[] {
  if (!Array.isArray(stored)) return [...DEFAULT_QUICK_TOOLS];
  const ids: string[] = [];
  for (const id of stored) {
    if (isKnownQuickToolId(id) && !ids.includes(id)) ids.push(id);
  }
  if (ids.length < QUICK_TOOLS_MIN) return [...DEFAULT_QUICK_TOOLS];
  return ids.slice(0, QUICK_TOOLS_MAX);
}

/** Registry entries for a list of ids, in the given order; unknown ids skipped. */
export function quickToolsFor(ids: readonly string[]): QuickTool[] {
  return ids.map((id) => TOOL_BY_ID.get(id)).filter((tool): tool is QuickTool => tool !== undefined);
}
