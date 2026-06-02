"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Brain, ArrowLeft } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

/**
 * /ai/research — تمت إعادة دمجه مع "المستشار القانوني ماكس"
 * يُعيد التوجيه تلقائياً إلى /ai/legal-opinion
 */
export default function ResearchRedirectPage() {
  const router = useRouter();
  const { isDark } = useTheme();

  useEffect(() => {
    const t = setTimeout(() => router.replace("/ai/legal-opinion"), 2200);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className={`flex items-center justify-center min-h-[60vh] ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center space-y-4 max-w-sm"
      >
        <div className="w-16 h-16 rounded-2xl bg-[#C8A762]/10 flex items-center justify-center mx-auto">
          <Brain size={28} weight="duotone" className="text-[#C8A762]" />
        </div>
        <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
          دُمج مع المستشار القانوني ماكس
        </h2>
        <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          تم دمج "الباحث القانوني" مع "الرأي القانوني" لتوفير تجربة متكاملة أكثر احترافاً.
          يتم الآن تحويلك...
        </p>
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          className="flex items-center justify-center gap-1.5"
        >
          <div className="w-2 h-2 rounded-full bg-[#C8A762]" />
          <div className="w-2 h-2 rounded-full bg-[#C8A762]" />
          <div className="w-2 h-2 rounded-full bg-[#C8A762]" />
        </motion.div>
      </motion.div>
    </div>
  );
}
