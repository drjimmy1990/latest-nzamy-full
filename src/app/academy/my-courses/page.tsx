'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  GraduationCap, BookOpen, Clock, ChartBar,
  Play, CheckCircle, Certificate, ArrowLeft,
} from '@phosphor-icons/react';
import { useTheme } from '@/components/ThemeProvider';

const MY_COURSES = [
  {
    slug: 'corporate-law-fundamentals',
    title: 'أساسيات القانون التجاري السعودي',
    instructor: 'أ. محمد العتيبي',
    category: 'القانون التجاري',
    progress: 75,
    lessonsCompleted: 18,
    lessonsTotal: 24,
    lastLesson: 'الشركة ذات المسؤولية المحدودة',
    color: 'from-[#0B3D2E] to-[#1a6645]',
    certificate: false,
    enrolledDate: '١٢ أبريل ٢٠٢٦',
  },
  {
    slug: 'contract-drafting-masterclass',
    title: 'إتقان صياغة العقود القانونية',
    instructor: 'أ. سارة الحربي',
    category: 'العقود',
    progress: 100,
    lessonsCompleted: 36,
    lessonsTotal: 36,
    lastLesson: 'عقود الامتياز التجاري',
    color: 'from-[#1a3a5c] to-[#2a5a9c]',
    certificate: true,
    enrolledDate: '٥ مارس ٢٠٢٦',
  },
  {
    slug: 'compliance-pdpl',
    title: 'نظام حماية البيانات الشخصية (PDPL)',
    instructor: 'أ. فيصل الدوسري',
    category: 'الامتثال',
    progress: 33,
    lessonsCompleted: 6,
    lessonsTotal: 18,
    lastLesson: 'حقوق الأفراد في ظل PDPL',
    color: 'from-[#1a4a3c] to-[#2a7a5c]',
    certificate: false,
    enrolledDate: '٢٠ أبريل ٢٠٢٦',
  },
];

const STATS = [
  { icon: BookOpen,    label: 'دورات مسجّل', value: MY_COURSES.length },
  { icon: CheckCircle, label: 'مكتملة',        value: MY_COURSES.filter(c => c.progress === 100).length },
  { icon: Certificate, label: 'شهادات',         value: MY_COURSES.filter(c => c.certificate).length },
  { icon: Clock,       label: 'ساعة تعلم',     value: '٢٤' },
];

export default function MyCoursesPage() {
  const { isDark } = useTheme();

  const card    = isDark ? 'border-white/[0.08] bg-[#161b22]' : 'border-slate-200 bg-white shadow-sm';
  const textPri = isDark ? 'text-zinc-100' : 'text-slate-900';
  const textMuted = isDark ? 'text-zinc-400' : 'text-slate-500';
  const subCard = isDark ? 'bg-white/[0.04] border-white/[0.06]' : 'bg-slate-50 border-slate-100';

  return (
    <div dir="rtl" className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <GraduationCap size={22} weight="fill" className="text-[#0B3D2E] dark:text-emerald-400" />
            <h1 className={`text-xl font-black ${textPri}`}>دوراتي</h1>
          </div>
          <p className={`text-sm ${textMuted}`}>تابع تقدمك في التعلم</p>
        </div>
        <Link href="/academy"
          className={`flex items-center gap-2 text-sm transition-colors group ${isDark ? 'text-zinc-500 hover:text-zinc-200' : 'text-slate-500 hover:text-[#0B3D2E]'}`}>
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
          تصفح الدورات
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STATS.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={i}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i, duration: 0.3 }}
              className={`rounded-2xl border ${card} p-4 text-center`}>
              <Icon size={18} weight="fill" className="text-[#0B3D2E] dark:text-emerald-400 mx-auto mb-1.5" />
              <p className={`text-xl font-black tabular-nums ${textPri}`}>{s.value}</p>
              <p className={`text-[11px] ${textMuted}`}>{s.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Courses list */}
      <div className="space-y-4">
        {MY_COURSES.map((course, i) => {
          const isComplete = course.progress === 100;
          return (
            <motion.div key={course.slug}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 * i, duration: 0.3 }}
              className={`rounded-2xl border ${card} overflow-hidden`}>
              {/* Top gradient strip */}
              <div className={`h-1.5 bg-gradient-to-r ${course.color}`} />

              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${isDark ? 'border-white/[0.06] text-zinc-500 bg-white/[0.04]' : 'border-slate-100 text-slate-500 bg-slate-50'}`}>
                        {course.category}
                      </span>
                      {isComplete && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          مكتملة
                        </span>
                      )}
                      {course.certificate && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#C8A762]/10 text-[#C8A762] border border-[#C8A762]/20">
                          شهادة
                        </span>
                      )}
                    </div>
                    <h3 className={`font-bold text-sm mb-0.5 ${textPri}`}>{course.title}</h3>
                    <p className={`text-xs ${textMuted}`}>{course.instructor}</p>
                  </div>
                  {isComplete
                    ? <Link href={`/academy/certificates`}
                        className="flex items-center gap-1.5 px-3 py-2 bg-[#C8A762]/10 border border-[#C8A762]/20 text-[#C8A762] rounded-xl text-xs font-bold hover:bg-[#C8A762]/20 transition-colors">
                        <Certificate size={13} weight="fill" /> الشهادة
                      </Link>
                    : <Link href={`/academy/${course.slug}/lesson/1`}
                        className="flex items-center gap-1.5 px-3 py-2 bg-[#0B3D2E] text-white rounded-xl text-xs font-bold hover:bg-[#0a3328] transition-colors">
                        <Play size={13} weight="fill" /> استكمال
                      </Link>
                  }
                </div>

                {/* Progress bar */}
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs ${textMuted}`}>الدرس الأخير: {course.lastLesson}</span>
                    <span className={`text-xs font-bold ${isComplete ? 'text-emerald-500' : textPri}`}>
                      {course.lessonsCompleted}/{course.lessonsTotal} درس
                    </span>
                  </div>
                  <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/[0.06]' : 'bg-slate-100'}`}>
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${course.progress}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 * i }}
                      className={`h-full rounded-full ${isComplete ? 'bg-emerald-500' : 'bg-[#0B3D2E]'}`}
                    />
                  </div>
                  <p className={`text-[10px] mt-1 ${textMuted}`}>{course.progress}% مكتمل · انضممت {course.enrolledDate}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

    </div>
  );
}
