"use client";

import { useState } from "react";
import {
  Crown, MagnifyingGlass, CreditCard, Wallet, Coins,
  CheckCircle, XCircle, UserCircle,
} from "@phosphor-icons/react";

/**
 * Admin → Entitlements editor.
 * Search a user, see their current tier + credit balance, then grant a plan
 * tier, AI credits, or wallet balance directly (no gateway) via
 * POST /api/v1/admin/entitlements/grant → grantEntitlement().
 */

interface AdminUserRow {
  id: string;
  display_name: string | null;
  email: string | null;
  user_type: string | null;
  subscription: { tier: string; status: string; current_period_end: string | null } | null;
  credit_balance: number;
}

const TIERS = ["free", "shield", "ai", "pro", "max", "corp", "enterprise"] as const;

export default function AdminEntitlementsPage() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<AdminUserRow[]>([]);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const [tier, setTier] = useState<string>("pro");
  const [durationDays, setDurationDays] = useState(30);
  const [creditsAmount, setCreditsAmount] = useState(100);
  const [walletAmount, setWalletAmount] = useState(100);
  const [granting, setGranting] = useState(false);

  async function runSearch() {
    if (!search.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/users?search=${encodeURIComponent(search)}&limit=10`);
      const json = (await res.json()) as { data?: AdminUserRow[] };
      setResults(json.data ?? []);
    } catch {
      setToast({ ok: false, msg: "تعذّر البحث" });
    } finally {
      setLoading(false);
    }
  }

  async function refreshSelected(id: string, email: string | null) {
    const res = await fetch(`/api/v1/admin/users?search=${encodeURIComponent(email ?? "")}&limit=10`);
    const json = (await res.json()) as { data?: AdminUserRow[] };
    const found = (json.data ?? []).find((u) => u.id === id);
    if (found) setSelected(found);
  }

  async function grant(action: "plan" | "credits" | "wallet") {
    if (!selected) return;
    setGranting(true);
    setToast(null);
    try {
      const body: Record<string, unknown> = { userId: selected.id, action };
      if (action === "plan") {
        body.tier = tier;
        body.durationDays = durationDays;
      } else if (action === "credits") {
        body.amount = creditsAmount;
        body.description = "منحة إدارية للنقاط";
      } else {
        body.amount = walletAmount;
        body.description = "إيداع إداري في المحفظة";
      }
      const res = await fetch("/api/v1/admin/entitlements/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setToast({ ok: false, msg: json.error ?? "فشل تنفيذ المنحة" });
        return;
      }
      setToast({ ok: true, msg: "تم تنفيذ المنحة بنجاح" });
      await refreshSelected(selected.id, selected.email);
    } catch {
      setToast({ ok: false, msg: "تعذّر الاتصال بالخادم" });
    } finally {
      setGranting(false);
    }
  }

  return (
    <div className="min-h-full p-6 md:p-8" dir="rtl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#C8A762]/10 border border-[#C8A762]/20">
          <Crown size={22} weight="duotone" className="text-[#C8A762]" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">منح الصلاحيات والاشتراكات</h1>
          <p className="text-[12px] text-zinc-500">امنح باقة أو نقاطًا أو رصيد محفظة لأي مستخدم مباشرةً (بدون بوابة دفع).</p>
        </div>
      </div>

      {toast && (
        <div className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold border ${
          toast.ok
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
            : "bg-red-500/10 border-red-500/30 text-red-300"
        }`}>
          {toast.ok ? <CheckCircle size={16} weight="fill" /> : <XCircle size={16} weight="fill" />}
          {toast.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Search + results */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="ابحث بالاسم أو البريد الإلكتروني"
              className="flex-1 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#C8A762]/40"
            />
            <button
              onClick={runSearch}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-[13px] font-bold text-emerald-300 hover:bg-[#0B3D2E]/80 disabled:opacity-50"
            >
              <MagnifyingGlass size={15} /> بحث
            </button>
          </div>

          <div className="mt-4 space-y-1.5 max-h-[420px] overflow-y-auto">
            {results.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelected(u)}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-right transition-all border ${
                  selected?.id === u.id
                    ? "bg-[#0B3D2E]/40 border-[#0B3D2E]/60"
                    : "bg-white/[0.02] border-transparent hover:bg-white/[0.05]"
                }`}
              >
                <UserCircle size={26} className="text-zinc-600 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-white truncate">{u.display_name ?? "—"}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{u.email ?? u.id}</p>
                </div>
                <span className="text-[10px] font-bold text-[#C8A762] uppercase">
                  {u.subscription?.tier ?? "free"}
                </span>
              </button>
            ))}
            {!loading && results.length === 0 && (
              <p className="text-center text-[12px] text-zinc-600 py-8">ابحث عن مستخدم لبدء المنح</p>
            )}
          </div>
        </div>

        {/* Grant panel */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <Crown size={40} weight="thin" className="text-zinc-700 mb-3" />
              <p className="text-[13px] text-zinc-600">اختر مستخدمًا من القائمة لمنحه صلاحية</p>
            </div>
          ) : (
            <>
              <div className="mb-5 rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                <p className="text-[14px] font-black text-white">{selected.display_name ?? "—"}</p>
                <p className="text-[11px] text-zinc-500">{selected.email}</p>
                <div className="mt-3 flex gap-4 text-[12px]">
                  <span className="text-zinc-400">الباقة: <b className="text-[#C8A762]">{selected.subscription?.tier ?? "free"}</b></span>
                  <span className="text-zinc-400">النقاط: <b className="text-emerald-300">{selected.credit_balance}</b></span>
                </div>
              </div>

              {/* Plan grant */}
              <div className="mb-4 rounded-xl border border-white/[0.06] p-4">
                <p className="mb-2 flex items-center gap-2 text-[13px] font-bold text-white"><CreditCard size={15} className="text-[#C8A762]" /> منح باقة</p>
                <div className="flex gap-2">
                  <select value={tier} onChange={(e) => setTier(e.target.value)}
                    className="flex-1 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-[12px] text-white focus:outline-none">
                    {TIERS.map((t) => <option key={t} value={t} className="bg-[#0d0d15]">{t}</option>)}
                  </select>
                  <input type="number" value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))}
                    className="w-24 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-[12px] text-white focus:outline-none" placeholder="أيام" />
                  <button onClick={() => grant("plan")} disabled={granting}
                    className="rounded-lg bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-emerald-300 hover:bg-[#0B3D2E]/80 disabled:opacity-50">منح</button>
                </div>
              </div>

              {/* Credits grant */}
              <div className="mb-4 rounded-xl border border-white/[0.06] p-4">
                <p className="mb-2 flex items-center gap-2 text-[13px] font-bold text-white"><Coins size={15} className="text-[#C8A762]" /> منح نقاط ذكاء اصطناعي</p>
                <div className="flex gap-2">
                  <input type="number" value={creditsAmount} onChange={(e) => setCreditsAmount(Number(e.target.value))}
                    className="flex-1 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-[12px] text-white focus:outline-none" />
                  <button onClick={() => grant("credits")} disabled={granting}
                    className="rounded-lg bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-emerald-300 hover:bg-[#0B3D2E]/80 disabled:opacity-50">منح</button>
                </div>
              </div>

              {/* Wallet grant */}
              <div className="rounded-xl border border-white/[0.06] p-4">
                <p className="mb-2 flex items-center gap-2 text-[13px] font-bold text-white"><Wallet size={15} className="text-[#C8A762]" /> إيداع في المحفظة (ريال)</p>
                <div className="flex gap-2">
                  <input type="number" value={walletAmount} onChange={(e) => setWalletAmount(Number(e.target.value))}
                    className="flex-1 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-[12px] text-white focus:outline-none" />
                  <button onClick={() => grant("wallet")} disabled={granting}
                    className="rounded-lg bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-emerald-300 hover:bg-[#0B3D2E]/80 disabled:opacity-50">إيداع</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
