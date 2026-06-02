"use client";

import { User, Briefcase, Star, ArrowLeft, Plus, MagnifyingGlass } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

type Counsel = {
  name: string;
  specialty: string;
  firm: string;
  rating: number;
  cases: number;
  status: "متاح" | "مشغول";
};

const COUNSELS: Counsel[] = [
  { name: "أ. سلطان الغامدي",  specialty: "قانون إداري",      firm: "مكتب الغامدي وشركاه",    rating: 4.9, cases: 23, status: "متاح" },
  { name: "أ. ليلى الزهراني",  specialty: "عقود حكومية",      firm: "الزهراني للمحاماة",       rating: 4.7, cases: 18, status: "مشغول" },
  { name: "أ. فيصل العمري",    specialty: "مناقصات وتوريد",   firm: "مستشار مستقل",            rating: 4.8, cases: 31, status: "متاح" },
  { name: "أ. هند القحطاني",   specialty: "حوكمة + PDPL",     firm: "مؤسسة القحطاني القانونية", rating: 4.6, cases: 15, status: "متاح" },
];

export default function GovernmentExternalCounselPage() {
  const { isDark } = useTheme();

  const textPri = isDark ? "text-white" : "text-slate-900";
  const textMuted = isDark ? "text-slate-500" : "text-slate-500";
  const cardCls = isDark
    ? "border-white/10 bg-white/[0.03] hover:bg-white/[0.05] hover:border-white/20"
    : "border-slate-200 bg-white shadow-sm hover:border-slate-300 hover:shadow";
  const avatarBg = isDark ? "bg-white/10 border-white/10" : "bg-slate-100 border-slate-200";
  const btnCls = isDark
    ? "border-white/10 bg-white/5 hover:bg-white/10 text-slate-400"
    : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600";
  const headerBtnCls = isDark
    ? "bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300"
    : "bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700";
  const headerBtnPri = isDark
    ? "bg-white/5 border border-white/10 hover:bg-white/10 text-white"
    : "bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-800";

  return (
    <div className="max-w-4xl mx-auto space-y-8" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <User size={20} className={isDark ? "text-slate-400" : "text-slate-500"} />
          <h1 className={`text-xl font-bold tracking-tight ${textPri}`}>المستشارون الخارجيون</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/marketplace"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${headerBtnCls}`}
          >
            <MagnifyingGlass size={14} />
            تصفح السوق
          </Link>
          <button className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${headerBtnPri}`}>
            <Plus size={14} />
            طلب استشارة
          </button>
        </div>
      </div>

      {/* Counsels — asymmetric 2-col on md */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {COUNSELS.map((c) => (
          <div
            key={c.name}
            className={`rounded-2xl border p-5 transition-all duration-300 ${cardCls}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full border flex items-center justify-center flex-shrink-0 ${avatarBg}`}>
                  <User size={18} className={isDark ? "text-slate-400" : "text-slate-500"} />
                </div>
                <div>
                  <div className={`font-semibold text-sm ${textPri}`}>{c.name}</div>
                  <div className={`text-xs mt-0.5 ${textMuted}`}>{c.specialty}</div>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs border flex-shrink-0 ${c.status === "متاح" ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20" : "bg-amber-400/10 text-amber-400 border-amber-400/20"}`}>
                {c.status}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className={`text-xs ${textMuted}`}>{c.firm}</span>
              <div className={`flex items-center gap-3 text-xs ${textMuted}`}>
                <span className="flex items-center gap-1">
                  <Star size={11} className="text-amber-400" weight="fill" />
                  <span className={`font-mono ${isDark ? "text-slate-300" : "text-slate-700"}`}>{c.rating}</span>
                </span>
                <span>
                  <span className={`font-mono ${isDark ? "text-slate-300" : "text-slate-700"}`}>{c.cases}</span> قضية
                </span>
              </div>
            </div>
            <Link
              href={`/marketplace?counsel=${c.name}`}
              className={`mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors ${btnCls}`}
            >
              <Briefcase size={12} />
              تواصل
              <ArrowLeft size={11} className="opacity-50" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

