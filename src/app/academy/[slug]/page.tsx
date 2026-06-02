'use client';

import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft, Play, Clock, Users, Star, Certificate,
  CheckCircle, BookOpen, Lock, SealCheck, Lightning,
} from '@phosphor-icons/react';
import { useTheme } from '@/components/ThemeProvider';

const COURSES_MAP: Record<string, {
  title: string; subtitle: string; instructor: string; instructorTitle: string;
  category: string; level: string; duration: string; lessons: number;
  students: number; rating: number; price: number; certificate: boolean;
  color: string; description: string; whatYouLearn: string[];
  curriculum: { section: string; items: { title: string; duration: string; free?: boolean }[] }[];
}> = {
  'corporate-law-fundamentals': {
    title: 'أساسيات القانون التجاري السعودي',
    subtitle: 'نظام الشركات ونظام التجارة — دليل شامل',
    instructor: 'أ. محمد العتيبي', instructorTitle: 'محامٍ تجاري — ١٥ عاماً خبرة',
    category: 'القانون التجاري', level: 'مبتدئ',
    duration: '٨ ساعات', lessons: 24, students: 3420, rating: 4.8, price: 0,
    certificate: true, color: 'from-[#0B3D2E] to-[#1a6645]',
    description: 'دورة شاملة تغطي نظام الشركات السعودي من التأسيس حتى التصفية، مع تطبيقات عملية ونماذج حقيقية.',
    whatYouLearn: ['أنواع الشركات وخصائصها', 'إجراءات التأسيس الرسمية', 'التزامات الشركات القانونية', 'حقوق المساهمين', 'تعديل عقد التأسيس', 'إجراءات التصفية'],
    curriculum: [
      { section: 'الوحدة الأولى — مدخل إلى القانون التجاري', items: [
        { title: 'ما هو القانون التجاري السعودي؟', duration: '٨ د', free: true },
        { title: 'المصادر التشريعية الرئيسية', duration: '١٢ د', free: true },
        { title: 'نظام الشركات 1443هـ — نظرة عامة', duration: '١٥ د' },
      ]},
      { section: 'الوحدة الثانية — أنواع الشركات', items: [
        { title: 'الشركة ذات المسؤولية المحدودة (LLC)', duration: '٢٠ د' },
        { title: 'شركة المساهمة (JSC)', duration: '٢٢ د' },
        { title: 'شركات الأشخاص', duration: '١٨ د' },
      ]},
      { section: 'الوحدة الثالثة — التأسيس والتشغيل', items: [
        { title: 'إجراءات التأسيس خطوة بخطوة', duration: '٢٥ د' },
        { title: 'عقد التأسيس والنظام الأساسي', duration: '٢٠ د' },
        { title: 'التزامات الشركة بعد التأسيس', duration: '١٨ د' },
      ]},
    ],
  },
  'contract-drafting-masterclass': {
    title: 'إتقان صياغة العقود القانونية',
    subtitle: 'من النظرية إلى التطبيق',
    instructor: 'أ. سارة الحربي', instructorTitle: 'مستشارة عقود — ١٠ سنوات',
    category: 'العقود', level: 'متوسط',
    duration: '١٢ ساعة', lessons: 36, students: 2180, rating: 4.9, price: 299,
    certificate: true, color: 'from-[#1a3a5c] to-[#2a5a9c]',
    description: 'دورة متخصصة تأخذك من مبادئ كتابة العقود إلى إتقان صياغة العقود التجارية المعقدة.',
    whatYouLearn: ['مبادئ العقود الصحيحة', 'الصياغة القانونية المتقنة', 'أنواع العقود التجارية', 'بنود الحماية', 'مراجعة العقود', 'النماذج المعيارية'],
    curriculum: [
      { section: 'الوحدة الأولى — أساسيات الصياغة', items: [
        { title: 'أركان العقد الصحيح', duration: '١٨ د', free: true },
        { title: 'الصياغة الواضحة والمحكمة', duration: '٢٢ د', free: true },
        { title: 'الأخطاء الشائعة', duration: '٢٠ د' },
      ]},
      { section: 'الوحدة الثانية — أنواع العقود', items: [
        { title: 'عقود التوريد', duration: '٢٥ د' },
        { title: 'عقود الخدمات', duration: '٢٢ د' },
        { title: 'عقود الشراكة', duration: '٢٨ د' },
      ]},
    ],
  },
};

export default function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { isDark } = useTheme();

  const course = COURSES_MAP[slug] ?? COURSES_MAP['corporate-law-fundamentals'];
  const card    = isDark ? 'border-white/[0.08] bg-[#161b22]' : 'border-slate-200 bg-white shadow-sm';
  const textPri = isDark ? 'text-zinc-100' : 'text-slate-900';
  const textMuted = isDark ? 'text-zinc-400' : 'text-slate-500';
  const freeLessons = course.curriculum.flatMap(s => s.items).filter(i => i.free).length;

  return (
    <div dir="rtl" className="max-w-5xl mx-auto">
      <Link href="/academy"
        className={`inline-flex items-center gap-2 text-sm mb-5 group transition-colors ${isDark ? 'text-zinc-500 hover:text-zinc-200' : 'text-slate-500 hover:text-[#0B3D2E]'}`}>
        <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
        أكاديمية نظامي
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-5">

          {/* Hero card */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl overflow-hidden border ${card}`}>
            <div className={`h-44 bg-gradient-to-br ${course.color} relative flex items-end p-6`}>
              <div className="absolute inset-0 bg-black/25" />
              <div className="relative z-10">
                <span className="text-[11px] px-2.5 py-1 bg-white/20 border border-white/20 rounded-full text-white font-bold mb-2 inline-block">{course.category}</span>
                <h1 className="text-xl font-black text-white">{course.title}</h1>
              </div>
            </div>
            <div className="p-5">
              <p className={`text-sm leading-relaxed mb-4 ${textMuted}`}>{course.description}</p>
              <div className="flex items-center gap-4 flex-wrap text-sm">
                <span className="flex items-center gap-1 text-amber-400 font-medium"><Star size={14} weight="fill" />{course.rating}</span>
                <span className={`flex items-center gap-1 ${textMuted}`}><Users size={14} />{course.students.toLocaleString('ar-SA')} متدرب</span>
                <span className={`flex items-center gap-1 ${textMuted}`}><Play size={14} />{course.lessons} درس</span>
                <span className={`flex items-center gap-1 ${textMuted}`}><Clock size={14} />{course.duration}</span>
              </div>
            </div>
          </motion.div>

          {/* What you learn */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            className={`rounded-2xl border ${card} p-5`}>
            <h2 className={`font-black text-base mb-4 ${textPri}`}>ماذا ستتعلم</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {course.whatYouLearn.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle size={14} weight="fill" className="text-[#0B3D2E] mt-0.5 flex-shrink-0 dark:text-emerald-400" />
                  <p className={`text-sm ${textMuted}`}>{item}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Curriculum */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
            className={`rounded-2xl border ${card} p-5`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`font-black text-base ${textPri}`}>المنهج الدراسي</h2>
              <span className={`text-xs ${textMuted}`}>{freeLessons} دروس مجانية للمعاينة</span>
            </div>
            <div className="space-y-3">
              {course.curriculum.map((sec, si) => (
                <div key={si} className={`rounded-xl border overflow-hidden ${isDark ? 'border-white/[0.06]' : 'border-slate-100'}`}>
                  <div className={`px-4 py-3 ${isDark ? 'bg-white/[0.03]' : 'bg-slate-50'}`}>
                    <p className={`text-sm font-bold ${textPri}`}>{sec.section}</p>
                    <p className={`text-xs ${textMuted}`}>{sec.items.length} دروس</p>
                  </div>
                  <div className={`divide-y ${isDark ? 'divide-white/[0.04]' : 'divide-slate-50'}`}>
                    {sec.items.map((item, ii) => (
                      <div key={ii} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-2">
                          {item.free
                            ? <Play size={12} weight="fill" className="text-[#0B3D2E] dark:text-emerald-400" />
                            : <Lock size={12} className={textMuted} />}
                          <span className={`text-sm ${item.free ? textPri : textMuted}`}>{item.title}</span>
                          {item.free && <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 rounded font-bold">مجاني</span>}
                        </div>
                        <span className={`text-xs ${textMuted}`}>{item.duration}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Sticky CTA */}
        <div className="lg:col-span-1">
          <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
            className={`sticky top-6 rounded-2xl border ${card} overflow-hidden`}>
            <div className={`h-20 bg-gradient-to-br ${course.color}`} />
            <div className="p-5 space-y-4">
              <p className={`text-3xl font-black ${course.price === 0 ? 'text-emerald-500' : textPri}`}>
                {course.price === 0 ? 'مجاناً' : `${course.price} ر.س`}
              </p>
              <Link href={`/academy/${slug}/lesson/1`}
                className="w-full flex items-center justify-center gap-2 py-3 bg-[#0B3D2E] text-white rounded-xl font-black text-sm hover:bg-[#0a3328] transition-colors">
                <Lightning size={16} weight="fill" />
                {course.price === 0 ? 'ابدأ مجاناً' : 'سجّل الآن'}
              </Link>
              <div className="space-y-2">
                {[
                  { icon: Play,       label: `${course.lessons} درس فيديو` },
                  { icon: Clock,      label: `${course.duration} محتوى` },
                  { icon: BookOpen,   label: 'وصول مدى الحياة' },
                  { icon: SealCheck,  label: 'من محامٍ مرخّص' },
                  ...(course.certificate ? [{ icon: Certificate, label: 'شهادة رقمية' }] : []),
                ].map((f, i) => {
                  const Icon = f.icon;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <Icon size={13} className="text-[#0B3D2E] dark:text-emerald-400" weight="fill" />
                      <span className={`text-sm ${textMuted}`}>{f.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className={`pt-3 border-t ${isDark ? 'border-white/[0.06]' : 'border-slate-100'}`}>
                <p className={`text-[11px] mb-1 ${textMuted}`}>المحاضر</p>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#0B3D2E] text-white flex items-center justify-center font-bold text-sm">
                    {course.instructor.charAt(3)}
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${textPri}`}>{course.instructor}</p>
                    <p className={`text-[10px] ${textMuted}`}>{course.instructorTitle}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
