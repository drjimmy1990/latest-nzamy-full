"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  UserCircle, Phone, Envelope, MapPin, PencilSimple, SealCheck,
  Warning, Globe, FilePdf, Certificate, Clock, XCircle, Prohibit,
  Eye, EyeSlash, SpinnerGap, ArrowClockwise, Info,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { apiGet, isSupabaseMode } from "@/lib/services/api";
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";
import { OverviewTab } from "@/components/dashboard/LawyerProfileForms";

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
// with the authenticated lawyer's real profiles + lawyer_profiles rows. These
// blanks are never rendered as fact: the page shows a spinner while loading and
// an explicit "could not read" card on failure, so an empty field on screen
// always means the server genuinely returned nothing.
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
  // Whether `lawyer_profiles` was actually read. The route swallows the error
  // from that sub-query (api/v1/profile/route.ts:100-105), so a 200 can arrive
  // with roleProfile === null. Everything above sourced from that table is then
  // a default, not a fact — and «غير مُفعَّل» asserted over an unread column is
  // exactly the kind of confident blank this pass exists to remove. The status
  // row checks this before it claims anything.
  hasRoleProfile: false,
  bio: "",
  expertise: [] as string[],
  // Empty, not ["العربية"]. The languages card renders a five-segment
  // proficiency bar whose fill condition is `s <= 5` — always true — so any
  // language listed here displays permanent full native fluency. Nothing in
  // the schema or the profile editor collects languages or proficiency, so
  // there is no honest value to seed. (The always-full bar itself lives in
  // LawyerProfileForms.tsx and is reported separately.)
  languages: [] as string[],
  education: [] as { degree: string; institution: string; year: string }[],
  courts: [] as string[],
  linkedin: "",
  twitter: "",
  website: "",
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
    } | null;
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
    { icon: Globe, val: profileData.website },
  ].filter((c) => c.val);

  return (
    <div className="max-w-5xl mx-auto space-y-5" dir="rtl">

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
            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 pb-1 sm:ms-auto">
              <button
                disabled
                title="تصدير PDF — قريباً"
                aria-label="تصدير PDF — قريباً"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold border transition-all opacity-50 cursor-not-allowed ${isDark ? "border-white/[0.08] text-zinc-500" : "border-slate-200 text-slate-400"}`}>
                <FilePdf size={13} /> تصدير PDF
              </button>
              <Link href="/dashboard/lawyer/profile/edit"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
                <PencilSimple size={13} /> تعديل
              </Link>
            </div>
          </div>

          {/*
            Status row — replaces the old hero stats row of four literals.
            Every cell here reads a real column, and the only cell that can be
            absent (سنوات الخبرة) is omitted rather than shown as 0: a lawyer
            who has not filled the field in has not practised for zero years.
          */}
          {!profileData.hasRoleProfile ? (
            <div className={`rounded-xl border p-3 mb-4 flex gap-2.5 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
              <Warning size={15} weight="fill" className="flex-shrink-0 mt-0.5 text-amber-500" />
              <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-amber-700/80"}`}>
                تعذّر قراءة بياناتك المهنية (التخصصات، رقم الترخيص، حالة التوثيق، إعداد الظهور في الدليل).
                ما يظهر أعلاه هو بيانات حسابك فقط. لم نعرض قيماً بديلة عن الحقول التي لم تُقرأ.
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
            screen when the read failed.
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
        Single view. The «الأداء» tab is gone (see the file header) and the
        achievements / reviews tabs were already withheld, so a tab bar with one
        remaining button would only read as broken chrome.
      */}
      <OverviewTab isDark={isDark} profile={profileData} cardClass={card} />
    </div>
  );
}
