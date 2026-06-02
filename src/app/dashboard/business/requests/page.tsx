"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase, Plus, MagnifyingGlass, FunnelSimple,
  Clock, CheckCircle, Hourglass, XCircle,
  CaretDown, CaretUp, Sparkle, ArrowUpRight,
  Buildings, Scales, FileText, ShieldCheck,
  Users, CalendarBlank, CurrencyCircleDollar,
  Warning, ArrowLeft,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ── Types ──────────────────────────────────────────────────────────────────────
type ReqStatus = "open" | "in-review" | "in-progress" | "completed" | "cancelled";
type ReqCategory = "legal-advice" | "contract" | "litigation" | "compliance" | "hr" | "real-estate";

interface ServiceRequest {
  id: string;
  title: string;
  category: ReqCategory;
  status: ReqStatus;
  budget: string;
  submittedAt: string;
  daysAgo: number;
  assignee?: string;
  priority: "high" | "normal" | "low";
  description: string;
  offersCount: number;
  deadline?: string;
}

// ── Mock Data ──────────────────────────────────────────────────────────────────
const MOCK_REQUESTS: ServiceRequest[] = [
  {
    id: "r1",
    title: "مراجعة عقد توريد مع مورّد رئيسي",
    category: "contract",
    status: "in-review",
    budget: "٣,٥٠٠ ر.س",
    submittedAt: "٢٠ أبريل ٢٠٢٦",
    daysAgo: 2,
    assignee: "محمد الغامدي",
    priority: "high",
    description: "مراجعة شاملة لعقد توريد بقيمة ٢.٤ مليون ريال مع شريك استراتيجي جديد — التركيز على بنود الضمان والتحكيم.",
    offersCount: 3,
    deadline: "٢٨ أبريل",
  },
  {
    id: "r2",
    title: "استشارة في مخالفة نظام العمل",
    category: "hr",
    status: "open",
    budget: "١,٢٠٠ ر.س",
    submittedAt: "١٨ أبريل ٢٠٢٦",
    daysAgo: 4,
    priority: "high",
    description: "الاستفسار عن مخالفة محتملة في إجراءات إنهاء خدمة موظف والمسؤولية القانونية المترتبة.",
    offersCount: 5,
    deadline: "٢٥ أبريل",
  },
  {
    id: "r3",
    title: "تقرير امتثال PDPL ربع سنوي",
    category: "compliance",
    status: "in-progress",
    budget: "٨,٠٠٠ ر.س",
    submittedAt: "١٠ أبريل ٢٠٢٦",
    daysAgo: 12,
    assignee: "نورة القحطاني",
    priority: "normal",
    description: "إعداد تقرير الامتثال للائحة حماية البيانات الشخصية للربع الأول من ٢٠٢٦.",
    offersCount: 2,
  },
  {
    id: "r4",
    title: "تمثيل في نزاع تجاري أمام المحكمة",
    category: "litigation",
    status: "in-progress",
    budget: "٢٥,٠٠٠ ر.س",
    submittedAt: "٥ مارس ٢٠٢٦",
    daysAgo: 46,
    assignee: "فهد العتيبي",
    priority: "high",
    description: "الترافع في قضية مطالبة مالية بقيمة ٣٠٠,٠٠٠ ريال أمام المحكمة التجارية بالرياض.",
    offersCount: 1,
    deadline: "٢٠ مايو",
  },
  {
    id: "r5",
    title: "صياغة نظام داخلي للحوكمة",
    category: "compliance",
    status: "completed",
    budget: "٦,٥٠٠ ر.س",
    submittedAt: "١٥ فبراير ٢٠٢٦",
    daysAgo: 71,
    assignee: "سلمى الدوسري",
    priority: "normal",
    description: "إعداد نظام حوكمة داخلي شامل وفق أفضل الممارسات ومتطلبات هيئة السوق المالية.",
    offersCount: 4,
  },
  {
    id: "r6",
    title: "استشارة في عقد إيجار منشأة تجارية",
    category: "real-estate",
    status: "cancelled",
    budget: "٩٠٠ ر.س",
    submittedAt: "١ أبريل ٢٠٢٦",
    daysAgo: 21,
    priority: "low",
    description: "مراجعة عقد إيجار مستودع بالدمام.",
    offersCount: 0,
  },
];

// ── Config ────────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<ReqStatus, { label: string; color: string; bg: string; icon: any }> = {
  "open":        { label: "مفتوح",       color: "text-blue-500",    bg: "bg-blue-500/10 border-blue-500/20",    icon: Hourglass },
  "in-review":   { label: "قيد المراجعة", color: "text-amber-500",   bg: "bg-amber-500/10 border-amber-500/20",  icon: MagnifyingGlass },
  "in-progress": { label: "جارٍ التنفيذ", color: "text-royal",       bg: "bg-royal/10 border-royal/20",          icon: Clock },
  "completed":   { label: "مكتمل",       color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle },
  "cancelled":   { label: "ملغى",        color: "text-zinc-400",    bg: "bg-zinc-500/10 border-zinc-500/20",    icon: XCircle },
};

const CAT_CFG: Record<ReqCategory, { label: string; icon: any; color: string }> = {
  "legal-advice": { label: "استشارة قانونية", icon: Scales,              color: "text-blue-500" },
  "contract":     { label: "صياغة / مراجعة عقد", icon: FileText,         color: "text-amber-500" },
  "litigation":   { label: "ترافع قضائي",     icon: Buildings,           color: "text-red-500" },
  "compliance":   { label: "امتثال",          icon: ShieldCheck,         color: "text-emerald-500" },
  "hr":           { label: "شؤون موظفين",    icon: Users,               color: "text-purple-500" },
  "real-estate":  { label: "عقاري",           icon: Buildings,           color: "text-cyan-500" },
};

const PRIORITY_CFG = {
  high:   { label: "عالية", dot: "bg-red-500", text: "text-red-500" },
  normal: { label: "عادية", dot: "bg-blue-400", text: "text-blue-400" },
  low:    { label: "منخفضة", dot: "bg-zinc-400", text: "text-zinc-400" },
};

// ── New Request Modal ─────────────────────────────────────────────────────────
function NewRequestModal({ onClose, isDark }: { onClose: () => void; isDark: boolean }) {
  const [done, setDone] = useState(false);
  const inp = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${
    isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200 focus:border-royal/50" : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-royal/50"
  }`;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: -8 }}
        className={`w-full max-w-lg rounded-3xl p-6 shadow-2xl ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}>
        {done ? (
          <div className="text-center py-8">
            <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} weight="fill" className="text-emerald-500" />
            </div>
            <p className={`text-[17px] font-bold mb-1 ${isDark ? "text-white" : "text-zinc-900"}`}>تم إرسال الطلب</p>
            <p className={`text-[13px] mb-5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>سيتواصل معك فريق نظامي خلال ٢٤ ساعة.</p>
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-[#0B3D2E] text-white text-[13px] font-bold">إغلاق</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>طلب خدمة جديد</h3>
              <button onClick={onClose} className={`h-7 w-7 flex items-center justify-center rounded-full text-[12px] ${isDark ? "bg-white/[0.07] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>نوع الخدمة</label>
                <select className={inp}>
                  <option>استشارة قانونية</option>
                  <option>صياغة / مراجعة عقد</option>
                  <option>ترافع قضائي</option>
                  <option>امتثال</option>
                  <option>شؤون موظفين</option>
                  <option>عقاري</option>
                </select>
              </div>
              <div>
                <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>عنوان الطلب</label>
                <input type="text" placeholder="مثال: مراجعة عقد توريد مع مورّد جديد" className={inp} />
              </div>
              <div>
                <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>تفاصيل الطلب</label>
                <textarea rows={3} placeholder="اشرح احتياجك القانوني بإيجاز..." className={`${inp} resize-none`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الميزانية التقريبية</label>
                  <input type="text" placeholder="مثال: ٣,٠٠٠ ر.س" className={inp} />
                </div>
                <div>
                  <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الأولوية</label>
                  <select className={inp}>
                    <option>عادية</option>
                    <option>عالية</option>
                    <option>منخفضة</option>
                  </select>
                </div>
              </div>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => setDone(true)}
                className="w-full py-3 rounded-2xl bg-[#0B3D2E] text-white text-[13px] font-bold flex items-center justify-center gap-2 shadow-[0_8px_24px_-8px_rgba(11,61,46,0.4)]">
                <Sparkle size={14} weight="fill" /> إرسال الطلب
              </motion.button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BusinessRequestsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReqStatus | "all">("all");
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.06)]";
  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-500" : "text-zinc-400";

  const filtered = useMemo(() => MOCK_REQUESTS.filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search && !r.title.includes(search) && !r.description.includes(search)) return false;
    return true;
  }), [statusFilter, search]);

  const stats = {
    open: MOCK_REQUESTS.filter(r => r.status === "open").length,
    inProgress: MOCK_REQUESTS.filter(r => r.status === "in-progress" || r.status === "in-review").length,
    completed: MOCK_REQUESTS.filter(r => r.status === "completed").length,
    total: MOCK_REQUESTS.length,
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 p-4 md:p-6" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold ${tp}`}>طلبات الخدمات</h1>
          <p className={`text-sm mt-0.5 ${ts}`}>{stats.total} طلب · <span className="text-royal font-semibold">{stats.inProgress} جارٍ تنفيذه</span></p>
        </div>
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[13px] font-bold hover:bg-[#0a3328] transition-colors flex-shrink-0">
          <Plus size={15} weight="bold" /> طلب جديد
        </motion.button>
      </motion.div>

      {/* KPI Strip */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "إجمالي الطلبات",  value: stats.total,      icon: Briefcase,         color: "text-zinc-500" },
          { label: "مفتوحة",           value: stats.open,       icon: Hourglass,         color: "text-blue-500" },
          { label: "جارٍ التنفيذ",    value: stats.inProgress, icon: Clock,             color: "text-royal" },
          { label: "مكتملة",           value: stats.completed,  icon: CheckCircle,       color: "text-emerald-500" },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.04 }} className={`${card} p-4 flex items-center gap-3`}>
              <Icon size={20} weight="duotone" className={s.color} />
              <div>
                <p className={`text-xl font-black font-mono ${tp}`}>{s.value}</p>
                <p className={`text-[11px] ${ts}`}>{s.label}</p>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Search + Filter */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}
        className="flex flex-col sm:flex-row gap-3">
        <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={15} className={ts} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث في الطلبات..."
            className={`flex-1 bg-transparent text-[13px] outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "open", "in-review", "in-progress", "completed", "cancelled"] as const).map(s => {
            const cfg = s !== "all" ? STATUS_CFG[s] : null;
            return (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 rounded-xl border text-[11px] font-bold transition-all ${
                  statusFilter === s
                    ? "bg-[#0B3D2E] text-white border-[#0B3D2E]"
                    : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-500 hover:text-slate-700"
                }`}>
                {s === "all" ? "الكل" : cfg!.label}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Requests List */}
      <div className="space-y-2.5">
        <AnimatePresence>
          {filtered.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className={`${card} p-14 text-center`}>
              <Briefcase size={40} weight="duotone" className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
              <p className={`text-[14px] font-semibold mb-1 ${tp}`}>لا توجد طلبات مطابقة</p>
              <p className={`text-[12px] ${ts} mb-4`}>جرّب تغيير الفلتر أو ابدأ بطلب خدمة جديد</p>
              <button onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0B3D2E] text-white text-[13px] font-bold">
                <Plus size={14} weight="bold" /> طلب جديد
              </button>
            </motion.div>
          ) : filtered.map((req, i) => {
            const stCfg = STATUS_CFG[req.status];
            const catCfg = CAT_CFG[req.category];
            const priCfg = PRIORITY_CFG[req.priority];
            const StatusIcon = stCfg.icon;
            const CatIcon = catCfg.icon;
            const isOpen = expanded === req.id;
            return (
              <motion.div key={req.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }} transition={{ delay: i * 0.04 }} layout>
                <div className={`${card} overflow-hidden transition-all`}>
                  {/* Row */}
                  <button onClick={() => setExpanded(isOpen ? null : req.id)}
                    className="w-full p-4 text-right flex items-start gap-4">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${isDark ? "bg-white/[0.05]" : "bg-slate-50"}`}>
                      <CatIcon size={18} weight="duotone" className={catCfg.color} />
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0 text-right">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${stCfg.bg} ${stCfg.color}`}>
                          {stCfg.label}
                        </span>
                        {req.deadline && (
                          <span className="text-[10px] font-bold text-red-500 flex items-center gap-0.5">
                            <Warning size={10} />يستحق {req.deadline}
                          </span>
                        )}
                        <span className={`text-[10px] font-medium ${ts}`}>{catCfg.label}</span>
                      </div>
                      <p className={`text-[14px] font-semibold leading-snug ${tp}`}>{req.title}</p>
                      <div className={`flex flex-wrap items-center gap-3 mt-1.5 text-[11px] ${ts}`}>
                        <span className="flex items-center gap-1"><CalendarBlank size={11} />{req.submittedAt}</span>
                        <span className="flex items-center gap-1"><CurrencyCircleDollar size={11} />{req.budget}</span>
                        {req.assignee && <span className="flex items-center gap-1"><Users size={11} />{req.assignee}</span>}
                        <span className={`flex items-center gap-1 ${priCfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${priCfg.dot}`} />أولوية {priCfg.label}
                        </span>
                      </div>
                    </div>
                    {/* Caret + offers */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      {req.offersCount > 0 && (
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${isDark ? "bg-[#C8A762]/15 text-[#C8A762]" : "bg-royal/10 text-royal"}`}>
                          {req.offersCount} عرض
                        </span>
                      )}
                      {isOpen ? <CaretUp size={14} className={ts} /> : <CaretDown size={14} className={ts} />}
                    </div>
                  </button>

                  {/* Expanded detail */}
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className={`px-4 pb-4 pt-0 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                          <p className={`text-[12px] leading-relaxed mt-3 mb-4 ${ts}`}>{req.description}</p>
                          <div className="flex flex-wrap gap-2">
                            {req.status !== "completed" && req.status !== "cancelled" && (
                              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B3D2E] text-white text-[11px] font-bold">
                                <StatusIcon size={12} /> متابعة الطلب
                              </button>
                            )}
                            <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200" : "border-zinc-200 text-zinc-500 hover:text-zinc-700"}`}>
                              <ArrowLeft size={11} /> عرض التفاصيل
                            </button>
                            {(req.status === "open" || req.status === "in-review") && req.offersCount > 0 && (
                              <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${isDark ? "border-[#C8A762]/20 text-[#C8A762] bg-[#C8A762]/10" : "border-amber-300 text-amber-700 bg-amber-50"}`}>
                                <Users size={11} /> مقارنة العروض ({req.offersCount})
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* CTA footer */}
      {filtered.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <a href="/marketplace"
            className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-[13px] font-bold transition-colors ${isDark ? "border-white/[0.06] text-zinc-400 hover:bg-white/[0.03]" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
            <ArrowUpRight size={15} /> تصفح سوق المهنيين للحصول على عروض جديدة
          </a>
        </motion.div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {showModal && <NewRequestModal onClose={() => setShowModal(false)} isDark={isDark} />}
      </AnimatePresence>
    </div>
  );
}
