"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  AddressBook, MagnifyingGlass, Buildings, Warning,
  Star, ArrowClockwise, Phone, Plus,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import EmptyState from "@/components/ui/EmptyState";
import { itemsOf, listViewState } from "@/lib/services/listRead";
import { getLawyerClients } from "@/lib/services/lawyerClientsService";
import { type ClientFlag, FLAG_CONFIG } from "@/constants/lawyerClientsData";
import AddClientModal from "@/components/dashboard/lawyer/AddClientModal";

/**
 * The firm's client directory — read through the SAME endpoint and DTO the
 * lawyer directory uses. RLS on public.lawyer_clients (migration
 * 20260903_phase2) returns owner-or-active-firm-member rows, so a firm
 * account calling getLawyerClients() gets the firm's cards, not one lawyer's.
 *
 * There used to be a local `MOCK_CLIENTS` array (eight invented clients with
 * a fabricated `assignee` name each) and a local `AddClientModal` whose
 * "success" screen set `done = true` on click without writing anything —
 * a fabricated confirmation for a save that never happened. Both are gone.
 *
 * The add button reuses the SAME AddClientModal the lawyer directory uses —
 * it is a generic component (name/type/flags/fees, no lawyer-specific
 * assumption) and POST /api/v1/lawyer/clients already authorizes
 * `assertRole(["lawyer", "firm"])`, with RLS insert on public.lawyer_clients
 * satisfied by `owner_user_id = auth.uid()`, which a firm account is. This
 * page itself is reachable only by a `firm` account (routeAccess.ts:
 * `/dashboard/firm` → `["firm"]`), so no extra role check is needed here.
 *
 * ── WHY THIS PAGE DOES NOT SHOW A CASELOAD NUMBER PER CLIENT ────────────────
 * `activeCount`/`closedCount`/`requestCount`/`lastActivity` on the DTO are
 * computed server-side (route.ts) by filtering `service_requests` on
 * `assigned_to = auth.uid()` — the CALLING account's own workload. For the
 * lawyer directory that caller is the lawyer the cases are assigned to, so
 * the numbers are correct. Here the caller is the firm account itself, and
 * a case is assigned to the individual lawyer who works it, never to the
 * firm account — so those four fields render as 0/null for essentially
 * every card even when the firm's lawyers have real open cases with that
 * client. That would be a confident, unhedged false zero (the exact defect
 * `listRead.ts` exists to prevent for whole-list reads), so this page does
 * not render them at all rather than show a caseload number it cannot
 * stand behind. A true firm-wide count needs a stats query scoped through
 * `firm_members`, which is a route change out of this page's reach.
 */

export default function FirmClientsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [activeFlags, setActiveFlags] = useState<Set<ClientFlag>>(new Set());
  const [read, setRead] = useState<Awaited<ReturnType<typeof getLawyerClients>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const viewState = listViewState(loading, read);
  const clients = itemsOf(read);
  const loadError = viewState === "unreadable" ? "تعذّر تحميل دليل الموكّلين." : null;

  const loadClients = useCallback(() => {
    setLoading(true);
    getLawyerClients().then((res) => {
      setRead(res);
      setLoading(false);
    });
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = clients.filter(c => {
    const matchSearch = !search || c.name.includes(search) || (c.phone ?? "").includes(search) || (c.email ?? "").includes(search);
    const matchFlags = activeFlags.size === 0 || [...activeFlags].every(f => c.flags.includes(f));
    return matchSearch && matchFlags;
  });

  const companyCount = clients.filter(c => c.clientType === "company").length;
  const individualCount = clients.filter(c => c.clientType === "individual").length;

  return (
    <div className="max-w-[1200px] mx-auto space-y-5" dir="rtl">

      {/* Could-not-read banner */}
      {loadError && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex items-center gap-3 ${isDark ? "border-red-500/20 bg-red-500/5" : "border-red-200 bg-red-50"}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-red-500/15" : "bg-red-100"}`}>
            <Warning size={18} weight="fill" className="text-red-500" />
          </div>
          <div className="flex-1">
            <p className={`text-[13px] font-bold ${isDark ? "text-red-400" : "text-red-700"}`}>{loadError}</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-red-600/70"}`}>هذه ليست قائمة فارغة — القراءة لم تنجح.</p>
          </div>
          <button onClick={loadClients}
            className="flex items-center gap-1.5 text-[11px] font-bold text-red-500 hover:underline flex-shrink-0">
            <ArrowClockwise size={13} /> إعادة المحاولة
          </button>
        </motion.div>
      )}

      {/* Add Client Modal — same component, same endpoint, as the lawyer directory. */}
      {showModal && (
        <AddClientModal
          isDark={isDark}
          onClose={() => setShowModal(false)}
          onCreated={(c) => setRead(prev => prev && prev.ok
            ? { ...prev, items: [c, ...prev.items], total: prev.total === null ? null : prev.total + 1 }
            : prev)}
        />
      )}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            دليل الموكلين
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {viewState === "loading"
              ? "جارٍ التحميل…"
              : loadError
                ? <span className="text-red-500 font-semibold">تعذّرت قراءة الدليل — العدد غير معروف</span>
                : `${filtered.length} موكّل من موكّلي المكتب`}
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors self-start">
          <Plus size={15} weight="bold" />إضافة موكّل
        </button>
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex flex-col sm:flex-row gap-3">
        <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو البريد أو الهاتف..."
            className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
        </div>
      </motion.div>

      {/* Smart Filter Flags — same six-flag set the lawyer directory uses. */}
      {clients.some(c => c.flags.length > 0) && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="flex flex-wrap gap-2">
          {(Object.entries(FLAG_CONFIG) as [ClientFlag, typeof FLAG_CONFIG[ClientFlag]][]).map(([flag, conf]) => {
            const count = clients.filter(c => c.flags.includes(flag)).length;
            if (count === 0) return null;
            const active = activeFlags.has(flag);
            return (
              <button key={flag} title={conf.desc}
                onClick={() => setActiveFlags(prev => {
                  const s = new Set(prev); s.has(flag) ? s.delete(flag) : s.add(flag); return s;
                })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                  active ? conf.bg + " " + conf.color + " border-current/30" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500"
                }`}>
                <span>{conf.emoji}</span>
                {conf.label}
                <span className={`text-[9px] rounded-full px-1.5 py-0.5 ${active ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>{count}</span>
              </button>
            );
          })}
        </motion.div>
      )}

      {/* Clients grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {viewState === "loading" ? (
          <div className="md:col-span-2 flex flex-col items-center justify-center gap-3 py-14">
            <div className="inline-block w-7 h-7 rounded-full border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] animate-spin" />
            <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جارٍ تحميل دليل الموكّلين…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="md:col-span-2">
            <EmptyState
              icon={<AddressBook />}
              title={loadError
                ? "تعذّر تحميل القائمة"
                : clients.length === 0 ? "لا يوجد موكّلون بعد" : "لا توجد نتائج مطابقة"}
              description={loadError
                ? "فشلت قراءة دليل الموكّلين — هذه ليست قائمة فارغة، بل قراءة لم تنجح."
                : clients.length === 0
                  ? "لم يُضِف أحد أعضاء المكتب أي موكّل بعد."
                  : "لم يتم العثور على موكّلين يطابقون شروط البحث أو الفلترة الحالية."}
              action={loadError
                ? { label: "إعادة المحاولة", onClick: loadClients }
                : clients.length === 0 ? { label: "إضافة موكّل", onClick: () => setShowModal(true) } : undefined}
            />
          </div>
        ) : filtered.map((c, i) => {
          const hasTotal = c.feeTotalSar !== null && c.feeTotalSar > 0;
          const hasPaid = c.feePaidSar !== null;
          const outstanding = hasTotal && hasPaid ? (c.feeTotalSar as number) - (c.feePaidSar as number) : null;

          return (
          <motion.div key={c.id}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className={`group ${card} p-4 transition-all`}>

            <div className="flex items-start gap-3 mb-3">
              {/* Avatar */}
              <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center font-bold text-sm ${
                c.clientType === "company" ? "bg-indigo-500/10 text-indigo-500" : "bg-royal/10 text-royal"
              }`}>
                {c.clientType === "company" ? <Buildings size={17} weight="duotone" /> : c.name.charAt(0)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-[14px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                    {c.name}
                  </p>
                  {c.rating !== null && (
                    <div className="flex flex-shrink-0">
                      {Array.from({ length: 5 }).map((_, si) => (
                        <Star key={si} size={10} weight={si < (c.rating ?? 0) ? "fill" : "regular"}
                          className={si < (c.rating ?? 0) ? "text-amber-400" : isDark ? "text-zinc-700" : "text-slate-200"} />
                      ))}
                    </div>
                  )}
                </div>
                <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  {c.clientType === "company" ? "شركة" : c.clientType === "individual" ? "فرد" : "—"}
                  {" · "}
                  {c.source === "profile" ? "حساب على المنصّة" : "بطاقة"}
                </p>
              </div>
            </div>

            {/* Flags */}
            {c.flags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {c.flags.map(f => {
                  const fc = FLAG_CONFIG[f];
                  if (!fc) return null;
                  return (
                    <span key={f} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${fc.bg} ${fc.color}`}>
                      {fc.emoji} {fc.label}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Contact */}
            <div className={`space-y-1.5 pt-3 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
              {c.phone && (
                <div className={`flex items-center gap-2 text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  <Phone size={12} /><span dir="ltr">{c.phone}</span>
                </div>
              )}
              {!c.phone && !c.email && (
                <p className={`text-[11px] ${isDark ? "text-zinc-700" : "text-slate-300"}`}>لا بيانات تواصل مسجّلة</p>
              )}
            </div>

            {/* Footer */}
            <div className={`flex items-center mt-3 pt-2 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
              <span className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                {outstanding !== null
                  ? outstanding > 0
                    ? <span className="text-red-500 font-semibold">متبقٍّ {outstanding.toLocaleString()} ﷼</span>
                    : <span className="text-emerald-500 font-semibold">الأتعاب مسدَّدة</span>
                  : "لا أتعاب مسجّلة"}
              </span>
            </div>
          </motion.div>
          );
        })}
      </div>

      {/* Stats */}
      {viewState !== "loading" && !loadError && clients.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className={`${card} p-4 grid grid-cols-2 sm:grid-cols-3 gap-4`}>
          {[
            { label: "إجمالي الموكلين",  value: clients.length,           color: "text-royal",       bg: "bg-royal/8" },
            { label: "شركات",            value: companyCount,             color: "text-blue-500",    bg: "bg-blue-500/8" },
            { label: "أفراد",            value: individualCount,          color: "text-purple-500",  bg: "bg-purple-500/8" },
          ].map((s, i) => (
            <div key={i} className={`rounded-xl p-3 ${s.bg} text-center`}>
              <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{s.label}</p>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
