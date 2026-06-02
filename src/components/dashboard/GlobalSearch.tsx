"use client";

/**
 * GlobalSearch — Universal search overlay for all dashboard profiles
 * ──────────────────────────────────────────────────────────────────
 * • Shows a search trigger button in the Sidebar (below nav groups)
 * • Opens a full-overlay modal with:
 *   1. Tools section (matched from current user's sidebar nav)  ← immediate, frontend-only
 *   2. My Content section (cases, documents, etc.)             ← placeholder until backend
 * • Supports Ctrl+K / ⌘+K shortcut as bonus
 * • RTL-aware, dark/light mode aware
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MagnifyingGlass, X, ArrowElbowDownLeft, Robot,
  FolderOpen, Gavel, FileText, Clock, Lightning,
  Sparkle, ArrowUpRight, Database,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { getSidebarByUserType, type SidebarItem } from "@/constants/navigation";
import { useUser } from "@/hooks/useUser";
import { usePathname } from "next/navigation";
import { useClientGroupMembership } from "@/hooks/useClientGroupMembership";

// ─── Infer user type from path (same as SharedSidebar) ────────────────────────
function inferUserTypeFromPath(pathname: string) {
  if (pathname.startsWith("/dashboard/client"))     return "individual" as const;
  if (pathname.startsWith("/dashboard/lawyer"))     return "lawyer" as const;
  if (pathname.startsWith("/dashboard/firm"))       return "firm" as const;
  if (pathname.startsWith("/dashboard/business"))   return "corporate" as const;
  if (pathname.startsWith("/dashboard/micro"))      return "micro" as const;
  if (pathname.startsWith("/dashboard/provider"))   return "provider" as const;
  if (pathname.startsWith("/dashboard/admin"))      return "admin" as const;
  if (pathname.startsWith("/dashboard/government")) return "government" as const;
  if (pathname.startsWith("/dashboard/ngo"))        return "ngo" as const;
  return null;
}

// ─── Mock personal content (placeholder until backend) ────────────────────────
const MOCK_CONTENT = [
  { type: "case",     label: "قضية الشركة المتحدة ضد محمد العمري",  sub: "قضية تجارية • نشطة",   href: "/dashboard/client/cases/1" },
  { type: "doc",      label: "عقد الإيجار — شقة الرياض",             sub: "مستند • آخر تعديل أمس", href: "/dashboard/client/documents/2" },
  { type: "consult",  label: "استشارة قانونية — حقوق العمال",         sub: "استشارة • مكتملة",      href: "/dashboard/client/consultations/3" },
];

// ─── Flatten all sidebar items into a searchable list ─────────────────────────
function extractTools(groups: ReturnType<typeof getSidebarByUserType>, hasClientGroup: boolean): SidebarItem[] {
  const items: SidebarItem[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      if (item.requiresClientGroup && !hasClientGroup) continue;
      if (item.href) items.push(item);
    }
  }
  return items;
}

// ─── Highlight matched text ───────────────────────────────────────────────────
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-emerald-500/20 text-emerald-300 rounded px-0.5 not-italic">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ─── Content type icon ────────────────────────────────────────────────────────
function ContentTypeIcon({ type }: { type: string }) {
  const cls = "flex-shrink-0";
  if (type === "case")    return <Gavel    size={16} weight="duotone" className={`${cls} text-amber-400`}/>;
  if (type === "doc")     return <FileText size={16} weight="duotone" className={`${cls} text-blue-400`}/>;
  if (type === "consult") return <Robot    size={16} weight="duotone" className={`${cls} text-purple-400`}/>;
  return <FolderOpen size={16} weight="duotone" className={`${cls} text-zinc-400`}/>;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function GlobalSearch() {
  const { isDark, lang } = useTheme();
  const { userType: sessionUserType, subRole, active_roles, governmentRole, businessRole, affiliation, isDemoBypass, dashboardMode, country } = useUser();
  const pathname = usePathname() ?? "/";
  const isAr = lang === "ar";
  const router = useRouter();
  const { hasGroup: hasClientGroup } = useClientGroupMembership();

  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve user type
  const pathUserType = inferUserTypeFromPath(pathname);
  const userType = pathUserType ?? sessionUserType;

  // Gather all tools for this user
  const groups = getSidebarByUserType(userType, dashboardMode, subRole, active_roles ?? [], governmentRole, businessRole, affiliation?.role, isDemoBypass, country);
  const allTools = extractTools(groups, hasClientGroup);

  // Filter tools
  const matchedTools = query.trim()
    ? allTools.filter(t =>
        t.label.toLowerCase().includes(query.toLowerCase()) ||
        (t.labelEn ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : allTools.slice(0, 6); // show first 6 as "recent" when no query

  // Filter mock content
  const matchedContent = query.trim()
    ? MOCK_CONTENT.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : [];

  const totalResults = matchedTools.length + matchedContent.length;

  // Reset cursor when results change
  useEffect(() => { setCursor(0); }, [query]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
    }
  }, [open]);

  // Ctrl+K shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(v => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keyboard nav inside overlay
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor(v => Math.min(v + 1, totalResults - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setCursor(v => Math.max(v - 1, 0)); }
    if (e.key === "Enter" && totalResults > 0) {
      const all = [...matchedTools.map(t => t.href!), ...matchedContent.map(c => c.href)];
      if (all[cursor]) { router.push(all[cursor]); setOpen(false); }
    }
  }

  // Styling helpers
  const triggerBase = isDark
    ? "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-zinc-400 hover:text-zinc-200"
    : "bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-700";

  const overlayBg = isDark ? "bg-zinc-950/95" : "bg-white/95";
  const panelBg   = isDark ? "bg-[#111418] border-white/10" : "bg-white border-slate-200";
  const inputBg   = isDark ? "bg-white/5 border-white/10 text-white placeholder:text-zinc-600" : "bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400";
  const sectionLabel = isDark ? "text-zinc-600" : "text-slate-400";
  const resultHover  = isDark ? "hover:bg-white/5" : "hover:bg-slate-50";
  const resultActive = isDark ? "bg-white/8" : "bg-slate-100";

  return (
    <>
      {/* ── Trigger Button (in sidebar) ─────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        className={`mx-3 mb-3 flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all ${triggerBase}`}
        dir="rtl"
      >
        <MagnifyingGlass size={15} weight="bold"/>
        <span className="flex-1 text-right text-[12px] font-medium">
          {isAr ? "ابحث عن أداة..." : "Search tools..."}
        </span>
        <kbd className={`hidden sm:flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded-md ${isDark ? "bg-white/5 text-zinc-600 border border-white/8" : "bg-slate-100 text-slate-400 border border-slate-200"}`}>
          <span>⌘</span><span>K</span>
        </kbd>
      </button>

      {/* ── Overlay ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={`fixed inset-0 z-[200] ${overlayBg} backdrop-blur-sm`}
              onClick={() => setOpen(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -12 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className={`fixed top-[12vh] left-1/2 -translate-x-1/2 z-[201] w-full max-w-[600px] px-4`}
              dir="rtl"
            >
              <div className={`rounded-[1.5rem] border shadow-2xl overflow-hidden ${panelBg}`}>

                {/* Search Input */}
                <div className={`flex items-center gap-3 px-4 py-4 border-b ${isDark ? "border-white/8" : "border-slate-100"}`}>
                  <MagnifyingGlass size={18} className={isDark ? "text-zinc-500" : "text-slate-400"} weight="bold"/>
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isAr ? "ابحث عن أداة، قضية، مستند..." : "Search tools, cases, documents..."}
                    className={`flex-1 bg-transparent text-[14px] font-medium outline-none ${isDark ? "text-white placeholder:text-zinc-600" : "text-slate-800 placeholder:text-slate-400"}`}
                  />
                  {query && (
                    <button onClick={() => setQuery("")} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                      <X size={14} className={isDark ? "text-zinc-500" : "text-slate-400"}/>
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} className={`hidden sm:flex items-center gap-0.5 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${isDark ? "bg-white/5 text-zinc-500 hover:bg-white/10" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}>
                    ESC
                  </button>
                </div>

                {/* Results */}
                <div className="overflow-y-auto max-h-[60vh] py-3">

                  {/* ── Section 1: Tools ────────────────────────────────────── */}
                  {matchedTools.length > 0 && (
                    <div className="mb-2">
                      <div className={`flex items-center gap-2 px-4 py-1.5 mb-1`}>
                        <Lightning size={12} weight="fill" className="text-emerald-500"/>
                        <span className={`text-[11px] font-black uppercase tracking-wider ${sectionLabel}`}>
                          {isAr ? (query ? "الأدوات المطابقة" : "أدوات مقترحة") : (query ? "Matched Tools" : "Suggested Tools")}
                        </span>
                      </div>
                      {matchedTools.map((tool, i) => {
                        const isActive = cursor === i;
                        return (
                          <Link
                            key={tool.href}
                            href={tool.href!}
                            onClick={() => setOpen(false)}
                            className={`flex items-center gap-3 px-4 py-3 transition-colors ${resultHover} ${isActive ? resultActive : ""}`}
                          >
                            <div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner ${isDark ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-emerald-50 border border-emerald-200"}`}>
                              <Robot size={16} weight="duotone" className="text-emerald-400"/>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-[13px] font-bold truncate ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                                <Highlight text={tool.label} query={query}/>
                              </p>
                              {tool.labelEn && (
                                <p className={`text-[10px] truncate ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{tool.labelEn}</p>
                              )}
                            </div>
                            <ArrowUpRight size={14} className={`flex-shrink-0 ${isDark ? "text-zinc-600" : "text-slate-300"}`}/>
                          </Link>
                        );
                      })}
                    </div>
                  )}

                  {/* Divider between tools and content */}
                  {matchedTools.length > 0 && (
                    <div className={`mx-4 my-2 border-t ${isDark ? "border-white/6" : "border-slate-100"}`}/>
                  )}

                  {/* ── Section 2: My Content ─────────────────────────────── */}
                  <div>
                    <div className={`flex items-center gap-2 px-4 py-1.5 mb-1`}>
                      <FolderOpen size={12} weight="fill" className={isDark ? "text-zinc-600" : "text-slate-400"}/>
                      <span className={`text-[11px] font-black uppercase tracking-wider ${sectionLabel}`}>
                        {isAr ? "من محتواك الشخصي" : "Your Content"}
                      </span>
                    </div>

                    {matchedContent.length > 0 ? (
                      matchedContent.map((item, i) => {
                        const globalIdx = matchedTools.length + i;
                        const isActive = cursor === globalIdx;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className={`flex items-center gap-3 px-4 py-3 transition-colors ${resultHover} ${isActive ? resultActive : ""}`}
                          >
                            <div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner ${isDark ? "bg-white/5 border border-white/8" : "bg-slate-50 border border-slate-200"}`}>
                              <ContentTypeIcon type={item.type}/>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-[13px] font-bold truncate ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                                <Highlight text={item.label} query={query}/>
                              </p>
                              <p className={`text-[10px] truncate ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{item.sub}</p>
                            </div>
                            <ArrowUpRight size={14} className={`flex-shrink-0 ${isDark ? "text-zinc-600" : "text-slate-300"}`}/>
                          </Link>
                        );
                      })
                    ) : (
                      /* Placeholder state */
                      <div className={`flex flex-col items-center justify-center py-6 px-4 mx-4 mb-2 rounded-2xl ${isDark ? "bg-white/3 border border-white/5" : "bg-slate-50 border border-slate-100"}`}>
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-3 ${isDark ? "bg-white/5" : "bg-slate-100"}`}>
                          <Database size={18} className={isDark ? "text-zinc-600" : "text-slate-400"} weight="duotone"/>
                        </div>
                        <p className={`text-[12px] font-bold mb-1 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                          {query
                            ? (isAr ? "لا توجد نتائج في محتواك" : "No matching content")
                            : (isAr ? "قضاياك ومستنداتك ستظهر هنا" : "Your cases & docs will appear here")
                          }
                        </p>
                        <p className={`text-[10px] text-center ${isDark ? "text-zinc-700" : "text-slate-400"}`}>
                          {isAr ? "متاح بعد ربط قاعدة البيانات" : "Available after database connection"}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Empty state — no tools found */}
                  {matchedTools.length === 0 && matchedContent.length === 0 && query && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <Sparkle size={32} className={isDark ? "text-zinc-700" : "text-slate-300"} weight="duotone"/>
                      <p className={`text-[13px] font-bold mt-3 mb-1 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                        {isAr ? `لا نتائج لـ "${query}"` : `No results for "${query}"`}
                      </p>
                      <p className={`text-[11px] ${isDark ? "text-zinc-700" : "text-slate-400"}`}>
                        {isAr ? "جرّب كلمة مختلفة" : "Try a different keyword"}
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer hint */}
                <div className={`flex items-center justify-between px-4 py-2.5 border-t text-[10px] ${isDark ? "border-white/6 text-zinc-700" : "border-slate-100 text-slate-400"}`}>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><ArrowElbowDownLeft size={10}/> للانتقال</span>
                    <span>↑↓ للتنقل</span>
                  </div>
                  <span className="flex items-center gap-1"><Clock size={10}/> {isAr ? "نتائج آنية" : "Instant results"}</span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
