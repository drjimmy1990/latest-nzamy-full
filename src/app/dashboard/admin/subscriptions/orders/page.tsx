"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatHalalas } from "@/lib/payments/catalog";
import { billingDateAr, billingItemAr, orderStatusAr } from "@/lib/payments/billingView";
import { canOfferRefund } from "@/lib/payments/refundDecision";
interface Order {
  id: string; user_id: string | null; merchant: string; item_id: string; status: string; total_halalas: number; created_at: string; receipt_number: string | null; live: boolean | null;
  flags: { paid_unmatched: unknown; already_entitled: boolean; no_user: boolean; refund_pending: boolean };
}
interface Event { event_id: string; payment_id: string; received_at: string }
interface Review { id: string; method: string; totalHalalas: number; warnings: string[] }
export default function AdminPaymentOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [canRefund, setCanRefund] = useState(false);
  const [status, setStatus] = useState("");
  const [user, setUser] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/v1/admin/payments/orders?${new URLSearchParams({ status, user, from, to })}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "تعذّر تحميل المدفوعات"); return; }
      setOrders(data.orders); setEvents(data.orphanEvents); setCanRefund(data.canRefund);
    } catch { setError("تعذّر الاتصال، حاول مرة أخرى"); }
    finally { setLoading(false); }
  }, [status,user,from,to]);
  useEffect(() => { const timer = setTimeout(() => void load(),0); return () => clearTimeout(timer); }, [load]);
  async function refund(id: string, confirm: boolean) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/v1/admin/payments/orders/${id}/refund`, { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ confirm }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "تعذّر إتمام الاسترداد"); return; }
      if (data.review) setReview({ id, method: data.method, totalHalalas: data.totalHalalas, warnings: data.warnings });
      else { setReview(null); await load(); }
    } catch { setError("تعذّر الاتصال؛ راجع حالة العملية قبل تكرار الطلب"); }
    finally { inFlight.current = false; setBusy(false); }
  }
  // The admin console is dark-only (dashboard/admin/layout.tsx paints
  // bg-[#0a0a0f] whatever the site theme is): `dark` here keeps this page's
  // dark: palette on in both themes, so no white table or input on the black console.
  return <div dir="rtl" className="dark space-y-6 p-4 text-zinc-900 [color-scheme:dark] dark:text-zinc-100 sm:p-8">
    <div><h1 className="text-2xl font-extrabold">عمليات الدفع والاسترداد</h1><p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">آخر ١٠٠ عملية. الاسترداد إلى وسيلة الدفع الأصلية متاح للمسؤول الأعلى فقط.</p></div>
    <div className="flex flex-wrap gap-3"><select aria-label="حالة الدفع" value={status} onChange={e => setStatus(e.target.value)} className="rounded-xl border border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"><option value="">جميع الحالات</option>{["created","initiated","paid","failed","refunded","voided","cancelled"].map(s => <option key={s} value={s}>{orderStatusAr(s)}</option>)}</select><input aria-label="معرّف المستخدم" value={user} onChange={e => setUser(e.target.value)} placeholder="معرّف المستخدم" className="rounded-xl border border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900" /><label className="text-sm">من<input aria-label="من تاريخ" type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} className="ms-2 rounded-xl border border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900" /></label><label className="text-sm">إلى<input aria-label="إلى تاريخ" type="datetime-local" value={to} onChange={e => setTo(e.target.value)} className="ms-2 rounded-xl border border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900" /></label><button onClick={() => void load()} className="rounded-xl border border-zinc-300 px-4 dark:border-zinc-700 dark:hover:bg-zinc-800">تحديث</button></div>
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p> : null}
    {review ? <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"><h2 className="font-bold">تأكيد استرداد {formatHalalas(review.totalHalalas)}</h2><p className="mt-2 text-sm">تُلغى الصلاحيات والنقاط المتبقية المرتبطة بهذه العملية. يُسجل الإجراء في سجل التدقيق.</p>{review.warnings.map(w => <p key={w} className="mt-2 text-sm">{w}</p>)}<div className="mt-4 flex gap-3"><button disabled={busy} onClick={() => void refund(review.id,true)} className="rounded-xl bg-red-700 px-4 py-2 font-bold text-white disabled:opacity-50">{busy ? "جارٍ المعالجة…" : "تأكيد الاسترداد"}</button><button disabled={busy} onClick={() => setReview(null)}>رجوع</button></div></section> : null}
    {loading ? <p>جارٍ تحميل المدفوعات…</p> : <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"><table className="w-full min-w-[850px] text-right text-sm"><thead className="text-zinc-500 dark:text-zinc-400"><tr>{["العملية","التاريخ","المبلغ","الحالة","المراجعة","الإجراء"].map(h => <th key={h} className="p-4">{h}</th>)}</tr></thead><tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">{orders.map(o => <tr key={o.id}><td className="p-4"><p className="font-bold">{billingItemAr(o.item_id)}</p><p className="mt-1 text-xs text-zinc-500" dir="ltr">{o.receipt_number ?? o.id}</p><p className="mt-1 text-xs text-zinc-500" dir="ltr">{o.user_id}</p>{o.live === false ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">عملية تجريبية</p> : null}</td><td className="p-4">{billingDateAr(o.created_at)}</td><td className="p-4 whitespace-nowrap">{formatHalalas(o.total_halalas)}</td><td className="p-4">{orderStatusAr(o.status)}</td><td className="p-4 text-amber-700 dark:text-amber-300">{o.flags.paid_unmatched ? <p>دفعة تحتاج إلى مطابقة ومراجعة</p> : null}{o.flags.already_entitled ? <p>لم تُمنح باقة إضافية؛ يلزم مراجعة الاسترداد</p> : null}{o.flags.no_user ? <p>حُذف حساب صاحب العملية</p> : null}{o.flags.refund_pending ? <p>استرداد قيد المعالجة أو يحتاج إلى تسوية</p> : null}</td><td className="p-4">{canRefund && canOfferRefund(o) ? <button disabled={busy} onClick={() => void refund(o.id,false)} className="rounded-lg border border-red-300 px-3 py-2 text-red-700 dark:border-red-800 dark:text-red-300">مراجعة الاسترداد</button> : "—"}</td></tr>)}</tbody></table>{!orders.length ? <p className="p-5 text-sm">لا توجد عمليات مطابقة.</p> : null}</div>}
    <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800"><h2 className="font-bold">إشعارات دفع بلا عملية مطابقة</h2><p className="mt-2 text-sm text-zinc-500">تحتاج هذه الدفعات إلى مطابقة في لوحة مزوّد الدفع قبل اتخاذ أي إجراء.</p>{events.length ? <ul className="mt-4 space-y-2 text-sm">{events.map(e => <li key={e.event_id}><bdi>{e.payment_id}</bdi> — {billingDateAr(e.received_at)}</li>)}</ul> : <p className="mt-4 text-sm">لا توجد إشعارات غير مطابقة.</p>}</section>
  </div>;
}
