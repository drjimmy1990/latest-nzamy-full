"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import { Tag, UserCircle, CheckCircle, ArrowLeft, ShieldCheck, Clock } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";

// Mock fetching the promo link data
function getMockPromoData(slug: string) {
  if (slug === "saud-consult-20") {
    return {
      providerName: "المحامي سعود القحطاني",
      providerType: "lawyer",
      value: "20%",
      serviceLabel: "استشارة قانونية ٤٥ دقيقة",
      expiresAt: "2026-06-30",
    };
  }
  return {
    providerName: "مكتب العتيبي للمحاماة",
    providerType: "firm",
    value: "100 ر.س",
    serviceLabel: "صياغة لائحة دعوى",
    expiresAt: "2026-12-31",
  };
}

export default function PromoLandingPage() {
  const { isDark } = useTheme();
  const params = useParams();
  const slug = params.slug as string;
  const data = getMockPromoData(slug);
  
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 md:p-8 ${isDark ? "bg-[#05080f]" : "bg-gray-50"}`} dir="rtl">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden flex justify-center items-center">
        <div className={`absolute w-[800px] h-[800px] rounded-full blur-[120px] opacity-20 ${isDark ? "bg-indigo-600/30" : "bg-indigo-300/40"}`} />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={`relative z-10 w-full max-w-lg p-8 rounded-[2rem] border shadow-2xl backdrop-blur-xl ${isDark ? "bg-[#0d1117]/80 border-white/10 shadow-indigo-500/5" : "bg-white/90 border-gray-200 shadow-indigo-500/10"}`}
      >
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-indigo-500 flex items-center justify-center overflow-hidden bg-indigo-50">
              <UserCircle size={60} weight="fill" className="text-indigo-300 mt-2" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-white">
              <ShieldCheck size={16} weight="fill" />
            </div>
          </div>
        </div>

        <div className="text-center space-y-2 mb-8">
          <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>
            عرض خاص من<br />
            <span className="text-indigo-500">{data.providerName}</span>
          </h1>
          <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            تم دعوتك للاستفادة من هذا العرض الحصري عبر منصة نظامي
          </p>
        </div>

        <div className={`p-6 rounded-2xl border border-dashed mb-8 text-center space-y-4 ${isDark ? "border-indigo-500/30 bg-indigo-500/5" : "border-indigo-200 bg-indigo-50/50"}`}>
          <div className="inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-500 font-bold text-sm">
            <Tag size={16} weight="fill" />
            خصم {data.value}
          </div>
          
          <div>
            <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>يُطبّق على خدمة:</p>
            <p className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>{data.serviceLabel}</p>
          </div>

          <div className={`flex items-center justify-center gap-2 text-xs font-bold ${isDark ? "text-amber-400" : "text-amber-600"}`}>
            <Clock size={14} />
            ينتهي العرض في {data.expiresAt}
          </div>
        </div>

        <div className="space-y-4">
          <Link href="/auth/login?promo=true" className="flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-indigo-500 text-white font-black text-lg hover:bg-indigo-600 transition shadow-lg shadow-indigo-500/25">
            استفد من العرض الآن
            <ArrowLeft size={20} weight="bold" />
          </Link>
          
          <div className={`flex items-center justify-center gap-2 text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
            <CheckCircle size={14} weight="fill" className="text-emerald-500" />
            دفع آمن ومضمون عبر منصة نظامي
          </div>
        </div>

      </motion.div>
    </div>
  );
}
