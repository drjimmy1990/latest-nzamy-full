"use client";

/**
 * OpenRequestsList — «الطلبات المفتوحة» for a verified lawyer (owner decisions
 * ١٠ + ١٩): each card shows the case type, the city and one summary line —
 * never the client's name, title or description (the database function does
 * not return them; GET /api/v1/lawyer/open-requests).
 *
 * Read-only on purpose: the marketplace stays parked (BETA_MONOPOLY_MODE), a
 * request's lawyer is chosen by the office (owner ١٨٧), so there is no «تقديم
 * عرض» or «قبول» button here. The full text and the client's name are shown
 * only once a lawyer is assigned, on the case itself.
 *
 * Owner ٢٣: only requests the office reviewed and PUBLISHED appear here, typed
 * استشارة / قضية / صياغة (20261127_70); a test account's request never does.
 *
 * Every state is honest: loading, an error, «not verified yet», an empty list.
 */

import { useCallback, useEffect, useState } from "react";
import { MapPin, Briefcase, ArrowClockwise } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { formatArabicDate } from "@/lib/services/clientDashboardCards";
import type { OpenRequestItem } from "@/lib/services/openRequestsView";

interface ListReply {
  data?: OpenRequestItem[];
  hasMore?: boolean;
  verified?: boolean | null;
  error?: string;
}

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: OpenRequestItem[]; hasMore: boolean; verified: boolean | null };

export default function OpenRequestsList() {
  const { isDark } = useTheme();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [page, setPage] = useState(0);

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
      });
    } catch {
      setState({ kind: "error", message: "تعذّر الاتصال — تحقق من اتصالك وحاول مجدداً." });
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const card = isDark ? "bg-white/[0.03] border-white/[0.08]" : "bg-white border-zinc-200";
  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-400" : "text-zinc-500";
  const chip = isDark ? "bg-white/[0.06] text-zinc-300" : "bg-zinc-100 text-zinc-700";

  return (
    <section className="max-w-3xl mx-auto px-4 pb-16" dir="rtl" aria-labelledby="open-requests-heading">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 id="open-requests-heading" className={`text-lg font-bold ${tp}`}>الطلبات المفتوحة</h2>
        <button
          type="button"
          onClick={() => void load(page)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${chip}`}
        >
          <ArrowClockwise size={14} weight="bold" />
          تحديث
        </button>
      </div>
      <p className={`text-xs leading-relaxed mb-4 ${ts}`}>
        طلبات راجعتها إدارة المنصة ونشرتها: استشارة أو قضية أو صياغة. للاطلاع فقط: نوع الطلب والمدينة وسطر ملخّص لا
        يحمل اسم العميل ولا أرقامه. يُسند الطلب من المكتب، ولا يظهر النص الكامل ولا اسم العميل إلا للمحامي المُسنَد إليه.
      </p>

      {state.kind === "loading" && <p className={`text-sm ${ts}`}>جارٍ التحميل…</p>}

      {state.kind === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.message}
        </p>
      )}

      {state.kind === "ready" && state.items.length === 0 && (
        <p className={`text-sm ${ts}`}>
          {state.verified === false
            ? "تظهر الطلبات المفتوحة للمحامين الموثَّقين فقط، بعد اعتماد ترخيصك."
            : "لا توجد طلبات مفتوحة الآن."}
        </p>
      )}

      {state.kind === "ready" && state.items.length > 0 && (
        <ul className="space-y-3">
          {state.items.map((item) => {
            const date = formatArabicDate(item.createdAt);
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
    </section>
  );
}
