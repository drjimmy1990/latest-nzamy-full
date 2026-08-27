'use client';

/**
 * /dashboard/client/find-lawyer — the public lawyer directory.
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 * This page rendered the MOCK-directory model (`Lawyer` from ./data) over rows
 * the API had never returned. `getLawyers()` cast instead of mapping, so every
 * field the card read was `undefined`: the search box called
 * `l.name.includes(q)` and THREW on the first keystroke, and `l.priceMin <=
 * maxPrice` was `undefined <= 1200` → `false`, which filtered out every card
 * that survived. On top of that the card advertised a star rating, a review
 * count, a success rate and a response time, and the header advertised a 4.7/5
 * platform rating and «1,900+ استشارة مكتملة». NONE of those five fields has a
 * table, a column or a computation anywhere in this codebase.
 *
 * ── What it renders now ──────────────────────────────────────────────────────
 * `DirectoryLawyer` (src/lib/services/lawyerDirectory.ts) — only the columns
 * the schema has. Every field is optional and every one of them is rendered
 * inside a guard: no dash, no zero, no «غير محدد» standing in for a number the
 * lawyer never stated. If that leaves a sparse card, the card is sparse. That
 * is what the database says.
 *
 * ── The empty directory is the NORMAL case ───────────────────────────────────
 * Verified against production on 2026-08-27: all five `lawyer_profiles` rows
 * are `verification_status: "pending"` with `marketplace_visible: false`, and
 * GET /api/v1/lawyers filters on verified AND marketplace_visible. This page
 * therefore shows the empty state to every visitor today, which is why that
 * state is written as a real destination — the office's own intake — and not
 * as «لا توجد نتائج مطابقة».
 *
 * ── Why there is no booking button here ──────────────────────────────────────
 * There was one, and it wrote `receiver: 'lawyer'` — a value NOTHING in this
 * codebase reads. The admin fulfilment queue hard-filters
 * `.eq("receiver", "ai_workspace")` (src/app/api/v1/admin/service-orders/route.ts:54),
 * so every booking made from this page was written to the database and shown to
 * no human being; the success notice said as much out loud
 * («سيظهر للمحامي المعيّن بعد ربط صلاحيات الباك اند»). It also invented its own
 * price from `hourly_rate` and sent flat metadata with no `metadata.intake`,
 * which is the only thing the fulfilment brief reads.
 *
 * Rather than repair a second, worse copy of an intake that already exists, the
 * card now links to it: /dashboard/client/consultation/new?lawyer=<id> resolves
 * the lawyer from the database, pre-selects the lawyer path, and submits with
 * the right receiver, a real quoted total and a real `metadata.intake`. One
 * intake, one queue.
 *
 * ── Why this page counts rows only when it knows it holds all of them ─────────
 * Everything on this screen — the search, the city and specialisation chips,
 * the ordering, and the two counts — is computed IN THE CLIENT over the array
 * this component holds. That design is only truthful over the complete
 * directory, and the fetch was not complete: `getLawyers()` sends no `limit`,
 * the route defaults it to 20 and issues `.range(0, 19)`, so «٢٠ محامياً» was
 * printed as the size of a directory that might hold two hundred, and the chips
 * offered filters derived from one arbitrary page of it.
 *
 * The route already computes the truth — it selects with `{ count: "exact" }`
 * and returns it as `total` — and `getLawyers()` drops it on the floor. Raising
 * the limit would not have fixed anything: a bigger cap is still a cap, and the
 * page would still have no way to know when it bit. So the fetch happens here,
 * through `apiGet`, with an explicit limit, and `complete` compares the number
 * of ROWS THE SERVER SENT against the `total` it reported. Every directory-wide
 * claim — both counts and both chip rows — is gated on that boolean; when it is
 * false they are simply absent, with no notice standing in for them, because a
 * notice about truncation would be one more assertion resting on the same
 * `total`. Cards, search and ordering still work: they describe what is on
 * screen and never claim to describe more.
 *
 * `getLawyers()` (src/lib/services/lawyerService.ts:132) cannot express this —
 * it returns `DirectoryLawyer[]` with `total` discarded, and `LawyerFilters`
 * has no `limit`/`offset` — which is the whole reason this page calls one level
 * down. src/app/lawyers/browse/page.tsx reaches for `apiGet` too.
 */

import { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import {
  motion, AnimatePresence, useInView,
  useMotionValue, useTransform, useSpring,
} from 'framer-motion';
import Link from 'next/link';
import {
  MagnifyingGlass, MapPin, Briefcase, CalendarCheck,
  SealCheck, X, CheckCircle, CaretUpDown, Scales,
  Coins, WarningCircle, ArrowLeft,
} from '@phosphor-icons/react';
import { apiGet } from '@/lib/services';
import {
  toDirectoryLawyers,
  matchesDirectoryQuery,
  directoryFacet,
  acceptingClientsCount,
  sortDirectoryLawyers,
  arabicYearsOfPractice,
  arabicLawyerCount,
  arabicAcceptingClientsPredicate,
  type DirectoryLawyer,
  type DirectoryLawyerRow,
  type DirectorySortKey,
} from '@/lib/services/lawyerDirectory';
import { SkeletonList } from '../_components/DashboardSkeleton';

// ─── Constants ───────────────────────────────────────────────────────────────

/** The office's own intake — the only booking path that reaches a human. */
const CONSULTATION_HREF = '/dashboard/client/consultation/new';

/**
 * What GET /api/v1/lawyers answers with. `total` is `count` from a
 * `{ count: "exact" }` select over the same filtered query — the route's line
 * 38 — and is typed nullable because Supabase types it that way; a null one
 * means we cannot verify completeness, which this page treats as "not
 * complete" and therefore prints nothing.
 */
interface LawyerListResponse {
  lawyers?: DirectoryLawyerRow[] | null;
  total?: number | null;
}

/**
 * One request, explicitly bounded, sized far above the whole verified directory
 * (five lawyer_profiles rows exist in production and none is published yet).
 * This is still a cap — the point is not that it is large, it is that `total`
 * tells us when it bit and the page then stops making claims about the whole.
 */
const FETCH_LIMIT = 200;

/**
 * Every option here maps to a column that exists.
 *
 * «الأعلى تقييماً» and «الأكثر تقييماً» are gone with the ratings they sorted
 * by; `getLawyers` used to silently rewrite `sort: 'rating'` into
 * `sort: 'experience'`, so the directory said it was ordering by rating while
 * ordering by years of practice.
 */
const SORT_OPTIONS: { id: DirectorySortKey; label: string }[] = [
  { id: 'experience', label: 'الأطول ممارسة' },
  { id: 'fee_asc',    label: 'الأقل أتعاباً بالساعة' },
  { id: 'name',       label: 'أبجدياً' },
];

const ALL = 'all';

// The comparators themselves — and the "unstated last, in BOTH directions" rule
// they share — now live in src/lib/services/lawyerDirectory.ts, under test.
// They were here, and «أبجدياً» was the one of the three that quietly did not
// follow the rule: it compared `(a.name ?? '')`, and '' collates before every
// real name, so the single card that renders with no heading was ranked first.

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

// ─── LawyerCard — Spotlight Border + Parallax Tilt ───────────────────────────
function LawyerCard({ l, index }: { l: DirectoryLawyer; index: number }) {
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
  const spotlight = useTransform(
    [spotX, spotY],
    ([x, y]) => `radial-gradient(280px circle at ${x}px ${y}px, rgba(200,167,98,0.12), transparent 60%)`,
  );

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

  // Two initials off the display name. Replaces the ui-avatars.com URL the mock
  // rows carried: a third-party image service is not somewhere a licensed
  // advocate's name should be sent, and there is nothing to send when the row
  // has no avatar anyway.
  const initials = (l.name ?? '')
    .replace(/^(الأستاذ|الأستاذة|المحامي|المحامية)\s+/u, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

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
        className="group relative flex flex-col overflow-hidden rounded-[1.75rem] bg-white border border-slate-200/60 shadow-[0_20px_40px_-15px_rgba(11,61,46,0.06)] select-none h-full"
      >
        {/* Spotlight border glow */}
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-[1.75rem] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{ background: spotlight }}
        />

        {/* Top gradient bar */}
        <div className="h-1 w-full bg-gradient-to-r from-[#0B3D2E] via-[#C8A762] to-[#0B3D2E]" />

        {/* Accepting-clients pill — ONLY on an explicit yes. `null` means the
            lawyer never answered the question, and a card is not the place to
            answer it for him. */}
        {l.isAcceptingClients === true && (
          <div className="absolute top-5 left-4 flex items-center gap-1.5 bg-emerald-500 text-white text-[9px] font-black px-2.5 py-1 rounded-full shadow-lg shadow-emerald-500/25 z-10">
            <AvailabilityPulse />
            يستقبل موكلين
          </div>
        )}

        {/* Avatar + identity */}
        <div className="px-6 pt-6 pb-4 flex items-start gap-4">
          <div className="relative flex-shrink-0">
            <div className="p-[2px] rounded-2xl bg-gradient-to-br from-[#0B3D2E] via-[#1a5e42] to-[#C8A762]">
              {l.avatarUrl ? (
                <img
                  src={l.avatarUrl}
                  alt={l.name ?? ''}
                  className="w-[58px] h-[58px] rounded-[14px] object-cover bg-white"
                  loading="lazy"
                />
              ) : (
                <div className="w-[58px] h-[58px] rounded-[14px] bg-[#0B3D2E] text-white flex items-center justify-center font-black text-[17px]">
                  {initials || <Scales size={24} weight="duotone" className="text-white/70" />}
                </div>
              )}
            </div>
            {/* A real claim, not a decoration: GET /api/v1/lawyers returns only
                rows whose verification_status is 'verified'. */}
            <div className="absolute -bottom-1.5 -right-1.5 w-[22px] h-[22px] rounded-full bg-white flex items-center justify-center shadow-md" title="ملف موثّق">
              <SealCheck size={15} weight="fill" className="text-[#0B3D2E]" />
            </div>
          </div>

          <div className="flex-1 min-w-0 pt-0.5">
            {/* No name in either language ⇒ no heading. The old cast rendered
                «undefined» here for every real row. */}
            {l.name && (
              <h3 className="font-black text-zinc-900 text-[15px] tracking-tight leading-tight mb-1 truncate">
                {l.name}
              </h3>
            )}
            {l.specialties.length > 0 && (
              <p className="text-[11.5px] text-[#0B3D2E] font-semibold truncate">
                {l.specialties[0]}
              </p>
            )}
          </div>
        </div>

        {/* Stated facts only. Each chip is guarded: nothing renders a 0, and an
            empty row simply produces no chips. */}
        {(l.yearsExperience !== undefined || l.city || l.hourlyRate !== undefined) && (
          <div className="px-6 pb-4 flex gap-1.5 flex-wrap">
            {l.yearsExperience !== undefined && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-100 text-[10px] text-slate-500 font-semibold">
                <Briefcase size={9} weight="fill" className="text-[#0B3D2E]" />
                {arabicYearsOfPractice(l.yearsExperience)}
              </span>
            )}
            {l.city && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-100 text-[10px] text-slate-400 font-medium">
                <MapPin size={9} weight="fill" />
                {l.city}
              </span>
            )}
            {/* «الأتعاب بالساعة», never «سعر الاستشارة»: hourly_rate is the
                lawyer's own stated rate and is NOT what an office consultation
                costs. The old card printed it as a consultation price range. */}
            {l.hourlyRate !== undefined && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#C8A762]/10 border border-[#C8A762]/20 text-[10px] text-[#8a6f2e] font-semibold">
                <Coins size={9} weight="fill" />
                الأتعاب بالساعة {l.hourlyRate.toLocaleString('ar-SA')} ر.س
              </span>
            )}
          </div>
        )}

        {/* Remaining specialties */}
        {l.specialties.length > 1 && (
          <div className="px-6 pb-4 flex flex-wrap gap-1.5">
            {l.specialties.slice(1, 4).map((s) => (
              <span key={s} className="px-2 py-0.5 text-[10px] border border-slate-200 rounded-lg text-slate-500 bg-white">
                {s}
              </span>
            ))}
          </div>
        )}

        {l.bio && (
          <p className="px-6 pb-4 text-[11.5px] leading-relaxed text-slate-500 line-clamp-3">
            {l.bio}
          </p>
        )}

        {/* CTA — the office intake, the only booking path that reaches a human.
            The old «عرض الملف» link went to /lawyers/[id], which
            src/app/lawyers/layout.tsx:27 redirects to the marketing page
            /services/lawyers while BETA_MONOPOLY_MODE is on: it promised a
            profile that cannot be shown. */}
        <div className="mt-auto px-6 pb-6">
          <Link
            href={`${CONSULTATION_HREF}?lawyer=${encodeURIComponent(l.id)}`}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[12px] font-black bg-[#0B3D2E] text-white hover:bg-[#0a3328] shadow-[0_4px_14px_0_rgba(11,61,46,0.25)] transition-all duration-200 active:scale-[0.98]"
          >
            <CalendarCheck size={13} weight="fill" />
            احجز استشارة عبر المكتب
          </Link>
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
      type="button"
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
  const [lawyers, setLawyers]         = useState<DirectoryLawyer[]>([]);
  const [loading, setLoading]         = useState(true);
  const [fetchError, setFetchError]   = useState(false);
  const [search, setSearch]           = useState('');
  const [city, setCity]               = useState(ALL);
  const [specialty, setSpecialty]     = useState(ALL);
  const [sort, setSort]               = useState<DirectorySortKey>('experience');
  const [acceptingOnly, setAcceptingOnly] = useState(false);
  const [sortOpen, setSortOpen]       = useState(false);
  /**
   * Are the rows in `lawyers` the WHOLE published directory? Only then may this
   * page print a number about it, or derive a filter list from it.
   * Defaults to false, so every degradation — a null `total`, a truncated
   * page, a shape we did not expect — hides the claim rather than guessing.
   */
  const [complete, setComplete]       = useState(false);

  useEffect(() => {
    apiGet<LawyerListResponse>('/api/v1/lawyers', { limit: FETCH_LIMIT })
      .then((response) => {
        const rows = Array.isArray(response?.lawyers) ? response.lawyers : [];
        setLawyers(toDirectoryLawyers(rows));
        // Compare the RAW row count, not the mapped length: `toDirectoryLawyers`
        // drops rows with no id, and reading a dropped row as a missing page
        // would hide the counts for a reason that has nothing to do with paging.
        setComplete(typeof response?.total === 'number' && rows.length >= response.total);
        setFetchError(false);
      })
      .catch(() => {
        // `apiGet` throws on a non-2xx or a dead network, which is what keeps
        // "we could not ask" from rendering as "no lawyer has published a
        // profile" — two different facts with two different screens below.
        setFetchError(true);
        setLawyers([]);
        setComplete(false);
      })
      .finally(() => setLoading(false));
  }, []);

  // Chip options come from the rows that actually arrived. The hard-coded lists
  // this page used to carry — eight cities and nine `specialtyKey` ids — were
  // matched against a field the API has never returned, so every chip was a
  // filter that could only ever return nothing.
  const cityOptions = useMemo(() => directoryFacet(lawyers, 'city'), [lawyers]);
  const specialtyOptions = useMemo(() => directoryFacet(lawyers, 'specialties'), [lawyers]);
  const acceptingCount = useMemo(() => acceptingClientsCount(lawyers), [lawyers]);

  const sorted = useMemo(() => {
    const result = lawyers.filter((l) => {
      const matchSearch = matchesDirectoryQuery(l, search);
      const matchCity   = city === ALL || l.city === city;
      const matchSpec   = specialty === ALL || l.specialties.includes(specialty);
      const matchAccept = !acceptingOnly || l.isAcceptingClients === true;
      return matchSearch && matchCity && matchSpec && matchAccept;
    });

    return sortDirectoryLawyers(result, sort);
  }, [lawyers, search, city, specialty, sort, acceptingOnly]);

  const activeFiltersCount = [city !== ALL, specialty !== ALL, acceptingOnly].filter(Boolean).length;

  const clearAll = useCallback(() => {
    setCity(ALL); setSpecialty(ALL);
    setAcceptingOnly(false);
    setSearch(''); setSort('experience');
  }, []);

  const sortLabel = SORT_OPTIONS.find((s) => s.id === sort)?.label ?? 'الترتيب';
  const hasLawyers = lawyers.length > 0;

  return (
    <div className="min-h-[100dvh] bg-[#f9fafb]" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">

        {/* ── Header ───────────────────────────────────────────────────────
            The right-hand «live stats» block used to sit here with two tiles:
            «متوسط التقييم 4.7 / 5» and «استشارة مكتملة 1,900+». Both were
            literals in the JSX. There is no ratings table and no completed-
            consultation counter in this platform, so they are deleted rather
            than zeroed — a rendered 0 would be the same claim, only smaller. */}
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6 mb-10">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="h-[3px] w-8 rounded-full bg-[#C8A762] inline-block" />
              <span className="text-[11px] font-black tracking-widest text-[#C8A762] uppercase">محامون موثّقون</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-zinc-900 leading-tight mb-3">
              ابحث عن المحامي<br />
              <span className="text-[#0B3D2E]">المناسب لقضيتك</span>
            </h1>
            <p className="text-slate-500 text-[13.5px] leading-relaxed max-w-[55ch]">
              محامون وثّق المكتب تراخيصهم واختاروا نشر ملفاتهم في الدليل — اطّلع على
              التخصص وسنوات الممارسة، ثم احجز استشارتك عبر المكتب.
            </p>
          </div>

          {/* One derived count — and only when there is something to count AND
              this page holds the whole directory to count it over. The verb
              comes from the same module as the noun, so «محامٍ واحد» is never
              printed above a plural «يستقبلون» again. */}
          {complete && acceptingCount > 0 && (
            <div className="flex flex-col justify-end">
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-200/70 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.04)]">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <AvailabilityPulse />
                </div>
                <div>
                  <p className="text-[15px] font-black text-zinc-900 leading-none">
                    {arabicLawyerCount(acceptingCount)}
                  </p>
                  <p className="text-[10.5px] text-slate-400 mt-1">
                    {arabicAcceptingClientsPredicate(acceptingCount)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Search + filters — only meaningful once there is something to
            filter. Showing a search box over an empty directory is how «لا توجد
            نتائج مطابقة» came to stand in for «لا يوجد أحد». ─────────────── */}
        {hasLawyers && (
          <>
            <div className="relative mb-5">
              <MagnifyingGlass size={17} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="اسم المحامي، التخصص، أو المدينة…"
                className="w-full pr-11 pl-10 py-3.5 text-[13.5px] border border-slate-200 rounded-2xl bg-white focus:outline-none focus:border-[#0B3D2E]/40 focus:ring-2 focus:ring-[#0B3D2E]/8 transition-all shadow-sm placeholder:text-slate-400"
              />
              <AnimatePresence>
                {search && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={() => setSearch('')}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label="مسح البحث"
                  >
                    <X size={15} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Both chip rows are gated on `complete` as well as on having more
                than one option. A facet derived from one page of the directory
                offers a city list with cities missing from it, and silently
                filters the cards over a subset — «كل المدن» would be a button
                that says all and means some. */}
            {complete && cityOptions.length > 1 && (
              <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
                <FilterChip active={city === ALL} onClick={() => setCity(ALL)}>كل المدن</FilterChip>
                {cityOptions.map((c) => (
                  <FilterChip key={c} active={city === c} onClick={() => setCity(c)}>{c}</FilterChip>
                ))}
              </div>
            )}

            {complete && specialtyOptions.length > 1 && (
              <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-hide">
                <FilterChip active={specialty === ALL} onClick={() => setSpecialty(ALL)} variant="gold">
                  كل التخصصات
                </FilterChip>
                {specialtyOptions.map((s) => (
                  <FilterChip key={s} active={specialty === s} onClick={() => setSpecialty(s)} variant="gold">
                    {s}
                  </FilterChip>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 mb-5 flex-wrap">
              {/* Offered only when at least one lawyer actually answered yes —
                  otherwise it is a toggle whose only outcome is an empty list. */}
              {acceptingCount > 0 && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setAcceptingOnly(!acceptingOnly)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11.5px] font-semibold border transition-all ${
                    acceptingOnly
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'border-slate-200 text-slate-500 bg-white hover:border-slate-300'
                  }`}
                >
                  {acceptingOnly ? <AvailabilityPulse /> : <span className="w-2 h-2 rounded-full bg-slate-300" />}
                  يستقبل موكلين
                </motion.button>
              )}

              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="flex items-center gap-1.5 text-[11.5px] text-rose-600 hover:text-rose-700 font-semibold px-3 py-2 rounded-xl border border-rose-200 hover:bg-rose-50 transition-all active:scale-[0.97]"
                >
                  <X size={12} />
                  مسح الفلاتر ({activeFiltersCount})
                </button>
              )}

              <div className="relative ms-auto">
                <motion.button
                  type="button"
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
                      className="absolute left-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-[0_12px_30px_-8px_rgba(0,0,0,0.1)] py-1.5 z-20 min-w-[190px]"
                    >
                      {SORT_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
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

              {/* «٧ محامين» beside the sort control reads as the size of the
                  directory, not as the length of one truncated page of it — so
                  it is printed only when those two are the same number. */}
              {complete && sorted.length > 0 && (
                <span className="text-[11px] text-slate-400 font-semibold">{arabicLawyerCount(sorted.length)}</span>
              )}
            </div>
          </>
        )}

        {/* ── Results ──────────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {loading ? (
            <SkeletonList count={6} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5" />
          ) : fetchError ? (
            /* ── The request failed. A DIFFERENT fact from an empty directory,
                  and it must not be told as one. ─────────────────────────── */
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              className="flex flex-col items-center py-24 gap-5 text-center"
            >
              <div className="w-20 h-20 rounded-3xl bg-white border border-amber-200 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.06)] flex items-center justify-center">
                <WarningCircle size={32} className="text-amber-500" weight="duotone" />
              </div>
              <div className="max-w-[330px] space-y-1.5">
                <p className="font-black text-zinc-800 text-lg">تعذّر تحميل دليل المحامين</p>
                <p className="text-slate-500 text-[13px] leading-relaxed">
                  لم نتمكّن من الوصول إلى الخادم. هذه مشكلة في التحميل ولا تعني أن الدليل فارغ.
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="text-[12px] text-[#0B3D2E] font-semibold px-5 py-2.5 rounded-xl border border-[#0B3D2E]/20 hover:bg-[#0B3D2E]/5 transition-all"
              >
                إعادة المحاولة
              </button>
            </motion.div>
          ) : !hasLawyers ? (
            /* ── Nobody has published a public profile. TODAY'S NORMAL STATE:
                  all five lawyer_profiles rows are pending and not marked
                  marketplace_visible, and the API filters on both. So this says
                  what is true and hands the client a door that opens. ────── */
            <motion.div
              key="no-lawyers"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              className="flex flex-col items-center py-24 gap-6 text-center"
            >
              <div className="w-24 h-24 rounded-[1.75rem] bg-gradient-to-br from-[#0B3D2E]/5 via-white to-[#C8A762]/5 border border-slate-200/80 shadow-[0_12px_32px_-8px_rgba(11,61,46,0.08)] flex items-center justify-center">
                <Scales size={40} className="text-[#0B3D2E]/30" weight="duotone" />
              </div>

              <div className="max-w-[420px] space-y-2.5">
                <p className="font-black text-zinc-800 text-xl leading-tight">
                  لم يَنشُر أي محامٍ ملفاً عاماً في الدليل بعد
                </p>
                <p className="text-slate-500 text-[13px] leading-relaxed">
                  يظهر المحامي هنا بعد أن يوثّق المكتب ترخيصه ويختار هو نشر ملفه للعموم.
                  ولا يعني خلوّ الدليل تعذُّر الحصول على استشارة: مكتب نظامي يستقبل طلبك
                  ويُسنده إلى المحامي المختص.
                </p>
              </div>

              <Link
                href={CONSULTATION_HREF}
                className="flex items-center gap-2 bg-[#0B3D2E] text-white text-[12.5px] font-black px-6 py-3 rounded-2xl shadow-[0_4px_14px_0_rgba(11,61,46,0.25)] hover:bg-[#0a3328] transition-all active:scale-[0.98]"
              >
                <CalendarCheck size={15} weight="fill" />
                احجز استشارة عبر المكتب
                <ArrowLeft size={13} weight="bold" />
              </Link>
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
              {sorted.map((l, i) => <LawyerCard key={l.id} l={l} index={i} />)}
            </motion.div>
          ) : (
            /* ── Filters matched nothing. Only reachable when the directory is
                  NOT empty, so «جرّب تغيير الفلاتر» is honest advice here. ── */
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
                type="button"
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
