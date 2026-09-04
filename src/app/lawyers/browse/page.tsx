"use client";

/**
 * /lawyers/browse — the PUBLIC lawyer directory.
 *
 * ─── What this file used to be ────────────────────────────────────────────────
 * A `MOCK_LAWYERS` array of NINE invented Saudi advocates — «أحمد الغامدي»,
 * «نورة الشهراني», «خالد المطيري», «ريم الدوسري», «محمد الزهراني»,
 * «سلمى العتيبي», «عمر القحطاني», «هند الحربي», «يوسف العسيري» — each with an
 * invented rating (4.5–4.9), an invented review count, an invented session
 * count, an invented response time, an invented hourly price and an invented
 * professional tagline («خبرة ١٢ عاماً في نزاعات العمل والفصل التعسفي»), all
 * under a gold «موثّق» seal and a headline reading «محامٍ مرخص ومعتمد من وزارة
 * العدل».
 *
 * Those are fabricated professional credentials attributed to named
 * individuals — the same class of problem removed from /lawyers/[slug] in
 * daf7320. None of it was recomputed or defaulted to zero: a rendered zero
 * rating beside a licensed advocate is still a claim. The fields were deleted
 * together with the UI that framed them.
 *
 * ─── What is actually renderable ──────────────────────────────────────────────
 * The allow-list projection in src/app/api/v1/lawyers/route.ts, plus — since
 * Phase 7 (item 192) — `reviewStats` (avgRating, reviewCount) from a SEPARATE
 * query on the `lawyer_review_stats` view, attached per row by that same
 * route. There is still no session counter, no response-time metric, no
 * case-outcome data and no gamification/badge system anywhere in the schema
 * (item 40's other half — experience badges on the profile and in this
 * directory — stays undone for exactly that reason: no data model, no owner
 * sign-off on what a badge would even measure). So this page renders: name,
 * avatar, city, specialties, years of experience, bio, hourly rate, bar
 * association, whether the lawyer is accepting clients, and — only for a
 * lawyer with at least one review — a star rating and review count. Nothing
 * else.
 *
 * Every one of those is ALSO optional in practice. Measured against production:
 * 5 lawyer rows, all `verification_status = 'pending'`, all
 * `marketplace_visible = false`, 4 of 5 with no specialties, `years_experience`
 * 0 and an empty bio. The API returns a row only when verified AND visible, so
 * the correct rendering of this directory TODAY is empty. The empty state below
 * is therefore the normal case, designed to look finished — not a failure.
 *
 * ─── Why `apiGet` and not `getLawyers()` ──────────────────────────────────────
 * `getLawyers()` (src/lib/services/lawyerService.ts:94) is unusable here for two
 * independent reasons:
 *   1. Its return type is a lie. It is declared `Promise<Lawyer[]>` — the mock
 *      directory interface with `name`, `rating`, `priceMin`, `avatar` — but it
 *      forwards the raw PostgREST rows, which carry `display_name`,
 *      `hourly_rate`, `avatar_url` and an embedded `lawyer_profiles`. Reading
 *      `l.name` off it yields `undefined` with a clean `tsc`.
 *   2. It swallows every failure (`catch { return [] }`), so a network error is
 *      indistinguishable from an empty directory. A retry button hung off it
 *      would be dead code.
 * `apiGet` is the same helper one level down, where the throw survives — and
 * the list route never 404s, so `throw` means error and `{ lawyers: [] }` means
 * empty, exactly the two-way split this page needs.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import Link from "next/link";
import {
  MagnifyingGlass, SealCheck, MapPin, Briefcase, Coins, Scales,
  Funnel, Sliders, X, ArrowLeft, ArrowRight, ArrowClockwise,
  CheckCircle, Circle, WarningCircle, UserCircle, Star,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import { apiGet } from "@/lib/services";

const GOLD = "#C8A762";
const GREEN = "#0B3D2E";
const PER_PAGE = 9;
/** One page of rows, filtered and sorted in the client so the derived
 *  specialty/city counts describe what is actually on screen. */
const FETCH_LIMIT = 60;

// ─── API shape ────────────────────────────────────────────────────────────────
// Declared locally and mirroring the select string in
// src/app/api/v1/lawyers/route.ts:32 — NOT `PublicLawyerProfile`, which belongs
// to the /[id] route and differs: the list projection returns `user_type` and
// does not return `created_at` or `country_code`. Importing it would invite a
// «عضو منذ undefined».

interface LawyerProfileRow {
  user_id: string;
  specialties: string[] | null;
  years_experience: number | null;
  hourly_rate: number | null;
  bio_ar: string | null;
  bio_en: string | null;
  is_accepting_clients: boolean | null;
  bar_association?: string | null;
  /** Projected by the route and stripped unless `show_contact`. Regulated
   *  credential data — never rendered on a directory card. */
  license_number?: string | null;
}

interface LawyerListRow {
  id: string;
  display_name: string | null;
  display_name_en: string | null;
  avatar_url: string | null;
  city: string | null;
  user_type: string | null;
  /** PostgREST returns an embedded to-one as an object OR as a single-element
   *  array depending on how it resolves the relationship. The route normalises
   *  it for its own `show_contact` strip but forwards the row as-is, so it can
   *  arrive either way — see `normalizeRow`. */
  lawyer_profiles: LawyerProfileRow | LawyerProfileRow[] | null;
  /** Phase 7 (item 192) — attached by the route from a SEPARATE query on the
   *  `lawyer_review_stats` view (no PostgREST-embeddable FK from `profiles`,
   *  so it never rides the `lawyer_profiles` embed above). `null` means either
   *  "no reviews yet" or "the stats query failed" — the route does not tell
   *  the two apart per row, so this page cannot either; it renders both as
   *  "no rating shown", never as a fabricated zero. */
  reviewStats: { reviewCount: number; avgRating: number | null; lastReviewAt: string | null } | null;
}

interface LawyerListResponse {
  lawyers: LawyerListRow[];
  total: number | null;
}

// ─── View model ───────────────────────────────────────────────────────────────
// Every field is nullable/empty-able because every column behind it is.

interface DirectoryLawyer {
  id: string;
  nameAr: string | null;
  nameEn: string | null;
  avatar: string | null;
  city: string | null;
  specialties: string[];
  /** 0 means "not stated", never "no experience" — it is omitted, not shown. */
  years: number;
  rate: number | null;
  bioAr: string | null;
  bioEn: string | null;
  /** `null` means the lawyer never answered; the badge is omitted entirely. */
  accepting: boolean | null;
  bar: string | null;
  /** Phase 7 (item 192). `null` = no reviews yet (or the stats read failed) —
   *  the card renders no stars for either case, and `byRating` below sends
   *  it to the end of the "highest rated" sort, same as an unstated
   *  `years`/`rate` under the other orderings. */
  avgRating: number | null;
  /** 0 when `avgRating` is `null`; never rendered on its own without a rating
   *  beside it, so a lawyer with zero reviews never prints «٠ تقييمات». */
  reviewCount: number;
}

/** A localised row, resolved once per locale change. */
interface ResolvedLawyer extends DirectoryLawyer {
  name: string;
  initials: string;
  bio: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Empty strings are as absent as nulls — a DB default of '' is not content. */
function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function initialsOf(name: string): string {
  const words = name
    .replace(/^(الأستاذ|الأستاذة|المحامي|المحامية)\s+/u, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2);
  return words[0][0] + words[1][0];
}

/** «سنة واحدة» / «سنتان» / «٣ سنوات» — never «1 سنوات». Mirrors the helper in
 *  src/app/lawyers/[slug]/page.tsx so the card and the profile agree. */
function arabicYears(n: number): string {
  if (n === 1) return "سنة خبرة";
  if (n === 2) return "سنتان خبرة";
  if (n <= 10) return `${n} سنوات خبرة`;
  return `${n} سنة خبرة`;
}

/** «محامٍ واحد موثّق» / «محاميان موثّقان» / «٥ محامين موثّقين». */
function arabicLawyerCount(n: number): string {
  if (n === 1) return "محامٍ واحد موثّق";
  if (n === 2) return "محاميان موثّقان";
  if (n <= 10) return `${n} محامين موثّقين`;
  return `${n} محامياً موثّقاً`;
}

/** «تقييم واحد» / «تقييمان» / «٣ تقييمات» / «١١ تقييماً» — same five-shape
 *  agreement as `arabicYears`/`arabicLawyerCount` above, for the review count
 *  beside a card's star rating. */
function arabicReviewCount(n: number): string {
  if (n === 1) return "تقييم واحد";
  if (n === 2) return "تقييمان";
  if (n <= 10) return `${n} تقييمات`;
  return `${n} تقييماً`;
}

function normalizeRow(row: LawyerListRow): DirectoryLawyer {
  const embedded = row.lawyer_profiles;
  const lp = (Array.isArray(embedded) ? embedded[0] : embedded) ?? null;
  const years = typeof lp?.years_experience === "number" ? lp.years_experience : 0;
  const rate = typeof lp?.hourly_rate === "number" && lp.hourly_rate > 0 ? lp.hourly_rate : null;

  return {
    id: row.id,
    nameAr: text(row.display_name),
    nameEn: text(row.display_name_en),
    avatar: text(row.avatar_url),
    city: text(row.city),
    specialties: (lp?.specialties ?? [])
      .map(text)
      .filter((s): s is string => Boolean(s)),
    years: years > 0 ? years : 0,
    rate,
    bioAr: text(lp?.bio_ar),
    bioEn: text(lp?.bio_en),
    accepting:
      lp?.is_accepting_clients === true ? true
      : lp?.is_accepting_clients === false ? false
      : null,
    bar: text(lp?.bar_association),
    avgRating: row.reviewStats?.avgRating ?? null,
    reviewCount: row.reviewStats?.reviewCount ?? 0,
  };
}

/** Cosmetic only. Free-text specialties will mostly miss this map, which is why
 *  it has a default rather than a `Record<Specialty, string>` union — the old
 *  `Specialty` type existed to constrain the mock data and constrains nothing
 *  real. */
const SPECIALTY_HUE: Record<string, string> = {
  عمالي: "#0B3D2E",
  مدني: "#1d5c45",
  تجاري: "#a07828",
  جنائي: "#7a1515",
  أسرة: "#5c1a6b",
  إداري: "#1a3a6b",
};
const hueFor = (specialty: string | undefined) =>
  (specialty && SPECIALTY_HUE[specialty]) || GREEN;

const ALL = "__all__";
type SortOption = "experience" | "rating" | "price_asc" | "price_desc" | "name";

/** Unpriced lawyers sort LAST in both directions. Treating a missing
 *  `hourly_rate` as 0 would rank them "cheapest" — the same lie as «من ٠ ر.س». */
function byRate(a: ResolvedLawyer, b: ResolvedLawyer, ascending: boolean): number {
  if (a.rate === null && b.rate === null) return 0;
  if (a.rate === null) return 1;
  if (b.rate === null) return -1;
  return ascending ? a.rate - b.rate : b.rate - a.rate;
}

/** «الأعلى تقييماً» — item 40 (Phase 7 half). A lawyer with no reviews sorts
 *  LAST, not lowest-rated: `avgRating: null` is "unrated", not "rated zero",
 *  same reasoning as `byRate` above. Two lawyers with the same average break
 *  the tie on `reviewCount` — a 5.0 from ten reviews outranks a 5.0 from one. */
function byRating(a: ResolvedLawyer, b: ResolvedLawyer): number {
  if (a.avgRating === null && b.avgRating === null) return 0;
  if (a.avgRating === null) return 1;
  if (b.avgRating === null) return -1;
  return b.avgRating - a.avgRating || b.reviewCount - a.reviewCount;
}

// ─── Load state ───────────────────────────────────────────────────────────────

type LoadState =
  | { phase: "loading" }
  /** `total` is the route's `{ count: "exact" }` — the size of the whole
   *  directory, which can exceed the FETCH_LIMIT page held in `rows`. */
  | { phase: "ready"; rows: DirectoryLawyer[]; total: number | null }
  | { phase: "error" };

type Settled = { key: number; state: Exclude<LoadState, { phase: "loading" }> };

/** A single frozen empty array, so the "no rows" case keeps a stable identity
 *  across renders and the derived memos below do not re-run for nothing. */
const NO_ROWS: DirectoryLawyer[] = [];

// ─── Spotlight Card (cursor-tracking border glow) ─────────────────────────────

function SpotlightCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  }, [mouseX, mouseY]);

  const background = useTransform(
    [mouseX, mouseY],
    ([x, y]) =>
      `radial-gradient(280px circle at ${x}px ${y}px, rgba(11,61,46,0.10), transparent 65%)`
  );

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      className={`relative overflow-hidden ${className}`}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[inherit] z-10 transition-opacity duration-300"
        style={{ background }}
      />
      {children}
    </motion.div>
  );
}

// ─── Lawyer Card ──────────────────────────────────────────────────────────────

/**
 * Five stars filled up to `Math.round(rating)` — the same visual language as
 * the profile page's `ratingStars` (src/app/lawyers/[slug]/page.tsx), sized
 * down for this card. Declared locally rather than imported: that file is a
 * page component, not a shared module, and the file's header above already
 * explains why this page keeps its own small presentational helpers.
 */
function ratingStars(rating: number, isDark: boolean, size = 11) {
  const filled = Math.round(rating);
  return Array.from({ length: 5 }).map((_, i) => (
    <Star
      key={i}
      size={size}
      weight={i < filled ? "fill" : "regular"}
      color={i < filled ? GOLD : isDark ? "#3a4453" : "#d1d5db"}
    />
  ));
}

function LawyerCard({ lawyer, delay, isRTL, isDark }: {
  lawyer: ResolvedLawyer; delay: number; isRTL: boolean; isDark: boolean;
}) {
  const [avatarBroken, setAvatarBroken] = useState(false);
  const hue = hueFor(lawyer.specialties[0]);

  // The API only ever returns verified + marketplace_visible rows, so the name
  // fallback still describes a real, verified account.
  const heading = lawyer.name || (isRTL ? "محامٍ موثّق" : "Verified lawyer");
  const profileHref = `/lawyers/${encodeURIComponent(lawyer.id)}`;

  // True when the lawyer has published nothing beyond the identity the platform
  // verified. The common case in production, so it gets a line of its own
  // instead of a card full of blank rows.
  const isSparse =
    !lawyer.bio && lawyer.specialties.length === 0 && lawyer.years === 0 &&
    !lawyer.city && !lawyer.bar && lawyer.rate === null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 120, damping: 18 }}
    >
      <SpotlightCard
        className={`group rounded-2xl border flex flex-col h-full transition-all duration-300 ${
          isDark
            ? "bg-zinc-900 border-white/[0.07] hover:border-white/20"
            : "bg-white border-zinc-100/80 hover:border-zinc-300/60 shadow-[0_2px_16px_-4px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_32px_-8px_rgba(11,61,46,0.12)]"
        }`}
      >
        <div className="p-5 flex-1 relative z-20 flex flex-col">
          {/* Avatar + name row */}
          <div className="flex items-start gap-3.5 mb-4">
            {/* A plain <img>: avatar_url is user-supplied and next.config only
                allowlists *.supabase.co, so next/image would throw on an
                unlisted host. Falls back to initials, then to an icon. */}
            {lawyer.avatar && !avatarBroken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lawyer.avatar}
                alt={heading}
                loading="lazy"
                onError={() => setAvatarBroken(true)}
                className="w-12 h-12 rounded-xl object-cover flex-shrink-0 shadow-md border border-[#C8A762]/25"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-base flex-shrink-0 shadow-md"
                style={{ backgroundColor: hue }}
              >
                {lawyer.initials || <UserCircle size={24} weight="duotone" />}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className={`font-bold text-sm leading-tight ${isDark ? "text-white" : "text-zinc-800"}`}>
                  {heading}
                </p>
                {/* Real: the route filters verification_status = 'verified'. */}
                <SealCheck size={14} weight="fill" style={{ color: GOLD }} />
              </div>

              {/* Item 40 (Phase 7 half): only when `avgRating` is set — no
                  reviews means no stars, never a rendered zero. */}
              {lawyer.avgRating !== null && (
                <div className="flex items-center gap-1 mt-1">
                  <div className="flex">{ratingStars(lawyer.avgRating, isDark)}</div>
                  <span className={`text-[11px] font-bold tabular-nums ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                    {lawyer.avgRating.toLocaleString(isRTL ? "ar-SA-u-nu-latn" : "en-US", { maximumFractionDigits: 1 })}
                  </span>
                  <span className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    ({isRTL
                      ? arabicReviewCount(lawyer.reviewCount)
                      : `${lawyer.reviewCount} ${lawyer.reviewCount === 1 ? "review" : "reviews"}`})
                  </span>
                </div>
              )}

              {lawyer.specialties.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {lawyer.specialties.slice(0, 2).map((s) => {
                    const c = hueFor(s);
                    return (
                      <span
                        key={s}
                        className="inline-block text-[11px] px-2 py-0.5 rounded-full font-semibold"
                        style={
                          isDark
                            ? { backgroundColor: `${c}45`, color: GOLD }
                            : { backgroundColor: `${c}18`, color: c }
                        }
                      >
                        {s}
                      </span>
                    );
                  })}
                  {lawyer.specialties.length > 2 && (
                    <span className={`text-[11px] px-1.5 py-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                      +{lawyer.specialties.length - 2}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Omitted entirely when the lawyer never answered — an unanswered
                question is not a «غير متاح». */}
            {lawyer.accepting === true ? (
              <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex-shrink-0 mt-0.5">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                {isRTL ? "يستقبل موكلين" : "Accepting"}
              </span>
            ) : lawyer.accepting === false ? (
              <span className={`text-[10px] flex-shrink-0 mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                {isRTL ? "لا يستقبل حالياً" : "Not accepting"}
              </span>
            ) : null}
          </div>

          {/* Bio — the only free text with a column behind it (bio_ar/bio_en). */}
          {lawyer.bio && (
            <p className={`text-[12px] leading-relaxed mb-4 line-clamp-2 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              {lawyer.bio}
            </p>
          )}

          {/* Facts. Each chip renders only when its column has a value, so a
              sparse profile shows fewer chips rather than «0 سنوات». */}
          {(lawyer.years > 0 || lawyer.city || lawyer.bar) && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {lawyer.years > 0 && (
                <span className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-semibold ${
                  isDark ? "bg-white/[0.05] text-zinc-300" : "bg-zinc-50 text-zinc-600 border border-zinc-100"
                }`}>
                  <Briefcase size={10} weight="fill" style={{ color: GOLD }} />
                  {isRTL ? arabicYears(lawyer.years) : `${lawyer.years} yrs`}
                </span>
              )}
              {lawyer.city && (
                <span className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-semibold ${
                  isDark ? "bg-white/[0.05] text-zinc-300" : "bg-zinc-50 text-zinc-600 border border-zinc-100"
                }`}>
                  <MapPin size={10} weight="fill" style={{ color: GOLD }} />
                  {lawyer.city}
                </span>
              )}
              {lawyer.bar && (
                <span className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-semibold ${
                  isDark ? "bg-white/[0.05] text-zinc-300" : "bg-zinc-50 text-zinc-600 border border-zinc-100"
                }`}>
                  <Scales size={10} weight="fill" style={{ color: GOLD }} />
                  {lawyer.bar}
                </span>
              )}
            </div>
          )}

          {isSparse && (
            <p className={`text-[11px] leading-relaxed mb-4 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              {isRTL
                ? "لم يُضف هذا المحامي تفاصيل ملفه بعد."
                : "This lawyer has not added profile details yet."}
            </p>
          )}

          {/* Indicative fee. Omitted when `hourly_rate` is null — never «من ٠ ر.س».
              There is no payment gateway on this platform, so the caption says
              «تقديري» and no control here implies a checkout. */}
          <div className="mt-auto pt-1">
            {lawyer.rate !== null ? (
              <div className={`flex items-center justify-between rounded-xl px-3 py-2 ${
                isDark ? "bg-white/[0.04]" : "bg-zinc-50"
              }`}>
                <span className={`flex items-center gap-1.5 text-[10px] font-medium ${isDark ? "text-zinc-400" : "text-zinc-400"}`}>
                  <Coins size={12} weight="duotone" style={{ color: GOLD }} />
                  {isRTL ? "أتعاب تقديرية" : "Indicative fee"}
                </span>
                <span className="text-[13px] font-black tabular-nums" style={{ color: GOLD }}>
                  {lawyer.rate.toLocaleString(isRTL ? "ar-SA-u-nu-latn" : "en-US")}
                  <span className="text-[10px] font-bold"> {isRTL ? "ر.س / الساعة" : "SAR / hr"}</span>
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Action row. Both destinations are real routes: the profile, and the
            consultation intake that pre-selects this lawyer from `?lawyer=`.
            The old second button pointed at `/lawyers/{slug}#consult` — an
            anchor into an invented price list that no longer exists. */}
        <div className={`grid ${lawyer.accepting === true ? "grid-cols-2" : "grid-cols-1"} border-t relative z-20 ${
          isDark ? "border-white/[0.06]" : "border-zinc-100"
        }`}>
          <Link
            href={profileHref}
            className={`py-3 text-center text-[12px] font-semibold transition-colors ${
              lawyer.accepting === true ? "border-e" : ""
            } ${
              isDark
                ? "border-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                : "border-zinc-100 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50"
            }`}
          >
            {isRTL ? "عرض الملف" : "View profile"}
          </Link>
          {lawyer.accepting === true && (
            <Link
              href={`/dashboard/client/consultation/new?lawyer=${encodeURIComponent(lawyer.id)}`}
              className="py-3 text-center text-[12px] font-bold text-white bg-[#0B3D2E] hover:bg-[#0f4f39] transition-colors"
            >
              {isRTL ? "اطلب استشارة" : "Request consultation"}
            </Link>
          )}
        </div>
      </SpotlightCard>
    </motion.div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CardSkeleton({ isDark }: { isDark: boolean }) {
  const shimmer = isDark ? "bg-white/[0.06]" : "bg-zinc-100";
  return (
    <div className={`rounded-2xl border p-5 ${
      isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-zinc-100/80 shadow-[0_2px_16px_-4px_rgba(0,0,0,0.06)]"
    }`}>
      <div className="animate-pulse">
        <div className="flex items-start gap-3.5 mb-4">
          <div className={`w-12 h-12 rounded-xl flex-shrink-0 ${shimmer}`} />
          <div className="flex-1 space-y-2 pt-1">
            <div className={`h-3.5 w-2/3 rounded ${shimmer}`} />
            <div className={`h-5 w-20 rounded-full ${shimmer}`} />
          </div>
        </div>
        <div className="space-y-2 mb-4">
          <div className={`h-3 w-full rounded ${shimmer}`} />
          <div className={`h-3 w-4/5 rounded ${shimmer}`} />
        </div>
        <div className="flex gap-1.5 mb-4">
          <div className={`h-6 w-20 rounded-xl ${shimmer}`} />
          <div className={`h-6 w-16 rounded-xl ${shimmer}`} />
        </div>
        <div className={`h-9 w-full rounded-xl ${shimmer}`} />
      </div>
    </div>
  );
}

// ─── States ───────────────────────────────────────────────────────────────────

/**
 * Nothing published yet. This is the CORRECT state of the directory today —
 * every production lawyer row is still `pending` and not marketplace-visible —
 * so it is built as a finished panel with a real onward route, not as a stub.
 */
function NothingPublished({ isDark, isRTL }: { isDark: boolean; isRTL: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 120, damping: 18 }}
      className={`rounded-3xl border overflow-hidden ${
        isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-zinc-100 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.06)]"
      }`}
    >
      <div className="h-1 w-full bg-gradient-to-r from-[#0B3D2E] via-[#C8A762] to-[#0B3D2E]" />
      <div className="flex flex-col items-center text-center px-6 py-16 gap-6">
        <div className="relative">
          <div className={`w-24 h-24 rounded-[1.75rem] flex items-center justify-center border ${
            isDark
              ? "bg-gradient-to-br from-[#0B3D2E]/30 via-zinc-900 to-[#C8A762]/10 border-white/[0.07]"
              : "bg-gradient-to-br from-[#0B3D2E]/5 via-white to-[#C8A762]/5 border-zinc-200/80 shadow-[0_12px_32px_-8px_rgba(11,61,46,0.08)]"
          }`}>
            <Scales size={40} weight="duotone" style={{ color: isDark ? GOLD : `${GREEN}4d` }} />
          </div>
          <div className={`absolute -bottom-1 ${isRTL ? "-left-1" : "-right-1"} w-8 h-8 rounded-full flex items-center justify-center border shadow-sm ${
            isDark ? "bg-zinc-900 border-white/10" : "bg-white border-zinc-200"
          }`}>
            <SealCheck size={16} weight="fill" style={{ color: GOLD }} />
          </div>
        </div>

        <div className="max-w-[380px] space-y-2">
          <h2 className={`font-black text-xl leading-tight ${isDark ? "text-white" : "text-zinc-800"}`}>
            {isRTL ? "لا يوجد محامون منشورون حالياً" : "No lawyers are listed yet"}
          </h2>
          <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            {isRTL
              ? "يظهر المحامي في هذا الدليل بعد توثيق ملفه وموافقته على النشر — وسيُضاف هنا فور اكتمال ذلك."
              : "A lawyer appears in this directory once their profile is verified and they have opted in to being listed."}
          </p>
        </div>

        <div className={`flex items-start gap-3 px-5 py-3.5 rounded-2xl border max-w-md text-start ${
          isDark ? "bg-white/[0.03] border-white/[0.07]" : "bg-[#0B3D2E]/[0.03] border-[#0B3D2E]/10"
        }`}>
          <Scales size={18} weight="duotone" className="flex-shrink-0 mt-0.5" style={{ color: GOLD }} />
          <p className={`text-[11.5px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            {isRTL
              ? "تحتاج مستشاراً قانونياً الآن؟ يمكنك تقديم طلبك مباشرة عبر خدمات نزامي القانونية."
              : "Need legal help now? You can submit your request directly through Nzamy's legal services."}
          </p>
        </div>

        <Link
          href="/services/lawyers"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0B3D2E] text-white text-sm font-semibold hover:bg-[#0a3328] transition"
        >
          {isRTL ? "اطلب استشارة قانونية" : "Request legal help"}
          <ArrowLeft size={15} className={isRTL ? "" : "rotate-180"} />
        </Link>
      </div>
    </motion.div>
  );
}

function LoadFailed({ isDark, isRTL, onRetry }: { isDark: boolean; isRTL: boolean; onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-3xl border px-6 py-16 text-center ${
        isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-zinc-100 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.06)]"
      }`}
    >
      <div
        className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
        style={{ backgroundColor: isDark ? "#f59e0b20" : "#fef3c7" }}
      >
        <WarningCircle size={30} color="#d97706" weight="duotone" />
      </div>
      <h2 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
        {isRTL ? "تعذّر تحميل دليل المحامين" : "Could not load the directory"}
      </h2>
      <p className={`text-sm max-w-md mx-auto leading-relaxed mb-7 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
        {isRTL
          ? "حدث خلل أثناء الاتصال بالخادم. تحقّق من اتصالك ثم أعد المحاولة."
          : "Something went wrong reaching the server. Check your connection and try again."}
      </p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0B3D2E] text-white text-sm font-semibold hover:bg-[#0a3328] transition"
      >
        <ArrowClockwise size={16} weight="bold" />
        {isRTL ? "إعادة المحاولة" : "Try again"}
      </button>
    </motion.div>
  );
}

/** Rows exist, but the current filters match none of them. */
function NoMatches({ isDark, isRTL, onClear }: { isDark: boolean; isRTL: boolean; onClear: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="col-span-full flex flex-col items-center justify-center py-24 text-center gap-4"
    >
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
        <MagnifyingGlass size={28} className={isDark ? "text-zinc-500" : "text-zinc-300"} weight="duotone" />
      </div>
      <div>
        <p className={`text-[15px] font-bold mb-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
          {isRTL ? "لا توجد نتائج مطابقة" : "No matching results"}
        </p>
        <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          {isRTL ? "جرّب تغيير فلاتر البحث" : "Try adjusting your filters"}
        </p>
      </div>
      <button
        onClick={onClear}
        className={`text-[12px] font-semibold px-5 py-2.5 rounded-xl border transition ${
          isDark
            ? "border-white/[0.12] text-zinc-300 hover:bg-white/[0.05]"
            : "border-[#0B3D2E]/20 text-[#0B3D2E] hover:bg-[#0B3D2E]/5"
        }`}
      >
        {isRTL ? "مسح الفلاتر" : "Clear filters"}
      </button>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BrowseLawyersPage() {
  const { isRTL, isDark } = useTheme();

  const [settled, setSettled] = useState<Settled | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [search, setSearch] = useState("");
  const [specialty, setSpecialty] = useState<string>(ALL);
  const [city, setCity] = useState<string>(ALL);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sort, setSort] = useState<SortOption>("experience");
  const [page, setPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // The settled result is stored WITH the attempt it answers, so pressing retry
  // invalidates it and the derived state falls back to "loading" — no
  // synchronous setState inside the effect.
  const state: LoadState = settled?.key === attempt ? settled.state : { phase: "loading" };

  useEffect(() => {
    let cancelled = false;
    apiGet<LawyerListResponse>("/api/v1/lawyers", { limit: FETCH_LIMIT })
      .then((response) => {
        if (cancelled) return;
        const rows = (response?.lawyers ?? []).map(normalizeRow);
        const total = typeof response?.total === "number" ? response.total : null;
        setSettled({ key: attempt, state: { phase: "ready", rows, total } });
      })
      .catch((error) => {
        console.warn("[Nzamy] Failed to load the lawyer directory:", error);
        if (cancelled) return;
        setSettled({ key: attempt, state: { phase: "error" } });
      });
    return () => { cancelled = true; };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Read off `settled` rather than off `state`, whose "loading" branch is a
  // fresh object literal every render — that identity churn would invalidate
  // every memo below on each keystroke.
  const ready = settled?.key === attempt && settled.state.phase === "ready" ? settled.state : null;
  const rows = ready?.rows ?? NO_ROWS;

  // The hero quotes the API's exact count, not the fetched page. Above
  // FETCH_LIMIT those differ, and saying «٦٠ محامياً» about a directory of 120
  // would be its own small untruth — so the shortfall is stated instead.
  const directoryTotal = typeof ready?.total === "number"
    ? Math.max(ready.total, rows.length)
    : rows.length;
  const truncated = rows.length < directoryTotal;

  // Locale resolution happens here, once, so the filter and the card agree on
  // which of the two name columns is being searched and displayed.
  const resolved = useMemo<ResolvedLawyer[]>(() => rows.map((r) => {
    const name = (isRTL ? r.nameAr ?? r.nameEn : r.nameEn ?? r.nameAr) ?? "";
    return {
      ...r,
      name,
      initials: initialsOf(name),
      bio: isRTL ? r.bioAr ?? r.bioEn : r.bioEn ?? r.bioAr,
    };
  }), [rows, isRTL]);

  // ── Facets derived from what actually loaded, never hardcoded ──
  const specialtyFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of resolved) {
      for (const s of new Set(l.specialties)) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ar"))
      .map(([label, count]) => ({ label, count }));
  }, [resolved]);

  const cityFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of resolved) if (l.city) counts.set(l.city, (counts.get(l.city) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ar"))
      .map(([label, count]) => ({ label, count }));
  }, [resolved]);

  // Each control is rendered only when the loaded data can distinguish
  // something with it. A city filter over a single city, or an availability
  // toggle when nobody is accepting, is a control that does nothing.
  const showSpecialtyFilter = specialtyFacets.length > 0;
  const showCityFilter = cityFacets.length > 1;
  const showAvailableFilter = resolved.some((l) => l.accepting === true);
  const hasAnyFilter = showSpecialtyFilter || showCityFilter || showAvailableFilter;
  const hasRates = resolved.some((l) => l.rate !== null);
  // Item 40 (Phase 7 half): a rating sort is offered only when at least one
  // loaded lawyer actually has one — same rule as `hasRates` just above.
  const hasRatings = resolved.some((l) => l.avgRating !== null);

  // A fee or rating sort is offered only when at least one lawyer has the
  // data behind it. If a retry returns rows without it under a selected
  // sort, fall back rather than leave a <select> displaying an option it no
  // longer contains.
  const effectiveSort: SortOption =
    (sort === "price_asc" || sort === "price_desc") && !hasRates ? "experience"
    : sort === "rating" && !hasRatings ? "experience"
    : sort;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = resolved.filter((l) => {
      const matchSearch =
        !q ||
        l.name.toLowerCase().includes(q) ||
        (l.nameAr?.toLowerCase().includes(q) ?? false) ||
        (l.nameEn?.toLowerCase().includes(q) ?? false) ||
        l.specialties.some((s) => s.toLowerCase().includes(q)) ||
        (l.city?.toLowerCase().includes(q) ?? false);
      const matchSpecialty = specialty === ALL || l.specialties.includes(specialty);
      const matchCity = city === ALL || l.city === city;
      const matchAvailable = !onlyAvailable || l.accepting === true;
      return matchSearch && matchSpecialty && matchCity && matchAvailable;
    });

    switch (effectiveSort) {
      case "rating":     return [...result].sort(byRating);
      case "price_asc":  return [...result].sort((a, b) => byRate(a, b, true));
      case "price_desc": return [...result].sort((a, b) => byRate(a, b, false));
      case "name":       return [...result].sort((a, b) => a.name.localeCompare(b.name, isRTL ? "ar" : "en"));
      case "experience":
      default:           return [...result].sort((a, b) => b.years - a.years);
    }
  }, [resolved, search, specialty, city, onlyAvailable, effectiveSort, isRTL]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const activeFiltersCount = [
    specialty !== ALL,
    city !== ALL,
    onlyAvailable,
  ].filter(Boolean).length;

  const resetFilters = useCallback(() => {
    setSpecialty(ALL);
    setCity(ALL);
    setOnlyAvailable(false);
    setSearch("");
    setPage(1);
  }, []);

  const sortOptions: { id: SortOption; label: string }[] = [
    { id: "experience", label: isRTL ? "الأكثر خبرة" : "Most experienced" },
    ...(hasRatings
      ? ([{ id: "rating", label: isRTL ? "الأعلى تقييماً" : "Highest rated" }] as { id: SortOption; label: string }[])
      : []),
    ...(hasRates
      ? ([
          { id: "price_asc",  label: isRTL ? "الأتعاب: الأقل" : "Fee: lowest" },
          { id: "price_desc", label: isRTL ? "الأتعاب: الأعلى" : "Fee: highest" },
        ] as { id: SortOption; label: string }[])
      : []),
    { id: "name", label: isRTL ? "الاسم" : "Name" },
  ];

  const showDirectoryUI = state.phase === "ready" && rows.length > 0;

  // ── Filter panel, shared by the desktop sidebar and the mobile drawer ──
  const filterGroups = (onPick?: () => void) => (
    <>
      {showSpecialtyFilter && (
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            {isRTL ? "التخصص" : "Specialty"}
          </p>
          <div className="space-y-1">
            {[{ label: ALL, count: resolved.length }, ...specialtyFacets].map((s) => (
              <button
                key={s.label}
                onClick={() => { setSpecialty(s.label); setPage(1); onPick?.(); }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all ${
                  specialty === s.label
                    ? "bg-[#0B3D2E] text-white"
                    : isDark
                      ? "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                }`}
              >
                <span className="truncate text-start">
                  {s.label === ALL ? (isRTL ? "كل التخصصات" : "All specialties") : s.label}
                </span>
                <span className={`text-[10px] tabular-nums ${
                  specialty === s.label ? "text-white/60" : isDark ? "text-zinc-500" : "text-zinc-400"
                }`}>
                  {s.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showCityFilter && (
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            {isRTL ? "المدينة" : "City"}
          </p>
          <div className="space-y-1">
            {[{ label: ALL, count: resolved.length }, ...cityFacets].map((c) => (
              <button
                key={c.label}
                onClick={() => { setCity(c.label); setPage(1); onPick?.(); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all ${
                  city === c.label
                    ? "bg-[#0B3D2E] text-white"
                    : isDark
                      ? "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                }`}
              >
                {city === c.label
                  ? <CheckCircle size={13} weight="fill" className="flex-shrink-0" />
                  : <Circle size={13} className={`flex-shrink-0 ${isDark ? "text-zinc-600" : "text-zinc-300"}`} />}
                <span className="truncate text-start">
                  {c.label === ALL ? (isRTL ? "كل المدن" : "All cities") : c.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showAvailableFilter && (
        <div>
          <button
            onClick={() => { setOnlyAvailable((v) => !v); setPage(1); onPick?.(); }}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-[12px] font-semibold transition-all ${
              onlyAvailable
                ? "bg-emerald-600 border-emerald-600 text-white"
                : isDark
                  ? "border-white/[0.07] text-zinc-400 hover:border-white/20 hover:text-white"
                  : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
            }`}
          >
            <span className="text-start">{isRTL ? "يستقبل موكلين فقط" : "Accepting clients only"}</span>
            <span className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
              onlyAvailable ? "border-white bg-white" : isDark ? "border-zinc-600" : "border-zinc-300"
            }`}>
              {onlyAvailable && <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />}
            </span>
          </button>
        </div>
      )}
    </>
  );

  return (
    <div
      className={`min-h-screen flex flex-col ${isDark ? "bg-[#0a0d10] text-white" : "bg-[#f7f8fa] text-zinc-900"}`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <Navbar />

      {/* ── Hero Strip ── */}
      <div className="relative pt-28 pb-10 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle at 20% 50%, #0B3D2E 0%, transparent 50%), radial-gradient(circle at 80% 20%, #C8A762 0%, transparent 40%)",
          }}
        />
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 relative">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-6 rounded-full bg-[#C8A762]" />
              {/* «موثّقون», not «مرخصون ومعتمدون من وزارة العدل»:
                  `verification_status` is Nzamy's own check on the account, and
                  the platform holds no Ministry of Justice accreditation record
                  to stand behind that claim. */}
              <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                {isRTL ? "محامون موثّقون على المنصة" : "Verified Lawyers"}
              </p>
            </div>
            <h1 className={`text-3xl md:text-4xl font-black tracking-tight leading-tight mb-3 ${isDark ? "text-white" : "text-zinc-900"}`}>
              {isRTL ? "ابحث عن المحامي المناسب" : "Find the Right Lawyer"}
            </h1>
            {/* The count comes from the loaded rows, and the sentence changes
                shape when there are none — no «+0 محامٍ». */}
            <p className={`text-sm leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              {showDirectoryUI
                ? isRTL
                  ? `${arabicLawyerCount(directoryTotal)} على منصة نزامي — قارن التخصصات والخبرة وتصفّح الملفات.`
                  : `${directoryTotal} verified ${directoryTotal === 1 ? "lawyer" : "lawyers"} on Nzamy — compare specialties and experience, and browse profiles.`
                : isRTL
                  ? "دليل المحامين الموثّقين على منصة نزامي — قارن التخصصات والخبرة وتصفّح الملفات."
                  : "The directory of verified lawyers on Nzamy — compare specialties and experience, and browse profiles."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-[1400px] mx-auto w-full px-5 md:px-8 pb-16">
        {/* ── Could not ask the server ── */}
        {state.phase === "error" && <LoadFailed isDark={isDark} isRTL={isRTL} onRetry={retry} />}

        {/* ── Nothing published: no filters, no search, no sort. A filter panel
               of all-zero counts over an empty directory reads as broken. ── */}
        {state.phase === "ready" && rows.length === 0 && (
          <NothingPublished isDark={isDark} isRTL={isRTL} />
        )}

        {/* ── Loading ── */}
        {state.phase === "loading" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} isDark={isDark} />)}
            </div>
            <span className="sr-only">{isRTL ? "جارٍ تحميل دليل المحامين…" : "Loading the lawyer directory…"}</span>
          </>
        )}

        {/* ── The directory proper ── */}
        {showDirectoryUI && (
          <div className="flex gap-7 items-start">
            {/* ── Sidebar Filters (desktop) ── */}
            {hasAnyFilter && (
              <aside className="hidden lg:block w-64 flex-shrink-0 sticky top-24">
                <div className={`rounded-2xl border p-5 space-y-6 ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-zinc-100 shadow-sm"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sliders size={15} className={isDark ? "text-zinc-400" : "text-zinc-500"} weight="duotone" />
                      <span className={`text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>
                        {isRTL ? "الفلاتر" : "Filters"}
                      </span>
                      {activeFiltersCount > 0 && (
                        <span className="w-5 h-5 flex items-center justify-center rounded-full bg-[#0B3D2E] text-white text-[9px] font-black">
                          {activeFiltersCount}
                        </span>
                      )}
                    </div>
                    {activeFiltersCount > 0 && (
                      <button
                        onClick={resetFilters}
                        className={`text-[10px] font-semibold transition-colors ${
                          isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"
                        }`}
                      >
                        {isRTL ? "إعادة ضبط" : "Reset"}
                      </button>
                    )}
                  </div>
                  {filterGroups()}
                </div>
              </aside>
            )}

            {/* ── Main Results ── */}
            <div className="flex-1 min-w-0">
              {/* Search + sort bar */}
              <div className="flex items-center gap-3 mb-5">
                <div className={`flex-1 flex items-center gap-2.5 rounded-xl border px-4 py-2.5 ${
                  isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-zinc-200 shadow-sm"
                }`}>
                  <MagnifyingGlass size={15} weight="duotone" style={{ color: GOLD, flexShrink: 0 }} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    placeholder={isRTL ? "ابحث باسم المحامي أو التخصص..." : "Search by name or specialty..."}
                    className={`flex-1 bg-transparent text-[13px] outline-none ${
                      isDark ? "text-white placeholder-zinc-600" : "text-zinc-800 placeholder-zinc-400"
                    }`}
                  />
                  {search && (
                    <button onClick={() => { setSearch(""); setPage(1); }} aria-label={isRTL ? "مسح البحث" : "Clear search"}>
                      <X size={14} className={isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"} />
                    </button>
                  )}
                </div>

                {/* Sort. «الأعلى تقييماً» reads Phase 7's `lawyer_review_stats`
                    view (avgRating, reviewCount as the tiebreak) via `byRating`
                    above, and — like the fee options beside it — is offered
                    only when at least one loaded lawyer actually has one. */}
                <select
                  value={effectiveSort}
                  onChange={(e) => { setSort(e.target.value as SortOption); setPage(1); }}
                  aria-label={isRTL ? "ترتيب النتائج" : "Sort results"}
                  className={`rounded-xl border px-3 py-2.5 text-[12px] font-medium outline-none transition-colors ${
                    isDark ? "bg-zinc-900 border-white/[0.07] text-zinc-300" : "bg-white border-zinc-200 text-zinc-700 shadow-sm"
                  }`}
                >
                  {sortOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>

                {/* Mobile filter toggle — only when there is a filter behind it */}
                {hasAnyFilter && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className={`lg:hidden relative flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-[12px] font-semibold ${
                      isDark ? "bg-zinc-900 border-white/[0.07] text-zinc-300" : "bg-white border-zinc-200 text-zinc-700 shadow-sm"
                    }`}
                  >
                    <Funnel size={14} />
                    {isRTL ? "فلتر" : "Filter"}
                    {activeFiltersCount > 0 && (
                      <span className="absolute -top-1.5 -end-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-[#0B3D2E] text-white text-[9px] font-black">
                        {activeFiltersCount}
                      </span>
                    )}
                  </button>
                )}
              </div>

              {/* Results meta */}
              <div className="flex items-center justify-between mb-4">
                <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  {isRTL
                    ? `${filtered.length} نتيجة − عرض ${paginated.length}`
                    : `${filtered.length} results — showing ${paginated.length}`}
                  {truncated && (
                    <span className="ms-2">
                      {isRTL
                        ? `(من أصل ${directoryTotal} — يُعرض أول ${rows.length})`
                        : `(of ${directoryTotal} — first ${rows.length} loaded)`}
                    </span>
                  )}
                </p>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={resetFilters}
                    className="text-[11px] font-semibold text-[#0B3D2E] dark:text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <X size={11} />
                    {isRTL ? "مسح الفلاتر" : "Clear filters"}
                  </button>
                )}
              </div>

              {/* Grid */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${specialty}-${city}-${effectiveSort}-${safePage}-${search}-${onlyAvailable}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8"
                >
                  {paginated.length === 0 ? (
                    <NoMatches isDark={isDark} isRTL={isRTL} onClear={resetFilters} />
                  ) : (
                    paginated.map((lawyer, i) => (
                      <LawyerCard
                        key={lawyer.id}
                        lawyer={lawyer}
                        isRTL={isRTL}
                        isDark={isDark}
                        delay={i * 0.05}
                      />
                    ))
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, Math.min(p, totalPages) - 1))}
                    disabled={safePage === 1}
                    className={`flex items-center gap-1 px-3 py-2 rounded-xl border text-[12px] font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      isDark ? "border-white/[0.07] text-zinc-300 hover:bg-zinc-800" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {isRTL ? <ArrowRight size={13} /> : <ArrowLeft size={13} />}
                    {isRTL ? "السابق" : "Prev"}
                  </button>
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i + 1)}
                      className={`w-9 h-9 rounded-xl text-[12px] font-bold transition-colors ${
                        safePage === i + 1
                          ? "bg-[#0B3D2E] text-white"
                          : isDark
                            ? "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                            : "text-zinc-500 hover:bg-zinc-100"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, Math.min(p, totalPages) + 1))}
                    disabled={safePage === totalPages}
                    className={`flex items-center gap-1 px-3 py-2 rounded-xl border text-[12px] font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      isDark ? "border-white/[0.07] text-zinc-300 hover:bg-zinc-800" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {isRTL ? "التالي" : "Next"}
                    {isRTL ? <ArrowLeft size={13} /> : <ArrowRight size={13} />}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile Sidebar Drawer ── */}
      <AnimatePresence>
        {sidebarOpen && hasAnyFilter && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: isRTL ? "100%" : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: isRTL ? "100%" : "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 35 }}
              className={`fixed top-0 ${isRTL ? "right-0" : "left-0"} bottom-0 w-72 z-50 overflow-y-auto p-5 space-y-6 lg:hidden ${
                isDark ? "bg-zinc-900" : "bg-white"
              }`}
              dir={isRTL ? "rtl" : "ltr"}
            >
              <div className="flex items-center justify-between">
                <p className={`font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>
                  {isRTL ? "الفلاتر" : "Filters"}
                </p>
                <button onClick={() => setSidebarOpen(false)} aria-label={isRTL ? "إغلاق" : "Close"}>
                  <X size={18} className={isDark ? "text-zinc-400" : "text-zinc-500"} />
                </button>
              </div>

              {filterGroups(() => setSidebarOpen(false))}

              {activeFiltersCount > 0 && (
                <button
                  onClick={() => { resetFilters(); setSidebarOpen(false); }}
                  className="w-full py-2 text-center text-[12px] font-semibold text-red-500 hover:underline"
                >
                  {isRTL ? "إعادة ضبط الكل" : "Reset all"}
                </button>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}
