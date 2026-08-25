"use client";

/**
 * /lawyers/[slug] — the PUBLIC profile of a real, licensed advocate.
 *
 * ─── What this file used to be ────────────────────────────────────────────────
 * `export default function LawyerProfilePage()` — no props, no `useParams`, and
 * six module-level constants. Every id under /lawyers/ rendered the same
 * invented person, «الأستاذ أحمد محمد الغامدي», with an invented licence, an
 * invented career, invented reviews and invented statistics: a 74٪ win rate, a
 * 98٪ client-satisfaction score, 234 reviews, 89 sessions.
 *
 * A win rate and a satisfaction score attributed to a named, licensed advocate
 * are professional claims. Publishing invented ones is the same class of
 * problem as the escrow language removed from this site days ago, so none of it
 * was recomputed or defaulted to zero — a displayed zero is still a claim. It
 * was deleted along with the UI that framed it.
 *
 * ─── The route param ──────────────────────────────────────────────────────────
 * The folder is `[slug]`, so `useParams()` yields `{ slug }` — but `slug` is a
 * misnomer and the value is a `profiles.id` UUID. Verified three ways:
 *   • src/app/dashboard/client/find-lawyer/page.tsx:236 links `/lawyers/${l.id}`
 *   • src/app/dashboard/client/find-lawyer/[id]/page.tsx:4 redirects `/lawyers/${params.id}`
 *   • src/app/dashboard/lawyer/page.tsx:208 shares `/lawyers/${userId}`
 * and the API behind it filters `profiles.id` and rejects anything that is not
 * 36 hex-and-dashes characters. So: read `params.slug`, pass it as an id.
 *
 * ─── What is actually renderable ──────────────────────────────────────────────
 * Only the allow-list projection in src/app/api/v1/lawyers/[id]/route.ts. There
 * is no ratings table, no reviews table, no case-outcome data and no analytics
 * in the schema. Every field below is also optional IN PRACTICE — measured
 * against production, 4 of the 5 lawyer rows have zero specialties, zero years
 * of experience and an empty bio. A nearly-empty profile is the common case, so
 * each section is omitted rather than rendered blank: no «الخبرة: 0 سنوات», no
 * empty bio box, no label with nothing after it.
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  SealCheck,
  MapPin,
  Briefcase,
  CalendarBlank,
  ArrowLeft,
  Scales,
  IdentificationCard,
  Coins,
  WarningCircle,
  ArrowClockwise,
  CheckCircle,
  UserCircle,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import {
  getPublicLawyerProfile,
  type PublicLawyerProfile,
} from "@/lib/services/lawyerService";

const GOLD = "#C8A762";
const GREEN = "#0B3D2E";
const DIRECTORY_HREF = "/lawyers/browse";

type LoadState =
  | { phase: "loading" }
  | { phase: "ok"; lawyer: PublicLawyerProfile }
  | { phase: "not-found" }
  | { phase: "error" };

/**
 * The settled result is stored WITH the request it answers. Everything else is
 * derived at render time, which buys two things:
 *   • no synchronous setState in the effect (react-hooks/set-state-in-effect),
 *   • no stale flash. Navigating /lawyers/a → /lawyers/b keeps this component
 *     mounted and only changes the param, so a plain state variable would show
 *     lawyer A under lawyer B's URL until the fetch settled. A key mismatch
 *     reads as "loading" instead.
 */
type Settled = { key: string; state: LoadState };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Empty strings are as absent as nulls — a DB default of '' is not content. */
function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function initialsOf(name: string): string {
  const words = name.replace(/^(الأستاذ|الأستاذة|المحامي|المحامية)\s+/u, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2);
  return words[0][0] + words[1][0];
}

/** «سنة واحدة» / «سنتان» / «٣ سنوات» — never «1 سنوات». */
function arabicYears(n: number): string {
  if (n === 1) return "سنة واحدة من الخبرة";
  if (n === 2) return "سنتان من الخبرة";
  if (n <= 10) return `${n} سنوات من الخبرة`;
  return `${n} سنة من الخبرة`;
}

function membershipYear(iso: string, isRTL: boolean): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Gregorian with Latin digits — the same formatter the fee calculator uses
  // (src/app/ai/fee-calculator/page.tsx:118); "ar-SA" alone would switch the
  // calendar to Hijri and silently change the year.
  return d.toLocaleDateString(isRTL ? "ar-SA-u-nu-latn" : "en-US", {
    year: "numeric",
    month: "long",
    calendar: "gregory",
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LawyerProfilePage() {
  const { isRTL, isDark } = useTheme();
  const params = useParams<{ slug: string }>();
  // Next can hand back `string | string[]` for a dynamic segment.
  const rawParam = params?.slug;
  const lawyerId = Array.isArray(rawParam) ? rawParam[0] : rawParam;

  const [settled, setSettled] = useState<Settled | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Keyed by URL rather than a boolean, so a different avatar is retried
  // instead of inheriting the previous one's failure.
  const [brokenAvatar, setBrokenAvatar] = useState<string | null>(null);

  // `attempt` is part of the key so that pressing retry invalidates the settled
  // error and re-runs the effect.
  const requestKey = lawyerId ? `${lawyerId}#${attempt}` : null;

  const state: LoadState = !requestKey
    ? { phase: "not-found" }
    : settled?.key === requestKey
      ? settled.state
      : { phase: "loading" };

  useEffect(() => {
    if (!lawyerId || !requestKey) return;
    let cancelled = false;

    getPublicLawyerProfile(lawyerId).then((result) => {
      if (cancelled) return;
      setSettled({
        key: requestKey,
        state:
          result.status === "ok"
            ? { phase: "ok", lawyer: result.lawyer }
            : result.status === "not-found"
              ? { phase: "not-found" }
              : { phase: "error" },
      });
    });

    return () => { cancelled = true; };
  }, [lawyerId, requestKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // ── Shared visual language, carried over from the previous layout ──
  const card = `rounded-2xl border p-6 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const heading = `text-xl font-bold mb-5 ${isDark ? "text-white" : "text-gray-800"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const shimmer = isDark ? "bg-white/[0.06]" : "bg-gray-100";

  const backLink = (
    <Link
      href={DIRECTORY_HREF}
      className={`inline-flex items-center gap-1.5 text-sm font-medium transition hover:underline ${
        isDark ? "text-gray-400 hover:text-[#C8A762]" : "text-gray-500 hover:text-[#0B3D2E]"
      }`}
    >
      <ArrowLeft size={15} className={isRTL ? "rotate-180" : ""} />
      {isRTL ? "العودة إلى دليل المحامين" : "Back to the lawyer directory"}
    </Link>
  );

  return (
    <div
      className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <Navbar />

      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-10 space-y-6">
        {state.phase === "loading" && (
          /* Skeleton mirrors the real hero + one content card, so the page does
             not jump when the data lands. */
          <>
            <section className={`${card} relative overflow-hidden`}>
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#0B3D2E] via-[#C8A762] to-[#0B3D2E] opacity-40" />
              <div className="flex flex-col sm:flex-row gap-6 items-start animate-pulse">
                <div className={`w-24 h-24 rounded-3xl flex-shrink-0 ${shimmer}`} />
                <div className="flex-1 w-full space-y-3">
                  <div className={`h-7 w-2/3 rounded-lg ${shimmer}`} />
                  <div className="flex gap-2">
                    <div className={`h-6 w-24 rounded-full ${shimmer}`} />
                    <div className={`h-6 w-20 rounded-full ${shimmer}`} />
                  </div>
                  <div className={`h-4 w-1/2 rounded ${shimmer}`} />
                </div>
                <div className={`h-11 w-full sm:w-40 rounded-xl ${shimmer}`} />
              </div>
            </section>
            <section className={card}>
              <div className="animate-pulse space-y-3">
                <div className={`h-5 w-40 rounded ${shimmer}`} />
                <div className={`h-3.5 w-full rounded ${shimmer}`} />
                <div className={`h-3.5 w-11/12 rounded ${shimmer}`} />
                <div className={`h-3.5 w-3/5 rounded ${shimmer}`} />
              </div>
            </section>
            <span className="sr-only">{isRTL ? "جارٍ تحميل ملف المحامي…" : "Loading lawyer profile…"}</span>
          </>
        )}

        {/* ── Unavailable ──────────────────────────────────────────────────────
            ONE message for "no such lawyer", "not verified yet" and "not listed".
            The API deliberately collapses all three into a single 404 body so
            that nobody can enumerate which accounts exist or what state they are
            in; distinguishing them here would undo that server-side decision. */}
        {state.phase === "not-found" && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`${card} text-center py-14`}
          >
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
              style={{ backgroundColor: isDark ? "#0B3D2E40" : "#0B3D2E10" }}
            >
              <Scales size={30} color={GOLD} weight="duotone" />
            </div>
            <h1 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "هذا الملف غير متاح" : "This profile is not available"}
            </h1>
            <p className={`text-sm max-w-md mx-auto leading-relaxed mb-7 ${muted}`}>
              {isRTL
                ? "قد يكون الرابط غير صحيح، أو أن هذا الملف غير معروض في دليل المحامين حالياً."
                : "The link may be incorrect, or this profile is not currently listed in the directory."}
            </p>
            <Link
              href={DIRECTORY_HREF}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0B3D2E] text-white text-sm font-semibold hover:bg-[#0a3328] transition"
            >
              <ArrowLeft size={16} className={isRTL ? "rotate-180" : ""} />
              {isRTL ? "تصفّح دليل المحامين" : "Browse the directory"}
            </Link>
          </motion.section>
        )}

        {/* ── Could not ask ────────────────────────────────────────────────────
            Distinct from the 404 on purpose: the visitor learned nothing about
            the lawyer, only that the request failed. Retrying is the remedy. */}
        {state.phase === "error" && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`${card} text-center py-14`}
          >
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
              style={{ backgroundColor: isDark ? "#f59e0b20" : "#fef3c7" }}
            >
              <WarningCircle size={30} color="#d97706" weight="duotone" />
            </div>
            <h1 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "تعذّر تحميل الملف" : "Could not load this profile"}
            </h1>
            <p className={`text-sm max-w-md mx-auto leading-relaxed mb-7 ${muted}`}>
              {isRTL
                ? "حدث خلل أثناء الاتصال بالخادم. تحقّق من اتصالك ثم أعد المحاولة."
                : "Something went wrong reaching the server. Check your connection and try again."}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={retry}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0B3D2E] text-white text-sm font-semibold hover:bg-[#0a3328] transition"
              >
                <ArrowClockwise size={16} weight="bold" />
                {isRTL ? "إعادة المحاولة" : "Try again"}
              </button>
              {backLink}
            </div>
          </motion.section>
        )}

        {state.phase === "ok" && (() => {
          const p = state.lawyer;
          const lp = p.lawyer_profiles;

          const nameAr = text(p.display_name);
          const nameEn = text(p.display_name_en);
          const name = (isRTL ? nameAr ?? nameEn : nameEn ?? nameAr) ?? "";
          // A profile with no name at all is not something to render blank.
          const headingName = name || (isRTL ? "محامٍ موثّق" : "Verified lawyer");

          const specialties = (lp?.specialties ?? []).map(text).filter((s): s is string => Boolean(s));
          const years = lp?.years_experience ?? 0;
          const city = text(p.city);
          const bio = (isRTL ? text(lp?.bio_ar) ?? text(lp?.bio_en) : text(lp?.bio_en) ?? text(lp?.bio_ar));
          const bar = text(lp?.bar_association);
          const licence = text(lp?.license_number);
          const rate = typeof lp?.hourly_rate === "number" && lp.hourly_rate > 0 ? lp.hourly_rate : null;
          const accepting = lp?.is_accepting_clients === true;
          const memberSince = p.created_at ? membershipYear(p.created_at, isRTL) : null;

          const avatar = text(p.avatar_url);
          const initials = initialsOf(name);

          // True only when the lawyer has published nothing beyond the identity
          // the platform itself verified. Common: 4 of 5 production rows.
          const isSparse = !bio && specialties.length === 0 && years <= 0 && !bar && !licence;

          return (
            <>
              {/* ── Hero ── */}
              <motion.section
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                className={`${card} relative overflow-hidden`}
              >
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#0B3D2E] via-[#C8A762] to-[#0B3D2E]" />

                <div className="flex flex-col sm:flex-row gap-6 items-start">
                  {/* Avatar. A plain <img> rather than next/image: avatar_url is
                      user-supplied and next.config only allowlists *.supabase.co,
                      so an unlisted host would throw at runtime. Falls back to
                      initials, and again to an icon when there is no name. */}
                  <div className="flex-shrink-0">
                    {avatar && brokenAvatar !== avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatar}
                        alt={headingName}
                        onError={() => setBrokenAvatar(avatar)}
                        className="w-24 h-24 rounded-3xl object-cover border border-[#C8A762]/30"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-3xl bg-[#0B3D2E] flex items-center justify-center text-white text-3xl font-bold">
                        {initials || <UserCircle size={40} color={GOLD} weight="duotone" />}
                      </div>
                    )}
                  </div>

                  {/* Identity */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                        {headingName}
                      </h1>
                      {/* Real: the API returns a row ONLY when
                          verification_status = 'verified' AND marketplace_visible. */}
                      <span
                        className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border"
                        style={{
                          color: GOLD,
                          borderColor: `${GOLD}55`,
                          backgroundColor: `${GOLD}1a`,
                        }}
                      >
                        <SealCheck size={12} weight="fill" />
                        {isRTL ? "موثّق" : "Verified"}
                      </span>
                    </div>

                    {specialties.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {specialties.map((s, i) => (
                          <span
                            key={i}
                            className="text-xs px-3 py-1 rounded-full font-medium bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-[#0B3D2E]/30 dark:text-[#C8A762]"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                      {city && (
                        <span className={`flex items-center gap-1.5 ${muted}`}>
                          <MapPin size={14} color={GOLD} weight="duotone" />
                          {city}
                        </span>
                      )}
                      {years > 0 && (
                        <span className={`flex items-center gap-1.5 ${muted}`}>
                          <Briefcase size={14} color={GOLD} weight="duotone" />
                          {isRTL ? arabicYears(years) : `${years} yrs experience`}
                        </span>
                      )}
                      {memberSince && (
                        <span className={`flex items-center gap-1.5 ${muted}`}>
                          <CalendarBlank size={14} color={GOLD} weight="duotone" />
                          {/* «عضو في المنصة منذ», not «عضو منذ»: `created_at` is
                              the account row. Beside a gold «موثّق» seal the
                              shorter phrasing could be read as bar membership,
                              i.e. years of practice this data does not claim. */}
                          {isRTL ? `عضو في المنصة منذ ${memberSince}` : `On the platform since ${memberSince}`}
                        </span>
                      )}
                    </div>

                    {lp?.is_accepting_clients !== null && lp?.is_accepting_clients !== undefined && (
                      <div className="mt-3">
                        {accepting ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25">
                            <CheckCircle size={12} weight="fill" />
                            {isRTL ? "يستقبل موكلين جدد" : "Accepting new clients"}
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${
                              isDark ? "bg-white/5 text-gray-400 border-white/10" : "bg-gray-100 text-gray-500 border-gray-200"
                            }`}
                          >
                            {isRTL ? "لا يستقبل موكلين جدداً حالياً" : "Not accepting new clients"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── The only call-to-action on this page ──────────────────
                      Shown ONLY when `is_accepting_clients` is true, and it goes
                      to the real intake at /dashboard/client/consultation/new,
                      which pre-selects this lawyer from `?lawyer=`. Everything
                      that could not go somewhere real was removed instead of
                      being left as a dead control: the old «تواصل مباشر» was a
                      <button> with no handler at all, and «احجز استشارة» pointed
                      at #consult — an anchor into the invented price list.
                      A logged-out visitor is sent to /login first (proxy.ts), a
                      normal gate rather than a broken control; that is called
                      out in the caption below so nobody is surprised. */}
                  {accepting && (
                    <div className="flex flex-col gap-2 w-full sm:w-56 flex-shrink-0">
                      <motion.a
                        href={`/dashboard/client/consultation/new?lawyer=${encodeURIComponent(p.id)}`}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        className="px-6 py-3 bg-[#0B3D2E] text-white font-semibold text-sm rounded-xl hover:bg-[#0a3328] transition text-center"
                      >
                        {isRTL ? "اطلب استشارة" : "Request a consultation"}
                      </motion.a>
                      <p className={`text-[11px] leading-relaxed text-center ${muted}`}>
                        {isRTL
                          ? "يتطلب تسجيل الدخول بحساب عميل لإكمال الطلب."
                          : "Requires signing in with a client account to complete the request."}
                      </p>
                    </div>
                  )}
                </div>
              </motion.section>

              {/* ── About — only when there is a bio ── */}
              {bio && (
                <motion.section
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className={card}
                >
                  <h2 className={heading}>{isRTL ? "نبذة عن المحامي" : "About"}</h2>
                  <p className={`leading-relaxed text-sm whitespace-pre-line ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                    {bio}
                  </p>
                </motion.section>
              )}

              {/* ── Credentials — only when the lawyer chose to publish them.
                  The route DELETES both keys unless `show_contact` is set, so
                  absence here means "withheld", and no label is rendered. ── */}
              {(bar || licence) && (
                <motion.section
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className={card}
                >
                  <h2 className={heading}>{isRTL ? "بيانات القيد المهني" : "Professional registration"}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {bar && (
                      <div
                        className={`rounded-xl border p-4 flex items-start gap-3 ${
                          isDark ? "border-[#2d3748] bg-[#0c0f12]" : "border-gray-200 bg-gray-50"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-[#0B3D2E]/10 flex items-center justify-center flex-shrink-0">
                          <Scales size={20} color={GREEN} weight="duotone" />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs mb-0.5 ${muted}`}>{isRTL ? "جهة القيد" : "Bar association"}</p>
                          {/* text-white, not text-gray-200: globals.css redefines
                              gray-100/200 as dark SURFACES, so the dark branch
                              would render these two — the most legally
                              significant real fields on the page — as a
                              10%-white ghost. */}
                          <p className={`font-semibold text-sm break-words ${isDark ? "text-white" : "text-gray-800"}`}>
                            {bar}
                          </p>
                        </div>
                      </div>
                    )}
                    {licence && (
                      <div
                        className={`rounded-xl border p-4 flex items-start gap-3 ${
                          isDark ? "border-[#2d3748] bg-[#0c0f12]" : "border-gray-200 bg-gray-50"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-[#C8A762]/10 flex items-center justify-center flex-shrink-0">
                          <IdentificationCard size={20} color={GOLD} weight="duotone" />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs mb-0.5 ${muted}`}>{isRTL ? "رقم الترخيص" : "Licence number"}</p>
                          {/* text-white, not text-gray-200: globals.css redefines
                              gray-100/200 as dark SURFACES, so the dark branch
                              would render these two — the most legally
                              significant real fields on the page — as a
                              10%-white ghost. */}
                          <p className={`font-semibold text-sm break-words ${isDark ? "text-white" : "text-gray-800"}`}>
                            {licence}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.section>
              )}

              {/* ── Fee — only when a rate is actually set.
                  There is no payment gateway on this platform, so this is an
                  indicative figure and the card must not imply a checkout: no
                  «ادفع», no price ranges per service, no book-and-pay button. ── */}
              {rate !== null && (
                <motion.section
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className={card}
                >
                  <h2 className={heading}>{isRTL ? "أتعاب الاستشارة" : "Consultation fee"}</h2>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#C8A762]/10 flex items-center justify-center flex-shrink-0">
                      <Coins size={24} color={GOLD} weight="duotone" />
                    </div>
                    <div>
                      <p className="text-2xl font-black" style={{ color: GOLD }}>
                        {rate.toLocaleString(isRTL ? "ar-SA-u-nu-latn" : "en-US")}{" "}
                        <span className="text-sm font-bold">{isRTL ? "ر.س / الساعة" : "SAR / hour"}</span>
                      </p>
                      <p className={`text-xs mt-1 leading-relaxed max-w-lg ${muted}`}>
                        {isRTL
                          ? "مبلغ إرشادي حدّده المحامي، ويُتفق على الأتعاب النهائية معه مباشرة. لا تتم أي عملية دفع عبر المنصة."
                          : "An indicative amount set by the lawyer; final fees are agreed directly with them. No payment is processed through the platform."}
                      </p>
                    </div>
                  </div>
                </motion.section>
              )}

              {/* ── The common case: a verified identity and nothing else yet.
                  One quiet line, so an intentionally minimal profile reads as
                  deliberate rather than as a page that failed to load. ── */}
              {isSparse && (
                <motion.section
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className={`rounded-2xl border border-dashed p-6 text-center ${
                    isDark ? "border-[#2d3748]" : "border-gray-200"
                  }`}
                >
                  <p className={`text-sm leading-relaxed ${muted}`}>
                    {isRTL
                      ? "لم يُضِف هذا المحامي نبذة تعريفية أو مجالات تخصص إلى ملفه بعد."
                      : "This lawyer has not added a bio or areas of practice to their profile yet."}
                  </p>
                </motion.section>
              )}

              <div className="pt-2">{backLink}</div>
            </>
          );
        })()}
      </div>

      <Footer />
    </div>
  );
}
