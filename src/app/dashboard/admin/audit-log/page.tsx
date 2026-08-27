"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import {
  MagnifyingGlass, Download,
  SignIn, CreditCard, ShieldCheck, Robot,
  Warning, Eye, LockSimple, UserSwitch,
  ArrowSquareOut, CheckCircle, X, ArrowClockwise,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  listFailed,
  listFromApi,
  listOk,
  listViewState,
  itemsOf,
  type ListRead,
} from "@/lib/services/listRead";

/* ── Types ─────────────────────────────────────────────────────────────────── */
type Severity = "info" | "warning" | "critical";

interface LogItem {
  id: number | string;
  actor: string;
  /**
   * Kept alongside the display name because the «إجراءات الأدمن» tile counts
   * over it. Counting by the rendered `actor` string would need a name→role
   * guess, which is exactly the kind of invented value this screen exists to
   * report rather than commit.
   */
  actorType: string;
  target: string;
  action: string;
  detail: string;
  severity: Severity;
  time: string;
}

interface AuditEvent {
  id: number | string;
  actor_id: string | null;
  actor_type: string;
  actor_name: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  before_state: unknown;
  after_state: unknown;
  metadata: Record<string, unknown> | null;
  severity: Severity;
  created_at: string;
}

/* ── There is no mock fallback here, deliberately ────────────────────────────
 *
 * This file used to carry a ten-row `LOGS` constant and render it whenever the
 * fetch failed OR returned nothing — «تعليق الحساب», «تصفح المنصة كـ أ. محمد
 * العتيبي», «٣ محاولات دخول فاشلة — IP: 185.23.xx.xx». Invented entries on an
 * audit log are the worst version of this whole defect class. «لا توجد سجلات»
 * over a failed read at least only claims that nothing happened; ten fabricated
 * rows claim that ten specific things DID happen, to named people, and this is
 * the screen someone opens precisely BECAUSE they suspect something happened.
 *
 * GET /api/v1/admin/audit-log now answers a failed query with 500 + {error}
 * instead of an empty 200, so the three cases are finally distinguishable and
 * the page says which one it is.
 */

const ACTION_ICONS: Record<string,React.ElementType> = {
  "user.suspend": LockSimple, "user.login": SignIn, "user.login.failed": Warning,
  "ai.request": Robot, "subscription.renew": CreditCard, "subscription.cancel": X,
  "provider.approve": CheckCircle, "admin.impersonate": UserSwitch,
  "system.backup": ShieldCheck, "escrow.release": ArrowSquareOut,
};

const SEV_CFG: Record<string,{cls:string;label:string}> = {
  info:     { cls:"bg-blue-500/10 border-blue-500/20 text-blue-400", label:"معلومة" },
  warning:  { cls:"bg-amber-500/10 border-amber-500/20 text-amber-400", label:"تنبيه" },
  critical: { cls:"bg-red-500/10 border-red-500/20 text-red-400", label:"حرج" },
};

/* ── Actor label (Arabic) by actor_type ──────────────────────────────────────── */
const ACTOR_TYPE_LABEL: Record<string,string> = {
  admin:  "أدمن",
  system: "النظام",
  n8n:    "النظام",
  api:    "API",
  user:   "مستخدم",
};

/** Arabic-Indic digits, to match every other number on this screen. */
function arNum(n: number): string {
  return n.toLocaleString("ar-SA");
}

/* ── Relative time in Arabic ─────────────────────────────────────────────────── */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دق`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "أمس";
  if (days < 30) return `منذ ${days} يوم`;
  const months = Math.floor(days / 30);
  return `منذ ${months} شهر`;
}

/* ── Map an API audit event to the timeline log item shape ───────────────────── */
function mapEvent(e: AuditEvent): LogItem {
  const actor =
    e.actor_name?.trim() ||
    (ACTOR_TYPE_LABEL[e.actor_type] ?? "مستخدم");
  const target =
    e.target_id
      ? (e.target_type ? `${e.target_type} (${e.target_id})` : String(e.target_id))
      : "—";
  const meta = (e.metadata ?? {}) as Record<string, unknown>;
  const detail =
    (typeof meta.detail === "string" && meta.detail) ||
    (typeof meta.description === "string" && meta.description) ||
    (typeof meta.reason === "string" && meta.reason) ||
    (e.target_type ? `${e.action} — ${e.target_type}` : e.action);
  return {
    id: e.id,
    actor,
    actorType: e.actor_type,
    target,
    action: e.action,
    detail,
    severity: e.severity,
    time: relativeTime(e.created_at),
  };
}

/**
 * The truncation sentence, written here instead of using the shared
 * `truncationNoticeAr()`.
 *
 * The shared one ends «استخدم البحث للوصول إلى الباقي», and that advice is
 * false on this screen: the search box below filters the rows already in
 * memory and cannot reach a single event the server did not send. Sending an
 * admin to search for the missing part of an audit log would be a second false
 * statement stacked on the one this pass exists to remove. The numbers still
 * come straight off the same `ListRead`, so this is the same contract — only
 * the advice is dropped, because there is no in-page way to widen the window
 * short of the route's own `?limit=`.
 */
function truncationNotice(read: ListRead<LogItem> | null): string | null {
  if (!read || !read.ok || !read.truncated || read.total === null) return null;
  return `يُعرض أحدث ${arNum(read.items.length)} حدثاً من ${arNum(read.total)} — السجل أطول مما يظهر هنا.`;
}

const LIMIT = 200;

export default function AuditLogPage() {
  const { isDark } = useTheme();
  const [sevFilter, setSevFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [read, setRead] = useState<ListRead<LogItem> | null>(null);
  // Starts `true`: the effect fires on mount, and a `false` start would paint
  // «لا توجد سجلات تدقيق» for one frame before the request is even sent.
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/audit-log?limit=${LIMIT}`);
      if (!res.ok) {
        // A 403 and a 500 say the same thing to the reader — «we could not
        // read the log» — so they get the same branch. Which it was is in the
        // response body and the server log, not on a screen that would have to
        // re-map both to one sentence anyway.
        setRead(listFailed<LogItem>());
        return;
      }
      const json = await res.json();
      // listFromApi() carries the rules for this envelope (a missing `data`
      // array and `degraded: true` are both failures, not emptiness); mapping
      // afterwards keeps the server's `total` attached to the mapped rows.
      const base = listFromApi<AuditEvent>(json);
      setRead(base.ok ? listOk(base.items.map(mapEvent), base.total) : listFailed<LogItem>());
    } catch {
      setRead(listFailed<LogItem>());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const state = listViewState(loading, read);
  const loaded = itemsOf(read);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = loaded.filter(l =>
    (sevFilter==="all" || l.severity===sevFilter) &&
    (l.detail.includes(search) || l.actor.includes(search) || l.action.includes(search))
  );

  /**
   * Every tile counts over the rows this page actually holds — never over the
   * whole table, which it has not read.
   *
   * The four figures used to be the hardcoded strings ١٬٢٤٧ / ٢٣ / ٨ / ٣, which
   * were the same invented-fact defect as the mock rows and did not move when
   * the log did. The old «إجمالي الأحداث (اليوم)» tile is gone rather than
   * rebuilt: with the read capped at LIMIT there is no honest way to count
   * today's events from here — a day busier than the window would silently
   * under-report, and an under-reported audit count is still a false one. What
   * replaces it is the one number this page can stand behind, and the caption
   * under the strip says what all four are measured against.
   */
  const kpis: { label: string; count: number; c: string }[] = [
    { label: "أحداث محمّلة",  count: loaded.length, c: "text-blue-400" },
    { label: "إجراءات الأدمن", count: loaded.filter(l => l.actorType === "admin").length, c: "text-purple-400" },
    { label: "تنبيهات",        count: loaded.filter(l => l.severity === "warning").length, c: "text-amber-400" },
    { label: "أحداث حرجة",     count: loaded.filter(l => l.severity === "critical").length, c: "text-red-400" },
  ];

  const notice = truncationNotice(read);

  return (
    <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="flex items-start justify-between">
        <div>
          <h1 className={`text-xl font-bold mb-1 ${isDark?"text-white":"text-slate-800"}`}>سجل التدقيق</h1>
          <p className={`text-[12px] ${isDark?"text-zinc-500":"text-slate-400"}`}>كل إجراء في المنصة مسجّل بتوقيته ومنفّذه</p>
        </div>
        <button className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold ${isDark?"bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]":"bg-slate-100 text-slate-500 hover:bg-slate-200"} transition-colors`}>
          <Download size={13}/> تصدير CSV
        </button>
      </motion.div>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-3">
        {kpis.map((k,i)=>(
          <motion.div key={k.label} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}
            className={`${card} p-4`}>
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className={`text-[10px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{k.label}</p>
              {/* Marked on the tile itself so the slot below can never be read
                  as a real ٠. On a failed read, «٠ أحداث حرجة» is the same
                  false statement as «٤٢ أحداث حرجة». */}
              {state === "unreadable" && (
                <span className={`shrink-0 flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  isDark ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    : "bg-amber-50 text-amber-600 border border-amber-200"}`}>
                  <Warning size={8} weight="fill"/> تعذّرت القراءة
                </span>
              )}
            </div>
            {state === "unreadable" || state === "loading" ? (
              <p className={`text-[20px] font-bold ${isDark?"text-zinc-600":"text-slate-300"}`}>—</p>
            ) : (
              <p className={`text-[20px] font-bold ${k.c}`}>{arNum(k.count)}</p>
            )}
          </motion.div>
        ))}
      </div>
      <p className={`-mt-3 text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>
        محسوبة على الأحداث المحمّلة في هذه الصفحة، لا على السجل كاملاً.
      </p>

      {notice && (
        <div className={`${card} px-4 py-3 text-[11px] flex items-center gap-2 ${isDark?"text-amber-400":"text-amber-700"}`}>
          <Warning size={13} weight="fill" className="shrink-0"/> {notice}
        </div>
      )}

      {/* Filters */}
      <div className={`${card} p-4 flex items-center gap-3 flex-wrap`}>
        <div className={`flex items-center gap-2 flex-1 min-w-[180px] rounded-xl border px-3 py-2 ${isDark?"border-white/[0.08] bg-white/[0.03]":"border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={13} className={isDark?"text-zinc-500":"text-slate-400"}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث في السجل..."
            className={`bg-transparent text-[12px] w-full outline-none ${isDark?"text-zinc-200 placeholder:text-zinc-700":"text-slate-700 placeholder:text-slate-400"}`}/>
        </div>
        {[["all","الكل"],["info","معلومة"],["warning","تنبيه"],["critical","حرج"]].map(([v,l])=>(
          <button key={v} onClick={()=>setSevFilter(v)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
              sevFilter===v?"bg-[#C8A762] text-black":isDark?"bg-white/[0.04] text-zinc-500":"bg-slate-100 text-slate-500"
            }`}>{l}</button>
        ))}
      </div>

      {/* Timeline — one of four states, never a mix ─────────────────────────── */}
      {state === "loading" && (
        <div className={`${card} p-8 text-center text-[13px] ${isDark?"text-zinc-500":"text-slate-400"}`}>
          جارٍ تحميل السجل…
        </div>
      )}

      {state === "unreadable" && (
        <div className={`${card} p-8 text-center`}>
          <Warning size={20} weight="fill" className="mx-auto mb-2 text-amber-500"/>
          <p className={`text-[13px] font-bold ${isDark?"text-zinc-200":"text-slate-700"}`}>تعذّرت قراءة سجل التدقيق</p>
          <p className={`text-[11px] mt-1 ${isDark?"text-zinc-500":"text-slate-400"}`}>
            هذه ليست نتيجة فارغة — لم نتمكن من قراءة السجل، ولا يمكن الاستنتاج من هذه الشاشة أن شيئاً لم يحدث.
          </p>
          <button type="button" onClick={() => { void load(); }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#C8A762] px-4 py-2 text-[11px] font-bold text-black">
            <ArrowClockwise size={12} weight="bold"/> إعادة المحاولة
          </button>
        </div>
      )}

      {state === "empty" && (
        <div className={`${card} p-8 text-center text-[13px] ${isDark?"text-zinc-400":"text-slate-500"}`}>
          لا توجد سجلات تدقيق.
        </div>
      )}

      {state === "ready" && (
        <div className="space-y-1">
          {filtered.map((l,i)=>{
            const Icon = ACTION_ICONS[l.action] || Eye;
            const sev = SEV_CFG[l.severity];
            return (
              <motion.div key={l.id} initial={{opacity:0,x:6}} animate={{opacity:1,x:0}} transition={{delay:i*0.03}}
                className={`${card} p-4 flex items-start gap-3 hover:border-[#C8A762]/15 transition-all`}>
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  l.severity==="critical"?"bg-red-500/10 text-red-400":
                  l.severity==="warning"?"bg-amber-500/10 text-amber-400":
                  "bg-blue-500/10 text-blue-400"
                }`}>
                  <Icon size={16} weight="duotone"/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className={`text-[11px] font-bold ${isDark?"text-zinc-200":"text-slate-700"}`}>{l.actor}</span>
                    {l.target!=="—" && <>
                      <span className={`text-[9px] ${isDark?"text-zinc-600":"text-slate-400"}`}>→</span>
                      <span className={`text-[10px] ${isDark?"text-zinc-400":"text-slate-500"}`}>{l.target}</span>
                    </>}
                    <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${isDark?"bg-white/[0.04] text-zinc-500":"bg-slate-50 text-slate-400"}`}>{l.action}</span>
                  </div>
                  <p className={`text-[11px] ${isDark?"text-zinc-400":"text-slate-500"}`}>{l.detail}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${sev.cls}`}>{sev.label}</span>
                  <span className={`text-[9px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{l.time}</span>
                </div>
              </motion.div>
            );
          })}

          {/* A read that returned rows but none survive the filters is a fourth
              fact again, and must not borrow the empty-log wording: the log is
              not empty, this view of it is. */}
          {filtered.length === 0 && (
            <div className={`${card} p-8 text-center text-[13px] ${isDark?"text-zinc-400":"text-slate-500"}`}>
              لا توجد سجلات مطابقة للتصفية الحالية.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
