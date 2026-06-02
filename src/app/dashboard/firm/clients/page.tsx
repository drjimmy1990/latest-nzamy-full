"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  AddressBook, MagnifyingGlass, Plus, Gavel,
  Phone, Envelope, ArrowUpRight, CaretLeft,
  Buildings, User, ChatDots,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Modals ───────────────────────────────────────────────────────────────────

function AddClientModal({ onClose, isDark }: { onClose: () => void; isDark: boolean }) {
  const [done, setDone] = useState(false);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}>
        
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>إضافة موكل جديد</h3>
          <button onClick={onClose} className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
            X
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <span className="text-emerald-500 text-2xl font-bold">✓</span>
            </div>
            <p className={`font-bold text-[16px] ${isDark ? "text-white" : "text-zinc-900"}`}>تم إضافة الموكل بنجاح!</p>
            <p className={`text-[12px] mt-1 mb-4 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>تم إدراج ملف الموكل وبإمكانك الآن ربط القضايا به.</p>
            <button onClick={onClose} className="rounded-xl px-5 py-2 text-[13px] font-bold bg-[#0B3D2E] text-white">إغلاق</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>نوع الموكل</label>
              <div className="flex gap-2">
                <button className="flex-1 rounded-xl border border-royal bg-royal/10 py-2.5 text-[13px] font-bold text-royal">فرد</button>
                <button className={`flex-1 rounded-xl border py-2.5 text-[13px] font-semibold ${isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-slate-500"}`}>شركة</button>
              </div>
            </div>
            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الاسم الكامل</label>
              <input type="text" placeholder="الاسم الرباعي للموكل" className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>رقم الجوال</label>
                <input type="text" dir="ltr" placeholder="05x xxx xxxx" className={`w-full text-right rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`} />
              </div>
              <div>
                <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>البريد الإلكتروني</label>
                <input type="email" placeholder="email@example.com" className={`w-full text-right rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`} />
              </div>
            </div>
            <button onClick={() => setDone(true)} className="w-full rounded-xl bg-[#0B3D2E] py-2.5 text-[13px] font-bold text-[#C8A762] mt-2">إنشاء السجل</button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Types & Mock Data ─────────────────────────────────────────────────────────

type ClientType = "individual" | "corporate";

interface Client {
  id: string;
  name: string;
  type: ClientType;
  phone: string;
  email: string;
  activeCases: number;
  totalCases: number;
  joinDate: string;
  lastContact: string;
  assignee: string;
  status: "active" | "inactive";
}

const MOCK_CLIENTS: Client[] = [
  { id: "1", name: "شركة الأفق للتجارة",      type: "corporate",  phone: "٠٥٠‑٢٣٤‑٥٦٧٨", email: "legal@alfuq.sa",      activeCases: 2, totalCases: 4, joinDate: "يناير ٢٠٢٣",   lastContact: "أمس",         assignee: "أ. سارة المنصور", status: "active" },
  { id: "2", name: "أحمد الزاهد",              type: "individual", phone: "٠٥٥‑١٢٣‑٤٥٦٧", email: "ahmed@gmail.com",      activeCases: 1, totalCases: 1, joinDate: "مارس ٢٠٢٤",    lastContact: "منذ ٣ أيام",  assignee: "أ. تركي العمر",   status: "active" },
  { id: "3", name: "خالد محمد القحطاني",        type: "individual", phone: "٠٥٦‑٩٨٧‑٦٥٤٣", email: "khalid.q@hotmail.com", activeCases: 1, totalCases: 2, joinDate: "فبراير ٢٠٢٤",  lastContact: "اليوم",        assignee: "أ. نورة الشمري",  status: "active" },
  { id: "4", name: "سارة الدوسري",              type: "individual", phone: "٠٥٩‑٤٤٤‑٣٣٢٢", email: "sara.d@yahoo.com",     activeCases: 1, totalCases: 1, joinDate: "أبريل ٢٠٢٤",   lastContact: "منذ أسبوع",   assignee: "أ. سارة المنصور", status: "active" },
  { id: "5", name: "ريم المطيري",               type: "individual", phone: "٠٥١‑٧٧٧‑٨٨٩٩", email: "reem@outlook.com",     activeCases: 1, totalCases: 1, joinDate: "نوفمبر ٢٠٢٣",  lastContact: "منذ شهر",      assignee: "أ. خالد الحربي",  status: "active" },
  { id: "6", name: "المجموعة الخليجية",          type: "corporate",  phone: "٠١١‑٢٢٢‑٣٣٣٣", email: "legal@gulf-group.sa",  activeCases: 0, totalCases: 2, joinDate: "يوليو ٢٠٢٢",   lastContact: "منذ شهرين",   assignee: "أ. تركي العمر",   status: "inactive" },
  { id: "7", name: "شركة الإبداع التقني",        type: "corporate",  phone: "٠٥٣‑٦٦٦‑٧٧٧٧", email: "info@ibda3tech.sa",    activeCases: 1, totalCases: 1, joinDate: "مارس ٢٠٢٤",    lastContact: "منذ ٥ أيام",  assignee: "أ. نورة الشمري",  status: "active" },
  { id: "8", name: "مجموعة الذهبي",             type: "corporate",  phone: "٠٥٤‑١١١‑٢٢٢٣", email: "contracts@dhahbi.sa",  activeCases: 1, totalCases: 1, joinDate: "أبريل ٢٠٢٤",   lastContact: "اليوم",        assignee: "أ. خالد الحربي",  status: "active" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FirmClientsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ClientType | "all">("all");
  const [showAddClient, setShowAddClient] = useState(false);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = MOCK_CLIENTS.filter(c => {
    const matchType   = typeFilter === "all" || c.type === typeFilter;
    const matchSearch = !search || c.name.includes(search) || c.email.includes(search) || c.assignee.includes(search);
    return matchType && matchSearch;
  });

  return (
    <div className="max-w-[1200px] mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            دليل الموكلين
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {MOCK_CLIENTS.length} موكل — {MOCK_CLIENTS.filter(c => c.status === "active").length} نشط
          </p>
        </div>
        <div className="flex gap-2">
          <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <ChatDots size={15} />
            تواصل جماعي
          </button>
          <button onClick={() => setShowAddClient(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
            <Plus size={15} weight="bold" />
            موكل جديد
          </button>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex flex-col sm:flex-row gap-3">
        <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو البريد أو المحامي المكلّف..."
            className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
        </div>
        <div className="flex gap-1.5">
          {([
            { key: "all",        label: "الكل",         count: MOCK_CLIENTS.length },
            { key: "individual", label: "أفراد",        count: MOCK_CLIENTS.filter(c => c.type === "individual").length },
            { key: "corporate",  label: "شركات",        count: MOCK_CLIENTS.filter(c => c.type === "corporate").length },
          ] as { key: ClientType | "all"; label: string; count: number }[]).map(f => (
            <button key={f.key} onClick={() => setTypeFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all flex-shrink-0 ${typeFilter === f.key
                ? "bg-royal text-white border-royal"
                : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"
              }`}>
              {f.key === "individual" ? <User size={12} /> : f.key === "corporate" ? <Buildings size={12} /> : null}
              {f.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${typeFilter === f.key ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Clients grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.length === 0 ? (
          <div className={`md:col-span-2 ${card} p-12 text-center`}>
            <AddressBook size={36} weight="duotone" className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
            <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد نتائج مطابقة</p>
          </div>
        ) : filtered.map((c, i) => (
          <motion.div key={c.id}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className={`group ${card} p-4 hover:border-royal/20 transition-all cursor-pointer`}>

            <div className="flex items-start gap-3 mb-3">
              {/* Avatar */}
              <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center font-bold text-sm ${
                c.type === "corporate"
                  ? "bg-blue-500/10 text-blue-500"
                  : "bg-royal/10 text-royal"
              }`}>
                {c.type === "corporate" ? <Buildings size={17} weight="duotone" /> : c.name.charAt(0)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-[14px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                    {c.name}
                  </p>
                  <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    c.status === "active"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : isDark ? "bg-white/[0.04] text-zinc-600" : "bg-slate-100 text-slate-400"
                  }`}>
                    {c.status === "active" ? "نشط" : "غير نشط"}
                  </span>
                </div>
                <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{c.type === "corporate" ? "شركة" : "فرد"}</p>
              </div>

              {/* Cases count */}
              <div className="text-center flex-shrink-0">
                <p className={`text-lg font-bold font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{c.activeCases}</p>
                <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>قضية نشطة</p>
              </div>
            </div>

            {/* Contact */}
            <div className={`space-y-1.5 pt-3 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
              <div className={`flex items-center gap-2 text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                <Phone size={12} /><span dir="ltr">{c.phone}</span>
              </div>
              <div className={`flex items-center gap-2 text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                <Envelope size={12} /><span dir="ltr">{c.email}</span>
              </div>
            </div>

            {/* Footer */}
            <div className={`flex items-center justify-between mt-3 pt-2 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
              <span className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                مكلّف: <span className={isDark ? "text-zinc-400" : "text-slate-600"}>{c.assignee}</span>
              </span>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] ${isDark ? "text-zinc-700" : "text-slate-300"}`}>آخر تواصل: {c.lastContact}</span>
                <ArrowUpRight size={13} className={`transition-colors ${isDark ? "text-zinc-700 group-hover:text-royal" : "text-slate-300 group-hover:text-royal"}`} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        className={`${card} p-4 grid grid-cols-2 sm:grid-cols-4 gap-4`}>
        {[
          { label: "إجمالي الموكلين",  value: MOCK_CLIENTS.length,                                              color: "text-royal",       bg: "bg-royal/8" },
          { label: "شركات",            value: MOCK_CLIENTS.filter(c => c.type === "corporate").length,          color: "text-blue-500",    bg: "bg-blue-500/8" },
          { label: "أفراد",            value: MOCK_CLIENTS.filter(c => c.type === "individual").length,         color: "text-purple-500",  bg: "bg-purple-500/8" },
          { label: "قضايا نشطة",       value: MOCK_CLIENTS.reduce((sum, c) => sum + c.activeCases, 0),          color: "text-emerald-500", bg: "bg-emerald-500/8" },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl p-3 ${s.bg} text-center`}>
            <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{s.label}</p>
          </div>
        ))}
      </motion.div>

      {showAddClient && <AddClientModal onClose={() => setShowAddClient(false)} isDark={isDark} />}
    </div>
  );
}
