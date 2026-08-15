"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { listMyServiceOrders, ORDER_STATUS_AR, type ServiceOrder } from "@/lib/services/serviceOrders";

const TONE: Record<string, string> = {
  amber: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  blue: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  zinc: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
};

export default function OrdersPage() {
  const { isDark } = useTheme();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMyServiceOrders().then((o) => { setOrders(o); setLoading(false); });
  }, []);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <div className="p-5 md:p-7 max-w-4xl mx-auto space-y-4" dir="rtl">
      <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>طلباتي</h1>

      {loading && <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>جارٍ التحميل...</p>}

      {!loading && orders.length === 0 && (
        <div className={`${card} p-8 text-center`}>
          <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>لا توجد طلبات بعد.</p>
        </div>
      )}

      {orders.map((o) => {
        const s = ORDER_STATUS_AR[o.status] ?? ORDER_STATUS_AR.pending_assignment;
        return (
          <Link key={o.id} href={`/ai/orders/${o.id}`} className={`${card} p-4 flex items-center gap-3 hover:shadow-md transition-shadow`}>
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{o.title}</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                {o.metadata?.serviceTitleAr} · {new Date(o.created_at).toLocaleDateString("ar-SA")}
              </p>
            </div>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${TONE[s.tone]}`}>{s.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
