'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Certificate, SealCheck, Download, Eye, Calendar,
  GraduationCap, ArrowLeft, Share,
} from '@phosphor-icons/react';
import { useTheme } from '@/components/ThemeProvider';

const MY_CERTS = [
  {
    id: 'cert-001',
    courseSlug: 'contract-drafting-masterclass',
    courseTitle: 'إتقان صياغة العقود القانونية',
    instructor: 'أ. سارة الحربي',
    issuedDate: '٢٨ أبريل ٢٠٢٦',
    verifyId: 'NZM-2026-CRT-8821',
    category: 'العقود',
    color: 'from-[#1a3a5c] to-[#2a5a9c]',
  },
];

export default function CertificatesPage() {
  const { isDark } = useTheme();

  const card    = isDark ? 'border-white/[0.08] bg-[#161b22]' : 'border-slate-200 bg-white shadow-sm';
  const textPri = isDark ? 'text-zinc-100' : 'text-slate-900';
  const textMuted = isDark ? 'text-zinc-400' : 'text-slate-500';

  return (
    <div dir="rtl" className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Certificate size={22} weight="fill" className="text-[#C8A762]" />
            <h1 className={`text-xl font-black ${textPri}`}>شهاداتي</h1>
          </div>
          <p className={`text-sm ${textMuted}`}>{MY_CERTS.length} شهادة مكتسبة</p>
        </div>
        <Link href="/academy/my-courses"
          className={`flex items-center gap-2 text-sm group transition-colors ${isDark ? 'text-zinc-500 hover:text-zinc-200' : 'text-slate-500 hover:text-[#0B3D2E]'}`}>
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
          دوراتي
        </Link>
      </div>

      {/* Empty state */}
      {MY_CERTS.length === 0 && (
        <div className={`rounded-2xl border ${card} p-16 flex flex-col items-center gap-4`}>
          <Certificate size={40} className={textMuted} />
          <div className="text-center">
            <p className={`font-bold text-sm mb-1 ${textPri}`}>لا توجد شهادات بعد</p>
            <p className={`text-xs ${textMuted}`}>أكمل دورة تدريبية للحصول على شهادتك الأولى</p>
          </div>
          <Link href="/academy"
            className="flex items-center gap-2 px-4 py-2 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold hover:bg-[#0a3328] transition-colors">
            <GraduationCap size={14} />
            تصفح الدورات
          </Link>
        </div>
      )}

      {/* Certificates grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {MY_CERTS.map((cert, i) => (
          <motion.div key={cert.id}
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * i, duration: 0.4 }}>

            {/* Certificate visual */}
            <div className={`rounded-2xl overflow-hidden border ${card}`}>
              {/* Visual cert card */}
              <div className={`bg-gradient-to-br ${cert.color} p-6 relative`}>
                <div className="absolute inset-0 opacity-10"
                  style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, white 0%, transparent 60%)' }} />
                <div className="absolute top-4 left-4 opacity-15">
                  <SealCheck size={60} weight="fill" className="text-white" />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-4">
                    <SealCheck size={18} weight="fill" className="text-[#C8A762]" />
                    <span className="text-[#C8A762] text-xs font-black tracking-widest">NEZAMY ACADEMY</span>
                  </div>
                  <p className="text-white/70 text-xs mb-1">شهادة إتمام دورة</p>
                  <h3 className="text-white font-black text-base leading-tight mb-3">{cert.courseTitle}</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white/60 text-[10px]">المحاضر</p>
                      <p className="text-white text-xs font-bold">{cert.instructor}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-white/60 text-[10px]">تاريخ الإصدار</p>
                      <p className="text-white text-xs font-bold">{cert.issuedDate}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-4">
                <div className={`flex items-center gap-2 text-xs mb-3 p-2 rounded-xl ${isDark ? 'bg-white/[0.04]' : 'bg-slate-50'}`}>
                  <SealCheck size={12} className="text-emerald-500" />
                  <span className={textMuted}>رقم التحقق:</span>
                  <span dir="ltr" className={`font-mono font-bold text-[11px] ${textPri}`}>{cert.verifyId}</span>
                </div>
                <div className="flex gap-2">
                  <button className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border transition-colors ${isDark ? 'border-white/[0.08] text-zinc-400 hover:bg-white/[0.06]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    <Eye size={13} /> معاينة
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#0B3D2E] text-white rounded-xl text-xs font-bold hover:bg-[#0a3328] transition-colors">
                    <Download size={13} /> تحميل PDF
                  </button>
                  <button className={`p-2 rounded-xl border transition-colors ${isDark ? 'border-white/[0.08] text-zinc-500 hover:bg-white/[0.06]' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}>
                    <Share size={13} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* In-progress hint */}
      <div className={`rounded-2xl border ${card} p-5 flex items-center gap-4`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-[#0B3D2E]/20' : 'bg-[#0B3D2E]/10'}`}>
          <GraduationCap size={18} weight="fill" className="text-[#0B3D2E] dark:text-emerald-400" />
        </div>
        <div>
          <p className={`text-sm font-bold mb-0.5 ${textPri}`}>٢ دورة في التقدم</p>
          <p className={`text-xs ${textMuted}`}>أكمل دوراتك الحالية للحصول على المزيد من الشهادات</p>
        </div>
        <Link href="/academy/my-courses"
          className="mr-auto flex items-center gap-1.5 px-3 py-2 bg-[#0B3D2E] text-white rounded-xl text-xs font-bold hover:bg-[#0a3328] transition-colors flex-shrink-0">
          الاستكمال
        </Link>
      </div>

    </div>
  );
}
