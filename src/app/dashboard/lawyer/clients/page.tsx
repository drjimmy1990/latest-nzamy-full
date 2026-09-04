"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, MagnifyingGlass, Plus, Phone, Clock,
  Buildings, Warning, Star, ArrowClockwise,
  XCircle, SortAscending, ArrowRight,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import EmptyState from "@/components/ui/EmptyState";
import { itemsOf, listViewState } from "@/lib/services/listRead";

import { type ClientFlag, type SortKey, FLAG_CONFIG } from "@/constants/lawyerClientsData";
import { getLawyerClients, type LawyerClient } from "@/lib/services/lawyerClientsService";
import AddClientModal from "@/components/dashboard/lawyer/AddClientModal";
import ClientDrawer from "@/components/dashboard/lawyer/ClientDrawer";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientsPage() {

  const { isDark } = useTheme();

  const [search,     setSearch]     = useState("");
  const [read,       setRead]       = useState<Awaited<ReturnType<typeof getLawyerClients>> | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [activeFlags, setActiveFlags] = useState<Set<ClientFlag>>(new Set());
  const [sortKey,    setSortKey]    = useState<SortKey>("lastContact");
  const [showModal,  setShowModal]  = useState(false);
  const [drawerClient, setDrawerClient] = useState<LawyerClient | null>(null);
  const [clientView,   setClientView]   = useState<"active" | "archive">("active"); // S82
  const [archiveSearch, setArchiveSearch] = useState(""); // S82

  const viewState = listViewState(loading, read);
  const clients = itemsOf(read);
  const loadError = viewState === "unreadable" ? "تعذّر تحميل دليل الموكّلين." : null;

  // S82: archived = the status recorded on the card, not a guess derived from
  // whether the client currently has an in-flight request. `status` is a real
  // column on public.lawyer_clients (migration 20260903_phase2) — the old
  // heuristic (`activeRequests === 0 || flags.includes("inactive")`) existed
  // only because there was no such column to read.
  const isArchived = (c: LawyerClient) => c.status !== "active";

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
      const matchSearch = !search || c.name.includes(search) || (c.phone ?? "").includes(search);
      const matchFlags  = activeFlags.size === 0 || [...activeFlags].every(f => c.flags.includes(f));
      const matchArchiveQ = clientView !== "archive" || !q ||
        c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q);
      return matchSearch && matchFlags && matchArchiveQ;
    }).sort((a, b) => {
      if (sortKey === "name")        return a.name.localeCompare(b.name);
      if (sortKey === "activeCases") return b.activeCount - a.activeCount;
      // Clients with no fee agreement and clients with no rating sort last
      // rather than being treated as 0 / 3 — they are unknown, not lowest.
      if (sortKey === "unpaid")      return outstandingOf(b) - outstandingOf(a);
      if (sortKey === "rating")      return (b.rating ?? -1) - (a.rating ?? -1);
      // «آخر نشاط», newest first. ISO-8601 is lexicographically ordered by
      // construction, so a plain string compare is the correct one here.
      // A client with no activity on record sorts last rather than first.
      const la = a.lastActivity ?? "";
      const lb = b.lastActivity ?? "";
      if (la === lb) return 0;
      return lb > la ? 1 : -1;
    });
  }, [clients, search, activeFlags, sortKey, clientView, archiveSearch]);

  /**
   * True only when the directory on screen is the directory the server holds.
   *
   * `clients` is `[]` in three different situations — before the first fetch
   * resolves, after one fails, and when the lawyer genuinely has no clients —
   * and only the third one licenses a number.
   */
  const countsKnown = viewState !== "loading" && viewState !== "unreadable";

  const onCreated = (c: LawyerClient) => {
    setRead(prev => prev && prev.ok
      ? { ...prev, items: [c, ...prev.items], total: prev.total === null ? null : prev.total + 1 }
      : prev);
  };

  // ─── Fetch clients ───────────────────────────────────────────────────────────
  const loadClients = useCallback(() => {
    setLoading(true);
    getLawyerClients().then((res) => {
      setRead(res);
      setLoading(false);
    });
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);

  return (
    <>
    <AnimatePresence>
      {drawerClient && <ClientDrawer client={drawerClient} isDark={isDark} onClose={() => setDrawerClient(null)} />}
    </AnimatePresence>
    <div className="max-w-[1100px] mx-auto space-y-5" dir="rtl">

      {/* Could-not-read banner. Distinct from an empty directory: this one says
          the read failed and offers to run it again. */}
      {loadError && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex items-center gap-3 ${isDark ? "border-red-500/20 bg-red-500/5" : "border-red-200 bg-red-50"}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-red-500/15" : "bg-red-100"}`}>
            <Warning size={18} weight="fill" className="text-red-500" />
          </div>
          <div className="flex-1">
            <p className={`text-[13px] font-bold ${isDark ? "text-red-400" : "text-red-700"}`}>{loadError}</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-red-600/70"}`}>القائمة أدناه غير مكتملة — لا تعتمد عليها حتى ينجح التحميل.</p>
          </div>
          <button onClick={loadClients}
            className="flex items-center gap-1.5 text-[11px] font-bold text-red-500 hover:underline flex-shrink-0">
            <ArrowClockwise size={13} /> إعادة المحاولة
          </button>
        </motion.div>
      )}

      {/* Genuinely empty directory — no clients yet, and the read succeeded. */}
      {viewState === "empty" && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex items-center gap-3 ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
            <User size={18} weight="duotone" className={isDark ? "text-zinc-400" : "text-slate-400"} />
          </div>
          <div>
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>لا يوجد موكّلون بعد</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>أضف موكّلاً جديداً، أو انتظر أول طلب يُوجَّه إليك من المنصة.</p>
          </div>
        </motion.div>
      )}

      {/* Add Client Modal */}
      {showModal && <AddClientModal isDark={isDark} onClose={() => setShowModal(false)} onCreated={onCreated} />}

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
            {/* Number only when a read is behind it — see `countsKnown`. */}
            {countsKnown && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                clientView === tab.key
                  ? isDark ? "bg-white/15 text-white" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
                  : isDark ? "bg-white/[0.05] text-zinc-600" : "bg-slate-200 text-slate-400"
              }`}>{tab.count}</span>
            )}
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

      {/* Archive context note. States what `status` actually means — a real
          column on public.lawyer_clients, not the old heuristic — and does not
          promise a restore control that does not exist on this screen. */}
      {clientView === "archive" && (
        <div className={`flex items-start gap-2 px-3 py-2 rounded-xl text-[11px] leading-relaxed ${
          isDark ? "bg-amber-500/5 border border-amber-500/15 text-amber-400" : "bg-amber-50 border border-amber-200 text-amber-700"
        }`}>
          <span className="flex-shrink-0">⚠️</span>
          <span>يظهر هنا الموكّلون الذين حالتهم المسجّلة في النظام «غير نشط» أو «مؤرشف». لا توجد أداة على هذه الشاشة لتعديل حالة الموكّل بعد حفظه.</span>
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
            {viewState === "loading"
              ? "جارٍ التحميل…"
              : loadError
                ? <span className="text-red-500 font-semibold">تعذّرت قراءة الدليل — العدد غير معروف</span>
                : `${filtered.length} موكّل · ${clientView === "active" ? `${clients.filter(c => !isArchived(c) && c.activeCount > 0).length} لديهم طلبات نشطة` : "تاريخ سابق — سجل دائم"}`}
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
            const count   = clients.filter(c => c.flags.includes(flag)).length;
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
            <option value="lastContact">آخر نشاط</option>
            <option value="activeCases">الطلبات النشطة</option>
            <option value="unpaid">الأتعاب المتبقية</option>
            <option value="rating">التقييم</option>
            <option value="name">الاسم</option>
          </select>
        </div>
      </div>

      {/* Client Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {viewState === "loading" ? (
          <div className="col-span-2 flex flex-col items-center justify-center gap-3 py-14">
            <div className="inline-block w-7 h-7 rounded-full border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] animate-spin" />
            <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جارٍ تحميل دليل الموكّلين…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-2">
            {/* THREE nothings, not two. «لا يوجد موكّلون مطابقون» blames the
                search box, and it was printed for a lawyer with no clients at
                all — whose search is not at fault and for whom resetting a
                filter changes nothing. Same distinction the cases page draws
                between «لا توجد قضايا بعد» and «لا توجد قضايا مطابقة». */}
            <EmptyState
              icon={<User />}
              title={loadError
                ? "تعذّر تحميل القائمة"
                : clients.length === 0 ? "لا يوجد موكّلون بعد" : "لا يوجد موكّلون مطابقون"}
              description={loadError
                ? "فشلت قراءة دليل الموكّلين — هذه ليست قائمة فارغة، بل قراءة لم تنجح."
                : clients.length === 0
                  ? "أضف موكّلاً جديداً، أو انتظر أول طلب يُوجَّه إليك من المنصة."
                  : "لم يتم العثور على موكّلين يطابقون شروط البحث أو الفلترة الحالية."}
              action={loadError
                ? { label: "إعادة المحاولة", onClick: loadClients }
                : { label: "إضافة موكّل", onClick: () => setShowModal(true) }}
            />
          </div>
        ) : filtered.map((client, i) => {
          // A fee agreement is on record only when a POSITIVE total is, and the
          // paid figure is independently nullable — an agreed total with no
          // advance recorded yet is a real state, not an error.
          const hasTotal = client.feeTotalSar !== null && client.feeTotalSar > 0;
          const hasPaid = client.feePaidSar !== null;
          const outstanding = hasTotal && hasPaid ? (client.feeTotalSar as number) - (client.feePaidSar as number) : null;
          const payPct = hasTotal && hasPaid
            ? Math.round(((client.feePaidSar as number) / (client.feeTotalSar as number)) * 100)
            : 0;

          // The «متبقٍّ» cell exists only when a fee agreement AND an advance
          // are both on record. It used to be unconditional, with both figures
          // hardcoded to 0, so every client on the page showed a green «✓».
          const cells: { v: string | number; label: string; c: string }[] = [
            { v: client.activeCount, label: "طلبات نشطة", c: client.activeCount > 0 ? "text-royal" : isDark ? "text-zinc-500" : "text-slate-400" },
            { v: client.closedCount, label: "مغلقة", c: isDark ? "text-zinc-500" : "text-slate-400" },
          ];
          if (outstanding !== null) {
            cells.push({
              v: outstanding > 0 ? outstanding.toLocaleString() + " ﷼" : "مسدَّدة",
              label: "متبقٍّ",
              c: outstanding > 0 ? "text-red-500" : "text-emerald-500",
            });
          }

          const lastContact = formatContactDate(client.lastActivity);

          return (
            <motion.div key={client.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}>
              <div onClick={() => setDrawerClient(client)}
                className={`block group cursor-pointer ${card} overflow-hidden transition-all hover:border-royal/30 hover:shadow-lg hover:-translate-y-0.5`}>
                {/* Header area */}
                <div className="p-4 pb-3">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm ${client.clientType === "company" ? "bg-indigo-500/10 text-indigo-500" : "bg-royal/10 text-royal"}`}>
                      {client.clientType === "company" ? <Buildings size={20} weight="duotone" /> : client.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-1">
                        <p className={`text-[14px] font-bold truncate flex-1 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{client.name}</p>
                        {/* Stars only for a client the lawyer actually rated. */}
                        {client.rating !== null && (
                          <div className="flex flex-shrink-0">
                            {Array.from({ length: 5 }).map((_, si) => (
                              <Star key={si} size={10} weight={si < (client.rating ?? 0) ? "fill" : "regular"}
                                className={si < (client.rating ?? 0) ? "text-amber-400" : isDark ? "text-zinc-700" : "text-slate-200"} />
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Source chip — a real platform account vs. a card typed
                          into AddClientModal are not the same kind of record.
                          A2: a "profile" row also gets a subtle hint pointing
                          at where a card actually gets made — the full client
                          file (ClientDrawer/[id]/page.tsx) — not a second
                          "create card" flow duplicated on this card. */}
                      <p className={`text-[9px] font-bold mb-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                        {client.source === "profile" ? "حساب على المنصّة" : "بطاقة"}
                        {client.source === "profile" && (
                          <span className={`font-semibold ${isDark ? "text-zinc-700" : "text-slate-300"}`}> · بلا بطاقة — أنشئ بطاقة من الملف</span>
                        )}
                      </p>
                      {/* Flags */}
                      {client.flags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {client.flags.map(f => {
                            const fc = FLAG_CONFIG[f];
                            if (!fc) return null;
                            return (
                              <span key={f} className={`text-[9px] font-bold px-1.5 rounded-full ${fc.bg} ${fc.color}`}>
                                {fc.emoji} {fc.label}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <div className={`flex items-center gap-3 text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                        {lastContact && <span className="flex items-center gap-0.5"><Clock size={9} />{lastContact}</span>}
                        {client.phone && <span className="flex items-center gap-0.5"><Phone size={9} /><span dir="ltr">{client.phone}</span></span>}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <ArrowRight size={16} className={`opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0 ${isDark ? "text-zinc-500" : "text-slate-400"}`} />
                    </div>
                  </div>
                </div>

                {/* Fee progress */}
                {hasTotal && hasPaid && (
                  <div className="px-4 pb-3">
                    <div className={`flex items-center justify-between text-[10px] mb-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                      <span>الأتعاب المسددة</span>
                      <span>
                        {(client.feePaidSar as number).toLocaleString()} / {(client.feeTotalSar as number).toLocaleString()} ﷼
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
                <div className={`grid ${cells.length === 3 ? "grid-cols-3" : "grid-cols-2"} border-t text-center ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
                  {cells.map((s, si) => (
                    <div key={si} className={`py-2.5 text-center ${si < cells.length - 1 ? (isDark ? "border-l border-white/[0.05]" : "border-l border-slate-100") : ""}`}>
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

/** ISO timestamp → a readable Arabic date, or "" when there is nothing to show. */
function formatContactDate(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/** Outstanding fees, or 0 when the client has no fee agreement (or no advance)
 *  on record. Used only for totals and sorting — never for display, where an
 *  unknown balance must be omitted rather than shown as a settled account. */
function outstandingOf(c: LawyerClient): number {
  if (c.feeTotalSar === null || c.feePaidSar === null) return 0;
  return c.feeTotalSar - c.feePaidSar;
}
