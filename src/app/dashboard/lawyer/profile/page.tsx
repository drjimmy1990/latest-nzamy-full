"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserCircle, Phone, Envelope, MapPin, PencilSimple, SealCheck,
  Warning, Printer, Certificate, Clock, XCircle, Prohibit,
  Eye, EyeSlash, SpinnerGap, ArrowClockwise, Info, ShareNetwork,
  GraduationCap, Bank, Translate, Plus, TrashSimple,
  ToggleLeft, ToggleRight, CircleNotch,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { apiGet, isSupabaseMode } from "@/lib/services/api";
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";
import { OverviewTab } from "@/components/dashboard/LawyerProfileForms";
import {
  COURT_AR, LANGUAGE_AR, SERVICE_CATEGORY_AR, servicePriceLabelAr,
  isCourtCode, isLanguageCode, type EducationEntry,
} from "@/lib/services/lawyerProfileFields";
import { toArabicDigits } from "@/lib/services/arabicCount";
import { listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";
import {
  getMyServices, deleteService, updateService, type LawyerService,
} from "@/lib/services/lawyerServicesService";
import ServiceFormModal from "../_components/profile/ServiceFormModal";
import ReviewsPanel from "../_components/profile/ReviewsPanel";

/*
 * ─── WHAT THIS PAGE NO LONGER CLAIMS ─────────────────────────────────────────
 * This page used to render the lawyer's REAL identity — name, licence number,
 * city, bio, specialties, verified seal, all from GET /api/v1/profile — and
 * then surround it with roughly forty numbers that had no source at all. They
 * came from two module-constant files (../_data/analytics.ts and
 * ../_data/performance.ts) and were rendered unconditionally, interleaved with
 * the real fields so that nothing on screen told the lawyer which was which:
 *
 *   • «نتائج القضايا» — a 74٪ win rate over 151 case outcomes (106 won / 22
 *     settled / 15 lost / 8 pending). Nothing in this schema records a case
 *     outcome. A win rate is precisely the number a lawyer repeats to a
 *     prospective client, and this one was a literal.
 *   • «ملخص الإيرادات» — 123,450 ر.س annual revenue, 10,287 ر.س monthly, a
 *     best month of نوفمبر. No payment provider has ever been connected to
 *     this platform and no money has ever moved through it, so there was not
 *     even a row these could have been read from. The «تقديري» pill did not
 *     save them: nothing was estimated from anything.
 *   • «مستوى رضا الموكلين» — 61٪ promoters, NPS 46, and the tier sublabel
 *     «أفضل ٥٠٪ على مستوى المدينة». There is no reviews table and there were
 *     zero consultations. The comparison was geographic; the platform has no
 *     data to make that claim about anyone.
 *   • The hero stats row — «١٤٣ قضايا / ٤٫٨★ / ٧+ س خبرة / ٨٩ تقييمات» — four
 *     literals sitting directly beneath the real name and the real licence
 *     number. Meanwhile the REAL years_experience was fetched on every load
 *     and thrown away unused.
 *   • «أنت في أعلى N٪ ضمن محامو المملكة», work-hour benchmark bars against a
 *     hardcoded national average, a productivity metal tier, a twelve-month
 *     activity chart, AI-usage counts and four «مؤشرات التطوير المهني» rings
 *     scoring the lawyer 88/79/92/85.
 *
 * All of it is gone rather than zero-filled: a rendered 0 next to «نسبة الفوز»
 * would be the same lie in the other direction. The whole «الأداء» tab went
 * with it, following the precedent this file already set for the achievements
 * and reviews tabs. The «مشاركة» button and its modal went too — the modal
 * offered to publish the win rate on a professional card that travels
 * off-platform, its two share buttons had no handlers, and the link it copied
 * to the clipboard (nezamy.sa/share/lawyer/xK9mP3q) was hardcoded and 404s.
 *
 * The «بعض الإحصائيات تجريبية» banner was removed WITH the statistics, not
 * before them. It is not a licence to display invented figures, and now there
 * is nothing left for it to disclaim.
 *
 * ../_data/analytics.ts and ../_data/performance.ts are deliberately NOT
 * deleted here: performance.ts is still imported by the lawyer tasks page,
 * which is outside this change. This page simply stops reading them.
 *
 * What remains is what has a source: identity and professional fields from
 * `profiles` + `lawyer_profiles`, and the two pieces of state the lawyer
 * actually needs and could not previously see — his verification status and
 * his directory-visibility setting.
 */

// Honest empty defaults. In supabase mode the effect below overwrites these
// with the authenticated lawyer's real profiles + lawyer_profiles rows.
//
// CORRECTED: this note used to conclude that "an empty field on screen always
// means the server genuinely returned nothing", on the grounds that the page
// spinners while loading and shows a "could not read" card on failure. That
// covered only a failure of the WHOLE GET. The `lawyer_profiles` sub-query
// inside a successful GET could fail on its own, and the route reported that
// as a 200 with `roleProfile: null` — so these blanks reached the screen in the
// `ready` state after all, and were described there as the lawyer's own empty
// fields. `roleProfileReadFailed` below is what closes that gap.
const EMPTY_PROFILE = {
  name: "",
  title: "محامٍ ومستشار قانوني",
  specialty: "",
  city: "",
  phone: "",
  email: "",
  barNumber: "",
  yearsExp: 0,
  verified: false,
  // verification_status verbatim from lawyer_profiles; null when the column is
  // empty. Never defaulted to "pending" — an assumed status is an invented one.
  verificationStatus: null as VerificationStatus | null,
  // The lawyer's stored directory preference. Displayed as a preference, never
  // as "you are listed" — see the visibility panel below for why those differ.
  marketplaceVisible: false,
  // Whether `lawyer_profiles` was actually read AND held a row. Everything
  // above that is sourced from that table is otherwise a default, not a fact —
  // and «غير مُفعَّل» asserted over an unread column is exactly the kind of
  // confident blank this pass exists to remove.
  hasRoleProfile: false,
  // Whether that sub-query FAILED, which is NOT the same as it returning no
  // row: a lawyer can genuinely have no `lawyer_profiles` row yet (see the
  // provisioning note at
  // src/app/api/v1/onboarding/account-type/route.ts:155-163). The two license
  // different sentences — an unread column may not be described at all, while
  // an absent row may honestly be described as empty — so they are two flags,
  // not one. The route reports this explicitly now
  // (api/v1/profile/route.ts, `roleProfileReadFailed`); it used to discard the
  // error, which is what collapsed both states into a single null here.
  roleProfileReadFailed: false,
  bio: "",
  expertise: [] as string[],
  // REVIVED (item 128 · 130) — `education`, `courts`, `languages` were REMOVED
  // above through 2026-09; the paragraph used to end here explaining that
  // `lawyer_profiles` had no column for any of them. That is no longer true:
  // supabase/migrations/20260907_phase7_profile_services_reviews.sql adds all
  // three (plus `slug`, `headline_ar`), GET /api/v1/profile's `.select("*")`
  // already returns them, and the «نبذة» tab below renders them again — this
  // time from real columns, not the old literal five-segment proficiency bar.
  slug: "",
  headlineAr: "",
  education: [] as EducationEntry[],
  courts: [] as string[],
  languages: [] as string[],
  // `linkedin` / `twitter` / `website` stay removed — no column exists for
  // any of the three (DECISION 1 in the same migration: «NO social_links,
  // EVER»), so they are not part of this revival.
};

type VerificationStatus = "pending" | "verified" | "rejected" | "suspended";

// Arabic copy per verification status. `pending` is the state all lawyer
// accounts start in; it is a real status, not a placeholder.
const VERIFICATION_CFG: Record<VerificationStatus, { label: string; icon: typeof SealCheck; color: string }> = {
  verified:  { label: "موثّق",         icon: SealCheck, color: "#C8A762" },
  pending:   { label: "قيد المراجعة",  icon: Clock,     color: "#f59e0b" },
  rejected:  { label: "مرفوض",         icon: XCircle,   color: "#ef4444" },
  suspended: { label: "موقوف",         icon: Prohibit,  color: "#ef4444" },
};

// loading  → the GET is in flight; render nothing factual yet.
// failed   → the GET threw; SAY SO and offer a retry. Never fall through to an
//            empty profile, which a lawyer would read as "my profile is blank".
// ready    → server state is in hand.
// no-server→ demo build. `isSupabaseMode` is a module-level constant, so in a
//            production (supabase) build this branch is dead-code-eliminated;
//            it exists so a demo build does not spin forever.
type LoadState = "loading" | "failed" | "ready" | "no-server";

// «إنجازات» is deliberately absent: no data source on this platform, same
// reasoning as the removed «الأداء» tab (see the file header).
const TABS: { id: "about" | "services" | "reviews"; label: string }[] = [
  { id: "about", label: "نبذة" },
  { id: "services", label: "الخدمات" },
  { id: "reviews", label: "التقييمات" },
];

/**
 * Defensive read of `lawyer_profiles.education` (jsonb array of
 * {degree, institution, year} — educationIssue() in lawyerProfileFields.ts is
 * the write-side check; this is the read side). A malformed or partial entry
 * is dropped rather than rendered with a blank degree or institution.
 */
function sanitizeEducation(raw: unknown): EducationEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      degree: typeof e.degree === "string" ? e.degree.trim() : "",
      institution: typeof e.institution === "string" ? e.institution.trim() : "",
      year: typeof e.year === "number" && Number.isInteger(e.year) ? e.year : null,
    }))
    .filter((e) => e.degree && e.institution);
}

/**
 * Copy `text` to the clipboard, reporting whether it actually landed there.
 *
 * Duplicated from the identical two-tier helper in
 * src/app/dashboard/lawyer/page.tsx (Clipboard API, falling back to a
 * textarea + execCommand("copy") for the insecure-origin/denied-permission
 * case — the office LAN reaches the dashboard over plain http) rather than
 * imported: that copy is a private, unexported function in a sibling page
 * module, not a shared utility.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Insecure origin, denied permission, or an unfocused document — fall through.
  }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "-1000px";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(field);
    return copied;
  } catch {
    return false;
  }
}

export default function LawyerProfilePage() {
  const { isDark } = useTheme();
  const user = useUser();
  const [profileData, setProfileData] = useState(EMPTY_PROFILE);
  // Always "loading" at first render. NOT `isSupabaseMode ? … : "no-server"`:
  // isSupabaseMode reads `typeof window`, so it is FALSE during SSR and true in
  // the browser (src/lib/services/api.ts:15-20). Branching on it in an
  // initializer would ship server HTML saying «غير متاح في هذا الوضع» to every
  // real lawyer and then hydrate into a spinner. Branching on it inside the
  // effect below is safe — effects are client-only.
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");

  const [activeTab, setActiveTab] = useState<"about" | "services" | "reviews">("about");

  // ─── Services tab state (item 178) — honest states via listRead.ts, same
  // contract every other list on this dashboard follows. Loaded lazily, on
  // first visit to the tab, not on page mount: the identity/about data above
  // is already part of GET /api/v1/profile, but a lawyer who never opens
  // «الخدمات» should not pay for that request. ─────────────────────────────
  const [servicesRead, setServicesRead] = useState<ListRead<LawyerService> | null>(null);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesRequested, setServicesRequested] = useState(false);
  const [serviceModal, setServiceModal] = useState<
    { mode: "create" } | { mode: "edit"; service: LawyerService } | null
  >(null);
  const [serviceBusyId, setServiceBusyId] = useState<string | null>(null);
  const [serviceActionError, setServiceActionError] = useState<string | null>(null);

  // ─── Share link (item 130) ────────────────────────────────────────────────
  const [shareState, setShareState] = useState<"idle" | "copied" | "manual">("idle");
  const [profileUrl, setProfileUrl] = useState("");

  type ProfileApiResponse = {
    profile: {
      display_name?: string | null;
      email?: string | null;
      phone?: string | null;
      city?: string | null;
    } | null;
    roleProfile: {
      license_number?: string | null;
      specialties?: string[] | null;
      years_experience?: number | null;
      bio_ar?: string | null;
      city?: string | null;
      verification_status?: VerificationStatus | null;
      marketplace_visible?: boolean | null;
      // Phase 7 (item 128 · 130) — see the EMPTY_PROFILE comment above.
      slug?: string | null;
      headline_ar?: string | null;
      education?: unknown;
      courts?: string[] | null;
      languages?: string[] | null;
    } | null;
    // Optional so an older deploy of the route (which did not send the key)
    // reads as `undefined` → `!== true` → "did not fail", the same conclusion
    // the page drew before the marker existed. The route always sends it.
    roleProfileReadFailed?: boolean;
  };

  const load = useCallback(async () => {
    if (!isSupabaseMode) { setLoadState("no-server"); return; }
    try {
      // GET /api/v1/profile returns { profile, roleProfile, subscription } —
      // NOT { data }. An earlier version guarded on res.data (always
      // undefined), so it never mapped and rendered a fabricated identity plus
      // a false "verified" seal.
      const res = await apiGet<ProfileApiResponse>("/api/v1/profile");
      const p = res.profile;
      const r = res.roleProfile;
      setProfileData((prev) => ({
        ...prev,
        // Identity from `profiles`; honest empties, never a mock identity.
        name: p?.display_name?.trim() || user.name || "",
        email: p?.email?.trim() || "",
        phone: p?.phone?.trim() || "",
        city: (r?.city ?? p?.city)?.trim() || "",
        // Professional fields from `lawyer_profiles` (real column names).
        bio: r?.bio_ar?.trim() || "",
        barNumber: r?.license_number?.trim() || "",
        yearsExp: typeof r?.years_experience === "number" ? r.years_experience : 0,
        expertise: r?.specialties?.length ? r.specialties : [],
        specialty: r?.specialties?.length ? r.specialties[0] : "",
        verificationStatus: r?.verification_status ?? null,
        // Verified seal driven by the REAL status, never hardcoded true.
        verified: r?.verification_status === "verified",
        marketplaceVisible: r?.marketplace_visible === true,
        hasRoleProfile: r != null,
        roleProfileReadFailed: res.roleProfileReadFailed === true,
        // Phase 7 fields — real columns, honest empties (see EMPTY_PROFILE).
        slug: r?.slug?.trim() || "",
        headlineAr: r?.headline_ar?.trim() || "",
        education: sanitizeEducation(r?.education),
        courts: (r?.courts ?? []).filter(isCourtCode),
        languages: (r?.languages ?? []).filter(isLanguageCode),
      }));
      setLoadState("ready");
    } catch (err) {
      // A silent catch here is what made the old page dangerous: a failed read
      // rendered as a real-looking profile with an empty licence number.
      setLoadError(err instanceof Error ? err.message : "تعذّر تحميل بيانات الملف");
      setLoadState("failed");
    }
  }, [user.name]);

  useEffect(() => { load(); }, [load]);

  // ─── Services tab (item 178) ────────────────────────────────────────────
  const loadServices = useCallback(() => {
    setServicesLoading(true);
    getMyServices().then((res) => {
      setServicesRead(res);
      setServicesLoading(false);
    });
  }, []);

  // Lazy: only fires the first time the lawyer opens the tab, not on mount.
  useEffect(() => {
    if (activeTab === "services" && !servicesRequested) {
      setServicesRequested(true);
      loadServices();
    }
  }, [activeTab, servicesRequested, loadServices]);

  /** Merge a server-confirmed row (create or edit) into the held list. */
  const handleServiceSaved = useCallback((service: LawyerService) => {
    setServicesRead((prev) => {
      if (!prev || !prev.ok) return prev;
      const exists = prev.items.some((s) => s.id === service.id);
      return {
        ...prev,
        items: exists
          ? prev.items.map((s) => (s.id === service.id ? service : s))
          : [...prev.items, service],
        total: exists ? prev.total : (prev.total ?? prev.items.length) + 1,
      };
    });
  }, []);

  const handleToggleActive = useCallback(async (service: LawyerService) => {
    setServiceBusyId(service.id);
    setServiceActionError(null);
    try {
      const updated = await updateService(service.id, { active: !service.active });
      handleServiceSaved(updated);
    } catch (err) {
      setServiceActionError(err instanceof Error && err.message ? err.message : "تعذّر تحديث حالة الخدمة.");
    } finally {
      setServiceBusyId(null);
    }
  }, [handleServiceSaved]);

  const handleDeleteService = useCallback(async (service: LawyerService) => {
    if (!window.confirm(`حذف خدمة «${service.titleAr}»؟`)) return;
    setServiceBusyId(service.id);
    setServiceActionError(null);
    try {
      await deleteService(service.id);
      setServicesRead((prev) => {
        if (!prev || !prev.ok) return prev;
        return {
          ...prev,
          items: prev.items.filter((s) => s.id !== service.id),
          total: prev.total === null ? null : Math.max(0, prev.total - 1),
        };
      });
    } catch (err) {
      setServiceActionError(err instanceof Error && err.message ? err.message : "تعذّر حذف الخدمة.");
    } finally {
      setServiceBusyId(null);
    }
  }, []);

  // ─── Share link (item 130) ───────────────────────────────────────────────
  //
  // Same gating semantics as the dashboard home page's «مشاركة» button
  // (src/app/dashboard/lawyer/page.tsx:348-355, `canShareProfile` /
  // `shareDisabledReason`), reproduced rather than imported — that button's
  // state lives in a page component with no exports. What differs here is
  // the URL itself: that button still hands out `/lawyers/${userId}`
  // unconditionally (see the comment above it — written before the slug
  // column existed) and is now the one stale copy left in the app. This page
  // has the lawyer's own `slug` in hand (GET /api/v1/profile → roleProfile,
  // Phase 7) and prefers it, falling back to the id exactly the way
  // /api/v1/lawyers/[id] resolves either.
  const canShareProfile = Boolean(user.userId) && !BETA_MONOPOLY_MODE;
  const shareDisabledReason = BETA_MONOPOLY_MODE
    ? "صفحة الملف العام غير متاحة حالياً — دليل المحامين غير مفتوح للنشر بعد"
    : "سجّل الدخول بحسابك المهني لمشاركة رابط ملفك العام";

  const handleShareProfile = useCallback(async () => {
    const uid = user.userId;
    if (!canShareProfile || !uid) return;
    const path = profileData.slug || uid;
    const url = `${window.location.origin}/lawyers/${encodeURIComponent(path)}`;
    setProfileUrl(url);
    setShareState((await copyToClipboard(url)) ? "copied" : "manual");
  }, [canShareProfile, user.userId, profileData.slug]);

  useEffect(() => {
    if (shareState !== "copied") return;
    const timer = window.setTimeout(() => setShareState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [shareState]);

  // ─── Print / PDF (item 131) ──────────────────────────────────────────────
  // No custom PDF generation — the browser's own print dialog offers "Save
  // as PDF" on every platform this app ships to. What makes the output only
  // the profile (not the tab chrome, not whichever tab happens to be open)
  // is CSS: see the print:hidden / print:block wrappers in the JSX below,
  // layered on top of the global @media print rules in globals.css.
  const handlePrintProfile = useCallback(() => { window.print(); }, []);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  if (loadState === "loading") {
    return (
      <div className="max-w-5xl mx-auto p-16 text-center" dir="rtl">
        <SpinnerGap size={26} className="animate-spin mx-auto text-zinc-400" />
        <p className={`mt-3 text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جارٍ تحميل ملفك المهني…</p>
      </div>
    );
  }

  if (loadState === "failed" || loadState === "no-server") {
    const isDemo = loadState === "no-server";
    return (
      <div className="max-w-2xl mx-auto py-16 px-4" dir="rtl">
        <div className={`${card} p-6 text-center`}>
          <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${isDark ? "bg-amber-500/10" : "bg-amber-50"}`}>
            <Warning size={26} weight="duotone" className="text-amber-500" />
          </div>
          <h1 className={`text-[16px] font-bold mb-2 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
            {isDemo ? "الملف المهني غير متاح في هذا الوضع" : "تعذّر تحميل بيانات الملف"}
          </h1>
          <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
            {isDemo
              ? "هذه الصفحة تقرأ ملفك من الخادم، والخادم غير متصل في هذا الوضع. لم يُعرض أي شيء بدلاً من بياناتك."
              : `${loadError} — لم نتمكن من قراءة ملفك، ولم نعرض بيانات بديلة. حاول مرة أخرى.`}
          </p>
          {!isDemo && (
            <button
              onClick={() => { setLoadError(""); setLoadState("loading"); load(); }}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[12px] font-bold text-[#C8A762] transition-colors hover:bg-[#0a3328]"
            >
              <ArrowClockwise size={14} weight="bold" /> إعادة المحاولة
            </button>
          )}
        </div>
      </div>
    );
  }

  const verificationCfg = profileData.verificationStatus
    ? VERIFICATION_CFG[profileData.verificationStatus]
    : null;
  const VerificationIcon = verificationCfg?.icon ?? Info;
  const VisibilityIcon = profileData.marketplaceVisible ? Eye : EyeSlash;

  // Contact chips: only the ones with a value. An empty pill, or
  // «رقم الترخيص: » with nothing after it, reads as a broken field rather than
  // as "not provided".
  const contactChips = [
    { icon: Phone, val: profileData.phone },
    { icon: Envelope, val: profileData.email },
  ].filter((c) => c.val);

  // `languages` defaults to `{"ar"}` for EVERY row at the database level
  // (migration default, not a lawyer's choice) — rendering «اللغات: العربية»
  // off that bare default would look like a claim the lawyer made about
  // himself when he may never have touched the field. The card is shown only
  // when the array holds something beyond that default, same treatment as
  // courts/education, which have no non-empty default to worry about.
  const languagesToShow =
    profileData.languages.length === 1 && profileData.languages[0] === "ar"
      ? []
      : profileData.languages;

  const sectionLabelCls = `text-[11px] font-bold uppercase tracking-wide mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`;
  const chipCls = `px-2.5 py-1 rounded-lg text-[11px] font-semibold ${isDark ? "bg-[#0B3D2E]/30 text-emerald-400" : "bg-[#0B3D2E]/8 text-[#0B3D2E]"}`;

  const servicesView = listViewState(servicesLoading, servicesRead);
  const serviceItems = itemsOf(servicesRead);

  return (
    <div className="nz-profile-print max-w-5xl mx-auto space-y-5" dir="rtl">
      {/* globals.css's @media print rules only neutralize backgrounds/colors
          on elements matching bg-zinc-900/bg-white/card-surface class
          patterns — this page's dark-mode text utilities (text-white,
          text-zinc-100/200/300, used throughout the isDark branches below)
          match none of those, so a dark-theme lawyer clicking «طباعة / حفظ
          PDF» (handlePrintProfile, above) would get near-invisible light
          text on white paper. Scope a blanket override to this page, same
          approach as the public profile's `.nz-lawyer-print` (see
          src/app/lawyers/[slug]/page.tsx). */}
      <style>{`
        @media print {
          .nz-profile-print, .nz-profile-print * {
            color: #000 !important;
            background: transparent !important;
          }
        }
      `}</style>

      {/* Header hero card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className={`${card} overflow-hidden`}>
        {/* Cover */}
        <div className="h-28 w-full" style={{ background: "linear-gradient(135deg, #0B3D2E 0%, #125e47 60%, #1a7a5e 100%)" }}>
          <div className="h-full w-full opacity-10"
            style={{ backgroundImage: "radial-gradient(circle at 20% 80%, #C8A762 0%, transparent 50%)" }} />
        </div>

        <div className="px-6 pb-5">
          {/* Avatar row */}
          <div className="flex flex-col gap-4 -mt-10 mb-4 sm:flex-row sm:items-end">
            <div className="flex min-w-0 items-end gap-4">
              <div className="w-20 h-20 rounded-2xl border-4 border-white dark:border-zinc-900 bg-[#0B3D2E] flex items-center justify-center flex-shrink-0 shadow-lg">
                <UserCircle size={44} weight="duotone" className="text-[#C8A762]" />
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className={`text-xl font-bold leading-snug ${isDark ? "text-white" : "text-slate-800"}`}>
                    {user.name || profileData.name}
                  </h1>
                  {profileData.verified && (
                    <SealCheck size={18} weight="fill" className="text-[#C8A762]" />
                  )}
                </div>
                <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                  {profileData.title}{profileData.specialty ? ` · ${profileData.specialty}` : ""}
                </p>
                {profileData.city && (
                  <div className="flex items-center gap-1 mt-1">
                    <MapPin size={12} className={isDark ? "text-zinc-600" : "text-slate-400"} />
                    <span className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{profileData.city}</span>
                  </div>
                )}
              </div>
            </div>
            {/* Action buttons — print:hidden as a group: none of the three
                belong in the printed output itself (globals.css already
                hides <button>, but «تعديل» is a Next <Link> → <a>, which that
                rule does not reach, so the whole row is scoped explicitly). */}
            <div className="flex flex-wrap items-center gap-2 pb-1 sm:ms-auto print:hidden">
              <span className="inline-flex" title={canShareProfile ? "انسخ رابط ملفك العام وشاركه مع موكليك" : shareDisabledReason}>
                <button
                  type="button"
                  onClick={handleShareProfile}
                  disabled={!canShareProfile}
                  aria-label={canShareProfile ? "مشاركة ملفي المهني" : shareDisabledReason}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold border transition-all ${
                    !canShareProfile
                      ? `opacity-50 cursor-not-allowed ${isDark ? "border-white/[0.08] text-zinc-500" : "border-slate-200 text-slate-400"}`
                      : shareState === "copied"
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-600"
                        : isDark ? "border-white/[0.08] text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}>
                  <ShareNetwork size={13} weight="duotone" />
                  {shareState === "copied" ? "تم نسخ الرابط ✓" : "مشاركة"}
                </button>
              </span>
              <button
                type="button"
                onClick={handlePrintProfile}
                title="طباعة الملف أو حفظه كملف PDF من نافذة الطباعة"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold border transition-all ${isDark ? "border-white/[0.08] text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                <Printer size={13} /> طباعة / حفظ PDF
              </button>
              <Link href="/dashboard/lawyer/profile/edit"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
                <PencilSimple size={13} /> تعديل
              </Link>
            </div>
          </div>

          {/* Manual copy fallback — neither the Clipboard API nor
              execCommand worked, so the link is put on screen in a
              selectable field. No tick: nothing has been copied yet. */}
          {shareState === "manual" && (
            <div className={`rounded-xl border p-3 mb-4 print:hidden ${isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-slate-200 bg-slate-50/60"}`}>
              <p className={`text-[11px] font-bold mb-1.5 ${isDark ? "text-zinc-300" : "text-slate-600"}`}>تعذّر النسخ تلقائياً — انسخ الرابط يدوياً</p>
              <input
                type="text" dir="ltr" readOnly value={profileUrl}
                onFocus={(e) => e.currentTarget.select()}
                className={`w-full rounded-lg border px-3 py-1.5 text-[11px] font-mono ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-slate-200 bg-white text-slate-700"}`}
              />
            </div>
          )}

          {/*
            Status row — replaces the old hero stats row of four literals.
            Every cell here reads a real column, and the only cell that can be
            absent (سنوات الخبرة) is omitted rather than shown as 0: a lawyer
            who has not filled the field in has not practised for zero years.
          */}
          {!profileData.hasRoleProfile ? (
            /*
              Two different facts, two different sentences. The banner used to
              assert a READ FAILURE for both, which was false for the lawyer who
              simply has no `lawyer_profiles` row yet — a state the account-type
              route documents as reachable.

              «مرتبط بحسابك» rather than "does not exist", deliberately: a row
              excluded by RLS returns zero rows without raising, so it reaches
              the client as "no row" with `roleProfileReadFailed` false — the
              route says so in its own GET docstring. This page can only speak
              for what this account can see.

              ABOUT THE «تعديل» LINK IN THE HEADER: it is not gated on any of
              this, and this comment used to claim the opposite — that neither
              branch offers it as the way out, because sending the lawyer there
              would be a promise the page could not keep. The link was never
              gated (it renders unconditionally about ten lines above), so that
              described a screen that did not exist. The underlying fact still
              holds — PATCH /api/v1/profile updates and does not insert
              (src/app/api/v1/profile/route.ts:368-378), so the row cannot be
              created from the editor either — but the editor now names these
              same two states and disables Save in both, so the link leads to a
              page that REPEATS this sentence rather than to a blank form that
              contradicts it. Gating it would also take the retry button away —
              from BOTH of these states, since the editor offers a re-read in
              each. Hence: narrow the comment, keep the link.

              Why creating the row is still deferred, and the single thing to
              verify against production before anyone builds it, is recorded at
              src/app/dashboard/lawyer/profile/edit/page.tsx in the branch that
              sets the "no-row" banner. Read it before assuming an insert here
              would work.
            */
            <div className={`rounded-xl border p-3 mb-4 flex gap-2.5 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
              <Warning size={15} weight="fill" className="flex-shrink-0 mt-0.5 text-amber-500" />
              <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-amber-700/80"}`}>
                {profileData.roleProfileReadFailed
                  ? "تعذّر قراءة بياناتك المهنية (التخصصات، رقم الترخيص، حالة التوثيق، إعداد الظهور في الدليل). ما يظهر أعلاه هو بيانات حسابك فقط. لم نعرض قيماً بديلة عن الحقول التي لم تُقرأ."
                  /*
                    Scope, then mechanism, then stop.

                    «من لوحة التحكم», not «من هذه الصفحة», stays: the editor one
                    click away cannot create the row either, so scoping this to
                    "this page" would let a lawyer bouncing between the two
                    infer that some third page can.

                    What went with it is «يرجى التواصل مع الدعم لإنشائه» — an
                    instruction whose outcome no feature delivers. Re-verified
                    for this round: nothing in the tree inserts into
                    `lawyer_profiles` for an account that already exists. The
                    single insert is in onboarding/account-type through a
                    DYNAMIC `spec.table` (invisible to a `from("lawyer_profiles")`
                    grep), and it refuses any caller whose `user_type` is
                    already set; across the admin routes the table is only
                    selected from, updated (`verification_status`,
                    `credit_balance`), or dropped with the user.

                    The row can still come to exist — but by a hand on the
                    database, not by a request. The admin console says so to the
                    only person who can do it (`newSectorRowNotes` in
                    src/app/dashboard/admin/users/[id]/page.tsx: «أنشئ الصف
                    يدويًا من قاعدة البيانات»). So the sentence names that
                    mechanism and offers no step: describing how a row comes
                    into being is not the same as telling a lawyer to go and ask
                    for one.
                  */
                  : "لا يوجد سجل مهني مرتبط بحسابك حتى الآن (التخصصات، رقم الترخيص، حالة التوثيق، إعداد الظهور في الدليل). ما يظهر أعلاه هو بيانات حسابك فقط. ولا يمكن إنشاء هذا السجل من لوحة التحكم؛ إنشاؤه تدخّل يدوي في قاعدة البيانات من مشغّل المنصة."}
              </p>
            </div>
          ) : (
          <div className="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-3">
            <div className={`${isDark ? "bg-white/[0.03] border border-white/[0.05]" : "bg-slate-50 border border-slate-100"} rounded-xl p-3 flex items-center gap-2.5`}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${verificationCfg?.color ?? "#94a3b8"}1a` }}>
                <VerificationIcon size={15} weight="duotone" style={{ color: verificationCfg?.color ?? "#94a3b8" }} />
              </div>
              <div className="min-w-0">
                <p className={`text-[13px] font-black leading-none ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                  {verificationCfg?.label ?? "غير محددة"}
                </p>
                <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>حالة التوثيق</p>
              </div>
            </div>

            <div className={`${isDark ? "bg-white/[0.03] border border-white/[0.05]" : "bg-slate-50 border border-slate-100"} rounded-xl p-3 flex items-center gap-2.5`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${profileData.marketplaceVisible ? "bg-emerald-500/10" : "bg-slate-400/10"}`}>
                <VisibilityIcon size={15} weight="duotone" className={profileData.marketplaceVisible ? "text-emerald-500" : "text-slate-400"} />
              </div>
              <div className="min-w-0">
                <p className={`text-[13px] font-black leading-none ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                  {profileData.marketplaceVisible ? "مُفعَّل" : "غير مُفعَّل"}
                </p>
                <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>طلب الظهور في الدليل</p>
              </div>
            </div>

            {profileData.yearsExp > 0 && (
              <div className={`${isDark ? "bg-white/[0.03] border border-white/[0.05]" : "bg-slate-50 border border-slate-100"} rounded-xl p-3 flex items-center gap-2.5`}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-500/10">
                  <Certificate size={15} weight="duotone" className="text-blue-500" />
                </div>
                <div className="min-w-0">
                  <p className={`text-[13px] font-black leading-none ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                    {profileData.yearsExp} سنة
                  </p>
                  <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>سنوات الخبرة</p>
                </div>
              </div>
            )}
          </div>
          )}

          {/*
            The three facts about directory visibility, stated together.
            Ticking «الظهور في دليل المحامين» in the editor sets a real column
            (lawyer_profiles.marketplace_visible) but it is NOT sufficient to
            list anyone, and the page previously said nothing about that:
              1. it is a stored preference, not a listing;
              2. every reader of the directory also requires
                 verification_status = 'verified' — both the API query and the
                 RLS policy — and verification is admin-only, deliberately not
                 self-editable;
              3. during the beta the public directory is not reachable at all.
            Clause 3 is gated on the flag so this copy stops being true-but-
            stale the moment BETA_MONOPOLY_MODE is turned off. The whole block
            is gated on hasRoleProfile because it explains a tile that is not on
            screen whenever the professional row is missing — whether the read
            failed or there is genuinely no row.
          */}
          {profileData.hasRoleProfile && (
          <div className={`rounded-xl border p-3 mb-4 flex gap-2.5 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-200 bg-slate-50/60"}`}>
            <Info size={15} weight="duotone" className="flex-shrink-0 mt-0.5 text-[#C8A762]" />
            <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
              «طلب الظهور في الدليل» تفضيل محفوظ في ملفك ولا يعني أن ملفك منشور.
              لا يُدرَج أي محامٍ في الدليل العام قبل توثيق حسابه من إدارة المنصة،
              والتوثيق يتم من الإدارة ولا يمكن تعديله من هنا.
              {BETA_MONOPOLY_MODE && " كما أن دليل المحامين العام غير مُفعَّل خلال مرحلة التجربة الحالية، فلا يظهر فيه أي محامٍ حتى الآن."}
            </p>
          </div>
          )}

          {/* Contact chips */}
          {(contactChips.length > 0 || profileData.barNumber) && (
            <div className="flex flex-wrap gap-2">
              {contactChips.map(({ icon: Icon, val }, i) => (
                <div key={i} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
                  <Icon size={11} /> {val}
                </div>
              ))}
              {profileData.barNumber && (
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
                  <SealCheck size={11} className="text-[#C8A762]" /> رقم الترخيص: {profileData.barNumber}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/*
        Three tabs now that each has a real data source (see the file header
        for what «الأداء» was and why it stayed gone). «إنجازات» is still
        absent, deliberately — no achievements table exists either.
        print:hidden — the tab bar itself never prints.
      */}
      <div className={`${card} p-1.5 flex gap-1 print:hidden`}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 rounded-xl px-3 py-2 text-[12px] font-bold transition-colors ${
              activeTab === t.id
                ? "bg-[#0B3D2E] text-[#C8A762]"
                : isDark ? "text-zinc-400 hover:bg-white/5" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/*
        «نبذة» — always mounted (its data is already part of profileData; no
        separate fetch) and toggled with hidden/print:block rather than
        conditionally rendered, so «طباعة / حفظ PDF» prints the profile card
        itself regardless of which tab happens to be open on screen — the
        task this button describes, not "whatever the lawyer was looking at".
      */}
      <div className={`space-y-4 ${activeTab === "about" ? "" : "hidden print:block"}`}>
        <OverviewTab isDark={isDark} profile={profileData} cardClass={card} />
        {(profileData.headlineAr || profileData.education.length > 0 || profileData.courts.length > 0 || languagesToShow.length > 0) && (
          <div className={`${card} p-5 space-y-4`}>
            {profileData.headlineAr && (
              <p className={`text-[13px] font-semibold leading-relaxed ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                {profileData.headlineAr}
              </p>
            )}
            {profileData.education.length > 0 && (
              <div>
                <p className={sectionLabelCls}>
                  <GraduationCap size={12} weight="bold" className="inline -mt-0.5 me-1" /> المؤهلات
                </p>
                <ul className="space-y-1">
                  {profileData.education.map((e, i) => (
                    <li key={i} className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                      {e.degree} — {e.institution}{e.year ? ` (${toArabicDigits(e.year)})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {profileData.courts.length > 0 && (
              <div>
                <p className={sectionLabelCls}>
                  <Bank size={12} weight="bold" className="inline -mt-0.5 me-1" /> المحاكم
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {profileData.courts.map((c) => (
                    <span key={c} className={chipCls}>{COURT_AR[c] ?? c}</span>
                  ))}
                </div>
              </div>
            )}
            {languagesToShow.length > 0 && (
              <div>
                <p className={sectionLabelCls}>
                  <Translate size={12} weight="bold" className="inline -mt-0.5 me-1" /> اللغات
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {languagesToShow.map((l) => (
                    <span key={l} className={chipCls}>{LANGUAGE_AR[l] ?? l}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* «الخدمات» (item 178) — never printed: a service list is not the
          profile card, and it is mounted only while the lawyer is on this
          tab (its own fetch, see loadServices above), so print:hidden here
          is a formality for the moment it happens to be on screen. */}
      {activeTab === "services" && (
        <div className="print:hidden space-y-4">
          <div className="flex items-center justify-between">
            <h2 className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>الخدمات</h2>
            <button
              type="button"
              onClick={() => setServiceModal({ mode: "create" })}
              className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-3 py-2 text-[12px] font-bold text-[#C8A762] hover:bg-[#0a3328] transition-colors"
            >
              <Plus size={13} weight="bold" /> إضافة خدمة
            </button>
          </div>

          {serviceActionError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[12px] font-semibold text-red-500">
              <Warning size={14} weight="fill" className="mt-0.5 flex-shrink-0" />
              <span>{serviceActionError}</span>
            </div>
          )}

          {servicesView === "loading" && (
            <div className={`${card} p-10 text-center`}>
              <SpinnerGap size={22} className="animate-spin mx-auto text-zinc-400" />
              <p className={`mt-3 text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جارٍ تحميل خدماتك…</p>
            </div>
          )}

          {servicesView === "unreadable" && (
            <div className={`${card} p-6 text-center`}>
              <p className={`text-[13px] font-bold mb-1 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>تعذّرت القراءة</p>
              <p className={`text-[12px] mb-4 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لم نتمكن من تحميل قائمة خدماتك. لم نعرض بيانات بديلة.</p>
              <button
                type="button" onClick={loadServices}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-[#C8A762] hover:bg-[#0a3328]"
              >
                <ArrowClockwise size={13} weight="bold" /> إعادة المحاولة
              </button>
            </div>
          )}

          {servicesView === "empty" && (
            <div className={`${card} p-10 text-center`}>
              <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>لا خدمات بعد</p>
              <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>أضف خدماتك المسعّرة ليتمكن الموكلون من طلبها من ملفك.</p>
            </div>
          )}

          {servicesView === "ready" && (
            <div className="space-y-3">
              {serviceItems.map((s) => (
                <div key={s.id} className={`${card} p-4`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{s.titleAr}</span>
                        {!s.active && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-slate-100 text-slate-400"}`}>غير مُفعَّلة</span>
                        )}
                      </div>
                      <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                        {SERVICE_CATEGORY_AR[s.category]} · {servicePriceLabelAr(s.pricingKind, s.priceSar, toArabicDigits)}
                        {s.durationLabel ? ` · ${s.durationLabel}` : ""}
                      </p>
                      {s.descriptionAr && (
                        <p className={`text-[12px] mt-2 leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{s.descriptionAr}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button" onClick={() => handleToggleActive(s)} disabled={serviceBusyId === s.id}
                        title={s.active ? "إخفاء الخدمة" : "تفعيل الخدمة"}
                        className={`p-1.5 rounded-lg disabled:opacity-40 ${isDark ? "text-zinc-400 hover:bg-white/5" : "text-slate-500 hover:bg-slate-50"}`}
                      >
                        {serviceBusyId === s.id
                          ? <CircleNotch size={15} className="animate-spin" />
                          : s.active ? <ToggleRight size={17} weight="fill" className="text-emerald-500" /> : <ToggleLeft size={17} />}
                      </button>
                      <button
                        type="button" onClick={() => setServiceModal({ mode: "edit", service: s })}
                        title="تعديل"
                        className={`p-1.5 rounded-lg ${isDark ? "text-zinc-400 hover:bg-white/5" : "text-slate-500 hover:bg-slate-50"}`}
                      >
                        <PencilSimple size={15} />
                      </button>
                      <button
                        type="button" onClick={() => handleDeleteService(s)} disabled={serviceBusyId === s.id}
                        title="حذف"
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 disabled:opacity-40"
                      >
                        <TrashSimple size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* «التقييمات» (item 192) — self-contained, fetches its own data;
          mounted only while this tab is open, so print:hidden here is the
          same formality as on the services tab above. */}
      {activeTab === "reviews" && (
        <div className="print:hidden">
          <ReviewsPanel isDark={isDark} />
        </div>
      )}

      <AnimatePresence>
        {serviceModal && (
          <ServiceFormModal
            isDark={isDark}
            initial={serviceModal.mode === "edit" ? serviceModal.service : undefined}
            onClose={() => setServiceModal(null)}
            onSaved={handleServiceSaved}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
