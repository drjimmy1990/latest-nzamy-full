"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, MagnifyingGlass, Plus, Phone, Gavel, Clock, CaretLeft,
  Buildings, CheckCircle, Warning, Star,
  XCircle, SortAscending, ArrowRight, X, Check,
  ListChecks, CalendarCheck, Dot,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { CLIENT_CASES, CLIENT_TASKS } from "@/app/dashboard/lawyer/_data/clientLinks";
import EmptyState from "@/components/ui/EmptyState";


import { type Client, type ClientFlag, type SortKey, MOCK_CLIENTS, FLAG_CONFIG } from "@/constants/lawyerClientsData";
import AddClientModal from "@/components/dashboard/lawyer/AddClientModal";
import ClientDrawer from "@/components/dashboard/lawyer/ClientDrawer";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientsPage() {

  const { isDark } = useTheme();

  const [search,     setSearch]     = useState("");
  const [clients,    setClients]    = useState<Client[]>(MOCK_CLIENTS);
  const [activeFlags, setActiveFlags] = useState<Set<ClientFlag>>(new Set());
  const [sortKey,    setSortKey]    = useState<SortKey>("lastContact");
  const [showModal,  setShowModal]  = useState(false);
  const [drawerClient, setDrawerClient] = useState<Client | null>(null);
  const [clientView,   setClientView]   = useState<"active" | "archive">("active"); // S82
  const [archiveSearch, setArchiveSearch] = useState(""); // S82

  // S82: auto-inactive = activeCases===0 AND (has inactive flag OR lastContact implies old)
  // manual flag: inactive
  // auto: activeCases === 0 (no current work)
  const isArchived = (c: Client) => c.activeCases === 0 || c.flags.includes("inactive");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const toggleFlag = (f: ClientFlag) =>
    setActiveFlags(prev => { const s = new Set(prev); s.has(f) ? s.delete(f) : s.add(f); return s; });

  const filtered = useMemo(() => {
    const base = clientView === "archive"
      ? clients.filter(isArchived)
      : clients.filter(c => !isArchived(c));
    const q = archiveSearch.trim().toLowerCase();
    return base.filter(c => {
      const matchSearch = !search || c.name.includes(search) || c.phone.includes(search);
      const matchFlags  = activeFlags.size === 0 || [...activeFlags].every(f => c.flags.includes(f));
      const matchArchiveQ = clientView !== "archive" || !q ||
        c.name.toLowerCase().includes(q) || c.phone.includes(q);
      return matchSearch && matchFlags && matchArchiveQ;
    }).sort((a, b) => {
      if (sortKey === "name")        return a.name.localeCompare(b.name);
      if (sortKey === "activeCases") return b.activeCases - a.activeCases;
      if (sortKey === "unpaid")      return (b.totalFees - b.paidFees) - (a.totalFees - a.paidFees);
      if (sortKey === "rating")      return b.rating - a.rating;
      return 0;
    });
  }, [clients, search, activeFlags, sortKey, clientView, archiveSearch]);

  const totalUnpaid = clients.reduce((acc, c) => acc + (c.totalFees - c.paidFees), 0);
  const badClients  = clients.filter(c => c.flags.includes("bad") || c.flags.includes("late_pay")).length;

  const onAdd = (c: Client) => setClients(prev => [c, ...prev]);

  return (
    <>
    <AnimatePresence>
      {drawerClient && <ClientDrawer client={drawerClient} isDark={isDark} onClose={() => setDrawerClient(null)} />}
    </AnimatePresence>
    <div className="max-w-[1100px] mx-auto space-y-5" dir="rtl">

      {/* Add Client Modal */}
      {showModal && <AddClientModal isDark={isDark} onClose={() => setShowModal(false)} onAdd={onAdd} />}

      {/* Warning banner */}
      {badClients > 0 && totalUnpaid > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className={`p-3.5 rounded-2xl border flex items-center gap-3 ${isDark ? "border-red-500/20 bg-red-500/5" : "border-red-200 bg-red-50"}`}>
          <Warning size={16} className="text-red-500 flex-shrink-0" />
          <p className="text-[12px] text-red-600 dark:text-red-400 flex-1 font-medium">
            <strong>{totalUnpaid.toLocaleString()} ﷼</strong> أتعاب غير مسددة · {badClients} عملاء يحتاجون متابعة عاجلة
          </p>
          <button onClick={() => { setActiveFlags(new Set(["late_pay"])); setSortKey("unpaid"); }}
            className="text-[11px] font-bold text-red-500 hover:underline flex-shrink-0">
            عرض فقط
          </button>
        </motion.div>
      )}

      {/* S82: Active / Archive toggle */}
      <div className={`flex items-center gap-1 p-1 rounded-2xl w-fit ${
        isDark ? "bg-zinc-800/70 border border-white/[0.05]" : "bg-slate-100 border border-slate-200/60"
      }`}>
        {([
          { key: "active" as const, label: "الموكلون النشطون", count: clients.filter(c => !isArchived(c)).length },
          { key: "archive" as const, label: "غير نشطين / أرشيف", count: clients.filter(isArchived).length },
        ]).map(tab => (
          <button key={tab.key} onClick={() => { setClientView(tab.key); setArchiveSearch(""); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold transition-all ${
              clientView === tab.key
                ? isDark ? "bg-zinc-700 text-white shadow-sm" : "bg-white text-[#0B3D2E] shadow-sm"
                : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
            }`}>
            {tab.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
              clientView === tab.key
                ? isDark ? "bg-white/15 text-white" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
                : isDark ? "bg-white/[0.05] text-zinc-600" : "bg-slate-200 text-slate-400"
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Archive search — only in archive mode */}
      {clientView === "archive" && (
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
          isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"
        }`}>
          <MagnifyingGlass size={14} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input
            value={archiveSearch}
            onChange={e => setArchiveSearch(e.target.value)}
            placeholder="ابحث في الأرشيف (اسم موكل، رقم الهاتف...)"
            className={`flex-1 bg-transparent text-[13px] outline-none ${
              isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"
            }`}
          />
          {archiveSearch && (
            <button onClick={() => setArchiveSearch("")}
              className={`text-[11px] px-2 py-0.5 rounded-lg ${
                isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
              }`}>مسح</button>
          )}
        </div>
      )}

      {/* Archive context note */}
      {clientView === "archive" && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] ${
          isDark ? "bg-amber-500/5 border border-amber-500/15 text-amber-400" : "bg-amber-50 border border-amber-200 text-amber-700"
        }`}>
          <span>⚠️</span>
          <span>العملاء هنا ليس لديهم قضايا نشطة حالياً أو تم تصنيفهم يدوياً كغير نشطين. لم يتم حذفهم — تستطيع استعادتهم في أي وقت.</span>
        </div>
      )}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            {clientView === "archive" ? "أرشيف الموكلين" : "الموكلّون"}
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {filtered.length} موكّل · {clientView === "active" ? `${clients.filter(c => !isArchived(c) && c.activeCases > 0).length} نشطون` : "تاريخ سابق — سجل دائم"}
          </p>
        </div>
        {clientView === "active" && (
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors self-start">
          <Plus size={15} weight="bold" />إضافة موكّل
        </button>
        )}
      </motion.div>

      {/* Smart Filter Flags */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          فلترة ذكية
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(FLAG_CONFIG) as [ClientFlag, typeof FLAG_CONFIG[ClientFlag]][]).map(([flag, conf]) => {
            const count   = MOCK_CLIENTS.filter(c => c.flags.includes(flag)).length;
            if (count === 0) return null;
            const active  = activeFlags.has(flag);
            return (
              <button key={flag} onClick={() => toggleFlag(flag)} title={conf.desc}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                  active ? conf.bg + " " + conf.color + " border-current/30" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500"
                }`}>
                <span>{conf.emoji}</span>
                {conf.label}
                <span className={`text-[9px] rounded-full px-1.5 py-0.5 ${active ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>{count}</span>
              </button>
            );
          })}
          {activeFlags.size > 0 && (
            <button onClick={() => setActiveFlags(new Set())}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-500 px-2 py-1.5">
              <XCircle size={12} /> مسح الفلتر
            </button>
          )}
        </div>
      </motion.div>

      {/* Search + Sort */}
      <div className="flex gap-3 flex-col sm:flex-row">
        <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو الهاتف..."
            className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
        </div>
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[12px] ${isDark ? "border-white/[0.06] bg-zinc-900/60 text-zinc-400" : "border-slate-200 bg-white text-slate-500"}`}>
          <SortAscending size={14} />
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
            className="bg-transparent outline-none text-[12px] cursor-pointer">
            <option value="lastContact">آخر تواصل</option>
            <option value="activeCases">القضايا النشطة</option>
            <option value="unpaid">الأتعاب المتأخرة</option>
            <option value="rating">التقييم</option>
            <option value="name">الاسم</option>
          </select>
        </div>
      </div>

      {/* Client Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.length === 0 ? (
          <div className="col-span-2">
            <EmptyState
              icon={<User />}
              title="لا يوجد موكّلون مطابقون"
              description="لم يتم العثور على موكّلين يطابقون شروط البحث أو الفلترة الحالية."
              action={{ label: "إضافة موكّل", onClick: () => setShowModal(true) }}
            />
          </div>
        ) : filtered.map((client, i) => {
          const unpaid  = client.totalFees - client.paidFees;
          const payPct  = client.totalFees ? Math.round((client.paidFees / client.totalFees) * 100) : 100;
          const hasBad   = client.flags.includes("bad");
          const hasLatePay = client.flags.includes("late_pay");
          return (
            <motion.div key={client.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}>
              <div onClick={() => setDrawerClient(client)}
                className={`block group cursor-pointer ${card} overflow-hidden transition-all hover:border-royal/30 hover:shadow-lg hover:-translate-y-0.5 ${hasBad ? isDark ? "border-orange-500/20" : "border-orange-200" : ""}`}>
                {/* Header area */}
                <div className="p-4 pb-3">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm ${client.type === "company" ? "bg-indigo-500/10 text-indigo-500" : hasBad ? "bg-orange-500/10 text-orange-500" : "bg-royal/10 text-royal"}`}>
                      {client.type === "company" ? <Buildings size={20} weight="duotone" /> : client.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-1">
                        <p className={`text-[14px] font-bold truncate flex-1 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{client.name}</p>
                        {/* Stars */}
                        <div className="flex flex-shrink-0">
                          {Array.from({ length: 5 }).map((_, si) => (
                            <Star key={si} size={10} weight={si < client.rating ? "fill" : "regular"}
                              className={si < client.rating ? "text-amber-400" : isDark ? "text-zinc-700" : "text-slate-200"} />
                          ))}
                        </div>
                      </div>
                      {/* Flags */}
                      <div className="flex flex-wrap gap-1 mb-1">
                        {client.flags.map(f => {
                          const fc = FLAG_CONFIG[f];
                          return (
                            <span key={f} className={`text-[9px] font-bold px-1.5 rounded-full ${fc.bg} ${fc.color}`}>
                              {fc.emoji} {fc.label}
                            </span>
                          );
                        })}
                      </div>
                      <div className={`flex items-center gap-3 text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                        <span className="flex items-center gap-0.5"><Clock size={9} />{client.lastContact}</span>
                        <span className="flex items-center gap-0.5"><Phone size={9} /><span dir="ltr">{client.phone}</span></span>

                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <ArrowRight size={16} className={`opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0 ${isDark ? "text-zinc-500" : "text-slate-400"}`} />
                    </div>
                  </div>
                </div>

                {/* Fee progress */}
                {client.totalFees > 0 && (
                  <div className="px-4 pb-3">
                    <div className={`flex items-center justify-between text-[10px] mb-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                      <span>الأتعاب المسددة</span>
                      <span className={hasLatePay && unpaid > 0 ? "text-red-500 font-bold" : ""}>
                        {client.paidFees.toLocaleString()} / {client.totalFees.toLocaleString()} ﷼
                      </span>
                    </div>
                    <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                      <div
                        className={`h-full rounded-full transition-all ${payPct === 100 ? "bg-emerald-500" : payPct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${payPct}%` }} />
                    </div>
                  </div>
                )}

                {/* Stats row */}
                <div className={`grid grid-cols-3 border-t text-center ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
                  {[
                    { v: client.activeCases,                           label: "نشطة",    c: client.activeCases > 0 ? "text-royal" : isDark ? "text-zinc-500" : "text-slate-400" },
                    { v: client.closedCases,                           label: "مغلقة",   c: isDark ? "text-zinc-500" : "text-slate-400" },
                    { v: (unpaid > 0 ? unpaid.toLocaleString() + " ﷼" : "✓"), label: "متبقي", c: unpaid > 0 ? "text-red-500" : "text-emerald-500" },
                  ].map((s, si) => (
                    <div key={si} className={`py-2.5 text-center ${si < 2 ? (isDark ? "border-l border-white/[0.05]" : "border-l border-slate-100") : ""}`}>
                      <p className={`text-[13px] font-bold ${s.c}`}>{s.v}</p>
                      <p className={`text-[9px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{s.label}</p>
                    </div>
                  ))}
                </div>

              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
    </>
  );
}
