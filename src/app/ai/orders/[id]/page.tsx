"use client";

import { useEffect, useState, use } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { getServiceOrder, ORDER_STATUS_AR, type ServiceOrder } from "@/lib/services/serviceOrders";

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isDark } = useTheme();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadErr, setDownloadErr] = useState("");

  useEffect(() => {
    getServiceOrder(id).then((o) => { setOrder(o); setLoading(false); });
  }, [id]);

  async function download() {
    setDownloadErr("");
    const res = await fetch(`/api/v1/service-requests/${id}/deliverable`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setDownloadErr(body.error ?? "تعذّر التحميل");
      return;
    }
    const { url } = await res.json();
    window.open(url, "_blank");
  }

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  if (loading) return <div className="p-7 text-[12px]" dir="rtl">جارٍ التحميل...</div>;
  if (!order) return <div className="p-7 text-[12px]" dir="rtl">الطلب غير موجود.</div>;

  const s = ORDER_STATUS_AR[order.status] ?? ORDER_STATUS_AR.pending_assignment;
  const deliverable = order.metadata?.deliverable;

  return (
    <div className="p-5 md:p-7 max-w-3xl mx-auto space-y-4" dir="rtl">
      <div>
        <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{order.title}</h1>
        <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          {order.metadata?.serviceTitleAr} · الحالة: {s.label}
        </p>
      </div>

      {order.status === "completed" && deliverable && (
        <div className={`${card} p-5 space-y-3`}>
          <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>المستند جاهز</p>
          {deliverable.notes && (
            <p className={`text-[12px] leading-[1.9] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{deliverable.notes}</p>
          )}
          <button onClick={download} className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[12px] font-bold text-white">
            <DownloadSimple size={14} /> تحميل {deliverable.fileName}
          </button>
          {downloadErr && <p className="text-[11px] text-red-500">{downloadErr}</p>}
        </div>
      )}

      {order.status === "cancelled" && (
        <div className={`${card} p-5`}>
          <p className="text-[12px] text-red-500">تم إلغاء الطلب. {order.metadata?.cancelReason ?? ""}</p>
        </div>
      )}

      {["pending_assignment", "assigned", "in_review"].includes(order.status) && (
        <div className={`${card} p-5`}>
          <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
            طلبك قيد التنفيذ لدى فريق نظامي. سيصلك إشعار فور جهوزية المستند.
          </p>
        </div>
      )}
    </div>
  );
}
