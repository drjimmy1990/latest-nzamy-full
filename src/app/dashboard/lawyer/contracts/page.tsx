"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, MagnifyingGlass, Plus, Clock, CalendarCheck,
  CheckCircle, Warning, CaretLeft, Download, Pen,
  Trash, Share, ArrowRight, PaperPlaneTilt, X, Archive,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import EmptyState from "@/components/ui/EmptyState";

// ─── Types & Mock Data ─────────────────────────────────────────────────────────

type ContractStatus = "active" | "pending_sign" | "expired" | "draft";

interface Contract {
  id:           string;
  title:        string;
  party:        string;
  type:         "service_agreement" | "fee_agreement" | "power_of_attorney" | "nda" | "employment";
  status:       ContractStatus;
  value?:       string;
  signDate?:    string;
  expiry?:      string;
  manualArchive?: boolean;   // أرشفة يدوية بغض النظر عن الحالة
}

const MOCK_CONTRACTS: Contract[] = [
  { id: "1", title: "اتفاقية توكيل — شركة الأفق",    party: "شركة الأفق للتجارة",  type: "power_of_attorney", status: "active",       signDate: "٢ يناير ٢٠٢٤",    expiry: "٢ يناير ٢٠٢٥", value: "٣٥,٠٠٠ ﷼" },
  { id: "2", title: "عقد أتعاب — أحمد الزاهد",       party: "أحمد الزاهد",          type: "fee_agreement",     status: "active",       signDate: "١٥ مارس ٢٠٢٤",   expiry: "مفتوح",           value: "١٨,٠٠٠ ﷼" },
  { id: "3", title: "اتفاقية سرية — موكّل جديد",     party: "سارة الدوسري",         type: "nda",               status: "pending_sign",                              expiry: "ينتهي ٢٠ أبريل" },
  { id: "4", title: "عقد خدمات قانونية — المطيري",  party: "ريم المطيري",           type: "service_agreement", status: "draft",        signDate: "",                  value: "٢٢,٠٠٠ ﷼" },
  { id: "5", title: "وكالة قانونية — السبيعي",        party: "علي السبيعي",           type: "power_of_attorney", status: "expired",      signDate: "١ يوليو ٢٠٢٣",   expiry: "٣١ ديسمبر ٢٠٢٣ (منتهية)" },
];

const TYPE_LABELS: Record<Contract["type"], string> = {
  service_agreement: "اتفاقية خدمات",
  fee_agreement:     "عقد أتعاب",
  power_of_attorney: "وكالة قانونية",
  nda:               "اتفاقية سرية",
  employment:        "عقد عمل",
};

const STATUS_CONFIG: Record<ContractStatus, { label: string; color: string; iconColor: string }> = {
  active:        { label: "ساري",          color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", iconColor: "text-emerald-500" },
  pending_sign:  { label: "بانتظار التوقيع", color: "text-amber-500 bg-amber-500/10 border-amber-500/20",     iconColor: "text-amber-500"   },
  expired:       { label: "منتهي",          color: "text-slate-400 bg-slate-100 border-slate-200 dark:bg-white/[0.04] dark:border-white/[0.06] dark:text-zinc-500", iconColor: "text-slate-400" },
  draft:         { label: "مسودة",          color: "text-blue-500 bg-blue-500/10 border-blue-500/20",          iconColor: "text-blue-500"    },
};

const STATUS_ICONS = {
  active:       CheckCircle,
  pending_sign: Warning,
  expired:      Clock,
  draft:        Pen,
};

const CONTRACT_TYPES = [
  { id: "power_of_attorney", label: "وكالة قانونية" },
  { id: "fee_agreement",     label: "عقد أتعاب" },
  { id: "nda",               label: "اتفاقية سرية" },
  { id: "service_agreement", label: "اتفاقية خدمات" },
  { id: "employment",        label: "عقد عمل" },
  { id: "other",             label: "آخر" },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContractsPage() {
  const { isDark } = useTheme();
  const [search,        setSearch]        = useState("");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [filter,        setFilter]        = useState<ContractStatus | "all">("all");
  const [viewMode,      setViewMode]      = useState<"active" | "archive">("active");
  const [expandedId,    setExpandedId]    = useState<string | null>(null);
  const [toast,         setToast]         = useState<string | null>(null);
  // New contract modal
  const [showModal, setShowModal]   = useState(false);
  const [modalStep, setModalStep]   = useState(1);
  const [newType,   setNewType]     = useState("");
  const [newParty,  setNewParty]    = useState("");
  const [newValue,  setNewValue]    = useState("");
  const [newTitle,  setNewTitle]    = useState("");
  const [contracts, setContracts]   = useState<Contract[]>(MOCK_CONTRACTS);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2800); }
  function openModal() { setShowModal(true); setModalStep(1); setNewType(""); setNewParty(""); setNewValue(""); setNewTitle(""); }
  function closeModal() { setShowModal(false); }
  function deleteContract(id: string) { setContracts(prev => prev.filter(c => c.id !== id)); setExpandedId(null); showToast("تم حذف العقد"); }
  function changeStatus(id: string, status: ContractStatus) { setContracts(prev => prev.map(c => c.id === id ? { ...c, status } : c)); showToast(status === "pending_sign" ? "تم إرسال العقد للتوقيع" : "تم تحديث حالة العقد"); }
  function archiveContract(id: string) {
    setContracts(prev => prev.map(c => c.id === id ? { ...c, manualArchive: true } : c));
    setExpandedId(null);
    showToast("🗂 تم نقل العقد للأرشيف");
  }
  function restoreContract(id: string, title: string) {
    setContracts(prev => prev.map(c => c.id === id ? { ...c, manualArchive: false, status: "draft" } : c));
    showToast(`✅ تم استعادة "${title}" — راجعه في قائمة المسودات`);
  }
  function saveDraft() {
    setContracts(prev => [{ id: Date.now().toString(), title: newTitle || `عقد جديد — ${newParty}`, party: newParty, type: (newType || "service_agreement") as Contract["type"], status: "draft", value: newValue || undefined }, ...prev]);
    closeModal(); showToast("تم حفظ المسودة");
  }
  function sendSign() {
    setContracts(prev => [{ id: Date.now().toString(), title: newTitle || `عقد جديد — ${newParty}`, party: newParty, type: (newType || "service_agreement") as Contract["type"], status: "pending_sign", value: newValue || undefined }, ...prev]);
    closeModal(); showToast("تم إرسال العقد للتوقيع ✓");
  }

  // isArchived = منتهية تلقائياً OR أُرشفت يدوياً
  const isArchived = (c: Contract) => c.status === "expired" || c.manualArchive === true;

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  // Active contracts (non-archived)
  const filtered = contracts.filter(c => {
    if (isArchived(c)) return false;
    const matchStatus = filter === "all" || c.status === filter;
    const matchSearch = !search || c.title.includes(search) || c.party.includes(search);
    return matchStatus && matchSearch;
  });

  // Archived contracts
  const archivedFiltered = contracts
    .filter(c => isArchived(c))
    .filter(c => {
      const q = archiveSearch.trim();
      return !q || c.title.includes(q) || c.party.includes(q) || c.value?.includes(q) || c.expiry?.includes(q);
    });

  const counts = {
    all:          contracts.filter(c => !isArchived(c)).length,
    active:       contracts.filter(c => c.status === "active"       && !isArchived(c)).length,
    pending_sign: contracts.filter(c => c.status === "pending_sign" && !isArchived(c)).length,
    draft:        contracts.filter(c => c.status === "draft"        && !isArchived(c)).length,
    expired:      contracts.filter(c => c.status === "expired"      && !isArchived(c)).length,
  };
  const archiveCount = contracts.filter(c => isArchived(c)).length;

  return (
    <div className="max-w-4xl mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
            مدير العقود
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {contracts.filter(c => !isArchived(c)).length} عقد نشط
            {archiveCount > 0 && ` · ${archiveCount} في الأرشيف`}
            {counts.pending_sign > 0 ? ` · ${counts.pending_sign} بانتظار التوقيع` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/ai/contracts"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            صياغة بـ AI
          </Link>
          {/* Archive toggle */}
          <button onClick={() => { setViewMode(m => m === "active" ? "archive" : "active"); setExpandedId(null); }}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all ${
              viewMode === "archive"
                ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                : isDark ? "border-white/10 text-zinc-400 hover:bg-white/5" : "border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}>
            <Archive size={14} />
            الأرشيف
            {archiveCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                viewMode === "archive" ? "bg-amber-500/20 text-amber-600" : isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-400"
              }`}>{archiveCount}</span>
            )}
          </button>
          <button onClick={openModal} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
            <Plus size={15} weight="bold" />
            عقد جديد
          </button>
        </div>
      </motion.div>

      {/* ───────────── ACTIVE VIEW ───────────── */}
      {viewMode === "active" && (<>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex flex-col sm:flex-row gap-3">
        <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في العقود..."
            className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {(["all", "active", "pending_sign", "draft", "expired"] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`flex items-center gap-1 px-3 py-2 rounded-xl border text-xs font-semibold flex-shrink-0 transition-all ${filter === s ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20"}`}>
              {s === "all" ? "الكل" : STATUS_CONFIG[s].label}
              <span className={`rounded-full px-1.5 text-[10px] font-bold ${filter === s ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                {counts[s]}
              </span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Contracts list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title="لا توجد عقود مطابقة"
            description="لم يتم العثور على أي عقود نشطة تطابق شروط الفلترة أو البحث الحالية."
            action={{ label: "إضافة عقد", onClick: openModal }}
          />
        ) : filtered.map((c, i) => {
          const sc = STATUS_CONFIG[c.status];
          const StatusIcon = STATUS_ICONS[c.status];
          const isExpanded = expandedId === c.id;
          return (
            <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <div className={`group ${card} overflow-hidden hover:border-royal/30 transition-all`}>
                {/* Row */}
                <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
                    <FileText size={18} weight="duotone" className="text-royal" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className={`text-[14px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{c.title}</p>
                      <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${sc.color}`}>
                        <StatusIcon size={10} weight="fill" />{sc.label}
                      </span>
                    </div>
                    <div className={`flex items-center gap-2 text-[12px] flex-wrap ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                      <span>{c.party}</span>
                      <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                      <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>{TYPE_LABELS[c.type]}</span>
                      {c.value && <><span className="w-1 h-1 rounded-full bg-current opacity-40" /><span className="text-[#C8A762] font-mono font-semibold">{c.value}</span></>}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-left hidden sm:block min-w-[110px]">
                    {c.signDate && <p className={`text-[11px] flex items-center gap-1 mb-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}><CalendarCheck size={10} />{c.signDate}</p>}
                    {c.expiry && <p className={`text-[11px] ${c.status === "expired" ? "text-red-400" : isDark ? "text-zinc-600" : "text-slate-300"}`}>{c.expiry}</p>}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={e => e.stopPropagation()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${isDark ? "text-zinc-700 hover:bg-white/[0.05] hover:text-zinc-300" : "text-slate-300 hover:bg-slate-100 hover:text-slate-600"}`}><Download size={14} /></button>
                    <CaretLeft size={14} className={`transition-transform mt-1 ${isExpanded ? "rotate-90" : ""} ${isDark ? "text-zinc-600" : "text-slate-300"}`} />
                  </div>
                </div>

                {/* Expanded detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className={`px-4 pb-4 pt-2 border-t ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>الإجراءات المتاحة</p>
                        <div className="flex flex-wrap gap-2">
                          {c.status === "draft" && (<>
                            <button onClick={() => changeStatus(c.id,"pending_sign")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-[#0B3D2E] text-[#C8A762]"><PaperPlaneTilt size={11}/>إرسال للتوقيع</button>
                            <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border ${isDark?"border-white/[0.08] text-zinc-300":"border-slate-200 text-slate-600"}`}><Pen size={11}/>تعديل</button>
                            <button onClick={() => archiveContract(c.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border ${isDark?"border-white/[0.08] text-zinc-400":"border-slate-200 text-slate-500"}`}><Archive size={11}/>أرشفة</button>
                            <button onClick={() => deleteContract(c.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border border-red-500/20 text-red-500"><Trash size={11}/>حذف</button>
                          </>)}
                                          {c.status === "active" && (<>
                            <button onClick={() => changeStatus(c.id,"pending_sign")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border ${isDark?"border-white/[0.08] text-zinc-300":"border-slate-200 text-slate-600"}`}><ArrowRight size={11}/>تجديد العقد</button>
                            <button onClick={() => showToast("تم نسخ رابط المشاركة")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border ${isDark?"border-white/[0.08] text-zinc-300":"border-slate-200 text-slate-600"}`}><Share size={11}/>مشاركة مع الموكل</button>
                            <button onClick={() => showToast("جارٍ تحميل PDF...")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border ${isDark?"border-white/[0.08] text-zinc-300":"border-slate-200 text-slate-600"}`}><Download size={11}/>PDF</button>
                            <button onClick={() => archiveContract(c.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border ${isDark?"border-white/[0.08] text-zinc-400":"border-slate-200 text-slate-500"}`}><Archive size={11}/>أرشفة</button>
                            <button onClick={() => changeStatus(c.id,"expired")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border border-red-500/20 text-red-500"><X size={11}/>إنهاء العقد</button>
                          </>)}
                          {c.status === "pending_sign" && (<>
                            <button onClick={() => showToast("تم إرسال التذكير")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20"><PaperPlaneTilt size={11}/>تذكير الطرف الثاني</button>
                            <button onClick={() => showToast("تم نسخ رابط التوقيع")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border ${isDark?"border-white/[0.08] text-zinc-300":"border-slate-200 text-slate-600"}`}><Share size={11}/>رابط التوقيع</button>
                            <button onClick={() => deleteContract(c.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border border-red-500/20 text-red-500"><X size={11}/>إلغاء</button>
                          </>)}
                          {c.status === "expired" && (<>
                            <button onClick={() => changeStatus(c.id,"pending_sign")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-[#0B3D2E] text-[#C8A762]"><ArrowRight size={11}/>تجديد</button>
                            <button onClick={() => archiveContract(c.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border ${isDark?"border-white/[0.08] text-zinc-300":"border-slate-200 text-slate-600"}`}><Archive size={11}/>أرشفة</button>
                            <button onClick={() => showToast("جارٍ تحميل PDF...")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border ${isDark?"border-white/[0.08] text-zinc-300":"border-slate-200 text-slate-600"}`}><Download size={11}/>PDF</button>
                          </>)}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>

      </> )}{/* end ACTIVE VIEW */}

      {/* ───────────── ARCHIVE VIEW ───────────── */}
      {viewMode === "archive" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Archive info banner */}
          <div className={`flex items-start gap-3 px-4 py-3 rounded-2xl border text-[12px] ${
            isDark ? "border-amber-500/15 bg-amber-500/5 text-amber-300" : "border-amber-100 bg-amber-50 text-amber-700"
          }`}>
            <Archive size={14} className="flex-shrink-0 mt-0.5" />
            <p>
              <strong>أرشيف العقود</strong> — يشمل العقود المنتهية تلقائياً والمؤرشفة يدوياً.
              العقود هنا للعرض فقط — يمكنك تجديد العقد أو استعادته للمسودات بضغطة واحدة.
            </p>
          </div>

          {/* Archive search */}
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
            isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"
          }`}>
            <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
            <input value={archiveSearch} onChange={e => setArchiveSearch(e.target.value)}
              placeholder="بحث في الأرشيف (اسم عقد، طرف، مبلغ، تاريخ...)"
              className={`flex-1 bg-transparent text-sm outline-none ${
                isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"
              }`} />
            {archiveSearch && (
              <button onClick={() => setArchiveSearch("")} className={`text-[11px] px-2 py-0.5 rounded-lg ${
                isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
              }`}>مسح</button>
            )}
          </div>

          {/* Archived contracts list */}
          {archivedFiltered.length === 0 ? (
            <EmptyState
              icon={<Archive />}
              title={archiveSearch ? "لم يُعثر على نتائج في الأرشيف" : "أرشيف العقود فارغ"}
              description="جميع العقود المنتهية تلقائياً والمؤرشفة يدوياً ستظهر هنا."
              action={archiveSearch ? { label: "عرض الكل", onClick: () => setArchiveSearch("") } : undefined}
            />
          ) : (
            <div className="space-y-2">
              {archivedFiltered.map((c, i) => {
                const sc = STATUS_CONFIG[c.status];
                const StatusIcon = STATUS_ICONS[c.status];
                return (
                  <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <div className={`group ${card} p-4 flex items-center gap-4 hover:border-amber-500/20 transition-all`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isDark ? "bg-amber-500/10" : "bg-amber-50"
                      }`}>
                        <FileText size={18} weight="duotone" className="text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <p className={`text-[14px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{c.title}</p>
                          <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${sc.color}`}>
                            <StatusIcon size={9} weight="fill" />{sc.label}
                          </span>
                          {c.manualArchive && (
                            <span className={`flex-shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full ${
                              isDark ? "bg-white/[0.05] text-zinc-500" : "bg-slate-100 text-slate-400"
                            }`}>مؤرشف يدوياً</span>
                          )}
                        </div>
                        <div className={`flex items-center gap-2 text-[11px] flex-wrap ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                          <span>{c.party}</span>
                          {c.value && <span className="text-[#C8A762] font-mono font-semibold">{c.value}</span>}
                          {c.expiry && <span>{c.expiry}</span>}
                        </div>
                      </div>
                      {/* Archive actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => { changeStatus(c.id, "pending_sign"); setViewMode("active"); showToast(`تم إرسال "${c.title}" للتجديد`); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border border-[#0B3D2E]/20 bg-[#0B3D2E]/8 text-[#0B3D2E] hover:bg-[#0B3D2E]/15 dark:border-emerald-700/30 dark:bg-emerald-900/20 dark:text-emerald-400 transition-all">
                          <ArrowRight size={11} />تجديد
                        </button>
                        <button onClick={() => restoreContract(c.id, c.title)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                            isDark
                              ? "border-white/[0.08] text-zinc-400 hover:border-white/[0.15] hover:text-zinc-200"
                              : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                          }`}>
                          <ArrowCounterClockwise size={11} />استعادة
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* New Contract Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
            <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96 }}
              className={`w-full max-w-md rounded-3xl p-6 shadow-2xl ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}>
              {/* Header */}
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>عقد جديد</h3>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>خطوة {modalStep} من 3</p>
                </div>
                <button onClick={closeModal} className={`w-8 h-8 flex items-center justify-center rounded-full ${isDark ? "bg-white/10 hover:bg-white/20" : "bg-slate-100 hover:bg-slate-200"}`}>
                  <span className="text-sm font-bold">✕</span>
                </button>
              </div>
              {/* Steps progress */}
              <div className="flex gap-1.5 mb-5">
                {[1,2,3].map(s => <div key={s} className={`flex-1 h-1 rounded-full transition-all ${s <= modalStep ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-800" : "bg-slate-100"}`} />)}
              </div>

              <AnimatePresence mode="wait">
                {/* Step 1: نوع العقد */}
                {modalStep === 1 && (
                  <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                    <p className={`text-[12px] font-bold mb-2 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>نوع العقد</p>
                    <div className="grid grid-cols-2 gap-2">
                      {CONTRACT_TYPES.map(t => (
                        <button key={t.id} onClick={() => setNewType(t.id)}
                          className={`px-3 py-2.5 rounded-xl border text-[12px] font-semibold text-right transition-all ${
                            newType === t.id ? "bg-[#0B3D2E] text-[#C8A762] border-[#0B3D2E]" : isDark ? "border-white/[0.08] text-zinc-300 hover:border-white/20" : "border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}>{t.label}</button>
                      ))}
                    </div>
                    <button disabled={!newType} onClick={() => setModalStep(2)}
                      className="w-full mt-2 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[13px] font-bold disabled:opacity-40">التالي</button>
                  </motion.div>
                )}

                {/* Step 2: الأطراف والتفاصيل */}
                {modalStep === 2 && (
                  <motion.div key="s2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                    <div>
                      <label className={`block text-[11px] font-bold mb-1 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>اسم العقد</label>
                      <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="مثال: عقد أتعاب — أحمد العتيبي"
                        className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-100" : "border-slate-200 bg-slate-50 text-slate-800"}`} />
                    </div>
                    <div>
                      <label className={`block text-[11px] font-bold mb-1 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>الطرف الثاني</label>
                      <input value={newParty} onChange={e => setNewParty(e.target.value)} placeholder="اسم الموكل أو الجهة"
                        className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-100" : "border-slate-200 bg-slate-50 text-slate-800"}`} />
                    </div>
                    <div>
                      <label className={`block text-[11px] font-bold mb-1 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>المبلغ / الأتعاب (اختياري)</label>
                      <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="مثال: ٢٠,٠٠٠ ﷼"
                        className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-100" : "border-slate-200 bg-slate-50 text-slate-800"}`} />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setModalStep(1)} className={`flex-1 py-2.5 rounded-xl border text-[12px] font-bold ${isDark ? "border-white/[0.08] text-zinc-300" : "border-slate-200 text-slate-600"}`}>السابق</button>
                      <button disabled={!newParty} onClick={() => setModalStep(3)} className="flex-1 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold disabled:opacity-40">التالي</button>
                    </div>
                  </motion.div>
                )}

                {/* Step 3: مراجعة وحفظ */}
                {modalStep === 3 && (
                  <motion.div key="s3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                    <div className={`rounded-2xl p-4 space-y-2 ${isDark ? "bg-zinc-800/60" : "bg-slate-50"}`}>
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>مراجعة العقد</p>
                      <p className={`text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{newTitle || `عقد جديد — ${newParty}`}</p>
                      <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{CONTRACT_TYPES.find(t => t.id === newType)?.label} · {newParty}</p>
                      {newValue && <p className="text-[11px] text-[#C8A762] font-mono font-bold">{newValue}</p>}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setModalStep(2)} className={`px-3 py-2.5 rounded-xl border text-[12px] font-bold ${isDark ? "border-white/[0.08] text-zinc-300" : "border-slate-200 text-slate-600"}`}>السابق</button>
                      <button onClick={saveDraft} className={`flex-1 py-2.5 rounded-xl border text-[12px] font-bold ${isDark ? "border-white/[0.08] text-zinc-300" : "border-slate-200 text-slate-600"}`}>حفظ مسودة</button>
                      <button onClick={sendSign} className="flex-1 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold">إرسال للتوقيع</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:20}}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] px-5 py-2.5 rounded-2xl text-[13px] font-bold text-white bg-[#0B3D2E] shadow-xl">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
