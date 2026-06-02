"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Users, SealCheck, UserCircle, Phone, Briefcase,
  Buildings, MapPin, Scales, ArrowLeft, MagnifyingGlass,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

interface Party {
  id: number;
  caseNumber: string;
  role: "claimant" | "respondent";
  name: string;
  type: "individual" | "company";
  representative: string;
  repFirm?: string;
  phone: string;
  city: string;
  isVerified: boolean;
}

const PARTIES: Party[] = [
  {
    id: 1, caseNumber: "ARB-2026-001", role: "claimant",
    name: "شركة البناء الحديث", type: "company",
    representative: "أ. فهد الشهري", repFirm: "مكتب الشهري للمحاماة",
    phone: "+966 50 123 4567", city: "الرياض", isVerified: true,
  },
  {
    id: 2, caseNumber: "ARB-2026-001", role: "respondent",
    name: "مجموعة الخليج للتطوير", type: "company",
    representative: "أ. سلطان المطيري", repFirm: "مكتب القانون الدولي",
    phone: "+966 55 987 6543", city: "الرياض", isVerified: true,
  },
  {
    id: 3, caseNumber: "ARB-2026-002", role: "claimant",
    name: "مؤسسة الشروق للتجارة", type: "company",
    representative: "أ. ريم الدوسري",
    phone: "+966 54 321 0987", city: "جدة", isVerified: false,
  },
  {
    id: 4, caseNumber: "ARB-2026-002", role: "respondent",
    name: "شركة التقنية المتقدمة", type: "company",
    representative: "أ. محمد السالم", repFirm: "مكتب السالم القانوني",
    phone: "+966 56 654 3210", city: "جدة", isVerified: true,
  },
];

const ROLE_MAP = {
  claimant:  { label: "مدّعٍ",  bg: "bg-blue-500/10",  color: "text-blue-500"  },
  respondent:{ label: "مدّعى عليه", bg: "bg-rose-500/10", color: "text-rose-500" },
};

export default function ArbitrationPartiesPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const bg   = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  const filtered = PARTIES.filter(p =>
    p.name.includes(search) || p.caseNumber.includes(search) || p.representative.includes(search)
  );

  const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.35 } }),
  };

  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">

        {/* Header */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className={`text-xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>
              الأطراف والوكلاء
            </h1>
            <p className={`text-sm mt-0.5 ${muted}`}>{filtered.length} طرف في {new Set(PARTIES.map(p => p.caseNumber)).size} قضايا</p>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border ${isDark ? "border-[#2d3748] bg-[#161b22]" : "border-gray-200 bg-white"}`}>
            <MagnifyingGlass size={15} className={muted} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ابحث باسم الطرف أو رقم القضية..."
              className={`bg-transparent outline-none text-sm w-64 ${isDark ? "text-gray-200 placeholder:text-gray-600" : "text-gray-800 placeholder:text-gray-400"}`}
            />
          </div>
        </motion.div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((party, i) => {
            const roleConf = ROLE_MAP[party.role];
            return (
              <motion.div key={party.id} variants={fadeUp} initial="hidden" animate="show" custom={i + 1}
                whileHover={{ y: -2 }}
                className={`${card} p-5 shadow-sm`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-indigo-500/10" : "bg-indigo-50"}`}>
                      {party.type === "company"
                        ? <Buildings size={20} weight="duotone" className={isDark ? "text-indigo-400" : "text-indigo-600"} />
                        : <UserCircle size={20} weight="duotone" className={isDark ? "text-indigo-400" : "text-indigo-600"} />
                      }
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>{party.name}</p>
                        {party.isVerified && <SealCheck size={14} weight="fill" className="text-emerald-500" />}
                      </div>
                      <p className={`text-xs font-mono ${isDark ? "text-[#C8A762]" : "text-indigo-600"}`}>{party.caseNumber}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${roleConf.bg} ${roleConf.color}`}>
                    {roleConf.label}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className={`flex items-center gap-2 ${muted}`}>
                    <Users size={12} /> <span>الوكيل: <span className={`font-semibold ${isDark ? "text-gray-200" : "text-gray-700"}`}>{party.representative}</span></span>
                  </div>
                  {party.repFirm && (
                    <div className={`flex items-center gap-2 ${muted}`}>
                      <Briefcase size={12} /> <span>{party.repFirm}</span>
                    </div>
                  )}
                  <div className={`flex items-center gap-2 ${muted}`}>
                    <Phone size={12} /> <span dir="ltr">{party.phone}</span>
                  </div>
                  <div className={`flex items-center gap-2 ${muted}`}>
                    <MapPin size={12} weight="fill" /> <span>{party.city}</span>
                  </div>
                </div>

                <div className={`mt-4 pt-3 border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"} flex items-center justify-between`}>
                  <span className={`text-[10px] ${muted}`}>
                    {party.isVerified ? "موثّق عبر نظامي" : "غير موثّق بعد"}
                  </span>
                  <button className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl transition ${
                    isDark ? "bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  }`}>
                    <Scales size={11} /> عرض ملف القضية
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className={`${card} p-12 text-center shadow-sm`}>
            <Users size={40} className="mx-auto mb-3 opacity-20" />
            <p className={`text-sm ${muted}`}>لا توجد نتائج</p>
          </div>
        )}

      </div>
    </div>
  );
}
