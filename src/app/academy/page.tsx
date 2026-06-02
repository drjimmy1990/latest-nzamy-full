'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  GraduationCap, MagnifyingGlass, Play, Clock, Users,
  Star, SealCheck, BookOpen, Lightning, Crown, Certificate,
  ArrowLeft, Sparkle, Trophy
} from '@phosphor-icons/react';
import { useTheme } from '@/components/ThemeProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

type CourseLevel   = 'مبتدئ' | 'متوسط' | 'متقدم';
type CourseCategory = 'القانون التجاري' | 'الأحوال الشخصية' | 'العقود' | 'القضاء والإجراءات' | 'الامتثال' | 'المهارات القانونية';

interface Course {
  slug: string;
  title: string;
  subtitle: string;
  instructor: string;
  category: CourseCategory;
  level: CourseLevel;
  duration: string;    // "٦ ساعات"
  lessons: number;
  students: number;
  rating: number;
  price: number;       // 0 = مجاني
  featured?: boolean;
  isNew?: boolean;
  certificate: boolean;
  color: string;       // gradient classes
}

// ─── Mock Courses ─────────────────────────────────────────────────────────────

const COURSES: Course[] = [
  {
    slug: 'corporate-law-fundamentals',
    title: 'أساسيات القانون التجاري السعودي',
    subtitle: 'نظام الشركات ونظام التجارة — دليل شامل للمؤسسات والمستثمرين',
    instructor: 'أ. محمد العتيبي',
    category: 'القانون التجاري',
    level: 'مبتدئ',
    duration: '٨ ساعات',
    lessons: 24,
    students: 3420,
    rating: 4.8,
    price: 0,
    featured: true,
    certificate: true,
    color: 'from-[#0B3D2E] to-[#1a6645]',
  },
  {
    slug: 'contract-drafting-masterclass',
    title: 'إتقان صياغة العقود القانونية',
    subtitle: 'من النظرية إلى التطبيق — صغ عقوداً محكمة بلغة قانونية سليمة',
    instructor: 'أ. سارة الحربي',
    category: 'العقود',
    level: 'متوسط',
    duration: '١٢ ساعة',
    lessons: 36,
    students: 2180,
    rating: 4.9,
    price: 299,
    featured: true,
    isNew: true,
    certificate: true,
    color: 'from-[#1a3a5c] to-[#2a5a9c]',
  },
  {
    slug: 'personal-status-law',
    title: 'نظام الأحوال الشخصية المحدَّث 1443هـ',
    subtitle: 'الطلاق، الحضانة، النفقة، والميراث — التطبيقات العملية',
    instructor: 'أ. نورة الشمري',
    category: 'الأحوال الشخصية',
    level: 'متوسط',
    duration: '١٠ ساعات',
    lessons: 28,
    students: 1890,
    rating: 4.7,
    price: 249,
    certificate: true,
    color: 'from-[#4a1a6c] to-[#7a2aac]',
  },
  {
    slug: 'litigation-procedures',
    title: 'إجراءات التقاضي أمام المحاكم السعودية',
    subtitle: 'رفع الدعوى، التمثيل، الاستئناف، وتنفيذ الأحكام',
    instructor: 'أ. خالد المطيري',
    category: 'القضاء والإجراءات',
    level: 'متقدم',
    duration: '١٤ ساعة',
    lessons: 42,
    students: 940,
    rating: 4.9,
    price: 399,
    isNew: true,
    certificate: true,
    color: 'from-[#6c3a00] to-[#ac5a00]',
  },
  {
    slug: 'compliance-pdpl',
    title: 'نظام حماية البيانات الشخصية (PDPL)',
    subtitle: 'الامتثال التنظيمي، حقوق الأفراد، وعقوبات المخالفات',
    instructor: 'أ. فيصل الدوسري',
    category: 'الامتثال',
    level: 'مبتدئ',
    duration: '٦ ساعات',
    lessons: 18,
    students: 2650,
    rating: 4.6,
    price: 0,
    certificate: false,
    color: 'from-[#1a4a3c] to-[#2a7a5c]',
  },
  {
    slug: 'legal-negotiation-skills',
    title: 'مهارات التفاوض القانوني',
    subtitle: 'فن الإقناع والتسوية — استراتيجيات عملية للمحامين ورجال الأعمال',
    instructor: 'أ. ليلى الزهراني',
    category: 'المهارات القانونية',
    level: 'متوسط',
    duration: '٨ ساعات',
    lessons: 22,
    students: 1340,
    rating: 4.8,
    price: 199,
    certificate: true,
    color: 'from-[#4c1a1a] to-[#7c2a2a]',
  },
];

const CATEGORIES: CourseCategory[] = [
  'القانون التجاري', 'الأحوال الشخصية', 'العقود',
  'القضاء والإجراءات', 'الامتثال', 'المهارات القانونية',
];

const LEVELS: CourseLevel[] = ['مبتدئ', 'متوسط', 'متقدم'];

const LEVEL_COLORS: Record<CourseLevel, string> = {
  'مبتدئ':  'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  'متوسط':  'text-amber-500   bg-amber-500/10   border-amber-500/20',
  'متقدم':  'text-red-500     bg-red-500/10     border-red-500/20',
};

const STATS = [
  { icon: BookOpen,    label: 'دورة تدريبية',  value: '٤٠+' },
  { icon: Users,       label: 'متدرب',          value: '١٢,٠٠٠+' },
  { icon: Certificate, label: 'شهادة رقمية',    value: '٨,٥٠٠+' },
  { icon: Star,        label: 'متوسط التقييم',  value: '٤.٨' },
];

// ─── Course Card ──────────────────────────────────────────────────────────────

function CourseCard({ course, isDark }: { course: Course; isDark: boolean }) {
  const card = isDark ? 'border-white/[0.08] bg-[#161b22]' : 'border-slate-200 bg-white shadow-sm';
  const levelColor = LEVEL_COLORS[course.level];

  return (
    <Link href={`/academy/${course.slug}`}>
      <motion.div
        whileHover={{ y: -4, scale: 1.01 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className={`group rounded-2xl border ${card} overflow-hidden cursor-pointer hover:border-[#0B3D2E]/30 transition-colors`}>
        {/* Card header gradient */}
        <div className={`h-28 bg-gradient-to-br ${course.color} relative flex items-end p-4`}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative z-10 flex items-center justify-between w-full">
            <span className={`text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-bold border border-white/20`}>
              {course.category}
            </span>
            <div className="flex gap-1.5">
              {course.isNew && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#C8A762]/90 text-white font-bold">جديد</span>
              )}
              {course.price === 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/90 text-white font-bold">مجاني</span>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-4">
          <h3 className={`text-sm font-bold leading-snug mb-1 group-hover:text-[#0B3D2E] transition-colors ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
            {course.title}
          </h3>
          <p className={`text-[11px] leading-relaxed mb-3 line-clamp-2 ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
            {course.subtitle}
          </p>

          {/* Instructor */}
          <p className={`text-[11px] mb-3 ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>
            {course.instructor}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-semibold ${levelColor}`}>
              {course.level}
            </span>
            <span className={`flex items-center gap-0.5 text-[10px] ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
              <Clock size={9} /> {course.duration}
            </span>
            <span className={`flex items-center gap-0.5 text-[10px] ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
              <Play size={9} /> {course.lessons} درس
            </span>
            {course.certificate && (
              <span className={`flex items-center gap-0.5 text-[10px] text-[#C8A762]`}>
                <Certificate size={9} /> شهادة
              </span>
            )}
          </div>

          {/* Footer */}
          <div className={`flex items-center justify-between pt-3 border-t ${isDark ? 'border-white/[0.06]' : 'border-slate-100'}`}>
            <div className="flex items-center gap-1">
              <Star size={11} weight="fill" className="text-amber-400" />
              <span className={`text-[11px] font-bold ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>{course.rating}</span>
              <span className={`text-[10px] ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>({course.students.toLocaleString('ar-SA')})</span>
            </div>
            <p className={`text-sm font-black ${course.price === 0 ? 'text-emerald-500' : isDark ? 'text-white' : 'text-slate-900'}`}>
              {course.price === 0 ? 'مجاناً' : `${course.price} ر.س`}
            </p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AcademyPage() {
  const { isDark } = useTheme();
  const [search,   setSearch]   = useState('');
  const [catFilter, setCatFilter] = useState<CourseCategory | 'الكل'>('الكل');
  const [lvlFilter, setLvlFilter] = useState<CourseLevel | 'الكل'>('الكل');
  const [priceFilter, setPriceFilter] = useState<'الكل' | 'مجاني' | 'مدفوع'>('الكل');

  const card    = isDark ? 'border-white/[0.08] bg-[#161b22]' : 'border-slate-200 bg-white shadow-sm';
  const textPri = isDark ? 'text-zinc-100' : 'text-slate-900';
  const textMuted = isDark ? 'text-zinc-400' : 'text-slate-500';
  const subCard = isDark ? 'bg-white/[0.04] border-white/[0.06]' : 'bg-slate-50 border-slate-100';

  const featured = COURSES.filter(c => c.featured);
  const filtered = COURSES.filter(c => {
    if (catFilter !== 'الكل' && c.category !== catFilter) return false;
    if (lvlFilter !== 'الكل' && c.level !== lvlFilter)    return false;
    if (priceFilter === 'مجاني' && c.price !== 0)          return false;
    if (priceFilter === 'مدفوع' && c.price === 0)          return false;
    if (search && !c.title.includes(search) && !c.category.includes(search)) return false;
    return true;
  });

  return (
    <div className="min-h-screen" dir="rtl">

      {/* Hero Banner */}
      <div className={`relative overflow-hidden rounded-3xl mb-8 p-8 md:p-12 bg-gradient-to-br from-[#0B3D2E] via-[#125340] to-[#0d4a38]`}>
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #C8A762 0%, transparent 50%), radial-gradient(circle at 80% 20%, white 0%, transparent 40%)' }} />
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-2 mb-4">
            <GraduationCap size={28} weight="fill" className="text-[#C8A762]" />
            <span className="text-[#C8A762] font-black text-lg">أكاديمية نظامي</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-3 leading-tight">
            تعلّم القانون السعودي<br />
            <span className="text-[#C8A762]">من الخبراء المرخّصين</span>
          </h1>
          <p className="text-white/70 text-sm mb-6 leading-relaxed max-w-xl">
            دورات تدريبية متخصصة في القانون السعودي — للمحامين والشركات والأفراد. شهادات معتمدة، محتوى حديث، وأسعار في متناول الجميع.
          </p>
          <div className="flex gap-3 flex-wrap">
            <Link href="/dashboard/client/services"
              className="flex items-center gap-2 px-5 py-2.5 bg-[#C8A762] text-[#0B3D2E] rounded-xl font-black text-sm hover:bg-[#d4b46e] transition-colors">
              <Lightning size={16} weight="fill" />
              ابدأ التعلم الآن
            </Link>
            <Link href="/academy/my-courses"
              className="flex items-center gap-2 px-5 py-2.5 bg-white/10 text-white rounded-xl font-bold text-sm hover:bg-white/20 transition-colors border border-white/20">
              دوراتي
            </Link>
            <Link href="/academy/quiz"
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-300 text-[#0B3D2E] rounded-xl font-bold text-sm hover:scale-105 transition-all shadow-md">
              <Trophy size={16} weight="fill" />
              تحدي نظامي
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {STATS.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={i}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.35 }}
              className={`rounded-2xl border ${card} p-4 flex items-center gap-3`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? 'bg-[#0B3D2E]/30' : 'bg-[#0B3D2E]/10'}`}>
                <Icon size={18} weight="fill" className="text-[#0B3D2E] dark:text-emerald-400" />
              </div>
              <div>
                <p className={`text-xl font-black tabular-nums ${textPri}`}>{s.value}</p>
                <p className={`text-[11px] ${textMuted}`}>{s.label}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Gamification Banner */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="mb-8 relative overflow-hidden rounded-3xl bg-[#0B3D2E] border border-[#C8A762]/30 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="absolute -left-10 -bottom-10 opacity-20">
          <Trophy size={180} weight="fill" className="text-[#C8A762]" />
        </div>
        <div className="relative z-10 flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#C8A762] to-amber-400 flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#C8A762]/20">
            <Sparkle size={28} weight="fill" className="text-[#0B3D2E]" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white mb-1">تحدي نظامي — اختبر معلوماتك!</h3>
            <p className="text-emerald-300/80 text-sm">جاوب على الأسئلة، اجمع النقاط، وشارك نتيجتك مع زملائك على LinkedIn.</p>
          </div>
        </div>
        <Link href="/academy/quiz" className="relative z-10 shrink-0 bg-[#C8A762] text-[#0B3D2E] px-6 py-3 rounded-xl font-bold text-sm hover:bg-[#d4b46e] transition-colors shadow-md flex items-center gap-2">
          ابدأ التحدي الآن <ArrowLeft size={16} />
        </Link>
      </motion.div>

      {/* Featured */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Crown size={18} weight="fill" className="text-[#C8A762]" />
          <h2 className={`text-base font-black ${textPri}`}>الدورات المميزة</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {featured.map((c, i) => (
            <motion.div key={c.slug}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.35 }}>
              <CourseCard course={c} isDark={isDark} />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className={`rounded-2xl border ${card} p-4 mb-6`}>
        {/* Search */}
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border mb-4 ${isDark ? 'border-white/[0.08] bg-white/[0.04]' : 'border-slate-200 bg-slate-50'}`}>
          <MagnifyingGlass size={15} className={textMuted} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث عن دورة..."
            className={`flex-1 bg-transparent text-sm outline-none ${isDark ? 'text-zinc-100 placeholder:text-zinc-600' : 'text-slate-700 placeholder:text-slate-400'}`} />
        </div>

        {/* Category filter */}
        <div className="flex gap-1.5 flex-wrap mb-3">
          {(['الكل', ...CATEGORIES] as const).map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat as CourseCategory | 'الكل')}
              className={`px-3 py-1.5 text-xs rounded-xl border font-semibold transition-all ${catFilter === cat
                ? 'bg-[#0B3D2E] text-white border-[#0B3D2E]'
                : isDark ? 'border-white/[0.06] text-zinc-500 hover:text-zinc-300' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
              {cat}
            </button>
          ))}
        </div>

        {/* Level + Price filter */}
        <div className="flex gap-2 flex-wrap">
          {(['الكل', ...LEVELS] as const).map(lvl => (
            <button key={lvl} onClick={() => setLvlFilter(lvl as CourseLevel | 'الكل')}
              className={`px-2.5 py-1 text-[11px] rounded-lg border font-medium transition-all ${lvlFilter === lvl
                ? 'bg-[#C8A762]/20 text-[#C8A762] border-[#C8A762]/40'
                : isDark ? 'border-white/[0.06] text-zinc-600 hover:text-zinc-400' : 'border-slate-100 text-slate-400'}`}>
              {lvl}
            </button>
          ))}
          <div className={`w-px ${isDark ? 'bg-white/[0.06]' : 'bg-slate-200'}`} />
          {(['الكل', 'مجاني', 'مدفوع'] as const).map(p => (
            <button key={p} onClick={() => setPriceFilter(p)}
              className={`px-2.5 py-1 text-[11px] rounded-lg border font-medium transition-all ${priceFilter === p
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                : isDark ? 'border-white/[0.06] text-zinc-600 hover:text-zinc-400' : 'border-slate-100 text-slate-400'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* All courses */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className={`text-base font-black ${textPri}`}>
          جميع الدورات
          <span className={`mr-2 text-sm font-normal ${textMuted}`}>({filtered.length})</span>
        </h2>
      </div>

      {filtered.length === 0 ? (
        <div className={`rounded-2xl border ${card} p-12 flex flex-col items-center gap-3`}>
          <GraduationCap size={32} className={textMuted} />
          <p className={`text-sm ${textMuted}`}>لا توجد دورات مطابقة لبحثك</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-8">
          {filtered.map((c, i) => (
            <motion.div key={c.slug}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i, duration: 0.3 }}>
              <CourseCard course={c} isDark={isDark} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
