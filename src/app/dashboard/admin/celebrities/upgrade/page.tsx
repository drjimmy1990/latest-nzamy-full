"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserCirclePlus, MagnifyingGlass, Star, Crown,
  CheckCircle, ArrowRight, QrCode, Gift, Warning,
} from "@phosphor-icons/react";
import Link from "next/link";

// ─── Mock Users (بحث عن مستخدم قبل الترقية) ─────────────────────────────────
const MOCK_USERS = [
  { id: "u1", name: "محمد العتيبي",   email: "m.ataibi@gmail.com",   type: "individual", joined: "١٠ مارس ٢٠٢٦",   avatar: "م" },
  { id: "u2", name: "ريم الدوسري",    email: "reem.d@outlook.com",   type: "individual", joined: "٢٢ فبراير ٢٠٢٦", avatar: "ر" },
  { id: "u3", name: "سعد الزهراني",   email: "saad.z@hotmail.com",   type: "individual", joined: "٥ أبريل ٢٠٢٦",   avatar: "س" },
  { id: "u4", name: "هنوف السبيعي",   email: "h.subaie@gmail.com",   type: "individual", joined: "١٨ أبريل ٢٠٢٦",  avatar: "ه" },
];

type Step = "search" | "configure" | "confirm" | "done";

export default function CelebrityUpgradePage() {
  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<typeof MOCK_USERS[0] | null>(null);
  const [code, setCode] = useState("");
  const [tier, setTier] = useState<"standard" | "gold" | "platinum">("standard");
  const [commission, setCommission] = useState("20");

  const results = MOCK_USERS.filter(u =>
    query.length >= 2 &&
    (u.name.includes(query) || u.email.toLowerCase().includes(query.toLowerCase()))
  );

  const tiers = [
    { id: "standard" as const, label: "Standard", icon: Star, color: "text-zinc-400", commission: "١٠–١٥٪", perks: "خصم ١٥٪ للعملاء" },
    { id: "gold"     as const, label: "Gold",      icon: Star, color: "text-[#C8A762]", commission: "١٥–٢٥٪", perks: "خصم ٢٠٪ + دعم مخصص" },
    { id: "platinum" as const, label: "Platinum",  icon: Crown, color: "text-sky-400", commission: "٢٥–٤٠٪", perks: "خصم ٣٠٪ + مدير حساب" },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Link href="/dashboard/admin/celebrities"
            className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 mb-3 transition-colors">
            <ArrowRight size={12} /> العودة للسفراء
          </Link>
          <div className="flex items-center gap-2 mb-1">
            <UserCirclePlus size={22} weight="fill" className="text-[#C8A762]" />
            <h1 className="text-2xl font-bold text-white">ترقية مستخدم لسفير</h1>
          </div>
          <p className="text-sm text-zinc-500">ابحث عن المستخدم ثم حدد باقة السفير ورمز الإحالة</p>
        </motion.div>

        {/* Progress Steps */}
        <div className="flex items-center gap-0 text-[11px]">
          {(["search","configure","confirm","done"] as Step[]).map((s, i, arr) => {
            const labels = ["بحث", "إعداد", "تأكيد", "تم"];
            const idx = arr.indexOf(step);
            const done = i < idx;
            const current = i === idx;
            return (
              <div key={s} className="flex items-center">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold transition-all ${
                  done    ? "bg-emerald-500/10 text-emerald-400"
                  : current ? "bg-[#0B3D2E]/30 text-emerald-300 border border-emerald-800/40"
                  : "text-zinc-700"
                }`}>
                  {done ? <CheckCircle size={12} weight="fill" /> : <span>{i+1}</span>}
                  {labels[i]}
                </div>
                {i < arr.length - 1 && <span className="mx-1 text-zinc-800">›</span>}
              </div>
            );
          })}
        </div>

        {/* ── Step 1: Search ── */}
        <AnimatePresence mode="wait">
          {step === "search" && (
            <motion.div key="search" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-4">
              <div className="rounded-2xl border border-white/[0.07] bg-zinc-900/70 p-5">
                <label className="text-[13px] font-semibold text-zinc-300 mb-2 block">ابحث عن المستخدم</label>
                <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-zinc-800/50 px-3">
                  <MagnifyingGlass size={16} className="text-zinc-600" />
                  <input value={query} onChange={e => setQuery(e.target.value)}
                    placeholder="اسم المستخدم أو البريد الإلكتروني..."
                    className="flex-1 py-3 text-sm bg-transparent outline-none text-zinc-200 placeholder-zinc-600" />
                </div>

                {/* Results */}
                {results.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {results.map(u => (
                      <motion.button key={u.id} whileTap={{ scale: 0.99 }}
                        onClick={() => { setSelected(u); setStep("configure"); }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-right transition-all ${
                          selected?.id === u.id
                            ? "border-emerald-700/40 bg-[#0B3D2E]/20"
                            : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"
                        }`}>
                        <div className="w-9 h-9 rounded-xl bg-zinc-800 text-emerald-400 flex items-center justify-center font-bold">
                          {u.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-white">{u.name}</p>
                          <p className="text-[11px] text-zinc-500">{u.email} · انضم {u.joined}</p>
                        </div>
                        <ArrowRight size={14} className="text-zinc-700" />
                      </motion.button>
                    ))}
                  </div>
                )}

                {query.length >= 2 && results.length === 0 && (
                  <div className="mt-4 text-center py-6">
                    <Warning size={24} className="text-zinc-700 mx-auto mb-2" />
                    <p className="text-[13px] text-zinc-500">لا يوجد مستخدم بهذا الاسم</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Configure ── */}
          {step === "configure" && selected && (
            <motion.div key="configure" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-4">
              {/* Selected user */}
              <div className="rounded-2xl border border-emerald-700/30 bg-[#0B3D2E]/10 p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 text-emerald-400 flex items-center justify-center font-bold text-[16px]">
                  {selected.avatar}
                </div>
                <div>
                  <p className="text-[14px] font-bold text-white">{selected.name}</p>
                  <p className="text-[11px] text-zinc-500">{selected.email}</p>
                </div>
                <CheckCircle size={16} weight="fill" className="text-emerald-500 ms-auto" />
              </div>

              {/* Tier Selection */}
              <div className="rounded-2xl border border-white/[0.07] bg-zinc-900/70 p-5 space-y-3">
                <label className="text-[13px] font-semibold text-zinc-300 block">مستوى السفير</label>
                {tiers.map(t => {
                  const Icon = t.icon;
                  return (
                    <button key={t.id} onClick={() => setTier(t.id)}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-right transition-all ${
                        tier === t.id
                          ? "border-[#0B3D2E]/60 bg-[#0B3D2E]/15"
                          : "border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04]"
                      }`}>
                      <Icon size={18} weight="fill" className={t.color} />
                      <div className="flex-1">
                        <p className={`text-[13px] font-bold ${t.color}`}>{t.label}</p>
                        <p className="text-[11px] text-zinc-500">{t.perks}</p>
                      </div>
                      <span className="text-[11px] text-zinc-500">عمولة {t.commission}</span>
                      {tier === t.id && <CheckCircle size={14} weight="fill" className="text-emerald-500" />}
                    </button>
                  );
                })}
              </div>

              {/* Referral Code */}
              <div className="rounded-2xl border border-white/[0.07] bg-zinc-900/70 p-5 space-y-3">
                <label className="text-[13px] font-semibold text-zinc-300 block">رمز الإحالة</label>
                <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-zinc-800/50 px-3">
                  <QrCode size={16} className="text-zinc-600" />
                  <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                    placeholder="مثال: AHMED20"
                    className="flex-1 py-3 text-sm bg-transparent outline-none text-white placeholder-zinc-600 tracking-widest font-mono" />
                </div>
                <p className="text-[11px] text-zinc-600">يجب أن يكون فريداً — سيحصل العميل الجديد على خصم عند استخدامه</p>
              </div>

              {/* Commission */}
              <div className="rounded-2xl border border-white/[0.07] bg-zinc-900/70 p-5">
                <label className="text-[13px] font-semibold text-zinc-300 mb-3 block">نسبة العمولة ٪</label>
                <div className="flex items-center gap-3">
                  <input type="range" min="5" max="40" value={commission}
                    onChange={e => setCommission(e.target.value)}
                    className="flex-1 accent-emerald-500" />
                  <span className="text-[20px] font-black text-white font-mono w-14 text-center">{commission}٪</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep("search")}
                  className="flex-1 py-3 rounded-xl border border-white/[0.07] text-zinc-400 text-[13px] font-bold hover:bg-white/[0.03] transition-colors">
                  السابق
                </button>
                <button onClick={() => setStep("confirm")} disabled={!code}
                  className="flex-1 py-3 rounded-xl bg-[#0B3D2E] text-white text-[13px] font-bold hover:bg-[#0a3328] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  التالي
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: Confirm ── */}
          {step === "confirm" && selected && (
            <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-4">
              <div className="rounded-2xl border border-white/[0.07] bg-zinc-900/70 p-6 space-y-4">
                <h2 className="text-[15px] font-bold text-white">تأكيد الترقية</h2>
                {[
                  { label: "المستخدم",     value: selected.name },
                  { label: "المستوى",      value: tier === "gold" ? "Gold ⭐" : tier === "platinum" ? "Platinum 👑" : "Standard" },
                  { label: "رمز الإحالة", value: code },
                  { label: "نسبة العمولة",value: `${commission}٪` },
                ].map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0">
                    <span className="text-[12px] text-zinc-500">{r.label}</span>
                    <span className="text-[13px] font-bold text-white">{r.value}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
                <Warning size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-400">بعد الترقية سيظهر قسم "سفير نظامي" في داشبورد المستخدم تلقائياً</p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep("configure")}
                  className="flex-1 py-3 rounded-xl border border-white/[0.07] text-zinc-400 text-[13px] font-bold hover:bg-white/[0.03] transition-colors">
                  السابق
                </button>
                <motion.button whileTap={{ scale: 0.98 }} onClick={() => setStep("done")}
                  className="flex-1 py-3 rounded-xl bg-[#0B3D2E] text-white text-[13px] font-bold hover:bg-[#0a3328] transition-colors">
                  تأكيد الترقية ✓
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── Step 4: Done ── */}
          {step === "done" && selected && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-emerald-700/30 bg-[#0B3D2E]/10 p-8 text-center">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                <CheckCircle size={48} weight="fill" className="text-emerald-500 mx-auto mb-4" />
              </motion.div>
              <h2 className="text-xl font-bold text-white mb-2">تمت الترقية!</h2>
              <p className="text-sm text-zinc-400 mb-1">{selected.name} الآن سفير نظامي</p>
              <p className="text-[13px] text-zinc-500 mb-6">رمز الإحالة: <strong className="text-white font-mono">{code}</strong></p>
              <div className="flex gap-3 justify-center">
                <Link href="/dashboard/admin/celebrities"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0B3D2E] text-white text-[13px] font-bold hover:bg-[#0a3328] transition-colors">
                  <Star size={14} /> شاهد كل السفراء
                </Link>
                <button onClick={() => { setStep("search"); setSelected(null); setCode(""); setQuery(""); }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/[0.07] text-zinc-400 text-[13px] font-bold hover:bg-white/[0.04] transition-colors">
                  <Gift size={14} /> ترقية آخر
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
