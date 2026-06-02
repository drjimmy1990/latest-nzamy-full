"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wall, Plus, ShieldCheck, LockKey, Users,
  Prohibit, CheckCircle, Warning, CaretDown,
  DotsThree, MagnifyingGlass
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types & Mock Data ────────────────────────────────────────────────────────

type WallStatus = "نشط" | "مؤرشف";

interface WallEntry {
  id: string;
  name: string;
  relatedCase: string;
  reason: string;
  status: WallStatus;
  createdAt: string;
  allowedMembers: string[];
  blockedMembers: string[];
}

const MOCK_WALLS: WallEntry[] = [
  {
    id: "w1", name: "استحواذ الأفق القابضة", relatedCase: "مشروع الاندماج M&A-001",
    reason: "معلومات داخلية حساسة تؤثر على سوق الأسهم", status: "نشط", createdAt: "٢٠٢٤/٠٥/٠١",
    allowedMembers: ["سلمان العتيبي (شريك)", "نورة الزهراني (محامي أول)"],
    blockedMembers: ["جميع محامي قسم التقاضي", "فريق الملكية الفكرية"]
  },
  {
    id: "w2", name: "نزاع عائلة الراشد", relatedCase: "قسمة تركة L-045",
    reason: "المكتب يمثل أحد الأطراف، وزميل آخر له صلة قرابة بطرف آخر", status: "نشط", createdAt: "٢٠٢٤/٠٣/١٢",
    allowedMembers: ["فهد الدوسري (محامي)"],
    blockedMembers: ["خالد الراشد (محامي متدرب)"]
  },
  {
    id: "w3", name: "تصفية شركة التقنية", relatedCase: "تصفية تجارية B-099",
    reason: "الشركة من عملاء المكتب السابقين", status: "مؤرشف", createdAt: "٢٠٢٣/١١/٠٥",
    allowedMembers: ["أحمد المرزوقي (شريك)"],
    blockedMembers: ["فريق التأسيس والشركات"]
  }
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChineseWallsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<WallStatus | "الكل">("الكل");
  const [expandedWall, setExpandedWall] = useState<string | null>("w1");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = MOCK_WALLS.filter(w => 
    (filter === "الكل" || w.status === filter) &&
    (!search || w.name.includes(search) || w.relatedCase.includes(search))
  );

  return (
    <div className="max-w-[1100px] mx-auto space-y-6" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-xl font-bold mb-0.5 flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            <Wall className="text-royal" weight="duotone" />
            الجدران الصينية (Chinese Walls)
          </h1>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            إدارة حواجز المعلومات الأخلاقية بين أقسام ومحامي المكتب لمنع تسرب المعلومات الحساسة
          </p>
        </div>
        <button className="px-4 py-2 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold hover:bg-[#0a3328] transition-colors flex items-center gap-2">
          <Plus size={15} weight="bold" /> إنشاء حاجز جديد
        </button>
      </motion.div>

      {/* Security Banner */}
      <div className={`p-4 rounded-2xl flex items-start gap-3 border ${isDark ? "bg-blue-500/10 border-blue-500/20" : "bg-blue-50 border-blue-200"}`}>
        <ShieldCheck size={20} weight="fill" className="text-blue-500 mt-0.5 shrink-0" />
        <div>
          <p className={`text-[12px] font-bold ${isDark ? "text-blue-400" : "text-blue-700"}`}>حماية النظام القصوى مفعّلة</p>
          <p className={`text-[11px] mt-1 leading-relaxed ${isDark ? "text-blue-200/70" : "text-blue-600"}`}>
            النظام يمنع تلقائياً الأعضاء المحظورين من البحث عن القضية، أو رؤيتها في لوحات التحكم، أو الوصول لأي مستند متعلق بها. 
            محاولة الوصول تسجل في سجلات التدقيق (Audit Logs).
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className={`${card} p-4 flex flex-col sm:flex-row gap-3`}>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border flex-1 transition-colors ${isDark ? "bg-white/[0.04] border-white/[0.06] focus-within:border-royal/40" : "bg-zinc-50 border-zinc-200 focus-within:border-emerald-300"}`}>
          <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث عن حاجز أو قضية..."
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-500" dir="rtl" />
        </div>
        <div className="flex gap-2">
          {(["الكل", "نشط", "مؤرشف"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                filter === f ? "bg-[#0B3D2E] border-[#0B3D2E] text-white" : isDark ? "bg-zinc-800 border-white/[0.05] text-zinc-400 hover:text-zinc-200" : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100"
              }`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-4">
        {filtered.map((wall, i) => (
          <motion.div key={wall.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`${card} overflow-hidden`}>
            
            {/* Header */}
            <div 
              onClick={() => setExpandedWall(expandedWall === wall.id ? null : wall.id)}
              className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-white/[0.02] transition-colors">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                  wall.status === "نشط" ? isDark ? "bg-red-500/10" : "bg-red-50" : isDark ? "bg-zinc-800" : "bg-slate-100"
                }`}>
                  <LockKey size={20} weight={wall.status === "نشط" ? "fill" : "regular"} className={wall.status === "نشط" ? "text-red-500" : isDark ? "text-zinc-500" : "text-slate-400"} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className={`text-[15px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>{wall.name}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      wall.status === "نشط" ? "bg-red-500/10 text-red-500 border-red-500/20" : isDark ? "bg-zinc-800 text-zinc-400 border-white/[0.05]" : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}>{wall.status}</span>
                  </div>
                  <p className={`text-[12px] flex items-center gap-1.5 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                    <span className="font-bold">{wall.relatedCase}</span>
                    <span className="opacity-50">•</span>
                    تم الإنشاء: {wall.createdAt}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-3 px-4 py-1.5 rounded-lg border ${isDark ? "bg-white/[0.03] border-white/[0.05]" : "bg-slate-50 border-slate-200"}`}>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-500">
                    <CheckCircle size={14} weight="fill" /> {wall.allowedMembers.length} مسموح
                  </div>
                  <div className="w-px h-4 bg-slate-300 dark:bg-white/[0.1]"></div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-red-500">
                    <Prohibit size={14} weight="fill" /> {wall.blockedMembers.length} محظور
                  </div>
                </div>
                <button className={`p-2 rounded-lg transition-colors ${isDark ? "hover:bg-zinc-800 text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}>
                  <CaretDown size={16} className={`transform transition-transform ${expandedWall === wall.id ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>

            {/* Expanded Content */}
            <AnimatePresence>
              {expandedWall === wall.id && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className={`border-t ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
                  <div className="p-5 space-y-5">
                    
                    <div>
                      <p className={`text-[11px] font-bold mb-1.5 uppercase ${isDark ? "text-zinc-500" : "text-slate-400"}`}>سبب إنشاء الحاجز</p>
                      <div className={`p-3 rounded-xl flex items-start gap-2 ${isDark ? "bg-amber-500/10 text-amber-200" : "bg-amber-50 text-amber-700"}`}>
                        <Warning size={14} weight="fill" className="text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-[12px]">{wall.reason}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Allowed Members */}
                      <div className={`p-4 rounded-xl border ${isDark ? "bg-white/[0.02] border-emerald-500/20" : "bg-emerald-50/50 border-emerald-200"}`}>
                        <div className="flex items-center justify-between mb-3">
                          <p className={`text-[12px] font-bold flex items-center gap-1.5 ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                            <CheckCircle size={16} weight="fill" /> الفريق داخل الحاجز (مصرح لهم)
                          </p>
                          <button className={`p-1.5 rounded-lg text-[10px] font-bold border transition-colors ${isDark ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" : "border-emerald-200 text-emerald-600 hover:bg-emerald-100"}`}>
                            + إضافة
                          </button>
                        </div>
                        <ul className="space-y-2">
                          {wall.allowedMembers.map((m, idx) => (
                            <li key={idx} className={`flex items-center gap-2 text-[12px] p-2 rounded-lg ${isDark ? "bg-white/[0.03] text-zinc-300" : "bg-white text-slate-700"}`}>
                              <Users size={14} className={isDark ? "text-zinc-500" : "text-slate-400"} /> {m}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Blocked Members */}
                      <div className={`p-4 rounded-xl border ${isDark ? "bg-white/[0.02] border-red-500/20" : "bg-red-50/50 border-red-200"}`}>
                        <div className="flex items-center justify-between mb-3">
                          <p className={`text-[12px] font-bold flex items-center gap-1.5 ${isDark ? "text-red-400" : "text-red-700"}`}>
                            <Prohibit size={16} weight="fill" /> المحظورون (خارج الحاجز)
                          </p>
                          <button className={`p-1.5 rounded-lg text-[10px] font-bold border transition-colors ${isDark ? "border-red-500/30 text-red-400 hover:bg-red-500/10" : "border-red-200 text-red-600 hover:bg-red-100"}`}>
                            + إضافة
                          </button>
                        </div>
                        <ul className="space-y-2">
                          {wall.blockedMembers.map((m, idx) => (
                            <li key={idx} className={`flex items-center gap-2 text-[12px] p-2 rounded-lg ${isDark ? "bg-white/[0.03] text-zinc-300" : "bg-white text-slate-700"}`}>
                              <ShieldCheck size={14} className={isDark ? "text-zinc-500" : "text-slate-400"} /> {m}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </motion.div>
        ))}
      </div>
    </div>
  );
}
