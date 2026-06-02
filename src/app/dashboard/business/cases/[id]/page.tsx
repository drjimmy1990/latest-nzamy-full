"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, ShieldCheck, UserCircle, Briefcase,
  WarningOctagon, MagnifyingGlass, FileText, CheckCircle,
  CurrencyCircleDollar, Scales, Sparkle, Robot, UserSwitch,
  FolderOpen, CalendarBlank, Key, LockKey, ShareNetwork,
  Users, Check, X, DotsThree, Eye, Pencil, Trash,
  Plus, Warning, Clock, CheckSquare, File, FilePdf, Image, CloudArrowUp
} from "@phosphor-icons/react";

import CaseGraphView from "../../kanban/CaseGraphView";

// ── Types ──────────────────────────────────────────────────────────────────────
type TabPane = "overview" | "graph" | "tasks" | "docs" | "finance";
type ShareRole = "read_only" | "editor" | "full";

function ShareGraphModal({ onClose, isDark }: { onClose: () => void; isDark: boolean }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("read_only");
  const [maskData, setMaskData] = useState(true);
  const [sent, setSent] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      dir="rtl"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl relative overflow-hidden ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-zinc-200"}`}
      >
        <div className={`absolute top-0 end-0 p-3 opacity-10 ${isDark ? "text-blue-500" : "text-blue-600"}`}>
          <ShareNetwork size={120} weight="duotone" />
        </div>

        <div className="flex items-center justify-between mb-5 relative z-10">
          <h3 className={`text-lg font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
            <ShareNetwork size={20} className="text-blue-500" />
            مشاركة الجراف الخارجي
          </h3>
          <button onClick={onClose} className={`rounded-xl p-1.5 transition-colors ${isDark ? "bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-600"}`}>
            <X size={16} />
          </button>
        </div>

        {sent ? (
          <div className="text-center py-6 relative z-10">
             <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
               <Check size={28} weight="bold" className="text-emerald-500" />
             </div>
             <h4 className={`text-[15px] font-bold mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}>تم التشفير وإرسال الوصول</h4>
             <p className={`text-[13px] leading-relaxed mb-6 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
               تم إصدار Passcode متغير للبريد {email}. سيتم إرسال رابط مؤقت للوصول المشفر.
             </p>
             <button onClick={onClose} className="rounded-xl w-full bg-zinc-800 text-white font-bold py-2.5 text-sm hover:bg-zinc-700">
               إغلاق
             </button>
          </div>
        ) : (
          <div className="space-y-5 relative z-10">
            <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              شارك اللوحة البصرية مع موكلك، أو محامي متدرب، أو مدير المكتب بصلاحيات مخصصة وتشفير آلي.
            </p>

            <div>
              <label className={`block text-[12px] font-bold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>البريد الإلكتروني أو الجوال</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="text" placeholder="example@domain.com" className={`w-full rounded-xl border px-3 py-2.5 outline-none text-sm ${isDark ? "bg-zinc-800 border-white/[0.08] text-white" : "bg-zinc-50 border-zinc-200 text-zinc-900"}`} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { id: "read_only", label: "قراءة فقط", icon: Eye },
                { id: "editor", label: "مسموح بالإضافة", icon: Pencil },
              ].map(r => (
                <button key={r.id} onClick={() => setRole(r.id as ShareRole)} className={`rounded-xl border p-3 flex flex-col items-start gap-2 transition-all ${role === r.id ? "bg-blue-500/10 border-blue-500/50 shadow-sm" : isDark ? "border-white/[0.06] opacity-60" : "border-zinc-200 opacity-70"}`}>
                  <r.icon size={18} className={role === r.id ? "text-blue-500" : isDark ? "text-zinc-400" : "text-zinc-500"} />
                  <span className={`text-[12px] font-bold pl-2 ${role === r.id ? "text-blue-600 dark:text-blue-400" : isDark ? "text-zinc-300" : "text-zinc-700"}`}>{r.label}</span>
                </button>
              ))}
            </div>

            {/* Smart Encryption Toggle */}
            <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${maskData ? isDark ? "bg-[#C8A762]/10 border-[#C8A762]/30" : "bg-orange-50 border-orange-200" : isDark ? "border-white/[0.06]" : "border-zinc-200"}`}>
              <div className="mt-0.5">
                <div className={`flex h-5 w-5 items-center justify-center rounded border ${maskData ? "bg-[#C8A762] border-[#C8A762]" : "border-zinc-400"}`}>
                  {maskData && <Check weight="bold" size={14} className="text-white" />}
                </div>
              </div>
              <input type="checkbox" className="hidden" checked={maskData} onChange={() => setMaskData(!maskData)} />
              <div>
                <p className={`text-[13px] font-bold mb-0.5 flex items-center gap-1.5 ${isDark ? "text-white" : "text-zinc-900"}`}>
                  <LockKey size={14} className={maskData ? "text-[#C8A762]" : isDark ? "text-zinc-500" : "text-zinc-400"} />
                  تشفير البيانات الحساسة (Masking)
                </p>
                <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  يقوم الذكاء الاصطناعي بتعمية أسماء الأشخاص وأرقام المبالغ والعقود في اللوحة البصرية (مثل: الطرف الأول، س***، عقد ***).
                </p>
              </div>
            </label>

            <button onClick={() => { if(email) setSent(true); }} className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 text-[14px] shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2">
              <Key size={18} /> توليد Passcode وإرسال
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}


// ── Page Component ─────────────────────────────────────────────────────────────
export default function MatterDashboard() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [activeTab, setActiveTab] = useState<TabPane>("overview");
  const [showShareModal, setShowShareModal] = useState(false);

  const cardStyle = isDark ? "bg-zinc-900 border border-white/[0.06]" : "bg-white border border-zinc-200/70";

  return (
    <div className={`min-h-screen pb-16 ${isDark ? "bg-zinc-950 text-zinc-100" : "bg-zinc-50/50 text-zinc-900"}`} dir="rtl">
      
      {/* ── Sub Header ── */}
      <div className={`sticky top-0 z-40 border-b backdrop-blur-md pt-5 px-6 ${isDark ? "bg-zinc-950/80 border-white/[0.05]" : "bg-white/80 border-zinc-200"}`}>
        <div className="max-w-6xl mx-auto">
          {/* Breadcrumbs & Title */}
          <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
            <div>
              <div className="flex items-center gap-1.5 mb-2 text-[12px] font-semibold">
                <Link href="/dashboard/business/kanban" className={isDark ? "text-zinc-500 hover:text-white transition-colors" : "text-zinc-400 hover:text-zinc-900"}>الكانبان القضايا</Link>
                <span className="text-zinc-600">/</span>
                <span className="text-[#C8A762]">DOCKET-1200</span>
              </div>
              <h1 className={`text-2xl font-bold flex items-center gap-3 ${isDark ? "text-white" : "text-zinc-900"}`}>
                <div className={`w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]`} />
                نزاع مقاولة مع شركة البناء الحديث
              </h1>
              <p className={`mt-1.5 text-sm flex items-center gap-4 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                <span className="flex items-center gap-1.5"><UserCircle size={15}/> الموكل: شركة أفق للتطوير</span>
                <span className="flex items-center gap-1.5"><Briefcase size={15}/> تجاري / منازعات</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${isDark ? "border-white/[0.08] hover:bg-white/[0.05]" : "border-zinc-200 hover:bg-zinc-50"}`}>
                <DotsThree size={20} />
              </button>
              <button className="rounded-xl bg-[#0B3D2E] hover:bg-[#082a20] text-white px-5 py-2 text-sm font-bold shadow-sm transition-colors flex items-center gap-2">
                <CheckCircle size={16} /> مكتمل جزئياً
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-6 overflow-x-auto no-scrollbar border-b border-transparent">
            {[
              { id: "overview", label: "نظرة عامة", icon: MagnifyingGlass },
              { id: "graph", label: "اللوحة البصرية (Graph)", icon: ShareNetwork }, // Reusing icon metaphor
              { id: "tasks", label: "المهام والإجراءات", icon: CheckCircle },
              { id: "docs", label: "المستندات", icon: FileText },
              { id: "finance", label: "المالية والأتعاب", icon: CurrencyCircleDollar },
            ].map(t => (
              <button
                key={t.id} onClick={() => setActiveTab(t.id as TabPane)}
                className={`flex items-center gap-2 pb-3 pt-1 text-[13px] font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === t.id ? "border-[#C8A762] text-[#C8A762]" : isDark ? "border-transparent text-zinc-500 hover:text-zinc-300" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
              >
                <t.icon size={16} weight={activeTab === t.id ? "fill" : "regular"} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto py-8 px-6">
        <AnimatePresence mode="wait">
          
          {/* ── OVERVIEW TAB ── */}
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                <div className="lg:col-span-2 space-y-6">
                  {/* AI Summary Block */}
                  <div className={`${cardStyle} rounded-3xl p-6 relative overflow-hidden`}>
                    <div className="absolute top-0 end-0 p-4 opacity-5 pointer-events-none">
                      <Sparkle size={100} weight="fill" className="text-[#C8A762]" />
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="bg-[#C8A762]/20 p-1.5 rounded-lg border border-[#C8A762]/30">
                        <Robot size={18} weight="fill" className="text-[#C8A762]" />
                      </div>
                      <h3 className={`text-[14px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>تحليل وتحديثات القضية</h3>
                    </div>
                    <p className={`text-[13px] leading-loose ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      تم فتح القضية يوم الأربعاء وبناء لوحة بصرية مبدئية توضح تعارض مواعيد التسليم بين الموكل ومؤسسة البناء. المستند الأخير المرفوع <span className="font-bold underline cursor-pointer text-blue-500">تقرير الخبير الهندسي.pdf</span> يدعم موقف موكلكم بنسبة 85٪ في طلب فسخ العقد التعسفي. ينصح الذكاء الاصطناعي بالتحضير لجلسة الإجابة القادمة بتجهيز مسودة الإنذار المبكر المرفوعة على اللوحة.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className={`${cardStyle} rounded-2xl p-5`}>
                       <h4 className={`text-[12px] font-bold mb-3 ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>الحالة القادمة للمحكمة</h4>
                       <div className="flex items-center gap-3">
                         <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isDark ? "bg-red-500/10 text-red-500" : "bg-red-50 text-red-600"}`}>
                           <CalendarBlank size={20} />
                         </div>
                         <div>
                           <p className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>جلسة تبادل المذكرات</p>
                           <p className="text-[12px] text-red-500 font-bold mt-1">غداً — 10:30 صباحاً</p>
                         </div>
                       </div>
                    </div>
                    <div className={`${cardStyle} rounded-2xl p-5`}>
                       <h4 className={`text-[12px] font-bold mb-3 ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>الفوترة (حساب الأمانة)</h4>
                       <div className="flex items-center gap-3">
                         <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isDark ? "bg-emerald-500/10 text-emerald-500" : "bg-emerald-50 text-emerald-600"}`}>
                           <CurrencyCircleDollar size={20} />
                         </div>
                         <div>
                           <p className={`text-[15px] font-bold font-mono ${isDark ? "text-white" : "text-zinc-900"}`}>15,000 ر.س</p>
                           <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>الرصيد المتبقي (Retainer)</p>
                         </div>
                       </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Team */}
                  <div className={`${cardStyle} rounded-3xl p-5`}>
                    <h3 className={`text-[13px] font-bold mb-4 flex items-center gap-2 ${isDark ? "text-zinc-300" : "text-zinc-800"}`}>
                      <Users size={16} /> فريق العمل
                    </h3>
                    <div className="space-y-3">
                      {[
                        { name: "نورة الزهراني", role: "شريك مشرف", avatar: "نز", color: "from-[#0B3D2E] to-[#1a6b50]" },
                        { name: "فهد السبيعي", role: "أخصائي قانوني", avatar: "ف", color: "from-blue-600 to-blue-400" },
                      ].map(m => (
                        <div key={m.name} className="flex items-center gap-3">
                           <div className={`h-8 w-8 rounded-full bg-gradient-to-br ${m.color} flex items-center justify-center text-white text-[10px] font-bold shadow-sm`}>{m.avatar}</div>
                           <div>
                             <p className={`text-[12px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{m.name}</p>
                             <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{m.role}</p>
                           </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            </motion.div>
          )}

          {/* ── GRAPH TAB (With Secure Sharing) ── */}
          {activeTab === "graph" && (
            <motion.div key="graph" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="h-[70vh] flex flex-col gap-4">
              <div className="flex items-center justify-between">
                 <p className={`text-[13px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>يتم تحديث اللوحة البصرية حياً مع فريقك</p>
                 <button onClick={() => setShowShareModal(true)} className={`flex items-center gap-2 text-[12px] font-bold rounded-xl px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm`}>
                   <ShareNetwork size={16} /> مشاركة مع شخص خارجي
                 </button>
              </div>
              <div className={`flex-1 rounded-3xl overflow-hidden border relative ${isDark ? "border-white/[0.08]" : "border-zinc-200"}`}>
                <CaseGraphView isDark={isDark} />
              </div>
            </motion.div>
          )}

          {/* ── TASKS TAB ── */}
          {activeTab === "tasks" && (
            <motion.div key="tasks" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Tasks Column (2/3 width) */}
                <div className="lg:col-span-2 space-y-5">
                  {/* Team Member Filter Tabs */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {["الكل", "نورة الزهراني", "فهد السبيعي", "ريم القحطاني"].map((member, i) => (
                      <button key={member} className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                        i === 0 
                          ? "bg-[#0B3D2E] text-white border-transparent" 
                          : isDark ? "border-white/[0.08] text-zinc-400 hover:border-white/20" : "border-zinc-200 text-zinc-600 hover:border-zinc-400"
                      }`}>{member}</button>
                    ))}
                    <button className={`ms-auto flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors ${isDark ? "border-[#C8A762]/30 text-[#C8A762] hover:bg-[#C8A762]/10" : "border-[#C8A762]/50 text-[#C8A762]"}`}>
                      <Plus size={14} /> إضافة مهمة
                    </button>
                  </div>

                  {/* Active Tasks */}
                  <div>
                    <h3 className={`text-xs font-bold mb-3 flex items-center gap-2 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                      <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
                      قيد التنفيذ
                    </h3>
                    <div className="space-y-2">
                      {[
                        { id: 1, text: "إعداد مذكرة الدفوع الموضوعية", assignee: "فهد السبيعي", due: "غداً", hot: true },
                        { id: 2, text: "تقديم طلب تأجيل الجلسة إلكترونياً", assignee: "ريم القحطاني", due: "بعد ٣ أيام", hot: false },
                      ].map(t => (
                        <div key={t.id} className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-colors ${isDark ? "bg-amber-500/5 border-amber-500/20" : "bg-amber-50 border-amber-200"}`}>
                          <div className={`mt-0.5 flex-shrink-0 h-4 w-4 rounded border-2 cursor-pointer ${isDark ? "border-amber-500" : "border-amber-400"}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{t.text}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{t.assignee}</span>
                              <span className={`text-[11px] flex items-center gap-1 font-bold ${t.hot ? "text-red-500" : isDark ? "text-zinc-500" : "text-zinc-600"}`}>
                                <Clock size={11} />{t.due}
                              </span>
                            </div>
                          </div>
                          {t.hot && <span className="text-[10px] bg-red-500/10 text-red-500 border border-red-500/30 px-2 py-0.5 rounded-lg font-bold">عاجل</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Blocked Tasks */}
                  <div>
                    <h3 className={`text-xs font-bold mb-3 flex items-center gap-2 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                      <Warning size={12} className="text-orange-500" />
                      معلقة / بانتظار
                    </h3>
                    <div className={`flex items-start gap-3 p-3.5 rounded-2xl border ${isDark ? "bg-orange-500/5 border-orange-500/20" : "bg-orange-50 border-orange-200"}`}>
                      <Warning size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>تحويل رسوم الاستئناف من الموكل</p>
                        <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>معلقة بانتظار: تأكيد التحويل البنكي</p>
                      </div>
                    </div>
                  </div>

                  {/* Done Tasks */}
                  <div>
                    <h3 className={`text-xs font-bold mb-3 flex items-center gap-2 opacity-60 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                      <CheckSquare size={12} />
                      مكتملة (٣)
                    </h3>
                    <div className="space-y-2 opacity-60">
                      {[
                        "تقديم اللائحة الافتتاحية أمام المحكمة",
                        "إيداع كفالة الدعوى",
                        "مراسلة الخبير الهندسي للمثول"
                      ].map((t, i) => (
                        <div key={i} className={`flex items-start gap-3 p-3 rounded-2xl border ${ isDark ? "border-white/[0.04]" : "border-zinc-100 bg-zinc-50"}`}>
                          <CheckCircle size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" weight="fill" />
                          <p className={`text-[12px] line-through ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{t}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Timeline Column (1/3 width) */}
                <div className={`${cardStyle} rounded-3xl p-5 h-fit`}>
                  <h3 className={`text-[13px] font-bold mb-4 flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                    <Clock size={15} className="text-[#C8A762]" />
                    السجل الزمني
                  </h3>
                  <div className="relative ps-4">
                    <div className={`absolute start-1.5 top-0 bottom-0 w-px ${isDark ? "bg-white/[0.06]" : "bg-zinc-200"}`} />
                    <div className="space-y-5">
                      {[
                        { label: "رُفع مستند: تقرير الخبير", time: "اليوم، 10:24 ص", user: "فهد", color: "bg-blue-500" },
                        { label: "تغيير الأولوية إلى عاجل", time: "أمس، 3:15 م", user: "نورة", color: "bg-[#C8A762]" },
                        { label: "إضافة ملاحظة على اللوحة البصرية", time: "أمس، 11:00 ص", user: "فهد", color: "bg-blue-500" },
                        { label: "فتح القضية وإنشاء الملف", time: "٣ أبريل، 9:00 ص", user: "نورة", color: "bg-[#C8A762]" },
                      ].map((item, i) => (
                        <div key={i} className="relative">
                          <div className={`absolute -start-[18px] top-1 w-2.5 h-2.5 rounded-full border-2 ${item.color} ${isDark ? "border-zinc-900" : "border-white"}`} />
                          <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{item.label}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{item.time}</span>
                            <span className={`text-[10px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>· {item.user}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── DOCUMENTS TAB ── */}
          {activeTab === "docs" && (
            <motion.div key="docs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {/* Filters + Upload */}
              <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {["الكل", "عقود", "مذكرات", "مرفقات المحكمة", "صور"].map((f, i) => (
                    <button key={f} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      i === 0 
                        ? "bg-[#0B3D2E] text-white border-transparent" 
                        : isDark ? "border-white/[0.08] text-zinc-400" : "border-zinc-200 text-zinc-600"
                    }`}>{f}</button>
                  ))}
                </div>
                <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0B3D2E] text-white text-xs font-bold hover:bg-[#082a20] transition-colors shadow-sm">
                  <CloudArrowUp size={16} /> رفع مستند جديد
                </button>
              </div>

              {/* Documents Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {[
                  { name: "عقد المقاولة.pdf", type: "pdf", size: "2.4 MB", date: "٣ أبريل", uploader: "فهد" },
                  { name: "تقرير الخبير الهندسي.pdf", type: "pdf", size: "1.1 MB", date: "٣ أبريل", uploader: "فهد" },
                  { name: "لائحة الدعوى الإبتدائية.docx", type: "doc", size: "340 KB", date: "٢ أبريل", uploader: "نورة" },
                  { name: "صور الموقع (١).jpg", type: "img", size: "4.2 MB", date: "١ أبريل", uploader: "فهد" },
                  { name: "صور الموقع (٢).jpg", type: "img", size: "3.8 MB", date: "١ أبريل", uploader: "فهد" },
                  { name: "مذكرة الدفاع الأولى.docx", type: "doc", size: "520 KB", date: "٣٠ مارس", uploader: "ريم" },
                  { name: "كفالة الدعوى.pdf", type: "pdf", size: "180 KB", date: "٢٩ مارس", uploader: "نورة" },
                  { name: "مراسلة (إنذار مبكر).pdf", type: "pdf", size: "95 KB", date: "٢٨ مارس", uploader: "فهد" },
                ].map((doc, i) => {
                  const isPdf = doc.type === "pdf";
                  const isImg = doc.type === "img";
                  return (
                    <div key={i} className={`group rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${ isDark ? "bg-zinc-900/80 border-white/[0.06] hover:border-white/15" : "bg-white border-zinc-200 hover:border-zinc-300 hover:shadow-zinc-100"}`}>
                      <div className={`h-16 w-full rounded-xl flex items-center justify-center mb-3 ${
                        isPdf ? isDark ? "bg-red-500/10" : "bg-red-50" :
                        isImg ? isDark ? "bg-blue-500/10" : "bg-blue-50" :
                               isDark ? "bg-[#C8A762]/10" : "bg-amber-50"
                      }`}>
                        {isPdf && <FilePdf size={32} className="text-red-500" weight="fill" />}
                        {isImg && <Image size={32} className="text-blue-500" weight="fill" />}
                        {!isPdf && !isImg && <FileText size={32} className="text-[#C8A762]" weight="fill" />}
                      </div>
                      <p className={`text-[11px] font-bold leading-tight truncate ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{doc.name}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className={`text-[9px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{doc.size}</span>
                        <span className={`text-[9px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{doc.date}</span>
                      </div>
                      <div className={`flex items-center gap-1 mt-2 pt-2 border-t ${isDark ? "border-white/[0.04]" : "border-zinc-100"}`}>
                        <div className={`h-4 w-4 rounded-full bg-gradient-to-br from-[#0B3D2E] to-emerald-400 flex items-center justify-center text-white text-[7px] font-bold`}>{doc.uploader[0]}</div>
                        <span className={`text-[9px] font-semibold ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{doc.uploader}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── FINANCE TAB ── */}
          {activeTab === "finance" && (
            <motion.div key="finance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${cardStyle} rounded-3xl p-12 text-center`}>
              <div className={`mx-auto h-16 w-16 mb-4 rounded-full flex items-center justify-center ${isDark ? "bg-white/[0.04]" : "bg-zinc-100"}`}>
                <CurrencyCircleDollar size={32} className="text-zinc-400 opacity-50" />
              </div>
              <h3 className={`text-lg font-bold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-800"}`}>المالية والأتعاب</h3>
              <p className={`text-sm max-w-sm mx-auto ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>سيتم ربط هذا القسم بوحدة الفوترة والأتعاب قريباً.</p>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Share Graph Modal Overlay */}
      <AnimatePresence>
        {showShareModal && <ShareGraphModal onClose={() => setShowShareModal(false)} isDark={isDark} />}
      </AnimatePresence>
    </div>
  );
}

function SettingsPlaceholder() {
  return <Briefcase size={32} className="text-zinc-400 opacity-50" />;
}
