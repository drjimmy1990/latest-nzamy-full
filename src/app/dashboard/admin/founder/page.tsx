"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, Crown, Pause, Play, FloppyDisk } from "@phosphor-icons/react";
import { formatHalalas } from "@/lib/payments/catalog";
import { orderStatusAr } from "@/lib/payments/billingView";
import {
  ADMIN_REFUND_HREF,
  FOUNDER_ORDER_STATUSES,
  saleStateAr,
  saleToggleCopy,
  type FounderAdminSummary,
  type FounderMemberDto,
  type FounderRefundOrderDto,
} from "@/lib/membership/founderAdmin";

/**
 * «حملة المؤسس» (P3 Task 10) — the founder campaign at a glance and its two
 * levers. The admin console is always dark (admin/layout.tsx).
 *   GET   /api/v1/admin/founder/overview
 *   PATCH /api/v1/admin/founder/sale                  { salePaused } or { capacity } (R25)
 *   POST  /api/v1/admin/founder/orders/[id]/activate  «إعادة محاولة التفعيل»
 */

interface Overview {
  migrationMissing: boolean;
  message?: string;
  summary: FounderAdminSummary | null;
  codeSwitchOn: boolean;
  ordersByStatus: Record<string, number>;
  activations: { today: number; last7Days: number };
  members: FounderMemberDto[];
  membersTruncated: boolean;
  refundOrders: FounderRefundOrderDto[];
  canManage: boolean;
}

const fmt = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
};
const day = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium" });
};
const credit = (c: { remaining: number; total: number } | null) => (c ? `${c.remaining} / ${c.total}` : "—");

async function call(url: string, init?: RequestInit): Promise<{ ok: boolean; body: Record<string, unknown> | null }> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok, body };
  } catch {
    return { ok: false, body: { error: "تعذّر الاتصال بالخادم." } };
  }
}

const OVERVIEW_URL = "/api/v1/admin/founder/overview";
const card = "rounded-2xl border border-white/[0.06] bg-zinc-900/60";
const th = "p-3 text-right text-[11px] font-bold text-zinc-400";
const td = "p-3 text-[12px] text-zinc-200";

export default function FounderCampaignPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const [capacity, setCapacity] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const apply = useCallback(({ ok, body }: { ok: boolean; body: Record<string, unknown> | null }) => {
    if (ok && body) {
      const o = body as unknown as Overview;
      setData(o);
      if (o.summary) setCapacity(String(o.summary.capacity));
    } else {
      setNotice({ ok: false, msg: String(body?.error ?? "تعذّر تحميل بيانات الحملة.") });
    }
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    apply(await call(OVERVIEW_URL));
  }, [apply]);

  useEffect(() => {
    let live = true;
    void call(OVERVIEW_URL).then((res) => {
      if (live) apply(res);
    });
    return () => {
      live = false;
    };
  }, [apply]);

  const summary = data?.summary ?? null;

  async function patchSale(payload: { salePaused: boolean } | { capacity: number }, label: string) {
    setBusy(label);
    setNotice(null);
    const { ok, body } = await call("/api/v1/admin/founder/sale", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setNotice(ok ? { ok: true, msg: "تم الحفظ." } : { ok: false, msg: String(body?.error ?? "تعذّر الحفظ.") });
    setBusy(null);
    if (ok) await load();
  }

  function toggleSale() {
    if (!summary) return;
    const copy = saleToggleCopy(summary.salePaused);
    if (!window.confirm(copy.confirm)) return;
    void patchSale({ salePaused: copy.next }, "toggle");
  }

  function saveCapacity() {
    if (!summary) return;
    const n = Number(capacity.trim());
    if (!/^\d+$/.test(capacity.trim()) || !Number.isInteger(n) || n < 1) {
      setNotice({ ok: false, msg: "عدد المقاعد يجب أن يكون عددًا صحيحًا موجبًا." });
      return;
    }
    if (!window.confirm(`تغيير عدد مقاعد المؤسسين من ${summary.capacity} إلى ${n}؟`)) return;
    void patchSale({ capacity: n }, "capacity");
  }

  async function retry(o: FounderRefundOrderDto) {
    const who = o.name ?? o.email ?? o.userId ?? "المشتري";
    if (!window.confirm(`إعادة محاولة تفعيل عضوية المؤسس لـ ${who}؟ تُفعَّل فقط إن وُجد مقعد متاح وكانت الرخصة موثّقة الآن.`)) return;
    setBusy(o.id);
    setNotice(null);
    const { ok, body } = await call(`/api/v1/admin/founder/orders/${o.id}/activate`, { method: "POST" });
    setNotice({ ok, msg: String(body?.message ?? body?.error ?? (ok ? "تم." : "تعذّر التفعيل.")) });
    setBusy(null);
    await load();
  }

  const tiles: Array<{ label: string; value: string }> = summary
    ? [
        { label: "عدد المقاعد", value: String(summary.capacity) },
        { label: "مفعّلة", value: String(summary.active) },
        { label: "محجوزة الآن", value: String(summary.reserved) },
        { label: "المتبقية", value: String(summary.seatsLeft) },
        { label: "تفعيلات اليوم", value: String(data?.activations.today ?? 0) },
        { label: "آخر ٧ أيام", value: String(data?.activations.last7Days ?? 0) },
      ]
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 flex items-center gap-2 text-xl font-bold text-white">
            <Crown size={20} weight="fill" className="text-[#C8A762]" />
            حملة المؤسس
          </h1>
          <p className="text-[12px] text-zinc-400">المقاعد والأعضاء وأرصدتهم، والعمليات بانتظار استرداد، وإيقاف البيع وعدد المقاعد.</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[12px] text-zinc-200 hover:bg-white/5 disabled:opacity-50"
        >
          <ArrowClockwise size={14} />
          تحديث
        </button>
      </div>

      {notice ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-[12px] ${
            notice.ok ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-red-500/20 bg-red-500/10 text-red-300"
          }`}
        >
          {notice.msg}
        </p>
      ) : null}

      {loading && !data ? <p className="text-[12px] text-zinc-400">جارٍ التحميل…</p> : null}

      {data?.migrationMissing ? (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-300">{data.message}</p>
      ) : null}

      {data && !data.migrationMissing ? (
        <>
          {!data.codeSwitchOn ? (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-300">
              مفتاح البيع في الشيفرة (FOUNDER_MEMBERSHIP_ON_SALE) مغلق: لا تظهر بطاقة المؤسس ولا يُقبل شراؤها حتى يُفتح في إصدار لاحق، مهما كان إعداد الإيقاف هنا.
            </p>
          ) : null}

          <section className={`${card} p-5`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-zinc-300">
                حالة البيع: <span className="font-bold text-white">{saleStateAr(summary, data.codeSwitchOn)}</span>
              </p>
              {data.canManage && summary ? (
                <button
                  onClick={toggleSale}
                  disabled={busy !== null}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-bold disabled:opacity-50 ${
                    summary.salePaused ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-amber-600 text-white hover:bg-amber-500"
                  }`}
                >
                  {summary.salePaused ? <Play size={14} weight="fill" /> : <Pause size={14} weight="fill" />}
                  {busy === "toggle" ? "جارٍ الحفظ…" : saleToggleCopy(summary.salePaused).button}
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {tiles.map((t) => (
                <div key={t.label} className="rounded-xl border border-white/[0.06] bg-zinc-950/40 p-3">
                  <p className="text-[11px] text-zinc-400">{t.label}</p>
                  <p className="mt-1 text-xl font-bold text-white">{t.value}</p>
                </div>
              ))}
            </div>

            {data.canManage && summary ? (
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="text-[12px] text-zinc-300">
                  عدد المقاعد
                  <input
                    aria-label="عدد المقاعد"
                    inputMode="numeric"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className="ms-2 w-28 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-[12px] text-white outline-none"
                    dir="ltr"
                  />
                </label>
                <button
                  onClick={saveCapacity}
                  disabled={busy !== null || capacity.trim() === String(summary.capacity)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[12px] text-zinc-200 hover:bg-white/5 disabled:opacity-50"
                >
                  <FloppyDisk size={14} />
                  {busy === "capacity" ? "جارٍ الحفظ…" : "حفظ عدد المقاعد"}
                </button>
                <p className="text-[11px] text-zinc-400">
                  لا يقل عن المفعّلة والمحجوزة الآن ({summary.active + summary.reserved}).
                </p>
              </div>
            ) : null}
          </section>

          <section className={`${card} p-5`}>
            <h2 className="mb-3 text-[14px] font-bold text-white">عمليات العضوية حسب الحالة</h2>
            <div className="flex flex-wrap gap-2">
              {FOUNDER_ORDER_STATUSES.map((s) => (
                <span key={s} className="rounded-lg border border-white/[0.06] bg-zinc-950/40 px-3 py-1.5 text-[12px] text-zinc-300">
                  {orderStatusAr(s)}: <span className="font-bold text-white">{data.ordersByStatus[s] ?? 0}</span>
                </span>
              ))}
            </div>
          </section>

          <section className={`${card} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3">
              <h2 className="text-[14px] font-bold text-white">بانتظار استرداد ({data.refundOrders.length})</h2>
              <Link href={ADMIN_REFUND_HREF} className="text-[12px] text-[#C8A762] hover:underline">
                صفحة المدفوعات والاسترداد
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {["المشتري", "السبب", "المبلغ", "الإيصال", "تاريخ الدفع", "الإجراء"].map((h) => (
                      <th key={h} className={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {data.refundOrders.map((o) => (
                    <tr key={o.id}>
                      <td className={td}>
                        <p className="font-bold text-white">{o.name ?? "—"}</p>
                        <p className="text-[11px] text-zinc-400" dir="ltr">{o.email ?? o.userId ?? "—"}</p>
                        {o.live === false ? <p className="text-[11px] text-amber-300">عملية تجريبية</p> : null}
                      </td>
                      <td className={td}>
                        <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-300">{o.label}</span>
                        <p className="mt-1 text-[11px] text-zinc-400">{o.reasonAr}</p>
                      </td>
                      <td className={`${td} whitespace-nowrap`}>{formatHalalas(o.totalHalalas)}</td>
                      <td className={td} dir="ltr">{o.receiptNumber ?? o.id}</td>
                      <td className={td}>{fmt(o.paidAt)}</td>
                      <td className={td}>
                        <div className="flex flex-wrap items-center gap-2">
                          {data.canManage && o.canRetry ? (
                            <button
                              onClick={() => void retry(o)}
                              disabled={busy !== null}
                              className="rounded-lg border border-emerald-500/30 px-3 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                            >
                              {busy === o.id ? "جارٍ المحاولة…" : "إعادة محاولة التفعيل"}
                            </button>
                          ) : null}
                          <Link href={ADMIN_REFUND_HREF} className="text-[11px] text-zinc-300 underline hover:text-white">
                            الاسترداد
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.refundOrders.length === 0 ? <p className="p-5 text-[12px] text-zinc-400">لا توجد عمليات بانتظار استرداد.</p> : null}
            </div>
          </section>

          <section className={`${card} overflow-hidden`}>
            <h2 className="p-5 pb-3 text-[14px] font-bold text-white">الأعضاء المؤسسون ({data.members.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {["العضو", "التفعيل", "الانتهاء", "أعمال الصياغة المتبقية", "المخرج المستقل المتبقي"].map((h) => (
                      <th key={h} className={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {data.members.map((m) => (
                    <tr key={m.seatId}>
                      <td className={td}>
                        <p className="font-bold text-white">{m.name ?? "—"}</p>
                        <p className="text-[11px] text-zinc-400" dir="ltr">{m.email ?? m.userId}</p>
                      </td>
                      <td className={td}>{fmt(m.activatedAt)}</td>
                      <td className={td}>{day(m.endsAt)}</td>
                      <td className={td} dir="ltr">{credit(m.credits.draftingWork)}</td>
                      <td className={td} dir="ltr">{credit(m.credits.independentOutput)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.members.length === 0 ? <p className="p-5 text-[12px] text-zinc-400">لا يوجد أعضاء مؤسسون بعد.</p> : null}
              {data.membersTruncated ? <p className="p-5 text-[12px] text-amber-300">القائمة مقتطعة — تُعرض أحدث الأعضاء فقط.</p> : null}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
