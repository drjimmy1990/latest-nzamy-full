"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, MagnifyingGlass, Sparkle, ArrowLeft,
  FileText, Seal, ChatCircleText, FileMagnifyingGlass,
  BookmarksSimple, Scales, ShieldCheck, Buildings,
  Users, Brain, Star, Clock, Download, ArrowUpRight,
  FunnelSimple, X, Crown,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

// ─── Types & Imports ─────────────────────────────────────────────────────────
import { TemplateCategory, Complexity, LegalArea, Template, TEMPLATES, CAT_CONFIG, COMPLEXITY_CONFIG, AREA_LABELS, GroupKey, GROUPS } from './_data';
// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const { isDark } = useTheme();

  const [search,      setSearch]      = useState("");
  const [groupFilter, setGroupFilter] = useState<GroupKey>("all");
  const [catFilter,   setCatFilter]   = useState<TemplateCategory | "all">("all");
  const [areaFilter,  setAreaFilter]  = useState<LegalArea | "all">("all");
  const [premFilter,  setPremFilter]  = useState<"all" | "free" | "premium">("all");
  const [selected,    setSelected]    = useState<Template | null>(null);

  // When group changes, reset cat/area filters
  const handleGroupChange = (g: GroupKey) => {
    setGroupFilter(g);
    setCatFilter("all");
    setAreaFilter("all");
  };

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  // Sub-cats for active group
  const activeCats = useMemo(() => {
    const g = GROUPS.find(g => g.key === groupFilter);
    if (!g || g.key === "all") return [];
    return g.cats.filter((c): c is TemplateCategory => c !== "all");
  }, [groupFilter]);

  const filtered = useMemo(() => TEMPLATES.filter(t => {
    // Group filter — templates must belong to the group's cats
    if (groupFilter !== "all") {
      const g = GROUPS.find(g => g.key === groupFilter);
      if (g && !g.cats.includes(t.category)) return false;
    }
    if (catFilter !== "all"  && t.category !== catFilter) return false;
    if (areaFilter !== "all" && t.legalArea !== areaFilter) return false;
    if (premFilter === "free"    && t.isPremium) return false;
    if (premFilter === "premium" && !t.isPremium) return false;
    if (search && !t.title.includes(search) && !t.desc.includes(search)) return false;
    return true;
  }), [groupFilter, catFilter, areaFilter, premFilter, search]);

  return (
    <div className="max-w-[1200px] mx-auto space-y-5" dir="rtl">

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}
                style={{ fontFamily: "var(--font-brand)" }}>
              مكتبة القوالب القانونية
            </h1>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#C8A762]/15 text-[#C8A762] border border-[#C8A762]/30">
              مُرجَّعة قانونياً
            </span>
          </div>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {TEMPLATES.length} قالب · مبنية على الأنظمة السعودية · AI-powered
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/ai/contracts"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
            <Sparkle size={15} weight="fill" /> محترف العقود
          </Link>
        </div>
      </motion.div>

      {/* ── Search Bar ── */}
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
        <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في القوالب..."
          className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
        {search && <button onClick={() => setSearch("")} className={isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"}><X size={13} /></button>}
      </div>

      {/* ── Level 1: Main Groups (always visible) ── */}
      <div className={`flex gap-1 p-1 rounded-2xl overflow-x-auto ${isDark ? "bg-zinc-800/60" : "bg-slate-100"}`}>
        {GROUPS.map(g => {
          const isActive = groupFilter === g.key;
          const count = g.key === "all"
            ? TEMPLATES.length
            : TEMPLATES.filter(t => g.cats.includes(t.category)).length;
          return (
            <motion.button key={g.key} onClick={() => handleGroupChange(g.key)} layout
              className={`relative flex-shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold transition-colors ${
                isActive
                  ? isDark ? "text-white" : "text-[#0B3D2E]"
                  : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
              }`}>
              {isActive && (
                <motion.span layoutId="group-pill"
                  className={`absolute inset-0 rounded-xl ${isDark ? "bg-zinc-700" : "bg-white shadow-sm"}`}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }} />
              )}
              <span className="relative flex items-center gap-1.5">
                {g.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  isActive
                    ? isDark ? "bg-white/10" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
                    : isDark ? "bg-white/[0.05] text-zinc-600" : "bg-slate-200 text-slate-400"
                }`}>{count}</span>
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* ── Level 2: Sub-category chips (appear when group is selected) ── */}
      <AnimatePresence>
        {activeCats.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden">
            <div className="space-y-3">
              {/* Sub-type chips */}
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setCatFilter("all")}
                  className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                    catFilter === "all" ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.07] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-500 hover:border-royal/30"
                  }`}>الكل</button>
                {activeCats.map(cat => {
                  const cfg = CAT_CONFIG[cat];
                  return (
                    <button key={cat} onClick={() => setCatFilter(cat)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                        catFilter === cat
                          ? `${cfg.bg} ${cfg.color} border-current`
                          : isDark ? "border-white/[0.07] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-500 hover:border-royal/30"
                      }`}>
                      {cfg.emoji} {cfg.label}
                    </button>
                  );
                })}
              </div>

              {/* Legal area + premium quick toggles */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? "text-zinc-700" : "text-slate-300"}`}>المجال:</span>
                {(Object.entries(AREA_LABELS) as [LegalArea, string][]).map(([key, label]) => {
                  const inGroup = TEMPLATES.some(t => {
                    const g = GROUPS.find(g => g.key === groupFilter);
                    return t.legalArea === key && (g ? g.cats.includes(t.category) : true);
                  });
                  if (!inGroup) return null;
                  return (
                    <button key={key} onClick={() => setAreaFilter(areaFilter === key ? "all" : key)}
                      className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all ${
                        areaFilter === key ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-600 hover:text-zinc-400" : "border-slate-200 text-slate-400 hover:border-slate-300"
                      }`}>{label}</button>
                  );
                })}
                <span className={`w-px h-4 mx-1 ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
                <button onClick={() => setPremFilter(p => p === "free" ? "all" : "free")}
                  className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all ${
                    premFilter === "free" ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" : isDark ? "border-white/[0.06] text-zinc-600" : "border-slate-200 text-slate-400"
                  }`}>مجاني</button>
                <button onClick={() => setPremFilter(p => p === "premium" ? "all" : "premium")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all ${
                    premFilter === "premium" ? "bg-[#C8A762]/15 text-[#C8A762] border-[#C8A762]/30" : isDark ? "border-white/[0.06] text-zinc-600" : "border-slate-200 text-slate-400"
                  }`}><Crown size={9} />PRO</button>
                {(catFilter !== "all" || areaFilter !== "all" || premFilter !== "all") && (
                  <button onClick={() => { setCatFilter("all"); setAreaFilter("all"); setPremFilter("all"); }}
                    className={`text-[10px] font-semibold underline ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"}`}>مسح</button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Results count ── */}
      <p className={`text-[12px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
        {filtered.length} قالب
        {search && <> لـ &quot;<span className={isDark ? "text-zinc-300" : "text-slate-600"}>{search}</span>&quot;</>}
      </p>

      {/* ── Template Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((tmpl, i) => {
          const catCfg = CAT_CONFIG[tmpl.category];
          const CatIcon = catCfg.icon;
          const cplx = COMPLEXITY_CONFIG[tmpl.complexity];

          return (
            <motion.div key={tmpl.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              onClick={() => setSelected(tmpl)}
              className={`${card} p-4 cursor-pointer hover:border-royal/30 hover:scale-[1.02] transition-all group relative`}
            >
              {/* Badges row */}
              <div className="flex items-center gap-1.5 mb-3">
                <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${catCfg.bg} ${catCfg.color}`}>
                  <CatIcon size={10} weight="duotone" /> {catCfg.label}
                </span>
                {tmpl.isNew && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">جديد</span>}
                {tmpl.isPremium && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#C8A762]/15 text-[#C8A762] border border-[#C8A762]/30 flex items-center gap-0.5"><Crown size={8} />PRO</span>}
              </div>

              {/* Title + desc */}
              <h3 className={`text-[14px] font-bold mb-1 leading-snug ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{tmpl.title}</h3>
              <p className={`text-[11px] mb-3 leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{tmpl.desc}</p>

              {/* Legal refs */}
              {tmpl.legalRef && tmpl.legalRef.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {tmpl.legalRef.slice(0, 2).map(ref => (
                    <span key={ref} className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>{ref}</span>
                  ))}
                  {tmpl.legalRef.length > 2 && <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>+{tmpl.legalRef.length - 2}</span>}
                </div>
              )}

              {/* Footer meta */}
              <div className={`flex items-center justify-between pt-3 border-t ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold ${cplx.color}`}>{cplx.label}</span>
                  <span className={`text-[9px] ${isDark ? "text-zinc-700" : "text-slate-300"}`}>·</span>
                  <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{tmpl.pages}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Star size={9} className="text-amber-400" weight="fill" />
                  <span className={`text-[10px] font-mono ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{tmpl.uses.toLocaleString()}</span>
                </div>
              </div>

              {/* Hover overlay CTA */}
              <div className={`absolute inset-0 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? "bg-zinc-900/80" : "bg-white/90"} backdrop-blur-[2px]`}>
                <span className="flex items-center gap-2 text-[13px] font-bold text-royal">
                  <BookmarksSimple size={16} weight="duotone" /> استخدام القالب
                </span>
              </div>
            </motion.div>
          );
        })}

        {filtered.length === 0 && (
          <div className={`col-span-3 ${card} p-12 text-center`}>
            <BookOpen size={36} weight="duotone" className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
            <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد قوالب مطابقة</p>
          </div>
        )}
      </div>

      {/* ── Template Detail Drawer ── */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setSelected(null)} />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className={`fixed inset-y-0 right-0 w-full max-w-[480px] z-50 flex flex-col ${isDark ? "bg-zinc-900 border-l border-white/[0.07]" : "bg-white border-l border-slate-200 shadow-2xl"}`}
              dir="rtl"
            >
              {/* Drawer header */}
              <div className={`flex items-center justify-between p-5 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                <div className="flex items-center gap-2">
                  {(() => { const cfg = CAT_CONFIG[selected.category]; const Icon = cfg.icon; return <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${cfg.bg}`}><Icon size={16} weight="duotone" className={cfg.color} /></span>; })()}
                  <div>
                    <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{selected.title}</p>
                    <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{CAT_CONFIG[selected.category].label} · {AREA_LABELS[selected.legalArea]}</p>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? "hover:bg-white/[0.06]" : "hover:bg-slate-100"}`}>
                  <X size={15} />
                </button>
              </div>

              {/* Drawer body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">

                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${COMPLEXITY_CONFIG[selected.complexity].color} ${isDark ? "border-white/[0.08] bg-white/[0.04]" : "border-slate-200 bg-slate-50"}`}>
                    {COMPLEXITY_CONFIG[selected.complexity].label}
                  </span>
                  <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.04] border-white/[0.08] text-zinc-400" : "bg-slate-50 border-slate-200 text-slate-500"} border`}>
                    <Clock size={10} /> {selected.pages}
                  </span>
                  <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.04] border-white/[0.08] text-zinc-400" : "bg-slate-50 border-slate-200 text-slate-500"} border`}>
                    <Star size={10} className="text-amber-400" weight="fill" /> {selected.uses.toLocaleString()} استخدام
                  </span>
                  {selected.isAi && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500 border border-purple-500/20">
                      <Sparkle size={10} /> AI مُحسَّن
                    </span>
                  )}
                </div>

                {/* Long description */}
                <div>
                  <p className={`text-[11px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>وصف القالب</p>
                  <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{selected.longDesc}</p>
                </div>

                {/* Legal refs */}
                {selected.legalRef && selected.legalRef.length > 0 && (
                  <div>
                    <p className={`text-[11px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>المراجع القانونية</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.legalRef.map(ref => (
                        <span key={ref} className={`text-[11px] px-2.5 py-1 rounded-lg font-medium ${isDark ? "bg-royal/10 text-royal border border-royal/20" : "bg-royal/8 text-royal border border-royal/15"}`}>
                          {ref}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fields count */}
                <div className={`rounded-2xl border p-4 ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <p className={`text-2xl font-bold font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{selected.fields}</p>
                      <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>حقل قابل للتعديل</p>
                    </div>
                    <div>
                      <p className={`text-2xl font-bold font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{selected.pages.replace(/[^٠-٩0-9]/g, "").slice(0, 2) || "٢"}</p>
                      <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>صفحات (تقريبياً)</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Drawer footer CTA */}
              <div className={`p-5 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"} space-y-2`}>
                {selected.redirectTo ? (
                  <Link href={selected.redirectTo}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#0B3D2E] text-[#C8A762] font-bold text-[14px] hover:bg-[#0a3328] transition-colors">
                    <Sparkle size={16} weight="fill" />
                    {selected.category === "contract" ? "ابدأ الصياغة بالذكاء الاصطناعي" : "استخدام هذا القالب"}
                    <ArrowLeft size={14} />
                  </Link>
                ) : (
                  <button className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#0B3D2E] text-[#C8A762] font-bold text-[14px] hover:bg-[#0a3328] transition-colors">
                    <Download size={16} /> تنزيل القالب
                  </button>
                )}
                <button onClick={() => setSelected(null)}
                  className={`w-full py-2.5 rounded-2xl text-[13px] font-medium border transition-colors ${isDark ? "border-white/[0.07] text-zinc-400 hover:bg-white/[0.04]" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                  رجوع للمكتبة
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
