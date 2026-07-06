"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Tray, CheckCircle, XCircle, Clock, CreditCard, Coins, Wallet, BookOpen, Play,
} from "@phosphor-icons/react";

/**
 * Admin → Entitlement requests queue.
 * Users' paid CTAs create requests here (GET /api/v1/admin/entitlements/requests).
 * Approve applies grantEntitlement (library/media → the tier the admin picks);
 * reject just closes it. Both notify the requester.
 */

interface RequestRow {
  id: string;
  user_id: string;
  kind: string;
  requested_ref: string | null;
  amount: number | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  profile: { display_name: string | null; email: string | null; user_type: string | null } | null;
}

const STATUSES = [
  { key: "pending", label: "قيد المراجعة" },
  { key: "approved", label: "مقبولة" },
  { key: "rejected", label: "مرفوضة" },
] as const;

const KIND_META: Record<string, { label: string; icon: typeof CreditCard }> = {
  plan: { label: "باقة", icon: CreditCard },
  credits: { label: "نقاط", icon: Coins },
  wallet: { label: "محفظة", icon: Wallet },
  library: { label: "المكتبة", icon: BookOpen },
  media: { label: "الوسائط", icon: Play },
};

const TIERS = ["shield", "ai", "pro", "max", "corp", "enterprise"] as const;

export default function AdminEntitlementRequestsPage() {
  const [status, setStatus] = useState<string>("pending");
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tierFor, setTierFor] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/entitlements/requests?status=${status}`);
      const json = (await res.json()) as { data?: RequestRow[] };
      setRows(json.data ?? []);
    } catch {
      setToast({ ok: false, msg: "تعذّر تحميل الطلبات" });
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(row: RequestRow, action: "approve" | "reject") {
    setBusyId(row.id);
    setToast(null);
    try {
      const body: Record<string, unknown> = { action };
      // library/media/plan approvals need a tier to grant.
      if (action === "approve" && ["plan", "library", "media"].includes(row.kind)) {
        body.tier = tierFor[row.id] ?? "pro";
      }
      const res = await fetch(`/api/v1/admin/entitlements/requests/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setToast({ ok: false, msg: json.error ?? "فشل تنفيذ القرار" });
        return;
      }
      setToast({ ok: true, msg: action === "approve" ? "تمت الموافقة" : "تم الرفض" });
      await load();
    } catch {
      setToast({ ok: false, msg: "تعذّر الاتصال بالخادم" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-full p-6 md:p-8" dir="rtl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#C8A762]/10 border border-[#C8A762]/20">
          <Tray size={22} weight="duotone" className="text-[#C8A762]" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">طلبات الترقية والاشتراك</h1>
          <p className="text-[12px] text-zinc-500">راجع طلبات المستخدمين ووافق عليها لتفعيل الباقة/النقاط/المحفظة.</p>
        </div>
      </div>

      {toast && (
        <div className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold border ${
          toast.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border-red-500/30 text-red-300"
        }`}>
          {toast.ok ? <CheckCircle size={16} weight="fill" /> : <XCircle size={16} weight="fill" />}
          {toast.msg}
        </div>
      )}

      {/* Status tabs */}
      <div className="mb-5 flex gap-2">
        {STATUSES.map((s) => (
          <button key={s.key} onClick={() => setStatus(s.key)}
            className={`rounded-xl px-4 py-2 text-[12px] font-bold transition-all border ${
              status === s.key
                ? "bg-[#0B3D2E]/40 border-[#0B3D2E]/60 text-emerald-300"
                : "bg-white/[0.02] border-white/[0.06] text-zinc-500 hover:text-zinc-300"
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {loading && <p className="text-center text-[12px] text-zinc-600 py-10">جارٍ التحميل…</p>}
        {!loading && rows.length === 0 && (
          <div className="flex flex-col items-center py-14 text-center">
            <Tray size={38} weight="thin" className="text-zinc-700 mb-2" />
            <p className="text-[13px] text-zinc-600">لا توجد طلبات في هذه الحالة</p>
          </div>
        )}
        {rows.map((row) => {
          const meta = KIND_META[row.kind] ?? { label: row.kind, icon: Clock };
          const Icon = meta.icon;
          const needsTier = ["plan", "library", "media"].includes(row.kind);
          return (
            <div key={row.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#C8A762]/10 border border-[#C8A762]/20 flex-shrink-0">
                  <Icon size={18} weight="duotone" className="text-[#C8A762]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13px] font-bold text-white">{row.profile?.display_name ?? row.user_id}</p>
                    <span className="text-[10px] text-zinc-500">{row.profile?.email}</span>
                    <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-[#C8A762]">{meta.label}</span>
                    {row.requested_ref && <span className="text-[11px] text-zinc-500">· {row.requested_ref}</span>}
                    {row.amount != null && <span className="text-[11px] text-emerald-300">· {row.amount}</span>}
                  </div>
                  {row.note && <p className="mt-1 text-[12px] text-zinc-400">{row.note}</p>}
                  <p className="mt-1 text-[10px] text-zinc-600">{new Date(row.created_at).toLocaleString("ar-SA")}</p>
                </div>

                {row.status === "pending" ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {needsTier && (
                      <select
                        value={tierFor[row.id] ?? "pro"}
                        onChange={(e) => setTierFor((p) => ({ ...p, [row.id]: e.target.value }))}
                        className="rounded-lg bg-white/[0.04] border border-white/[0.08] px-2 py-1.5 text-[11px] text-white focus:outline-none"
                      >
                        {TIERS.map((t) => <option key={t} value={t} className="bg-[#0d0d15]">{t}</option>)}
                      </select>
                    )}
                    <button onClick={() => decide(row, "approve")} disabled={busyId === row.id}
                      className="flex items-center gap-1 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-50">
                      <CheckCircle size={13} weight="fill" /> موافقة
                    </button>
                    <button onClick={() => decide(row, "reject")} disabled={busyId === row.id}
                      className="flex items-center gap-1 rounded-lg bg-red-600/15 border border-red-500/25 px-3 py-1.5 text-[11px] font-bold text-red-300 hover:bg-red-600/25 disabled:opacity-50">
                      <XCircle size={13} weight="fill" /> رفض
                    </button>
                  </div>
                ) : (
                  <span className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold ${
                    row.status === "approved" ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"
                  }`}>
                    {row.status === "approved" ? "مقبول" : "مرفوض"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
