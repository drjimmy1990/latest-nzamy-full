"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Crown, ChartLine, CurrencyCircleDollar, Users, TrendDown, Warning, Tag, UserList } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { TIER_LABELS_AR } from "@/hooks/featureAccess";

/**
 * /dashboard/admin/subscriptions — the live subscriptions (C07, l16).
 *
 * Every figure comes from GET /api/v1/admin/stats (`{ data: … }`): the active
 * subscriptions grouped by their REAL plan (name and price from
 * subscription_plans, every tier including corp and shield), the MRR as the
 * monthly equivalent of each cycle's own price, and the count of active paid
 * subscriptions. Test accounts are left out by the API. Nothing is invented:
 * no churn is measured, so none is shown, and a failed read says so instead of
 * showing zeros. Prices are edited on «إدارة الأسعار», subscribers on «المستخدمون».
 */

interface PlanRow {
  plan_id: string;
  name_ar: string | null;
  tier: string;
  count: number;
  mrr: number;
  price_monthly: number | null;
}

interface Stats {
  mrr: number;
  active_paid_subscriptions: number;
  active_subscriptions_by_plan: PlanRow[];
  test_accounts_excluded?: number;
}

const sar = (n: number) => `${Math.round(n).toLocaleString("ar-SA")} ر.س`;

function tierLabel(tier: string): string {
  return (TIER_LABELS_AR as Record<string, string>)[tier] ?? tier;
}

export default function AdminSubscriptionsPage() {
  const { isDark } = useTheme();
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/admin/stats", { cache: "no-store" })
      .then(async (r) => {
        const json = (await r.json().catch(() => null)) as { data?: Partial<Stats> } | null;
        if (!r.ok || !json?.data) throw new Error("stats");
        return json.data;
      })
      .then((d) => {
        if (!alive) return;
        setStats({
          mrr: typeof d.mrr === "number" ? d.mrr : 0,
          active_paid_subscriptions: typeof d.active_paid_subscriptions === "number" ? d.active_paid_subscriptions : 0,
          active_subscriptions_by_plan: Array.isArray(d.active_subscriptions_by_plan) ? d.active_subscriptions_by_plan : [],
          test_accounts_excluded: d.test_accounts_excluded,
        });
      })
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  const plans = stats?.active_subscriptions_by_plan ?? [];
  const paid = stats?.active_paid_subscriptions ?? 0;
  const mrr = stats?.mrr ?? 0;
  const totalSubs = plans.reduce((s, p) => s + p.count, 0);
  const maxMrr = Math.max(...plans.map((p) => p.mrr), 1);

  return (
    <div className="max-w-5xl mx-auto space-y-5" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
            الاشتراكات
          </h1>
          <p className={`text-sm ${muted}`}>
            {loading
              ? "جارٍ التحميل…"
              : failed
                ? "تعذّر تحميل الأرقام الآن."
                : `${paid.toLocaleString("ar-SA")} اشتراك مدفوع نشط · الإيراد الشهري المتكرر ${sar(mrr)} · السنوي ${sar(mrr * 12)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/admin/pricing"
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-bold ${isDark ? "border-white/[0.08] text-zinc-300 hover:bg-zinc-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <Tag size={14} /> إدارة الأسعار
          </Link>
          <Link href="/dashboard/admin/users"
            className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-3 py-2 text-[12px] font-bold text-[#C8A762]">
            <UserList size={14} /> إدارة المشتركين
          </Link>
        </div>
      </motion.div>

      {failed && (
        <div className={`${card} p-4 flex items-center gap-3 border-red-500/20`}>
          <Warning size={16} weight="duotone" className="text-red-500 flex-shrink-0" />
          <p className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
            تعذّر تحميل بيانات الاشتراكات، فلا تُعرض أرقام بدلاً منها. أعد تحميل الصفحة بعد قليل.
          </p>
        </div>
      )}

      {!failed && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "الإيراد الشهري المتكرر", value: loading ? "…" : sar(mrr), icon: CurrencyCircleDollar, color: "text-emerald-500", bg: "bg-emerald-500/8" },
              { label: "اشتراكات مدفوعة نشطة", value: loading ? "…" : paid.toLocaleString("ar-SA"), icon: Users, color: "text-royal", bg: "bg-royal/8" },
              { label: "متوسط الإيراد لكل مشترك", value: loading ? "…" : paid > 0 ? sar(mrr / paid) : "—", icon: ChartLine, color: "text-violet-500", bg: "bg-violet-500/8" },
              { label: "معدل الإلغاء", value: "غير مقيس", icon: TrendDown, color: "text-red-500", bg: "bg-red-500/8" },
            ].map((k, i) => {
              const Icon = k.icon;
              return (
                <motion.div key={k.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={`${card} p-4`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${k.bg}`}>
                    <Icon size={17} weight="duotone" className={k.color} />
                  </div>
                  <p className={`text-[10px] mb-0.5 ${muted}`}>{k.label}</p>
                  <p className={`text-[16px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{k.value}</p>
                </motion.div>
              );
            })}
          </div>

          <p className={`text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>الباقات والمشتركون النشطون</p>
          {!loading && plans.length === 0 && (
            <div className={`${card} p-5 text-[12px] ${muted}`}>لا توجد اشتراكات نشطة الآن.</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {plans.map((plan, i) => {
              const share = totalSubs ? Math.round((plan.count / totalSubs) * 100) : 0;
              return (
                <motion.div key={plan.plan_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={`${card} p-5`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-500/10 flex-shrink-0">
                        <Crown size={17} weight="duotone" className="text-amber-500" />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-[14px] font-black truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{plan.name_ar ?? tierLabel(plan.tier)}</p>
                        <p className={`text-[10px] ${muted}`}>
                          {tierLabel(plan.tier)}
                          {plan.price_monthly != null && plan.price_monthly > 0 ? ` · ${sar(plan.price_monthly)} شهرياً` : plan.tier === "free" ? " · مجانية" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className={`text-[18px] font-black ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{plan.count.toLocaleString("ar-SA")}</p>
                      <p className={`text-[9px] ${muted}`}>مشترك</p>
                    </div>
                  </div>
                  <div className={`h-1.5 rounded-full overflow-hidden mb-3 ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(plan.mrr / maxMrr) * 100}%` }} />
                  </div>
                  <div className={`flex items-center justify-between text-[11px] ${muted}`}>
                    <span>{share.toLocaleString("ar-SA")}٪ من الاشتراكات النشطة</span>
                    <span className="font-bold text-emerald-500">{plan.mrr > 0 ? `${sar(plan.mrr)} شهرياً` : "—"}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
          {typeof stats?.test_accounts_excluded === "number" && stats.test_accounts_excluded > 0 && (
            <p className={`text-[11px] ${muted}`}>لا تدخل الحسابات التجريبية في هذه الأرقام.</p>
          )}
        </>
      )}
    </div>
  );
}
