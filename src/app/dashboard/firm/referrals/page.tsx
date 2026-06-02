"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Handshake, UsersThree, ChartLineUp,
  Link as LinkIcon, Copy, Check,
  MagnifyingGlass, CaretDown, Plus,
  Money, ArrowRight, ArrowLeft
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types & Mock Data ────────────────────────────────────────────────────────

type ReferralStatus = "مقبول" | "قيد الانتظار" | "مرفوض" | "مكتمل";

interface Referral {
  id: string;
  partnerName: string;
  clientName: string;
  caseType: string;
  status: ReferralStatus;
  date: string;
  commission: number;
}

const MOCK_REFERRALS: Referral[] = [
  { id: "REF-001", partnerName: "مكتب المحامي خالد", clientName: "شركة الرواد", caseType: "اندماج واستحواذ", status: "مكتمل", date: "٢٠٢٤/٠٤/١٠", commission: 15000 },
  { id: "REF-002", partnerName: "شركة الاستشارات المالية", clientName: "مجموعة العليان", caseType: "حوكمة شركات", status: "مقبول", date: "٢٠٢٤/٠٥/٠٢", commission: 5000 },
  { id: "REF-003", partnerName: "أحمد الدوسري", clientName: "فهد العتيبي", caseType: "قضية عمالية", status: "قيد الانتظار", date: "٢٠٢٤/٠٥/١٤", commission: 1500 },
  { id: "REF-004", partnerName: "مكتب التوثيق السريع", clientName: "مؤسسة الأمل", caseType: "تأسيس شركة", status: "مرفوض", date: "٢٠٢٤/٠٣/٢٠", commission: 0 },
];

const STATUS_COLORS: Record<ReferralStatus, string> = {
  "مكتمل": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  "مقبول": "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  "قيد الانتظار": "bg-amber-500/10 text-amber-500 border-amber-500/20",
  "مرفوض": "bg-red-500/10 text-red-500 border-red-500/20",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function FirmReferralsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ReferralStatus | "الكل">("الكل");
  const [copiedLink, setCopiedLink] = useState(false);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = MOCK_REFERRALS.filter(r => 
    (filter === "الكل" || r.status === filter) &&
    (!search || r.partnerName.includes(search) || r.clientName.includes(search))
  );

  const totalCommissions = MOCK_REFERRALS.reduce((sum, r) => sum + r.commission, 0);

  const handleCopyLink = () => {
    navigator.clipboard.writeText("https://nzamy.com/ref/firm-alufuq");
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="max-w-[1100px] mx-auto space-y-6" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-xl font-bold mb-0.5 flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            <Handshake className="text-royal" weight="duotone" />
            الإحالات والشركاء (Referrals)
          </h1>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            إدارة العملاء المحالين من مكاتب أخرى أو وسطاء، ومتابعة العمولات والنسب المتفق عليها.
          </p>
        </div>
        <button className="px-4 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold hover:bg-[#0a3328] transition-colors flex items-center gap-2">
          <Plus size={15} weight="bold" /> إضافة شريك استراتيجي
        </button>
      </motion.div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`${card} p-5 flex flex-col justify-center`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-emerald-500/10" : "bg-emerald-50"}`}>
              <Money size={20} className="text-emerald-500" weight="duotone" />
            </div>
            <p className={`text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>إجمالي العمولات المكتسبة</p>
          </div>
          <p className={`text-[24px] font-black font-mono mt-1 ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
            {totalCommissions.toLocaleString()} <span className="text-[12px] font-sans">ريال</span>
          </p>
        </div>

        <div className={`${card} p-5 flex flex-col justify-center`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-blue-500/10" : "bg-blue-50"}`}>
              <UsersThree size={20} className="text-blue-500" weight="duotone" />
            </div>
            <p className={`text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>العملاء المحالين</p>
          </div>
          <p className={`text-[24px] font-black font-mono mt-1 ${isDark ? "text-white" : "text-slate-800"}`}>
            {MOCK_REFERRALS.length} <span className={`text-[12px] font-sans ${isDark ? "text-zinc-500" : "text-slate-400"}`}>عميل</span>
          </p>
        </div>

        <div className={`${card} p-5 col-span-1 md:col-span-2 flex flex-col justify-center`}>
          <p className={`text-[11px] font-bold mb-3 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>رابط الإحالة الخاص بالمكتب (Affiliate Link)</p>
          <div className="flex items-center gap-2">
            <div className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl border ${isDark ? "bg-zinc-800 border-white/[0.05]" : "bg-slate-50 border-slate-200"}`}>
              <LinkIcon size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
              <p className={`text-[13px] font-mono select-all ${isDark ? "text-zinc-300" : "text-slate-700"}`} dir="ltr">
                https://nzamy.com/ref/firm-alufuq
              </p>
            </div>
            <button onClick={handleCopyLink} className={`px-4 py-2.5 rounded-xl text-[12px] font-bold transition-colors flex items-center gap-2 ${
              copiedLink ? "bg-emerald-500 text-white" : isDark ? "bg-white/10 text-white hover:bg-white/20" : "bg-slate-800 text-white hover:bg-slate-700"
            }`}>
              {copiedLink ? <><Check size={16} /> نُسخ</> : <><Copy size={16} /> نسخ</>}
            </button>
          </div>
          <p className={`text-[10px] mt-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>أي عميل يسجل عبر هذا الرابط ويطلب خدمة سيتم ربطه تلقائياً كإحالة لصالح مكتبكم.</p>
        </div>
      </div>

      {/* Filters */}
      <div className={`${card} p-4 flex flex-col sm:flex-row gap-3`}>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border flex-1 transition-colors ${isDark ? "bg-white/[0.04] border-white/[0.06] focus-within:border-royal/40" : "bg-zinc-50 border-zinc-200 focus-within:border-emerald-300"}`}>
          <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث باسم الشريك أو العميل المحال..."
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-500" dir="rtl" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
          {(["الكل", "مقبول", "قيد الانتظار", "مكتمل", "مرفوض"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-xl text-[11px] font-bold shrink-0 transition-all border ${
                filter === f ? "bg-[#0B3D2E] border-[#0B3D2E] text-white" : isDark ? "bg-zinc-800 border-white/[0.05] text-zinc-400 hover:text-zinc-200" : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100"
              }`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Referrals List */}
      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className={`text-[11px] border-b ${isDark ? "border-white/[0.06] text-zinc-500 bg-zinc-900/50" : "border-slate-100 text-slate-500 bg-slate-50/50"}`}>
                <th className="p-4 font-bold">الرقم المرجعي</th>
                <th className="p-4 font-bold">الشريك (المُحيل)</th>
                <th className="p-4 font-bold">العميل المُحال / القضية</th>
                <th className="p-4 font-bold">التاريخ</th>
                <th className="p-4 font-bold">العمولة المقدرة</th>
                <th className="p-4 font-bold">الحالة</th>
                <th className="p-4 font-bold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ref, i) => (
                <motion.tr key={ref.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className={`border-b transition-colors ${isDark ? "border-white/[0.04] hover:bg-white/[0.02]" : "border-slate-50 hover:bg-slate-50"}`}>
                  <td className={`p-4 text-[12px] font-mono ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{ref.id}</td>
                  <td className="p-4">
                    <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{ref.partnerName}</p>
                  </td>
                  <td className="p-4">
                    <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{ref.clientName}</p>
                    <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{ref.caseType}</p>
                  </td>
                  <td className={`p-4 text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{ref.date}</td>
                  <td className="p-4">
                    <p className={`text-[13px] font-black font-mono ${ref.commission > 0 ? "text-emerald-500" : isDark ? "text-zinc-500" : "text-slate-400"}`}>
                      {ref.commission.toLocaleString()} ﷼
                    </p>
                  </td>
                  <td className="p-4">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${STATUS_COLORS[ref.status]}`}>
                      {ref.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <button className={`p-2 rounded-lg transition-colors ${isDark ? "hover:bg-zinc-800 text-zinc-400" : "hover:bg-slate-200 text-slate-600"}`}>
                      <CaretDown size={16} />
                    </button>
                  </td>
                </motion.tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center">
                    <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد إحالات مطابقة.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
