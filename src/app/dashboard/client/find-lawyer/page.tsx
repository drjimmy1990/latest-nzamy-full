'use client';

import { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import {
  motion, AnimatePresence, useInView,
  useMotionValue, useTransform, useSpring,
} from 'framer-motion';
import Link from 'next/link';
import {
  MagnifyingGlass, Star, MapPin, Briefcase, CalendarCheck,
  SealCheck, Clock, X, SlidersHorizontal,
  CheckCircle, CaretUpDown,
  Buildings, House, Users, ShieldCheck,
  Lightbulb, Handshake, Factory,
  Scales,
} from '@phosphor-icons/react';
import { useUser } from '@/hooks/useUser';
import { createWorkflowId, createWorkflowRequest } from '@/lib/clientWorkflowRepository';
import { createPaymentIntentStub } from '@/lib/paymentAdapter';
import { type Lawyer } from './data';
import { getLawyers } from '@/lib/services';
import { SkeletonList } from '../_components/DashboardSkeleton';

// ─── Types ────────────────────────────────────────────────────────────────────
// Lawyer interface is now imported from ./data

type SortKey = 'rating' | 'price_asc' | 'price_desc' | 'experience' | 'reviews';

// ─── Constants ───────────────────────────────────────────────────────────────
const CITIES = [
  { id: 'all', label: 'كل المدن' },
  { id: 'الرياض', label: 'الرياض' },
  { id: 'جدة', label: 'جدة' },
  { id: 'الدمام', label: 'الدمام' },
  { id: 'مكة', label: 'مكة المكرمة' },
  { id: 'المدينة', label: 'المدينة المنورة' },
  { id: 'الشرقية', label: 'المنطقة الشرقية' },
  { id: 'أبها', label: 'أبها' },
];

const SPECIALTIES = [
  { id: 'all',        label: 'الكل',             icon: Scales },
  { id: 'labor',      label: 'عمالي',             icon: Briefcase },
  { id: 'commercial', label: 'تجاري',             icon: Buildings },
  { id: 'real-estate',label: 'عقاري',             icon: House },
  { id: 'family',     label: 'أسرة',              icon: Users },
  { id: 'criminal',   label: 'جنائي',             icon: ShieldCheck },
  { id: 'ip',         label: 'ملكية فكرية',       icon: Lightbulb },
  { id: 'civil',      label: 'مدني',              icon: Handshake },
  { id: 'corporate',  label: 'شركات',             icon: Factory },
];

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'rating',     label: 'الأعلى تقييماً' },
  { id: 'reviews',    label: 'الأكثر تقييماً' },
  { id: 'experience', label: 'الأكثر خبرة' },
  { id: 'price_asc',  label: 'السعر: الأقل' },
  { id: 'price_desc', label: 'السعر: الأعلى' },
];

// MOCK_LAWYERS is now imported from ./data (single source of truth for all 8 lawyers)


// ─── AvailabilityPulse — isolated to prevent re-renders ──────────────────────
const AvailabilityPulse = memo(function AvailabilityPulse() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <motion.span
        className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
        animate={{ scale: [1, 1.8, 1], opacity: [0.75, 0, 0.75] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
  );
});

// ─── StarRow ─────────────────────────────────────────────────────────────────
const StarRow = memo(function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s} size={11}
          weight={rating >= s ? 'fill' : rating >= s - 0.5 ? 'duotone' : 'regular'}
          className={rating >= s ? 'text-[#C8A762]' : 'text-slate-200'}
        />
      ))}
    </div>
  );
});

// ─── LawyerCard — Spotlight Border + Parallax Tilt ───────────────────────────
function LawyerCard({ l, index, onBook }: { l: Lawyer; index: number; onBook: (lawyer: Lawyer) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  // Parallax tilt
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-0.5, 0.5], [4, -4]);
  const rotateY = useTransform(mouseX, [-0.5, 0.5], [-4, 4]);
  const springRX = useSpring(rotateX, { stiffness: 120, damping: 22 });
  const springRY = useSpring(rotateY, { stiffness: 120, damping: 22 });

  // Spotlight
  const spotX = useMotionValue(0);
  const spotY = useMotionValue(0);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
    spotX.set(e.clientX - rect.left);
    spotY.set(e.clientY - rect.top);
  }, [mouseX, mouseY, spotX, spotY]);

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
  }, [mouseX, mouseY]);

  const priceLabel = `${l.priceMin.toLocaleString('ar-SA')}–${l.priceMax.toLocaleString('ar-SA')} ر.س`;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.07, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{ perspective: 800 }}
    >
      <motion.div
        ref={cardRef}
        style={{ rotateX: springRX, rotateY: springRY, transformStyle: 'preserve-3d' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        whileHover={{ scale: 1.015 }}
        transition={{ type: 'spring', stiffness: 200, damping: 28 }}
        className="group relative flex flex-col overflow-hidden rounded-[1.75rem] bg-white border border-slate-200/60 shadow-[0_20px_40px_-15px_rgba(11,61,46,0.06)] cursor-pointer select-none h-full"
      >
        {/* Spotlight border glow */}
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-[1.75rem] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: useTransform(
              [spotX, spotY],
              ([x, y]) => `radial-gradient(280px circle at ${x}px ${y}px, rgba(200,167,98,0.12), transparent 60%)`
            ),
          }}
        />

        {/* Top gradient bar */}
        <div className="h-1 w-full bg-gradient-to-r from-[#0B3D2E] via-[#C8A762] to-[#0B3D2E]" />

        {/* Availability pill */}
        {l.available && (
          <div className="absolute top-5 left-4 flex items-center gap-1.5 bg-emerald-500 text-white text-[9px] font-black px-2.5 py-1 rounded-full shadow-lg shadow-emerald-500/25 z-10">
            <AvailabilityPulse />
            متاح الآن
          </div>
        )}

        {/* Avatar + identity */}
        <div className="px-6 pt-6 pb-4 flex items-start gap-4">
          <div className="relative flex-shrink-0">
            <div className="p-[2px] rounded-2xl bg-gradient-to-br from-[#0B3D2E] via-[#1a5e42] to-[#C8A762]">
              <img
                src={l.avatar}
                alt={l.name}
                className="w-[58px] h-[58px] rounded-[14px] object-cover"
                loading="lazy"
              />
            </div>
            {l.verified && (
              <div className="absolute -bottom-1.5 -right-1.5 w-[22px] h-[22px] rounded-full bg-white flex items-center justify-center shadow-md">
                <SealCheck size={15} weight="fill" className="text-[#0B3D2E]" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="font-black text-zinc-900 text-[15px] tracking-tight leading-tight mb-0.5 truncate">
              {l.name}
            </h3>
            <p className="text-[11.5px] text-[#0B3D2E] font-semibold mb-2 truncate">{l.specialty}</p>
            <div className="flex items-center gap-1.5">
              <StarRow rating={l.rating} />
              <span className="text-[12px] font-black text-zinc-900 tabular-nums">{l.rating}</span>
              <span className="text-[10px] text-slate-400 tabular-nums">({l.reviewCount})</span>
            </div>
          </div>
        </div>

        {/* Stats chips */}
        <div className="px-6 pb-4 flex gap-1.5 flex-wrap">
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-100 text-[10px] text-slate-500 font-semibold">
            <Briefcase size={9} weight="fill" className="text-[#0B3D2E]" />
            {l.experienceYears} سنة
          </span>
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-100 text-[10px] text-emerald-700 font-semibold">
            <CheckCircle size={9} weight="fill" />
            {l.successRate}%
          </span>
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-sky-50 border border-sky-100 text-[10px] text-sky-600 font-semibold">
            <Clock size={9} weight="fill" />
            {l.responseTime}
          </span>
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-100 text-[10px] text-slate-400 font-medium">
            <MapPin size={9} weight="fill" />
            {l.city}
          </span>
        </div>

        {/* Tags */}
        <div className="px-6 pb-4 flex flex-wrap gap-1.5">
          {l.expertise.slice(0, 3).map((e) => (
            <span key={e} className="px-2 py-0.5 text-[10px] border border-slate-200 rounded-lg text-slate-500 bg-white">
              {e}
            </span>
          ))}
        </div>

        {/* Price + CTA */}
        <div className="mt-auto px-6 pb-6 space-y-3">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-2xl bg-slate-50 border border-slate-100/80">
            <span className="text-[10px] text-slate-400 font-medium">سعر الاستشارة</span>
            <span className="text-[13px] font-black text-[#0B3D2E] tabular-nums">{priceLabel}</span>
          </div>

          <div className="flex gap-2">
            <Link
              href={`/lawyers/${l.id}`}
              className="flex-[0.85] flex items-center justify-center py-2.5 border border-slate-200 rounded-2xl text-[11px] font-semibold text-slate-600 hover:border-[#0B3D2E]/30 hover:text-[#0B3D2E] hover:bg-[#0B3D2E]/[0.02] transition-all duration-200 active:scale-[0.98]"
            >
              عرض الملف
            </Link>
            <button
              type="button"
              onClick={() => onBook(l)}
              disabled={!l.available}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[12px] font-black transition-all duration-200 active:scale-[0.98] ${
                l.available
                  ? 'bg-[#0B3D2E] text-white hover:bg-[#0a3328] shadow-[0_4px_14px_0_rgba(11,61,46,0.25)]'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              <CalendarCheck size={13} weight="fill" />
              {l.available ? 'احجز الآن' : 'غير متاح'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── FilterChip ───────────────────────────────────────────────────────────────
function FilterChip({
  active, onClick, children, variant = 'dark',
}: {
  active: boolean; onClick: () => void; children: React.ReactNode; variant?: 'dark' | 'gold';
}) {
  const activeClass = variant === 'gold'
    ? 'bg-[#C8A762] text-white border-[#C8A762] shadow-sm'
    : 'bg-[#0B3D2E] text-white border-[#0B3D2E] shadow-sm';

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11.5px] font-semibold border transition-all duration-200 ${
        active ? activeClass : 'border-slate-200 text-slate-500 hover:border-slate-300 bg-white hover:text-slate-700'
      }`}
    >
      {children}
    </motion.button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FindLawyerPage() {
  const user = useUser();
  const [lawyers, setLawyers]         = useState<Lawyer[]>([]);
  const [loading, setLoading]         = useState(true);
  const [fetchError, setFetchError]   = useState(false);
  const [search, setSearch]           = useState('');
  const [city, setCity]               = useState('all');
  const [specialty, setSpecialty]     = useState('all');
  const [sort, setSort]               = useState<SortKey>('rating');
  const [availableOnly, setAvailable] = useState(false);
  const [maxPrice, setMaxPrice]       = useState(1200);
  const [showFilters, setShowFilters] = useState(false);
  const [sortOpen, setSortOpen]       = useState(false);
  const [bookingNotice, setBookingNotice] = useState<{ id: string; lawyer: string } | null>(null);

  useEffect(() => {
    getLawyers()
      .then(data => {
        setLawyers(data ?? []);
        setFetchError(false);
      })
      .catch(() => {
        setFetchError(true);
        setLawyers([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    const result = lawyers.filter((l) => {
      const q = search.trim().toLowerCase();
      const matchSearch = !q || l.name.includes(q) || l.specialty.includes(q) || l.expertise.some((e) => e.includes(q));
      const matchCity   = city === 'all'      || l.city === city;
      const matchSpec   = specialty === 'all' || l.specialtyKey === specialty;
      const matchAvail  = !availableOnly      || l.available;
      const matchPrice  = l.priceMin          <= maxPrice;
      return matchSearch && matchCity && matchSpec && matchAvail && matchPrice;
    });

    switch (sort) {
      case 'rating':     return [...result].sort((a, b) => b.rating - a.rating);
      case 'reviews':    return [...result].sort((a, b) => b.reviewCount - a.reviewCount);
      case 'experience': return [...result].sort((a, b) => b.experienceYears - a.experienceYears);
      case 'price_asc':  return [...result].sort((a, b) => a.priceMin - b.priceMin);
      case 'price_desc': return [...result].sort((a, b) => b.priceMin - a.priceMin);
    }
  }, [lawyers, search, city, specialty, sort, availableOnly, maxPrice]);

  const activeFiltersCount = [
    city !== 'all', specialty !== 'all', availableOnly, maxPrice < 1200,
  ].filter(Boolean).length;

  const clearAll = useCallback(() => {
    setCity('all'); setSpecialty('all');
    setAvailable(false); setMaxPrice(1200);
    setSearch(''); setSort('rating');
  }, []);

  const sortLabel = SORT_OPTIONS.find((s) => s.id === sort)?.label ?? 'الترتيب';
  const availableCount = lawyers.filter((l) => l.available).length;

  const handleBook = useCallback(async (lawyer: Lawyer) => {
    const requestId = createWorkflowId('LAW-CON');
    const paymentIntent = await createPaymentIntentStub({
      amount: lawyer.priceMin,
      requestId,
      serviceId: 'find-lawyer-consultation',
    });
    const request = await createWorkflowRequest({
      id: requestId,
      type: 'consultation',
      title: `حجز استشارة مع ${lawyer.name}`,
      description: `طلب حجز استشارة من دليل المحامين في تخصص ${lawyer.specialty}.`,
      requester: {
        userId: user.userId,
        name: user.name,
        role: user.userType,
        tier: user.tier,
        businessRole: user.businessRole,
      },
      receiver: 'lawyer',
      status: 'pending_payment',
      payment: {
        amount: lawyer.priceMin,
        status: 'pending',
      },
      sourcePath: '/dashboard/client/find-lawyer',
      metadata: {
        lawyerId: lawyer.id,
        lawyerName: lawyer.name,
        specialty: lawyer.specialtyKey,
        city: lawyer.city,
        mode: 'video',
        serviceId: 'find-lawyer-consultation',
        paymentIntentId: paymentIntent.id,
        paymentProvider: paymentIntent.provider,
      },
      auditEvent: 'find_lawyer_consultation_requested',
    });
    setBookingNotice({ id: request.id, lawyer: lawyer.name });
  }, [user.businessRole, user.name, user.tier, user.userType]);

  return (
    <div className="min-h-[100dvh] bg-[#f9fafb]" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {bookingNotice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-bold">تم إنشاء طلب حجز مع {bookingNotice.lawyer} برقم {bookingNotice.id}</span>
              <div className="flex items-center gap-3 text-xs font-bold">
                <Link href="/dashboard/client/requests" className="underline">متابعة الطلب</Link>
                <span>سيظهر للمحامي المعيّن بعد ربط صلاحيات الباك اند</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Asymmetric Header (DESIGN_VARIANCE: 8) ─────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6 mb-10">
          {/* Left: copy */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="h-[3px] w-8 rounded-full bg-[#C8A762] inline-block" />
              <span className="text-[11px] font-black tracking-widest text-[#C8A762] uppercase">محامون معتمدون</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-zinc-900 leading-tight mb-3">
              ابحث عن المحامي<br />
              <span className="text-[#0B3D2E]">المناسب لقضيتك</span>
            </h1>
            <p className="text-slate-500 text-[13.5px] leading-relaxed max-w-[55ch]">
              {lawyers.length > 0
                ? `${lawyers.length}+ محامٍ مرخص ومعتمد من وزارة العدل — قارن التخصصات والأسعار والتقييمات واحجز استشارتك في دقائق.`
                : 'ابحث عن المحامين المرخصين والمعتمدين من وزارة العدل — قارن التخصصات والأسعار والتقييمات واحجز استشارتك في دقائق.'
              }
            </p>
          </div>

          {/* Right: live stats — asymmetric data block */}
          <div className="flex flex-col justify-end gap-3">
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-200/70 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.04)]">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <AvailabilityPulse />
              </div>
              <div>
                <p className="text-xl font-black text-zinc-900 tabular-nums leading-none">{availableCount}</p>
                <p className="text-[10.5px] text-slate-400 mt-0.5">محامٍ متاح الآن</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'متوسط التقييم', value: '4.7', unit: '/ 5' },
                { label: 'استشارة مكتملة', value: '1,900+', unit: '' },
              ].map((s) => (
                <div key={s.label} className="p-3 rounded-xl bg-white border border-slate-200/70 text-center shadow-[0_2px_8px_-2px_rgba(0,0,0,0.04)]">
                  <p className="text-[15px] font-black text-zinc-900 tabular-nums leading-none">
                    {s.value}<span className="text-[10px] text-slate-400 font-medium">{s.unit}</span>
                  </p>
                  <p className="text-[9.5px] text-slate-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Search bar ────────────────────────────────────────────────── */}
        <div className="relative mb-5">
          <MagnifyingGlass size={17} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="اسم المحامي، التخصص، أو الكلمة المفتاحية…"
            className="w-full pr-11 pl-10 py-3.5 text-[13.5px] border border-slate-200 rounded-2xl bg-white focus:outline-none focus:border-[#0B3D2E]/40 focus:ring-2 focus:ring-[#0B3D2E]/8 transition-all shadow-sm placeholder:text-slate-400"
          />
          <AnimatePresence>
            {search && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setSearch('')}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={15} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* ── City chips ──────────────────────────────────────────────── */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
          {CITIES.map((c) => (
            <FilterChip key={c.id} active={city === c.id} onClick={() => setCity(c.id)}>
              {c.label}
            </FilterChip>
          ))}
        </div>

        {/* ── Specialty chips ──────────────────────────────────────────── */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-hide">
          {SPECIALTIES.map((s) => {
            const Icon = s.icon;
            return (
              <FilterChip key={s.id} active={specialty === s.id} onClick={() => setSpecialty(s.id)} variant="gold">
                <Icon size={11} weight={specialty === s.id ? 'fill' : 'regular'} />
                {s.label}
              </FilterChip>
            );
          })}
        </div>

        {/* ── Controls row ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {/* Filters toggle */}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11.5px] font-semibold border transition-all ${
              showFilters || activeFiltersCount > 0
                ? 'bg-[#0B3D2E]/5 border-[#0B3D2E]/30 text-[#0B3D2E]'
                : 'border-slate-200 text-slate-500 bg-white hover:border-slate-300'
            }`}
          >
            <SlidersHorizontal size={13} />
            فلاتر
            {activeFiltersCount > 0 && (
              <span className="bg-[#0B3D2E] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </motion.button>

          {/* Available toggle */}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setAvailable(!availableOnly)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11.5px] font-semibold border transition-all ${
              availableOnly
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'border-slate-200 text-slate-500 bg-white hover:border-slate-300'
            }`}
          >
            {availableOnly ? <AvailabilityPulse /> : <span className="w-2 h-2 rounded-full bg-slate-300" />}
            متاح الآن
          </motion.button>

          {/* Sort */}
          <div className="relative ms-auto">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setSortOpen(!sortOpen)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11.5px] font-semibold border border-slate-200 bg-white text-slate-600 hover:border-slate-300 transition-all"
            >
              <CaretUpDown size={12} />
              {sortLabel}
            </motion.button>
            <AnimatePresence>
              {sortOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  className="absolute left-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-[0_12px_30px_-8px_rgba(0,0,0,0.1)] py-1.5 z-20 min-w-[168px]"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => { setSort(opt.id); setSortOpen(false); }}
                      className={`w-full text-right px-4 py-2.5 text-[11.5px] font-medium flex items-center gap-2 transition-colors ${
                        sort === opt.id
                          ? 'text-[#0B3D2E] bg-[#0B3D2E]/5 font-semibold'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {sort === opt.id && <CheckCircle size={11} className="text-[#0B3D2E]" weight="fill" />}
                      {opt.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Count */}
          <span className="text-[11px] text-slate-400 font-mono tabular-nums">{sorted.length} نتيجة</span>
        </div>

        {/* ── Advanced Filters Panel ────────────────────────────────────── */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="mb-5 p-5 rounded-2xl border border-slate-200 bg-white shadow-[0_4px_16px_-4px_rgba(0,0,0,0.04)] grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-[11.5px] font-semibold text-slate-600">الحد الأقصى للسعر</label>
                    <span className="text-[11.5px] font-black text-[#0B3D2E] tabular-nums">{maxPrice.toLocaleString('ar-SA')} ر.س</span>
                  </div>
                  <input
                    type="range" min={100} max={1200} step={50}
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(Number(e.target.value))}
                    className="w-full accent-[#0B3D2E] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>١٠٠ ر.س</span><span>١٢٠٠ ر.س</span>
                  </div>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={clearAll}
                    className="flex items-center gap-1.5 text-[11.5px] text-rose-600 hover:text-rose-700 font-semibold px-4 py-2 rounded-xl border border-rose-200 hover:bg-rose-50 transition-all active:scale-[0.97]"
                  >
                    <X size={12} />
                    مسح كل الفلاتر
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Results Grid (2-col base, 3-col xl) — staggered ─────────── */}
        <AnimatePresence mode="wait">
          {loading ? (
            <SkeletonList count={6} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5" />
          ) : lawyers.length === 0 ? (
            /* ── No verified lawyers exist at all ──────────────────── */
            <motion.div
              key="no-lawyers"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              className="flex flex-col items-center py-28 gap-6 text-center"
            >
              {/* Icon container */}
              <div className="relative">
                <div className="w-24 h-24 rounded-[1.75rem] bg-gradient-to-br from-[#0B3D2E]/5 via-white to-[#C8A762]/5 border border-slate-200/80 shadow-[0_12px_32px_-8px_rgba(11,61,46,0.08)] flex items-center justify-center">
                  <Scales size={40} className="text-[#0B3D2E]/30" weight="duotone" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                  <Clock size={14} className="text-[#C8A762]" weight="fill" />
                </div>
              </div>

              {/* Arabic main message */}
              <div className="max-w-[340px] space-y-2">
                <p className="font-black text-zinc-800 text-xl leading-tight">
                  لا يوجد محامون متاحون حالياً
                </p>
                <p className="text-slate-400 text-[13px] leading-relaxed">
                  No verified lawyers available yet
                </p>
              </div>

              {/* Subtle info box */}
              <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#0B3D2E]/[0.03] border border-[#0B3D2E]/10 max-w-sm">
                <SealCheck size={18} weight="duotone" className="text-[#0B3D2E]/40 flex-shrink-0" />
                <p className="text-[11.5px] text-slate-500 leading-relaxed text-right">
                  يتم التحقق من المحامين قبل ظهورهم في الدليل — سيتوفر محامون قريباً إن شاء الله
                </p>
              </div>
            </motion.div>
          ) : sorted.length > 0 ? (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5"
            >
              {sorted.map((l, i) => <LawyerCard key={l.id} l={l} index={i} onBook={handleBook} />)}
            </motion.div>
          ) : (
            /* ── No results matching current filters ───────────────── */
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              className="flex flex-col items-center py-24 gap-5 text-center"
            >
              <div className="w-20 h-20 rounded-3xl bg-white border border-slate-200 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.06)] flex items-center justify-center">
                <MagnifyingGlass size={32} className="text-slate-300" weight="thin" />
              </div>
              <div className="max-w-[280px]">
                <p className="font-black text-zinc-700 text-lg mb-1.5">لا توجد نتائج مطابقة</p>
                <p className="text-slate-400 text-[13px] leading-relaxed">جرّب تغيير الفلاتر أو توسيع نطاق البحث</p>
              </div>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={clearAll}
                className="text-[12px] text-[#0B3D2E] font-semibold px-5 py-2.5 rounded-xl border border-[#0B3D2E]/20 hover:bg-[#0B3D2E]/5 transition-all"
              >
                مسح الفلاتر
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
