"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft, User, Robot, Ticket, Money, Star, Eye,
  LockSimple, Crown, ChatCircle, ShieldCheck, Clock,
  CheckCircle, Warning, Globe, DeviceMobile, Desktop,
  SignIn, SignOut, CreditCard, ChartLine, Scales,
  ArrowSquareOut, Envelope, Prohibit, UserSwitch,
  Plus, Minus, SpinnerGap, CaretDown,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface SubscriptionPlan {
  id: string;
  name_ar: string;
  name_en: string;
  tier: string;
  price_monthly: number;
  price_yearly: number;
}

interface Subscription {
  id: string;
  status: string;
  tier: string;
  billing_cycle: string;
  current_period_end: string;
  auto_renew: boolean;
  plan_id: string;
  created_at: string;
  subscription_plans?: SubscriptionPlan;
}

interface CreditTransaction {
  id: string;
  amount: number;
  kind: string;
  description: string;
  balance_after: number;
  created_at: string;
}

interface UserData {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  user_type: string;
  status: string;
  city: string;
  created_at: string;
  last_sign_in_at: string;
  subscription: Subscription | null;
  subscription_history: Subscription[];
  lawyer_profile: Record<string, unknown> | null;
  credit_transactions: CreditTransaction[];
  credit_balance: number;
}

const ROLE_MAP: Record<string,string> = {
  lawyer:"محامي", firm:"مكتب محاماة", corporate:"شركة",
  micro:"منشأة صغيرة", provider:"مزود خدمة", individual:"عميل فرد",
  admin:"مسؤول",
};

const TIER_MAP: Record<string,string> = {
  free:"مجاني", starter:"Starter", pro:"Pro", enterprise:"Enterprise",
};

const STATUS_MAP: Record<string,{label:string;cls:string}> = {
  active: { label:"نشط", cls:"bg-emerald-500/15 border border-emerald-500/30 text-emerald-400" },
  suspended: { label:"معلّق", cls:"bg-red-500/15 border border-red-500/30 text-red-400" },
  inactive: { label:"غير نشط", cls:"bg-zinc-500/15 border border-zinc-500/30 text-zinc-400" },
};

type Tab = "activity"|"subscription"|"ai"|"tickets"|"security";

/* ── Skeleton ──────────────────────────────────────────────────────────────── */
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-700/30 ${className}`} />;
}

/* ── Page ──────────────────────────────────────────────────────────────────── */
export default function UserProfilePage() {
  const { isDark } = useTheme();
  const params = useParams();
  const userId = params.id as string;

  const [tab, setTab] = useState<Tab>("activity");
  const [impersonating, setImpersonating] = useState(false);

  /* ── Data state ────────────────────────────────────────────────────────── */
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── Subscription actions state ────────────────────────────────────────── */
  const [changingPlan, setChangingPlan] = useState(false);
  const [selectedTier, setSelectedTier] = useState("");
  const [planActionLoading, setPlanActionLoading] = useState(false);
  const [planActionMsg, setPlanActionMsg] = useState<{type:"ok"|"err";text:string}|null>(null);

  /* ── Credits state ─────────────────────────────────────────────────────── */
  const [showCredits, setShowCredits] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditDesc, setCreditDesc] = useState("");
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditMsg, setCreditMsg] = useState<{type:"ok"|"err";text:string}|null>(null);

  /* ── Fetch user data ───────────────────────────────────────────────────── */
  const fetchUser = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "حدث خطأ");
      setUserData(json.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "حدث خطأ أثناء جلب البيانات");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  /* ── Change plan handler ───────────────────────────────────────────────── */
  const handleChangePlan = async () => {
    if (!userData?.subscription?.id || !selectedTier) return;
    setPlanActionLoading(true);
    setPlanActionMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/subscriptions/${userData.subscription.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: selectedTier }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "فشل تحديث الباقة");
      setPlanActionMsg({ type:"ok", text: json.message || "تم تحديث الباقة بنجاح" });
      setChangingPlan(false);
      setSelectedTier("");
      fetchUser(); // refresh
    } catch (err: unknown) {
      setPlanActionMsg({ type:"err", text: err instanceof Error ? err.message : "حدث خطأ" });
    } finally {
      setPlanActionLoading(false);
    }
  };

  /* ── Grant credits handler ─────────────────────────────────────────────── */
  const handleGrantCredits = async () => {
    const amt = parseInt(creditAmount, 10);
    if (!amt || !creditDesc.trim() || !userId) return;
    setCreditLoading(true);
    setCreditMsg(null);
    try {
      const res = await fetch("/api/v1/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, amount: amt, description: creditDesc }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "فشل تعديل الرصيد");
      setCreditMsg({ type:"ok", text: json.message || "تم تعديل الرصيد بنجاح" });
      setCreditAmount("");
      setCreditDesc("");
      setShowCredits(false);
      fetchUser(); // refresh
    } catch (err: unknown) {
      setCreditMsg({ type:"err", text: err instanceof Error ? err.message : "حدث خطأ" });
    } finally {
      setCreditLoading(false);
    }
  };

  /* ── Derived values ────────────────────────────────────────────────────── */
  const U = userData;
  const activeSub = U?.subscription;
  const subHistory = U?.subscription_history ?? [];
  const creditTxns = U?.credit_transactions ?? [];
  const statusInfo = U ? (STATUS_MAP[U.status] ?? STATUS_MAP.inactive) : STATUS_MAP.inactive;
  const planLabel = activeSub?.subscription_plans?.name_ar
    ?? TIER_MAP[activeSub?.tier ?? ""] ?? activeSub?.tier ?? "مجاني";

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const TABS:{id:Tab;label:string;icon:React.ElementType}[] = [
    { id:"activity", label:"النشاط", icon:Clock },
    { id:"subscription", label:"الاشتراك", icon:CreditCard },
    { id:"ai", label:"استخدام AI", icon:Robot },
    { id:"tickets", label:"تذاكر الدعم", icon:Ticket },
    { id:"security", label:"الأمان", icon:ShieldCheck },
  ];

  /* ── Loading State ─────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
        {/* Header skeleton */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
        </div>
        {/* KPI skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_,i) => (
            <div key={i} className={`${card} p-4 flex items-center gap-3`}>
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
          ))}
        </div>
        {/* Tabs skeleton */}
        <Skeleton className="h-10 w-full rounded-xl" />
        {/* Content skeleton */}
        <div className={`${card} p-5 space-y-4`}>
          {[...Array(5)].map((_,i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Error State ───────────────────────────────────────────────────────── */
  if (error || !U) {
    return (
      <div className="max-w-6xl mx-auto" dir="rtl">
        <div className={`${card} p-10 text-center space-y-4`}>
          <Warning size={40} weight="duotone" className="text-red-400 mx-auto" />
          <p className={`text-[14px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
            {error || "المستخدم غير موجود"}
          </p>
          <Link href="/dashboard/admin/users"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold ${isDark ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"} transition-colors`}>
            <ArrowLeft size={14} /> العودة لقائمة المستخدمين
          </Link>
        </div>
      </div>
    );
  }

  /* ── Helpers for display ───────────────────────────────────────────────── */
  const formatDate = (d: string | null | undefined) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("ar-SA", { year:"numeric", month:"long", day:"numeric" }); }
    catch { return d; }
  };

  const timeAgo = (d: string | null | undefined) => {
    if (!d) return "—";
    try {
      const diff = Date.now() - new Date(d).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return "الآن";
      if (mins < 60) return `منذ ${mins} دق`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `منذ ${hours} ساعة`;
      const days = Math.floor(hours / 24);
      return `منذ ${days} يوم`;
    } catch { return "—"; }
  };

  /* ── Build activity from credit transactions ───────────────────────────── */
  const ACTIVITY = creditTxns.slice(0, 10).map(tx => ({
    action: tx.description || (tx.amount > 0 ? `إضافة ${tx.amount} رصيد` : `خصم ${Math.abs(tx.amount)} رصيد`),
    time: timeAgo(tx.created_at),
    type: tx.kind === "admin_adjustment" ? "pay" as const : "ai" as const,
  }));

  /* ── Build payments from subscription history ──────────────────────────── */
  const PAYMENTS = subHistory.map(s => ({
    date: formatDate(s.created_at),
    amount: s.subscription_plans?.price_monthly ?? 0,
    status: s.status,
    tier: s.subscription_plans?.name_ar ?? s.tier,
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-5" dir="rtl">

      {/* Impersonation Banner */}
      {impersonating && (
        <motion.div initial={{y:-40,opacity:0}} animate={{y:0,opacity:1}}
          className="fixed top-0 inset-x-0 z-50 bg-red-600 text-white flex items-center justify-center gap-3 py-2.5 text-[13px] font-bold shadow-lg">
          <UserSwitch size={16} weight="bold"/>
          أنت تتصفح المنصة كـ {U.full_name ?? U.email} — كل الإجراءات مسجلة
          <button onClick={()=>setImpersonating(false)}
            className="mr-4 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-[11px] font-bold transition-colors">
            إنهاء الانتحال
          </button>
        </motion.div>
      )}

      {/* Back + Header */}
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/admin/users"
            className={`h-10 w-10 rounded-xl flex items-center justify-center ${isDark?"bg-zinc-800 text-zinc-400 hover:bg-zinc-700":"bg-slate-100 text-slate-500 hover:bg-slate-200"} transition-colors`}>
            <ArrowLeft size={16}/>
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className={`text-xl font-bold ${isDark?"text-white":"text-slate-800"}`}>{U.full_name ?? U.email}</h1>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${statusInfo.cls}`}>
                {statusInfo.label}
              </span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">{planLabel}</span>
            </div>
            <p className={`text-[12px] ${isDark?"text-zinc-500":"text-slate-400"}`}>
              {ROLE_MAP[U.user_type] ?? U.user_type} · {U.email} · {U.id.slice(0,8)}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={()=>setImpersonating(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition-colors">
            <SignIn size={13}/> تصفح كمستخدم
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-colors">
            <Crown size={13}/> ترقية الباقة
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors">
            <Envelope size={13}/> إرسال رسالة
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors">
            <Prohibit size={13}/> تعليق الحساب
          </button>
        </div>
      </motion.div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:"رصيد الكريدت", val:`${(U.credit_balance ?? 0).toLocaleString("ar-SA")}`, icon:Money, c:"text-emerald-400" },
          { label:"المعاملات", val:(creditTxns.length).toLocaleString("ar-SA"), icon:Robot, c:"text-purple-400" },
          { label:"الاشتراكات", val:subHistory.length.toString(), icon:Ticket, c:"text-orange-400" },
          { label:"الباقة", val:planLabel, icon:Star, c:"text-[#C8A762]" },
        ].map((k,i)=>(
          <motion.div key={i} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*0.06}}
            className={`${card} p-4 flex items-center gap-3`}>
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark?"bg-white/[0.04]":"bg-slate-50"} ${k.c}`}>
              <k.icon size={18} weight="duotone"/>
            </div>
            <div>
              <p className={`text-[10px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{k.label}</p>
              <p className={`text-[18px] font-bold ${k.c}`}>{k.val}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className={`flex items-center gap-1 border-b ${isDark?"border-white/[0.06]":"border-slate-100"} pb-0.5`}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-t-xl transition-all ${
              tab===t.id
                ? isDark?"text-white border-b-2 border-[#C8A762]":"text-slate-800 border-b-2 border-[#0B3D2E]"
                : isDark?"text-zinc-600 hover:text-zinc-400":"text-slate-400 hover:text-slate-600"
            }`}>
            <t.icon size={13}/>{t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab==="activity" && (
        <motion.div key="act" initial={{opacity:0}} animate={{opacity:1}} className={`${card} p-5`}>
          <p className={`text-[13px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>سجل النشاط</p>
          {ACTIVITY.length === 0 ? (
            <p className={`text-[12px] text-center py-8 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا يوجد نشاط مسجل</p>
          ) : (
          <div className="space-y-0">
            {ACTIVITY.map((a,i)=>(
              <motion.div key={i} initial={{opacity:0,x:8}} animate={{opacity:1,x:0}} transition={{delay:i*0.05}}
                className={`flex items-center gap-3 py-3 ${i<ACTIVITY.length-1?`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`:""}`}>
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  a.type==="ai"?"bg-purple-500/10 text-purple-400":
                  a.type==="pay"?"bg-emerald-500/10 text-emerald-400":
                  "bg-zinc-500/10 text-zinc-400"
                }`}>
                  {a.type==="ai"?<Robot size={14}/>:a.type==="pay"?<Money size={14}/>:
                   <Eye size={14}/>}
                </div>
                <p className={`flex-1 text-[12px] ${isDark?"text-zinc-300":"text-slate-600"}`}>{a.action}</p>
                <span className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{a.time}</span>
              </motion.div>
            ))}
          </div>
          )}
        </motion.div>
      )}

      {tab==="subscription" && (
        <motion.div key="sub" initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">
          {/* Subscription Details */}
          <div className={`${card} p-5`}>
            <p className={`text-[13px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>تفاصيل الاشتراك</p>
            {activeSub ? (
              <>
                <div className="grid grid-cols-3 gap-4 mb-5">
                  {[
                    { label:"الباقة الحالية", val:`${activeSub.subscription_plans?.name_ar ?? activeSub.tier} — ${activeSub.subscription_plans?.price_monthly ?? 0} ر.س/${activeSub.billing_cycle === "yearly" ? "سنة" : "شهر"}` },
                    { label:"تاريخ التجديد", val: formatDate(activeSub.current_period_end) },
                    { label:"دورة الفوترة", val: activeSub.billing_cycle === "yearly" ? "سنوي" : "شهري" },
                  ].map((r,i)=>(
                    <div key={i}>
                      <p className={`text-[10px] mb-1 ${isDark?"text-zinc-500":"text-slate-400"}`}>{r.label}</p>
                      <p className={`text-[13px] font-bold ${isDark?"text-zinc-200":"text-slate-700"}`}>{r.val}</p>
                    </div>
                  ))}
                </div>

                {/* Action messages */}
                {planActionMsg && (
                  <div className={`mb-3 text-[11px] font-bold px-3 py-2 rounded-xl ${planActionMsg.type === "ok" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                    {planActionMsg.text}
                  </div>
                )}

                {/* Change Plan */}
                <div className="flex items-center gap-2 flex-wrap">
                  {!changingPlan ? (
                    <button onClick={() => { setChangingPlan(true); setPlanActionMsg(null); }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-colors">
                      <Crown size={13}/> تغيير الباقة
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <select value={selectedTier} onChange={e => setSelectedTier(e.target.value)}
                          className={`appearance-none pl-7 pr-3 py-2 rounded-xl text-[11px] font-bold border transition-colors ${
                            isDark ? "bg-zinc-800 border-white/[0.06] text-zinc-200" : "bg-slate-50 border-slate-200 text-slate-700"
                          }`}>
                          <option value="">اختر الباقة</option>
                          {["free","starter","pro","enterprise"].filter(t => t !== activeSub.tier).map(t => (
                            <option key={t} value={t}>{TIER_MAP[t] ?? t}</option>
                          ))}
                        </select>
                        <CaretDown size={12} className={`absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? "text-zinc-500" : "text-slate-400"}`} />
                      </div>
                      <button onClick={handleChangePlan} disabled={!selectedTier || planActionLoading}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40">
                        {planActionLoading ? <SpinnerGap size={13} className="animate-spin"/> : <CheckCircle size={13}/>} تأكيد
                      </button>
                      <button onClick={() => { setChangingPlan(false); setSelectedTier(""); setPlanActionMsg(null); }}
                        className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                        إلغاء
                      </button>
                    </div>
                  )}

                  {/* Grant Credits */}
                  {!showCredits ? (
                    <button onClick={() => { setShowCredits(true); setCreditMsg(null); }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition-colors">
                      <Plus size={13}/> منح رصيد
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input type="number" value={creditAmount} onChange={e => setCreditAmount(e.target.value)}
                        placeholder="الكمية (+ أو -)" className={`w-28 px-3 py-2 rounded-xl text-[11px] font-bold border transition-colors ${
                          isDark ? "bg-zinc-800 border-white/[0.06] text-zinc-200 placeholder:text-zinc-600" : "bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400"
                        }`} />
                      <input type="text" value={creditDesc} onChange={e => setCreditDesc(e.target.value)}
                        placeholder="السبب" className={`w-40 px-3 py-2 rounded-xl text-[11px] font-bold border transition-colors ${
                          isDark ? "bg-zinc-800 border-white/[0.06] text-zinc-200 placeholder:text-zinc-600" : "bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400"
                        }`} />
                      <button onClick={handleGrantCredits} disabled={!creditAmount || !creditDesc.trim() || creditLoading}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40">
                        {creditLoading ? <SpinnerGap size={13} className="animate-spin"/> : <CheckCircle size={13}/>} تأكيد
                      </button>
                      <button onClick={() => { setShowCredits(false); setCreditAmount(""); setCreditDesc(""); setCreditMsg(null); }}
                        className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                        إلغاء
                      </button>
                    </div>
                  )}
                </div>

                {creditMsg && (
                  <div className={`mt-3 text-[11px] font-bold px-3 py-2 rounded-xl ${creditMsg.type === "ok" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                    {creditMsg.text}
                  </div>
                )}

                {/* Credit balance */}
                <div className={`mt-4 pt-3 border-t ${isDark ? "border-white/[0.04]" : "border-slate-50"} flex items-center gap-2`}>
                  <Money size={14} className="text-emerald-400"/>
                  <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>رصيد الكريدت الحالي:</span>
                  <span className="text-[13px] font-bold text-emerald-400">{(U.credit_balance ?? 0).toLocaleString("ar-SA")}</span>
                </div>
              </>
            ) : (
              <p className={`text-[12px] text-center py-6 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                لا يوجد اشتراك نشط
              </p>
            )}
          </div>

          {/* Payments / Subscription History */}
          <div className={`${card} p-5`}>
            <p className={`text-[13px] font-bold mb-3 ${isDark?"text-white":"text-slate-800"}`}>سجل الاشتراكات</p>
            {PAYMENTS.length === 0 ? (
              <p className={`text-[12px] text-center py-6 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا يوجد سجل اشتراكات</p>
            ) : (
              PAYMENTS.map((p,i)=>(
                <div key={i} className={`flex items-center justify-between py-2.5 ${i<PAYMENTS.length-1?`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`:""}`}>
                  <span className={`text-[12px] ${isDark?"text-zinc-400":"text-slate-500"}`}>{p.date}</span>
                  <span className={`text-[11px] ${isDark?"text-zinc-400":"text-slate-500"}`}>{p.tier}</span>
                  <span className={`text-[12px] font-bold ${isDark?"text-white":"text-slate-700"}`}>{p.amount} ر.س</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    p.status === "active" ? "text-emerald-400 bg-emerald-500/10" :
                    p.status === "cancelled" ? "text-red-400 bg-red-500/10" :
                    "text-zinc-400 bg-zinc-500/10"
                  }`}>
                    {p.status === "active" ? "نشط" : p.status === "cancelled" ? "ملغي" : p.status === "expired" ? "منتهي" : p.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}

      {tab==="ai" && (
        <motion.div key="ai" initial={{opacity:0}} animate={{opacity:1}} className={`${card} p-5`}>
          <p className={`text-[13px] font-bold mb-5 ${isDark?"text-white":"text-slate-800"}`}>آخر معاملات الرصيد</p>
          {creditTxns.length === 0 ? (
            <p className={`text-[12px] text-center py-8 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد معاملات</p>
          ) : (
          <div className="space-y-4">
            {creditTxns.map((tx,i)=>(
              <div key={tx.id || i}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className={`text-[12px] font-semibold ${isDark?"text-zinc-300":"text-slate-600"}`}>
                    {tx.description || tx.kind}
                  </p>
                  <span className={`text-[11px] font-bold ${tx.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString("ar-SA")} رصيد
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{timeAgo(tx.created_at)}</span>
                  <span className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>الرصيد بعد: {tx.balance_after?.toLocaleString("ar-SA") ?? "—"}</span>
                </div>
                {i < creditTxns.length - 1 && <div className={`mt-3 border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`}/>}
              </div>
            ))}
          </div>
          )}
        </motion.div>
      )}

      {tab==="tickets" && (
        <motion.div key="tix" initial={{opacity:0}} animate={{opacity:1}} className={`${card} p-5`}>
          <p className={`text-[13px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>تذاكر الدعم</p>
          {[
            { id:"#١٢٨", title:"مشكلة في تصدير PDF", status:"open", date:"منذ أسبوع" },
            { id:"#١٠٤", title:"طلب ترقية باقة", status:"closed", date:"منذ شهر" },
            { id:"#٨٩", title:"استفسار عن حاسبة الأتعاب", status:"closed", date:"منذ شهرين" },
          ].map((t,i)=>(
            <div key={i} className={`flex items-center gap-3 py-3 ${i<2?`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`:""}`}>
              <Ticket size={14} className={t.status==="open"?"text-orange-400":"text-zinc-500"}/>
              <p className={`flex-1 text-[12px] ${isDark?"text-zinc-300":"text-slate-600"}`}>{t.title}</p>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                t.status==="open"?"bg-orange-500/10 border-orange-500/20 text-orange-400":"bg-zinc-500/10 border-zinc-500/20 text-zinc-500"
              }`}>{t.status==="open"?"مفتوح":"مغلق"}</span>
              <span className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{t.date}</span>
            </div>
          ))}
        </motion.div>
      )}

      {tab==="security" && (
        <motion.div key="sec" initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">
          <div className={`${card} p-5`}>
            <p className={`text-[13px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>معلومات الحساب</p>
            {[
              { label:"تاريخ التسجيل", val: formatDate(U.created_at) },
              { label:"آخر تسجيل دخول", val: U.last_sign_in_at ? timeAgo(U.last_sign_in_at) : "—" },
              { label:"البريد الإلكتروني", val: U.email },
              { label:"رقم الهاتف", val: U.phone || "غير مسجل" },
              { label:"المدينة", val: U.city || "غير محدد" },
            ].map((r,i)=>(
              <div key={i} className={`flex items-center justify-between py-2.5 ${i<4?`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`:""}`}>
                <span className={`text-[11px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{r.label}</span>
                <span className={`text-[11px] ${isDark?"text-zinc-300":"text-slate-600"}`}>{r.val}</span>
              </div>
            ))}
          </div>
          <div className={`${card} p-5`}>
            <p className={`text-[13px] font-bold mb-3 ${isDark?"text-white":"text-slate-800"}`}>معلومات الأمان</p>
            {[
              { label:"نوع الحساب", val: ROLE_MAP[U.user_type] ?? U.user_type, ok:true },
              { label:"حالة الحساب", val: statusInfo.label, ok: U.status === "active" },
              { label:"معرف المستخدم", val: U.id, ok:true },
            ].map((r,i)=>(
              <div key={i} className={`flex items-center justify-between py-2.5 ${i<2?`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`:""}`}>
                <span className={`text-[11px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{r.label}</span>
                <div className="flex items-center gap-1.5">
                  {r.ok?<CheckCircle size={12} weight="fill" className="text-emerald-400"/>:<Warning size={12} weight="fill" className="text-amber-400"/>}
                  <span className={`text-[11px] ${isDark?"text-zinc-300":"text-slate-600"}`}>{r.val}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
