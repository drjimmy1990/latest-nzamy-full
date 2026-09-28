"use client";

import { motion } from "framer-motion";
import { Briefcase, MagnifyingGlass, ArrowLeft } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";
import Link from "next/link";
import { useState } from "react";
import { CircuitEmail, CircuitsSampleNotice, UnverifiedBadge } from "@/app/ai/procedures/_data";

interface CircuitEntry {
  id: number;
  region: string;
  court: string;
  name: string;
  currentEmail: string;
}

// ⚠️ تنبيه صارم موجه للمبرمج (قرار المالك المعتمد):
// المصفوفة INITIAL_CIRCUITS أدناه هي مجرد عينة تجريبية أولية (٤ دوائر فقط).
// الدليل المعتمد الكامل يحتوي على ٢,١٩٢ دائرة قضائية مع إيميلاتها وأرقامها واختصاصاتها،
// ويلزم توريده كاملاً من الأرشيف وتفريغه في قاعدة البيانات وربطه بالواجهة بدلاً من البيانات الثابتة.
//
// Owner test 28-9 (T28-33) also removed what this page claimed on top of the
// sample: a «إجابة نظامية (رسمية)» badge citing an invented «تعميم وزارة العدل
// رقم ١٤٤٥/٢٣», «أكيدة (تصديق المحامين)» badges nobody had given, a «3/5»
// vote tally and thumbs that changed only this tab's memory, and an
// «اقتراح تصحيح» form whose «إرسال الاقتراح للمراجعة» button sent nothing.
// Every entry now carries «غير مُتحقَّق», its full address and a working copy
// button.
const INITIAL_CIRCUITS: CircuitEntry[] = [
  { id: 1, region: "الرياض", court: "المحكمة التجارية", name: "الدائرة التجارية الأولى", currentEmail: "com1.riyadh@moj.gov.sa" },
  { id: 2, region: "جدة", court: "المحكمة العمالية", name: "الدائرة العمالية الثالثة", currentEmail: "lab3.jeddah@moj.gov.sa" },
  { id: 3, region: "الدمام", court: "المحكمة العامة", name: "الدائرة العامة الخامسة", currentEmail: "gen5.dammam@moj.gov.sa" },
  { id: 4, region: "مكة المكرمة", court: "محكمة التنفيذ", name: "دائرة التنفيذ الثانية", currentEmail: "exe2.makkah@moj.gov.sa" },
];

export default function CircuitsEmailsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const q = search.trim();
  const circuits = INITIAL_CIRCUITS.filter(c =>
    !q || c.name.includes(q) || c.court.includes(q) || c.region.includes(q) || c.currentEmail.includes(q),
  );

  return (
    <SubscriptionGuard featureKey="business-litigation">
    <div className={`p-5 md:p-8 space-y-6 max-w-5xl mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard/business" className={`p-2 rounded-xl transition-colors ${isDark ? "bg-white/[0.04] hover:bg-white/[0.08]" : "bg-zinc-100 hover:bg-zinc-200"}`}>
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <Briefcase className="text-[#C8A762]" weight="duotone" />
            دليل إيميلات الدوائر
          </h1>
          <p className={isDark ? "text-zinc-400" : "text-zinc-600"}>عناوين البريد الإلكتروني للدوائر القضائية — انسخ العنوان بضغطة واحدة.</p>
        </div>
      </div>

      <CircuitsSampleNotice isDark={isDark} />

      {/* Search — filters the entries below by name, court, city or address */}
      <div className={`relative flex items-center p-2 rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-200 shadow-sm"}`}>
        <MagnifyingGlass size={20} className={`ms-3 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث باسم المحكمة، المدينة، أو الدائرة..."
          className="flex-1 bg-transparent border-none outline-none py-2 px-3 text-sm"
        />
      </div>

      {/* List */}
      <div className="grid gap-4 mt-8">
        {circuits.map((c, i) => (
          <motion.div 
            key={c.id}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className={`flex flex-col p-5 rounded-3xl border overflow-hidden relative ${isDark ? "bg-zinc-900/50 border-white/[0.06]" : "bg-white border-zinc-200 shadow-sm"}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-100 text-zinc-600"}`}>
                    {c.region}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-[#0B3D2E]/20 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
                    {c.court}
                  </span>
                  
                  <UnverifiedBadge />
                </div>
                <h3 className="font-bold text-[16px] mb-3">{c.name}</h3>

                {/* The full address with copy + mailto (owner test 28-9, T28-33) */}
                <CircuitEmail email={c.currentEmail} isDark={isDark} />
              </div>
            </div>
          </motion.div>
        ))}
        {circuits.length === 0 && (
          <div className={`p-8 rounded-3xl border text-center text-[13px] ${isDark ? "border-white/[0.06] text-zinc-400" : "border-zinc-200 text-zinc-500"}`}>
            لا توجد نتائج مطابقة لبحثك.
          </div>
        )}
      </div>
    </div>
    </SubscriptionGuard>
  );
}
