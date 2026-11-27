"use client";

/**
 * OpenRequestsList — «سوق الطلبات» for a verified lawyer.
 *
 * Owner decisions ١٠ + ١٩: each card shows the case type, the city and one
 * summary line — never the client's name, title or description (the database
 * function does not return them; GET /api/v1/lawyer/open-requests).
 *
 * l12 (owner answers of 20 Nov):
 *   Q130a the market is open: every new client request is listed (staff may
 *         still publish an older one or hide one), and a lawyer may ask to
 *         take it — «اطلب القبول» (POST …/open-requests/[id]/accept).
 *   RAW[66] / Q151 the ask waits for the administration's approval within the
 *         window set in the admin console (default 30 minutes; never accepted
 *         automatically), or — when the admin switches it — is instant.
 *   N9    «المنصة وسيط لا ضامن ولا أمين على الأتعاب» on every card.
 * Below the list: «طلباتي في السوق» (his asks and their outcome) and
 * «طلبات أُسندت إليّ» — only there, after assignment, the full text and the
 * client's name (GET /api/v1/lawyer/market-requests). Payment through the
 * platform stays off.
 *
 * Every state is honest: loading, an error, «not verified yet», an empty list.
 */

import { useCallback, useEffect, useState } from "react";
import { MapPin, Briefcase, ArrowClockwise, HandPointing, CheckCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { formatArabicDate } from "@/lib/services/clientDashboardCards";
import type { OpenRequestItem } from "@/lib/services/openRequestsView";
import IntermediaryNotice from "@/components/marketplace/IntermediaryNotice";
import { toArabicDigits } from "@/lib/marketplace/marketSettings";

interface MarketInfo {
  installed: boolean;
  open: boolean;
  acceptMode: "admin_approval" | "instant";
  approvalMinutes: number;
}

interface ListReply {
  data?: OpenRequestItem[];
  hasMore?: boolean;
  verified?: boolean | null;
  /** l18 review: asking to take a request is a verified LAWYER's act (a firm account reads only). */
  canAsk?: boolean;
  /** l18 review: the caller owns a firm (the firm account's page). */
  firm?: boolean;
  market?: MarketInfo;
  error?: string;
}

interface AskRow {
  id: string;
  requestId: string;
  status: string;
  statusLabel: string;
  dueAt: string | null;
  createdAt: string | null;
  note: string | null;
  card: OpenRequestItem | null;
}

interface AssignedRow {
  id: string;
  title: string;
  description: string;
  createdAt: string | null;
  clientName: string | null;
  card: OpenRequestItem | null;
}

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: OpenRequestItem[]; hasMore: boolean; verified: boolean | null; canAsk: boolean; firm: boolean; market: MarketInfo | null };

type Mine =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; installed: boolean; asks: AskRow[]; assigned: AssignedRow[] };

export function acceptHintAr(market: MarketInfo | null): string {
  if (!market || !market.installed) return "";
  return market.acceptMode === "instant"
    ? "القبول فوري: يُسند الطلب إلى أول محامٍ موثَّق يطلبه."
    : `تعتمد إدارة المنصة قبولك خلال ${toArabicDigits(market.approvalMinutes)} دقيقة في العادة، ولا يُقبل أحد تلقائياً. وللإدارة أن تُسند الطلب إلى محامٍ بعينه متى شاءت.`;
}

export default function OpenRequestsList() {
  const { isDark } = useTheme();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [mine, setMine] = useState<Mine>({ kind: "loading" });
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  const load = useCallback(async (p: number) => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/v1/lawyer/open-requests?page=${p}`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as ListReply;
      if (!res.ok) {
        setState({ kind: "error", message: body.error || "تعذّر تحميل الطلبات المفتوحة." });
        return;
      }
      setState({
        kind: "ready",
        items: Array.isArray(body.data) ? body.data : [],
        hasMore: body.hasMore === true,
        verified: typeof body.verified === "boolean" ? body.verified : null,
        canAsk: body.canAsk !== false,
        firm: body.firm === true,
        market: body.market ?? null,
      });
    } catch {
      setState({ kind: "error", message: "تعذّر الاتصال — تحقق من اتصالك وحاول مجدداً." });
    }
  }, []);

  const loadMine = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/lawyer/market-requests", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as {
        installed?: boolean;
        asks?: AskRow[];
        assigned?: AssignedRow[];
        error?: string;
      };
      if (!res.ok) {
        setMine({ kind: "error", message: body.error || "تعذّر تحميل طلباتك في السوق." });
        return;
      }
      setMine({
        kind: "ready",
        installed: body.installed !== false,
        asks: Array.isArray(body.asks) ? body.asks : [],
        assigned: Array.isArray(body.assigned) ? body.assigned : [],
      });
    } catch {
      setMine({ kind: "error", message: "تعذّر الاتصال — تحقق من اتصالك وحاول مجدداً." });
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);
  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const ask = async (id: string) => {
    setBusy(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/lawyer/open-requests/${encodeURIComponent(id)}/accept`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string; result?: string };
      setNotice({ id, text: body.message || body.error || "تعذّر إرسال طلبك.", ok: res.ok });
      if (res.ok) {
        void loadMine();
        if (body.result === "assigned") void load(page);
      }
    } catch {
      setNotice({ id, text: "تعذّر الاتصال — حاول مجدداً.", ok: false });
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async (askId: string) => {
    setBusy(askId);
    try {
      const res = await fetch(`/api/v1/lawyer/market-requests/${encodeURIComponent(askId)}/withdraw`, { method: "POST" });
      if (res.ok) void loadMine();
    } finally {
      setBusy(null);
    }
  };

  const card = isDark ? "bg-white/[0.03] border-white/[0.08]" : "bg-white border-zinc-200";
  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-400" : "text-zinc-500";
  const chip = isDark ? "bg-white/[0.06] text-zinc-300" : "bg-zinc-100 text-zinc-700";
  const primary = "bg-emerald-600 text-white hover:bg-emerald-700";

  const pendingIds = new Set(
    mine.kind === "ready" ? mine.asks.filter((a) => a.status === "pending").map((a) => a.requestId) : [],
  );
  const market = state.kind === "ready" ? state.market : null;
  const canAsk = state.kind === "ready" && state.verified === true && state.canAsk && market?.installed === true;
  // l18 review: a verified firm reads the list; a verified lawyer of the firm asks from his own account
  const firmReadsOnly = state.kind === "ready" && state.firm && state.verified === true && !state.canAsk;

  return (
    <section className="max-w-3xl mx-auto px-4 pb-16" dir="rtl" aria-labelledby="open-requests-heading">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 id="open-requests-heading" className={`text-lg font-bold ${tp}`}>سوق الطلبات</h2>
        <button
          type="button"
          onClick={() => {
            void load(page);
            void loadMine();
          }}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${chip}`}
        >
          <ArrowClockwise size={14} weight="bold" />
          تحديث
        </button>
      </div>
      <p className={`text-xs leading-relaxed mb-2 ${ts}`}>
        طلبات العملاء المفتوحة: نوع الطلب والمدينة وسطر ملخّص لا يحمل اسم العميل ولا أرقامه. اطلب قبول ما يناسبك، ولا
        يظهر النص الكامل ولا اسم العميل إلا للمحامي الذي يُسند إليه الطلب. {acceptHintAr(market)}
      </p>
      <IntermediaryNotice withPayment className="mb-4" />
      {firmReadsOnly && (
        <p className={`text-xs leading-relaxed mb-4 ${ts}`}>
          يعرض حساب المكتب الطلبات المفتوحة للاطلاع، ويطلب قبولَ الطلب محامٍ موثَّق من أعضاء المكتب من حسابه.
        </p>
      )}

      {state.kind === "loading" && <p className={`text-sm ${ts}`}>جارٍ التحميل…</p>}

      {state.kind === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.message}
        </p>
      )}

      {state.kind === "ready" && state.items.length === 0 && (
        <p className={`text-sm ${ts}`}>
          {state.verified === false
            ? state.firm
              ? "تظهر الطلبات المفتوحة لحساب المكتب بعد اعتماد توثيق مكتبك."
              : "تظهر الطلبات المفتوحة للمحامين الموثَّقين فقط، بعد اعتماد ترخيصك."
            : "لا توجد طلبات مفتوحة الآن."}
        </p>
      )}

      {state.kind === "ready" && state.items.length > 0 && (
        <ul className="space-y-3">
          {state.items.map((item) => {
            const date = formatArabicDate(item.createdAt);
            const asked = pendingIds.has(item.id);
            return (
              <li key={item.id} className={`rounded-2xl border p-4 ${card}`}>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${chip}`}>
                    <Briefcase size={13} weight="bold" />
                    {item.typeLabel}
                  </span>
                  {item.cityLabel && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${chip}`}>
                      <MapPin size={13} weight="bold" />
                      {item.cityLabel}
                    </span>
                  )}
                  {date && <span className={`text-xs ${ts}`}>{date}</span>}
                </div>
                {item.summary && <p className={`text-sm leading-relaxed ${tp}`}>{item.summary}</p>}
                <IntermediaryNotice className="mt-2" />
                {canAsk && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {asked ? (
                      <span className={`inline-flex items-center gap-1 text-xs font-bold ${ts}`}>
                        <CheckCircle size={14} weight="bold" />
                        طلبك بانتظار اعتماد الإدارة
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy === item.id}
                        onClick={() => void ask(item.id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${primary}`}
                      >
                        <HandPointing size={14} weight="bold" />
                        {busy === item.id ? "جارٍ الإرسال…" : "اطلب القبول"}
                      </button>
                    )}
                    {notice?.id === item.id && (
                      <span
                        role="status"
                        className={`text-xs ${notice.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                      >
                        {notice.text}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {state.kind === "ready" && (page > 0 || state.hasMore) && (
        <div className="flex items-center justify-center gap-3 mt-5">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className={`rounded-lg px-4 py-2 text-xs font-bold disabled:opacity-40 ${chip}`}
          >
            السابق
          </button>
          <button
            type="button"
            disabled={!state.hasMore}
            onClick={() => setPage((p) => p + 1)}
            className={`rounded-lg px-4 py-2 text-xs font-bold disabled:opacity-40 ${chip}`}
          >
            التالي
          </button>
        </div>
      )}

      {/* ── طلبات أُسندت إليّ ─────────────────────────────────────────────── */}
      <h3 className={`text-base font-bold mt-10 mb-2 ${tp}`}>طلبات أُسندت إليّ</h3>
      {mine.kind === "loading" && <p className={`text-sm ${ts}`}>جارٍ التحميل…</p>}
      {mine.kind === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {mine.message}
        </p>
      )}
      {mine.kind === "ready" && mine.assigned.length === 0 && (
        <p className={`text-sm ${ts}`}>لم يُسند إليك طلب من السوق بعد.</p>
      )}
      {mine.kind === "ready" && mine.assigned.length > 0 && (
        <ul className="space-y-3">
          {mine.assigned.map((r) => (
            <li key={r.id} className={`rounded-2xl border p-4 ${card}`}>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                {r.card?.typeLabel && (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${chip}`}>{r.card.typeLabel}</span>
                )}
                {r.card?.cityLabel && (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${chip}`}>{r.card.cityLabel}</span>
                )}
                {formatArabicDate(r.createdAt) && <span className={`text-xs ${ts}`}>{formatArabicDate(r.createdAt)}</span>}
              </div>
              {r.title && <p className={`text-sm font-bold ${tp}`}>{r.title}</p>}
              {r.clientName && <p className={`text-xs mt-0.5 ${ts}`}>العميل: {r.clientName}</p>}
              {r.description && <p className={`text-sm leading-relaxed mt-2 whitespace-pre-line ${tp}`}>{r.description}</p>}
              <p className={`text-xs mt-2 ${ts}`}>تنسّق إدارة المنصة التواصل بينك وبين العميل.</p>
              <IntermediaryNotice withPayment className="mt-1" />
            </li>
          ))}
        </ul>
      )}

      {/* ── طلباتي في السوق ───────────────────────────────────────────────── */}
      <h3 className={`text-base font-bold mt-10 mb-2 ${tp}`}>طلباتي في السوق</h3>
      {mine.kind === "ready" && !mine.installed && (
        <p className={`text-sm ${ts}`}>قبول طلبات السوق قريباً.</p>
      )}
      {mine.kind === "ready" && mine.installed && mine.asks.length === 0 && (
        <p className={`text-sm ${ts}`}>لم تطلب قبول أي طلب بعد.</p>
      )}
      {mine.kind === "ready" && mine.asks.length > 0 && (
        <ul className="space-y-2">
          {mine.asks.map((a) => (
            <li key={a.id} className={`rounded-xl border p-3 ${card}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-sm ${tp}`}>
                  {a.card?.typeLabel ?? "طلب"}
                  {a.card?.cityLabel ? ` · ${a.card.cityLabel}` : ""}
                  {formatArabicDate(a.createdAt) ? ` · ${formatArabicDate(a.createdAt)}` : ""}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${chip}`}>{a.statusLabel}</span>
              </div>
              {a.card?.summary && <p className={`text-xs mt-1 ${ts}`}>{a.card.summary}</p>}
              {a.note && <p className={`text-xs mt-1 ${ts}`}>سبب الإدارة: {a.note}</p>}
              {a.status === "pending" && (
                <button
                  type="button"
                  disabled={busy === a.id}
                  onClick={() => void withdraw(a.id)}
                  className={`mt-2 rounded-lg px-3 py-1 text-xs font-bold disabled:opacity-50 ${chip}`}
                >
                  اسحب الطلب
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
