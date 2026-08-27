"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { listMyServiceOrders, ORDER_STATUS_AR, type ServiceOrder } from "@/lib/services/serviceOrders";
import {
  listOk,
  listFailed,
  listViewState,
  itemsOf,
  type ListRead,
} from "@/lib/services/listRead";

const TONE: Record<string, string> = {
  amber: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  blue: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  zinc: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
};

/**
 * The label for a status this build does not know.
 *
 * This used to be `ORDER_STATUS_AR[o.status] ?? ORDER_STATUS_AR.pending_assignment`
 * — a row carrying a status added to the database after this bundle shipped was
 * therefore announced as «بانتظار الاستلام», a specific claim about where the
 * order stands, invented from the absence of a mapping. Naming the gap is the
 * only honest answer; the same shape `UNKNOWN_STATUS_CFG` takes in «طلباتي»
 * (dashboard/client/requests/page.tsx).
 */
const UNKNOWN_STATUS = { label: "حالة غير معروفة", tone: "zinc" } as const;

export default function OrdersPage() {
  const { isDark } = useTheme();
  // THREE STATES, not two. `read === null` means the first fetch has not
  // settled; `ok: false` means it failed; `ok: true` with no items means this
  // account really has placed no orders. listViewState() is what keeps the
  // three apart — see src/lib/services/listRead.ts. It answers 'unreadable'
  // for a null read, which is why `loading` starts true and is only cleared
  // once a read has been stored.
  const [read, setRead] = useState<ListRead<ServiceOrder> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    // listMyServiceOrders() THROWS on failure — including on the route's
    // `200 {data: [], degraded: true}` answer to a Supabase error — so the
    // catch below is a real failure branch and not a swallowed one.
    listMyServiceOrders()
      .then((orders) => setRead(listOk(orders)))
      .catch((error) => {
        console.error("[ai orders] load failed:", error);
        setRead(listFailed<ServiceOrder>());
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const view = listViewState(loading, read);
  const orders = itemsOf(read);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <div className="p-5 md:p-7 max-w-4xl mx-auto space-y-4" dir="rtl">
      <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>طلباتي</h1>

      {view === "loading" && <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>جارٍ التحميل...</p>}

      {view === "unreadable" && (
        <div className={`${card} p-8 text-center space-y-3`}>
          {/* Never «لا توجد طلبات بعد» here: the orders may be there and only
              the request failed. */}
          <p className="text-[13px] text-red-500">تعذّرت قراءة طلباتك. لا يعني هذا أنه لا توجد لديك طلبات.</p>
          <button onClick={load} className="rounded-xl bg-[#0B3D2E] px-5 py-2 text-[12px] font-bold text-white">
            إعادة المحاولة
          </button>
        </div>
      )}

      {view === "empty" && (
        <div className={`${card} p-8 text-center`}>
          <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>لا توجد طلبات بعد.</p>
        </div>
      )}

      {view === "ready" && orders.map((o) => {
        const s = ORDER_STATUS_AR[o.status] ?? UNKNOWN_STATUS;
        // Each half is printed only when the row carries it. The line was
        // `{o.metadata?.serviceTitleAr} · {date}`, so an order stamped by a
        // path that writes no `serviceTitleAr` rendered a leading « · » —
        // a separator with nothing before it, which is the small version of
        // the same false claim.
        const meta = [
          o.metadata?.serviceTitleAr,
          Number.isNaN(new Date(o.created_at).getTime())
            ? null
            : new Date(o.created_at).toLocaleDateString("ar-SA"),
        ].filter(Boolean);
        return (
          <Link key={o.id} href={`/ai/orders/${o.id}`} className={`${card} p-4 flex items-center gap-3 hover:shadow-md transition-shadow`}>
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{o.title}</p>
              {meta.length > 0 && (
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  {meta.join(" · ")}
                </p>
              )}
            </div>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${TONE[s.tone]}`}>{s.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
