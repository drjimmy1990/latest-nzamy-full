"use client";

import { motion } from "framer-motion";
import { UsersThree, ShieldCheck, ArrowRight, Sparkle, CreditCard, Clock, CheckCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

export default function GroupJoinPage({ params }: { params: { code: string } }) {
  const { isDark } = useTheme();
  
  // Mock data for the invitation
  const groupName = "عائلة المحمد";
  const inviter = "أحمد الصالح";
  const code = params.code || "RHB-2026";

  const sp = { type: "spring" as const, stiffness: 120, damping: 20 };
  const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };
  const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: sp } };

  const card = isDark
    ? "relative rounded-[2rem] border border-white/10 bg-zinc-900/50 backdrop-blur-xl shadow-2xl overflow-hidden"
    : "relative rounded-[2rem] border border-zinc-200 bg-white/70 backdrop-blur-xl shadow-xl overflow-hidden";

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 md:p-8 relative overflow-hidden ${isDark ? "bg-zinc-950 text-white" : "bg-zinc-50 text-zinc-900"}`} dir="rtl">
      {/* Background gradients */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-emerald-500/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-teal-500/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2 pointer-events-none" />

      <motion.div variants={stagger} initial="hidden" animate="visible" className="w-full max-w-lg relative z-10">
        <motion.div variants={fadeUp} className="text-center mb-8">
          <Link href="/" className="inline-block mb-6">
            <span className={`text-2xl font-black tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
              نظامي<span className="text-emerald-500">.</span>
            </span>
          </Link>
        </motion.div>

        <motion.div variants={fadeUp} className={`${card} p-8`}>
          {/* Top Illustration */}
          <div className="flex justify-center mb-6">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center relative ${isDark ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-emerald-50 border border-emerald-200"}`}>
              <UsersThree size={40} weight="duotone" className={isDark ? "text-emerald-400" : "text-emerald-600"} />
              <motion.div 
                animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="absolute -top-1 -right-1 text-amber-400"
              >
                <Sparkle weight="fill" size={20} />
              </motion.div>
            </div>
          </div>

          {/* Invitation Text */}
          <div className="text-center space-y-2 mb-8">
            <p className={`text-sm font-medium uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>دعوة انضمام</p>
            <h1 className="text-2xl font-bold">
              لقد دعاك <span className={isDark ? "text-emerald-400" : "text-emerald-600"}>{inviter}</span>
            </h1>
            <p className={`text-lg ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
              للانضمام إلى مجموعة <span className="font-bold">{groupName}</span>
            </p>
          </div>

          {/* Details Box */}
          <div className={`rounded-2xl p-5 mb-8 space-y-4 ${isDark ? "bg-white/5 border border-white/10" : "bg-zinc-50 border border-zinc-200"}`}>
            <div className="flex items-center gap-3">
              <ShieldCheck size={20} className={isDark ? "text-emerald-400" : "text-emerald-600"} />
              <div>
                <p className={`text-sm font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>باقة الربع القانونية</p>
                <p className={`text-xs mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>حماية شاملة للمجموعة مع نظام تناوب ذكي</p>
              </div>
            </div>
            
            <div className={`h-px w-full ${isDark ? "bg-white/10" : "bg-zinc-200"}`} />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className={`text-[10px] uppercase mb-1 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>كود الدعوة</p>
                <p className={`text-sm font-mono font-bold tracking-wider ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{code}</p>
              </div>
              <div>
                <p className={`text-[10px] uppercase mb-1 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>التكلفة</p>
                <p className={`text-sm font-bold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>نظام التناوب (بالدور)</p>
              </div>
            </div>
          </div>

          {/* Benefits List */}
          <div className="space-y-3 mb-8">
            {[
              "١٠٠ استفسار قانوني شهرياً للمجموعة",
              "صياغة ٣ عقود ومستندات بالذكاء الاصطناعي",
              "خصم خاص على أتعاب المحاماة والترافع",
              "استشارة شهرية واحدة من محامٍ متخصص"
            ].map((benefit, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + (i * 0.1) }}
                className="flex items-center gap-2"
              >
                <CheckCircle size={16} weight="fill" className={isDark ? "text-emerald-500/50" : "text-emerald-500"} />
                <span className={`text-sm ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{benefit}</span>
              </motion.div>
            ))}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Link href="/dashboard/client/my-group">
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                className="w-full py-3.5 rounded-xl bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20"
              >
                قبول الدعوة والمتابعة <ArrowRight size={18} weight="bold" />
              </motion.button>
            </Link>
            <p className={`text-xs text-center ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
              بالانضمام أنت توافق على شروط الاستخدام ونظام التناوب الذكي الخاص بنظامي
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
