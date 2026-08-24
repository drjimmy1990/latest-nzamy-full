"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Buildings,
  Bank,
  Handshake,
  Scales,
  Check,
  ArrowLeft,
  ArrowRight,
  Gavel,
  Brain,
  FileText,
  Bell,
  Star,
  MapPin,
  Phone,
  Briefcase,
  GraduationCap,
  Users,
  ChartLine,
  CheckCircle,
  Storefront,
  Stamp,
  Shield,
  Certificate,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { createClient } from "@/lib/supabase/client";
import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import {
  buildNotificationPreferences,
  getWizardCategories,
  legalUpdateAudience,
  readCategoryStates,
  type NotifCategory,
  type UserSettingsEnvelope,
} from "@/app/settings/components/tabs/NotificationsTab";
import {
  dashboardPathFor,
  isAssignableUserType,
  isDbUserType,
  toDbUserType,
  toProviderSubRole,
  type DbUserType,
} from "@/lib/auth/userTypes";

type UserType = DbUserType | null;
type Step = 1 | 2 | 3 | 4 | 5;

// ── Step 1: confirm user type ──────────────────────────────────────────────────
// The `id` of each option is a PICKER id, not a `profiles.user_type` value:
// `company` here is `corporate` in the database, and `notary`, `tracker` and
// `arbitrator` are all the single user_type `provider`. Every read of these ids
// goes through `toDbUserType` and `toProviderSubRole`
// (src/lib/auth/userTypes.ts) — nothing in this file writes a picker id to the
// database, and nothing indexes PICKER_TO_DB or PICKER_TO_SUB_ROLE directly.
//
// `admin` is the one `profiles.user_type` with no option here, permanently: it
// must never be assignable from a control (see `isAssignableUserType`).
// src/lib/auth/userTypes.test.ts fails if any option resolves to it.
//
// ── The three service-provider options ────────────────────────────────────
// موثّق, معقّب and محكّم are three options and ONE user_type. What separates
// them is `provider_profiles.sub_role`, which is NOT NULL with a CHECK over
// ('notary','arbitrator','bailiff') and no default
// (supabase/migrations/20260603_phase1_001_profiles.sql:159-160). So the
// specialty has to travel with the claim, and it does: the submit below sends
// `subRole` beside `pickerId`, the claim route validates it against the CHECK
// list AND against the option chosen, and refuses rather than defaulting
// (src/app/api/v1/onboarding/account-type/route.ts). One generic "service
// provider" option would have chosen somebody's specialty for them; three
// options with one hardcoded sub_role behind them would have been worse still,
// because being filed as the wrong specialty is invisible while being absent
// is not.
//
// The ids are the same three /register/provider uses for the same roles
// (`ProviderType`, src/app/register/provider/types.ts:1), so the Google route
// and the email route name them identically. `tracker` → `'bailiff'` is the one
// id whose sub_role is not its own name; the map is the only place that
// translation lives.
//
// This works without supabase/migrations/20260821_fix_provider_signup_sub_role.sql,
// which is written and NOT applied. That migration repairs the signup TRIGGER,
// which is what the /register/provider EMAIL route depends on; the claim route
// creates the `provider_profiles` row itself in application code. The two
// routes are still in different states and one is not evidence about the other.

const userTypeOptions = {
  ar: [
    { id: "individual", icon: User,        label: "فرد",             desc: "مواطن أو مقيم يبحث عن خدمة قانونية" },
    { id: "company",    icon: Buildings,   label: "شركة / مؤسسة",   desc: "شركة تجارية أو مؤسسة خاصة" },
    { id: "micro",      icon: Storefront,  label: "مؤسسة / منشأة",    desc: "محل تجاري أو مؤسسة فردية أو مطعم" },
    { id: "government", icon: Bank,        label: "جهة حكومية",      desc: "وزارة أو هيئة أو مؤسسة حكومية" },
    { id: "ngo",        icon: Handshake,   label: "جمعية / منظمة",   desc: "منظمة غير ربحية أو جمعية أهلية" },
    { id: "lawyer",     icon: Gavel,       label: "محامي / مستشار",   desc: "ممارس قانوني مرخّص" },
    { id: "firm",       icon: Scales,      label: "شركة محاماة",     desc: "مكتب أو شركة محاماة" },
    // The three service-provider kinds. Labels and descriptions are the ones
    // /register/provider already uses (src/app/register/provider/data.ts:8-10),
    // so somebody who saw that page and came here through Google reads the same
    // words for the same role.
    { id: "notary",     icon: Stamp,       label: "موثّق",            desc: "توثيق العقود والمحررات الرسمية" },
    { id: "tracker",    icon: Shield,      label: "معقّب",            desc: "إنجاز المعاملات الحكومية" },
    { id: "arbitrator", icon: Certificate, label: "محكّم",            desc: "التحكيم وفض النزاعات" },
  ],
  en: [
    { id: "individual", icon: User,        label: "Individual",           desc: "Citizen or resident seeking legal service" },
    { id: "company",    icon: Buildings,   label: "Company / Enterprise", desc: "A commercial or private entity" },
    { id: "micro",      icon: Storefront,  label: "Small Business",       desc: "Shop, sole proprietorship, or restaurant" },
    { id: "government", icon: Bank,        label: "Government Entity",    desc: "Ministry, authority, or public body" },
    { id: "ngo",        icon: Handshake,   label: "Association / NGO",    desc: "Non-profit or charitable organization" },
    { id: "lawyer",     icon: Gavel,       label: "Lawyer / Consultant",  desc: "Licensed legal practitioner" },
    { id: "firm",       icon: Scales,      label: "Law Firm",             desc: "Legal office or firm" },
    { id: "notary",     icon: Stamp,       label: "Notary",               desc: "Contract and document notarization" },
    { id: "tracker",    icon: Shield,      label: "Gov. Agent",           desc: "Complete government transactions" },
    { id: "arbitrator", icon: Certificate, label: "Arbitrator",           desc: "Arbitration and dispute resolution" },
  ],
};

// ── Step 2: service preference ───────────────────────────────────────────────
const serviceOptions = {
  ar: [
    { id: "consult",   icon: Brain,    label: "استشارات قانونية",    desc: "محامٍ بشري أو AI" },
    { id: "contract",  icon: FileText, label: "عقود ومستندات",       desc: "صياغة ومراجعة" },
    { id: "cases",     icon: Gavel,    label: "تمثيل قضائي",         desc: "المرافعة والدفاع" },
    { id: "research",  icon: ChartLine,label: "بحث قانوني",          desc: "أنظمة وسوابق" },
    { id: "notify",    icon: Bell,     label: "متابعة وتنبيهات",      desc: "قضايا واستشارات" },
    { id: "erp",       icon: Users,    label: "نظام ERP قانوني",      desc: "إدارة المكتب" },
  ],
  en: [
    { id: "consult",   icon: Brain,    label: "Legal Consultations",  desc: "Human lawyer or AI" },
    { id: "contract",  icon: FileText, label: "Contracts & Documents", desc: "Draft & review" },
    { id: "cases",     icon: Gavel,    label: "Legal Representation",  desc: "Litigation & defense" },
    { id: "research",  icon: ChartLine,label: "Legal Research",        desc: "Laws & precedents" },
    { id: "notify",    icon: Bell,     label: "Monitoring & Alerts",   desc: "Cases & consultations" },
    { id: "erp",       icon: Users,    label: "Legal ERP",             desc: "Office management" },
  ],
};

// ── Step 3: specialties (for lawyers) ────────────────────────────────────────
const specialtyOptions = [
  { ar: "قانون الشركات والأعمال", en: "Corporate & Business Law" },
  { ar: "قانون العقارات",         en: "Real Estate Law" },
  { ar: "القانون الجنائي",        en: "Criminal Law" },
  { ar: "قانون العمل",              en: "Labor Law" },
  { ar: "قانون الأسرة",            en: "Family Law" },
  { ar: "القانون الإداري",         en: "Administrative Law" },
  { ar: "قانون الملكية الفكرية",   en: "Intellectual Property" },
  { ar: "فض النزاعات والتحكيم",    en: "Dispute Resolution & Arbitration" },
];

// ── Step 4: notifications pref ───────────────────────────────────────────────
//
// There is no option table here any more, and that is the point. This step used
// to offer four ids of its own — `case`, `lawyer`, `law`, `promo` — that existed
// nowhere else, while /settings offered a whole category matrix in a second
// vocabulary. The user answered the same question twice, in two languages the
// platform did not share, and neither answer was ever read back.
// The categories now come from the settings tab, which owns the vocabulary
// (`getWizardCategories`), and the answers are written to the same
// `user_settings` row that tab reads. What stays local is presentation only:
// an icon per category, and the English half of the copy — the settings tab is
// Arabic-only, this wizard is not.
//
// `promo` is the one switch that is not a category: عروض وخصومات has a column
// of its own (`user_settings.marketing_emails`), so it is answered there rather
// than duplicated as a category key.
const notifIcons: Record<string, typeof Gavel> = {
  case_update:      Gavel,
  new_case:         Gavel,
  case_assign:      Gavel,
  consultation:     Brain,
  contract:         FileText,
  hearing:          Bell,
  team_activity:    Users,
  approval_req:     CheckCircle,
  compliance:       Shield,
  gov_reports:      Bank,
  circular:         FileText,
  new_request:      Briefcase,
  appointment:      Bell,
  legal_update:     Scales,
  platform_updates: Star,
  reminders:        Bell,
};

/**
 * The English half of the copy, for the categories this step can show.
 *
 * Keyed by category key, except التحديثات التشريعية: obs-24 gives it a
 * different sentence per role, so its English follows the same audience split
 * — `legalUpdateAudience` is imported rather than re-derived, so the role →
 * audience table exists once.
 */
const notifCopyEn: Record<string, { label: string; desc: string }> = {
  case_update:            { label: "Case Updates",          desc: "New hearings or replies from your lawyer" },
  new_case:               { label: "New Case",              desc: "A case was assigned to you" },
  case_assign:            { label: "Case Assignment",       desc: "A new case assigned to you" },
  consultation:           { label: "Consultation Replies",  desc: "A reply arrived on your question" },
  contract:               { label: "Contracts",             desc: "A new contract or an amendment request" },
  hearing:                { label: "Hearing Dates",         desc: "An upcoming hearing" },
  team_activity:          { label: "Team Activity",         desc: "Important actions by members" },
  approval_req:           { label: "Approval Requests",     desc: "A request is waiting for your approval" },
  compliance:             { label: "Compliance & Governance", desc: "A ZATCA, PDPL or SAMA alert" },
  gov_reports:            { label: "Government Reports",    desc: "A periodic report due to the ministry" },
  circular:               { label: "Official Circulars",    desc: "A new circular from your entity" },
  new_request:            { label: "New Service Request",   desc: "A client requested your service" },
  appointment:            { label: "Appointments",          desc: "An appointment was booked or changed" },
  platform_updates:       { label: "Platform Updates",      desc: "New features and Nezamy bulletins" },
  reminders:              { label: "General Reminders",     desc: "Important dates and deadlines" },
  "legal_update:practitioner": { label: "📜 New laws, regulations and legislative decisions", desc: "A law, regulation or legislative decision is issued" },
  "legal_update:individual":   { label: "⚖️ Alerts on your rights and the legal changes that touch you (labor, tenancy, family)", desc: "A change that touches your rights directly" },
  "legal_update:business":     { label: "🏢 Regulatory updates, commercial compliance and ministerial decisions for business", desc: "A new ministerial decision or regulatory obligation" },
};

/** The Arabic/English pair to render for one category. */
function notifCopy(cat: NotifCategory, userType: UserType, isAr: boolean) {
  if (isAr) return { label: cat.label, desc: cat.description };
  const key =
    cat.key === "legal_update" ? `legal_update:${legalUpdateAudience(userType)}` : cat.key;
  const en = notifCopyEn[key];
  // Arabic is the fallback, never an untranslated key: every category
  // `getWizardCategories` can return is listed above, and a new one showing its
  // Arabic label in English mode is a far smaller failure than a blank row.
  return en ? { label: en.label, desc: en.desc } : { label: cat.label, desc: cat.description };
}

// ── Phone ─────────────────────────────────────────────────────────────────────

/**
 * Arabic-Indic (٠١٢…) and Extended Arabic-Indic (۰۱۲…) digits → ASCII, so a
 * number typed on an Arabic keyboard is not rejected as malformed.
 */
function toAsciiDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/**
 * A Saudi mobile in E.164 (`+9665XXXXXXXX`), or `null` when the input is not
 * one. Accepts `05…`, `5…`, `966…`, `00966…` and `+966…`, with spaces, dashes
 * and Arabic-Indic digits.
 *
 * NOTE: this is a deliberate duplicate of the same function in
 * src/app/api/v1/profile/route.ts. The server is what actually guards the
 * column; this copy exists so the wizard can refuse before it submits, and the
 * two must stay identical. If a third caller appears, extract them into one
 * module.
 */
function normalizeSaudiMobile(raw: string): string | null {
  let v = toAsciiDigits(raw).replace(/[\s()\u200e\u200f-]/g, "");
  if (v.startsWith("00966")) v = `+${v.slice(2)}`;
  else if (v.startsWith("966")) v = `+${v}`;
  else if (/^0?5\d{8}$/.test(v)) v = `+966${v.replace(/^0/, "")}`;
  return /^\+9665\d{8}$/.test(v) ? v : null;
}

// ── Errors ────────────────────────────────────────────────────────────────────

/** Shown when a failure carries no Arabic message of its own. */
const GENERIC_SAVE_ERROR = "تعذّر حفظ بياناتك. تحقق من اتصالك وحاول مرة أخرى.";

/**
 * The Arabic message for a failed request, or the generic one.
 *
 * Both endpoints this page calls answer in Arabic, but the transport in
 * between does not: `apiMutate` (src/lib/services/api.ts:56-59) falls back to
 * `API error: 500` when a response carries no JSON `error` — a Next.js error
 * page, a proxy timeout, an endpoint that is not deployed. Rendering that
 * string would put English in front of a user, so anything without Arabic
 * letters in it is replaced here and logged instead.
 */
function arabicError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  if (raw) console.warn("[Nzamy] onboarding save failed:", raw);
  return /[\u0600-\u06ff]/.test(raw) ? raw : GENERIC_SAVE_ERROR;
}

/** The shape this page reads from GET/PATCH /api/v1/profile. */
type ProfileEnvelope = {
  profile: {
    user_type?: string | null;
    phone?: string | null;
    city?: string | null;
    onboarding_completed?: boolean | null;
  } | null;
};

/** The 200 body of POST /api/v1/onboarding/account-type. */
type AccountTypeClaimResult = { ok?: boolean; userType?: string; subRole?: string | null };

// ── Helper: step indicator ───────────────────────────────────────────────────
function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          animate={{ width: i + 1 === step ? 24 : 8 }}
          className={`h-2 rounded-full transition-colors ${
            i + 1 <= step ? "bg-royal dark:bg-gold" : "bg-slate-200 dark:bg-white/15"
          }`}
        />
      ))}
    </div>
  );
}

// ── Step 1 component ─────────────────────────────────────────────────────────
function S1({
  isAr,
  selected,
  onSelect,
}: {
  isAr: boolean;
  /** The selected PICKER id (`company`, not `corporate`), or null. */
  selected: string | null;
  onSelect: (pickerId: string) => void;
}) {
  const opts = isAr ? userTypeOptions.ar : userTypeOptions.en;
  return (
    <motion.div key="s1" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ type: "spring", stiffness: 280, damping: 26 }}>
      <h2 className="font-brand text-2xl font-bold text-ink mb-1">
        {isAr ? "أنت من تكون بالضبط؟" : "Who exactly are you?"}
      </h2>
      <p className="text-sm text-ink-muted dark:text-gray-400 mb-7">
        {isAr ? "نخصّص تجربتك بالكامل بناءً على دورك" : "We fully personalize your experience based on your role"}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {opts.map((o) => {
          const Icon = o.icon;
          const active = selected === o.id;
          return (
            <motion.button
              key={o.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(o.id)}
              className={`relative flex flex-col items-start gap-2.5 rounded-2xl border p-4 text-start transition-all ${
                active
                  ? "border-royal/30 bg-royal/5 dark:border-gold/30 dark:bg-royal/15 shadow-sm"
                  : "border-slate-200/70 bg-white dark:border-white/10 dark:bg-dark-card hover:border-slate-300 dark:hover:border-white/20"
              }`}
            >
              {active && (
                <span className="absolute top-2.5 end-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-royal dark:bg-gold">
                  <Check size={11} weight="bold" className="text-white dark:text-royal" />
                </span>
              )}
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm ${active ? "bg-royal/10 text-royal dark:bg-gold/15 dark:text-gold" : "bg-slate-100 text-ink-faint dark:bg-white/10 dark:text-gray-400"}`}>
                <Icon size={18} weight="duotone" />
              </span>
              <div>
                <div className="text-sm font-semibold text-ink">{o.label}</div>
                <div className="text-xs text-ink-muted dark:text-gray-400 mt-0.5">{o.desc}</div>
              </div>
            </motion.button>
          );
        })}
      </div>
      {/* True as written: the account type is claimed once, and only an admin
          can change it afterwards (the database refuses a self-change —
          trg_lock_user_type). No promise is made about self-service. */}
      <p className="mt-4 text-xs text-ink-faint dark:text-gray-500">
        {isAr
          ? "يُحدَّد نوع الحساب مرة واحدة. لتغييره لاحقاً تحتاج إلى مراجعة إدارة المنصّة."
          : "Your account type is set once. Changing it later requires the platform administrators."}
      </p>
      {/* The service-provider options now exist, so the note that used to
          apologise for their absence is gone. What replaces it is the one thing
          a موثّق, معقّب or محكّم cannot learn from the cards themselves: the
          specialty they pick here is what gets written to
          `provider_profiles.sub_role`, and the sentence above already told them
          the account type is set once. Every clause below is checked:

            - "يُسجَّل تخصصك" — the submit sends `subRole` with the claim and
              the route writes it into provider_profiles (see the header
              comment). It is not a preference stored somewhere soft.
            - "لا يظهر ملفك في نتائج البحث حتى تراجعه إدارة المنصّة" —
              `provider_profiles.verification_status` takes its column default
              of 'pending' and `marketplace_visible` its default of false
              (supabase/migrations/20260603_phase1_001_profiles.sql:167-169).
              The claim sets neither, deliberately.
            - It does NOT say documents or a licence number were submitted:
              this wizard has no field for either. /register/provider is the
              page that collects them, and it is not linked from here on
              purpose — this visitor is already signed in, so registering there
              on the same email converts nothing and on another email creates a
              second account they do not want. */}
      <p className="mt-2 text-xs text-ink-faint dark:text-gray-500">
        {isAr
          ? "إن اخترت «موثّق» أو «معقّب» أو «محكّم» فسيُسجَّل تخصصك مع حسابك، ولا يظهر ملفك المهني في نتائج البحث حتى تراجعه إدارة المنصّة."
          : "If you choose “Notary”, “Gov. Agent” or “Arbitrator”, your specialty is recorded with your account, and your professional file does not appear in search results until the platform administrators review it."}
      </p>
    </motion.div>
  );
}

// ── Step 2 component ─────────────────────────────────────────────────────────
function S2({
  isAr,
  selected,
  onToggle,
  userType,
  hasLawyer,
  onSetHasLawyer,
}: {
  isAr: boolean;
  selected: string[];
  onToggle: (id: string) => void;
  userType: UserType;
  hasLawyer: boolean | null;
  onSetHasLawyer: (v: boolean) => void;
}) {
  const opts = isAr ? serviceOptions.ar : serviceOptions.en;
  // `corporate` is what the picker calls "شركة / مؤسسة".
  const showLawyerQ = userType === "corporate" || userType === "micro";
  return (
    <motion.div key="s2" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ type: "spring", stiffness: 280, damping: 26 }}>
      <h2 className="font-brand text-2xl font-bold text-ink mb-1">
        {isAr ? "ما الذي تحتاجه غالباً؟" : "What do you usually need?"}
      </h2>
      <p className="text-sm text-ink-muted dark:text-gray-400 mb-7">
        {isAr ? "اختر كل ما ينطبق — يمكنك تغييره لاحقاً" : "Select all that apply — you can change this later"}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {opts.map((o) => {
          const Icon = o.icon;
          const active = selected.includes(o.id);
          return (
            <motion.button
              key={o.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onToggle(o.id)}
              className={`relative flex flex-col items-start gap-2 rounded-2xl border p-4 text-start transition-all ${
                active ? "border-royal/30 bg-royal/5 dark:border-gold/30 dark:bg-royal/15 shadow-sm" : "border-slate-200/70 bg-white dark:border-white/10 dark:bg-dark-card"
              }`}
            >
              {active && (
                <span className="absolute top-2.5 end-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-royal dark:bg-gold">
                  <Check size={11} weight="bold" className="text-white dark:text-royal" />
                </span>
              )}
              <Icon size={18} weight="duotone" className={active ? "text-royal dark:text-gold" : "text-ink-faint dark:text-gray-500"} />
              <div>
                <div className="text-sm font-semibold text-ink">{o.label}</div>
                <div className="text-xs text-ink-muted dark:text-gray-400">{o.desc}</div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* ── Lawyer question for Corporate / Micro ── */}
      {showLawyerQ && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="mt-6 rounded-2xl border border-gold/20 bg-gold/5 dark:bg-gold/8 dark:border-gold/15 p-5"
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold-dark dark:text-gold">
              <Scales size={18} weight="duotone" />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink">
                {isAr ? "هل لديكم محامي داخلي / قسم قانوني؟" : "Do you have an in-house lawyer / legal department?"}
              </div>
              <div className="text-xs text-ink-muted dark:text-gray-400 mt-0.5">
                {isAr
                  ? "هذا يساعدنا نخصّص لك الأدوات والباقات المناسبة"
                  : "This helps us tailor the right tools and plans for you"}
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            {[
              { val: true,  ar: "نعم، لدينا محامي", en: "Yes, we have a lawyer" },
              { val: false, ar: "لا، نحتاج محامي",  en: "No, we need one" },
            ].map((opt) => (
              <button
                key={String(opt.val)}
                onClick={() => onSetHasLawyer(opt.val)}
                className={`flex-1 rounded-xl border py-3 px-4 text-sm font-medium transition-all ${
                  hasLawyer === opt.val
                    ? "border-royal/30 bg-royal/8 text-royal dark:border-gold/30 dark:bg-royal/15 dark:text-gold shadow-sm"
                    : "border-slate-200 bg-white text-ink-muted dark:border-white/10 dark:bg-dark-card dark:text-gray-400 hover:border-slate-300"
                }`}
              >
                {isAr ? opt.ar : opt.en}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Step 3: phone + location + specialty ─────────────────────────────────────
function S3({
  isAr,
  userType,
  phone,
  setPhone,
  city,
  setCity,
  specialties,
  onToggleSpec,
}: {
  isAr: boolean;
  userType: UserType;
  phone: string;
  setPhone: (p: string) => void;
  city: string;
  setCity: (c: string) => void;
  specialties: string[];
  onToggleSpec: (s: string) => void;
}) {
  const isLegal = userType === "lawyer" || userType === "firm";
  const inputCls = "w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-ink outline-none focus:border-royal focus:ring-2 focus:ring-royal/10 transition-all dark:border-white/10 dark:bg-dark-card dark:focus:border-gold dark:focus:ring-gold/10";
  const phoneTouched = phone.trim().length > 0;
  const phoneValid = normalizeSaudiMobile(phone) !== null;
  return (
    <motion.div key="s3" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ type: "spring", stiffness: 280, damping: 26 }}>
      <h2 className="font-brand text-2xl font-bold text-ink mb-1">
        {isAr
          ? (isLegal ? "تواصلك وتخصصاتك" : "بيانات التواصل")
          : (isLegal ? "Contact & Specialties" : "Contact Details")}
      </h2>
      <p className="text-sm text-ink-muted dark:text-gray-400 mb-7">
        {isAr
          ? "نستخدم رقم جوالك للتواصل معك بخصوص طلباتك"
          : "We use your mobile number to contact you about your requests"}
      </p>
      <div className="space-y-5">
        <div>
          <label htmlFor="ob-phone" className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
            {isAr ? "رقم الجوال" : "Mobile Number"}
            <span className="text-royal dark:text-gold"> *</span>
          </label>
          <div className="relative">
            <Phone size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            <input
              id="ob-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0512345678"
              aria-invalid={phoneTouched && !phoneValid}
              className={`${inputCls} ${isAr ? "pr-10 pl-4 text-right" : "pl-10 pr-4"} ${
                phoneTouched && !phoneValid ? "border-red-400 dark:border-red-500/60" : ""
              }`}
            />
          </div>
          <p className={`mt-1.5 text-xs ${phoneTouched && !phoneValid ? "text-red-600 dark:text-red-400" : "text-ink-faint dark:text-gray-500"}`}>
            {phoneTouched && !phoneValid
              ? (isAr
                  ? "رقم الجوال غير صحيح. أدخل رقم جوال سعودي يبدأ بـ 05 — مثال: 0512345678"
                  : "Invalid number. Enter a Saudi mobile starting with 05 — e.g. 0512345678")
              : (isAr
                  ? "رقم جوال سعودي — مثال: 0512345678"
                  : "Saudi mobile number — e.g. 0512345678")}
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
            {isAr ? "المدينة" : "City"}
          </label>
          <div className="relative">
            <MapPin size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            <select value={city} onChange={(e) => setCity(e.target.value)} className={`${inputCls} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"} cursor-pointer`}>
              <option value="">{isAr ? "اختر مدينتك" : "Select your city"}</option>
              {["الرياض", "جدة", "الدمام", "مكة المكرمة", "المدينة المنورة", "الطائف", "أبها", "تبوك", "أخرى"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        {isLegal && (
          <div>
            <label className="mb-2 block text-sm font-medium text-ink dark:text-gray-300">
              {isAr ? "تخصصاتك القانونية (اختر ما ينطبق)" : "Your Legal Specialties (select all that apply)"}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {specialtyOptions.map((s, i) => {
                const label = isAr ? s.ar : s.en;
                const active = specialties.includes(s.en);
                return (
                  <button
                    key={i}
                    onClick={() => onToggleSpec(s.en)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-start text-xs font-medium transition-all ${
                      active ? "border-royal/30 bg-royal/5 text-royal dark:border-gold/30 dark:bg-royal/15 dark:text-gold" : "border-slate-200 bg-white text-ink-muted dark:border-white/10 dark:bg-dark-card dark:text-gray-400"
                    }`}
                  >
                    {active ? <Check size={12} weight="bold" className="shrink-0" /> : <div className="h-3 w-3 rounded-sm border border-current shrink-0" />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Step 4: notifications ─────────────────────────────────────────────────────
function S4({
  isAr,
  userType,
  states,
  onToggle,
  marketing,
  onToggleMarketing,
}: {
  isAr: boolean;
  /** The role whose categories and wording this step shows (obs-24). */
  userType: UserType;
  /** Every category of the role, keyed the way the settings tab keys them. */
  states: Record<string, boolean>;
  onToggle: (key: string) => void;
  marketing: boolean;
  onToggleMarketing: () => void;
}) {
  // The categories are the role's own — a جهة حكومية is asked about تعيين
  // القضايا والتعاميم, not about «تحديثات القضايا» as though every account
  // were the same one.
  const opts = [
    ...getWizardCategories(userType).map((cat) => {
      const { label, desc } = notifCopy(cat, userType, isAr);
      return {
        id: cat.key,
        icon: notifIcons[cat.key] ?? Bell,
        label,
        desc,
        active: states[cat.key] ?? cat.defaultOn,
        toggle: () => onToggle(cat.key),
      };
    }),
    {
      id: "promo",
      icon: Storefront,
      label: isAr ? "عروض وخصومات" : "Offers & Discounts",
      desc: isAr ? "باقات مخفّضة" : "Discounted packages",
      active: marketing,
      toggle: onToggleMarketing,
    },
  ];
  return (
    <motion.div key="s4" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ type: "spring", stiffness: 280, damping: 26 }}>
      <h2 className="font-brand text-2xl font-bold text-ink mb-1">
        {isAr ? "أي إشعارات تريد؟" : "Which notifications do you want?"}
      </h2>
      <p className="text-sm text-ink-muted dark:text-gray-400 mb-7">
        {isAr ? "لن نزعجك — فقط ما يهمك" : "We won't spam you — only what matters to you"}
      </p>
      <div className="space-y-3">
        {opts.map((o) => {
          const Icon = o.icon;
          const active = o.active;
          return (
            <motion.button
              key={o.id}
              whileTap={{ scale: 0.98 }}
              onClick={o.toggle}
              className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-start transition-all ${
                active ? "border-royal/30 bg-royal/5 dark:border-gold/30 dark:bg-royal/12" : "border-slate-200/70 bg-white dark:border-white/10 dark:bg-dark-card"
              }`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? "bg-royal/10 text-royal dark:bg-gold/15 dark:text-gold" : "bg-slate-100 text-ink-faint dark:bg-white/10 dark:text-gray-400"}`}>
                <Icon size={20} weight="duotone" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-ink">{o.label}</div>
                <div className="text-xs text-ink-muted dark:text-gray-400">{o.desc}</div>
              </div>
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${active ? "border-royal bg-royal dark:border-gold dark:bg-gold" : "border-slate-300 dark:border-white/20"}`}>
                {active && <Check size={11} weight="bold" className="text-white dark:text-royal" />}
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Step 5: success ───────────────────────────────────────────────────────────
function S5({
  isAr,
  userType,
  hasLawyer,
  typeWasNotChanged,
}: {
  isAr: boolean;
  userType: UserType;
  hasLawyer: boolean | null;
  /**
   * True when the type the account ended up with is not the one that was
   * picked — either it was already set, or the account had already finished
   * onboarding once, which closes the one-time claim.
   */
  typeWasNotChanged: boolean;
}) {
  // One dashboard map for the whole app (src/lib/auth/userTypes.ts). The local
  // map this replaced sent a government body and an NGO to /dashboard/business
  // and /dashboard/client — prefixes ROUTE_ACCESS (src/proxy.ts:13-37) reserves
  // for `corporate` and `individual`, so those links bounced their own owners
  // straight back out.
  const base = userType ? dashboardPathFor(userType) : "/";
  // ?mode=service is read by the corporate dashboard itself
  // (src/app/dashboard/business/page.tsx:95); it stays inside the same prefix,
  // so it cannot fall foul of the rule above.
  const dashLink = userType === "corporate" && hasLawyer === false ? `${base}?mode=service` : base;
  return (
    <motion.div key="s5" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
        className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-royal shadow-[0_12px_32px_-8px_rgba(11,61,46,0.45)]"
      >
        <CheckCircle size={38} weight="bold" className="text-white" />
      </motion.div>
      <h2 className="font-brand text-2xl font-bold text-ink mb-2">
        {isAr ? "حسابك جاهز تماماً!" : "Your Account Is All Set!"}
      </h2>
      <p className="text-sm text-ink-muted dark:text-gray-400 max-w-[280px] mx-auto mb-8">
        {isAr ? "خصّصنا تجربتك. الآن استكشف خدمات نظامي." : "We've personalized your experience. Now explore Nezamy's services."}
      </p>
      {typeWasNotChanged && (
        <p className="mx-auto mb-6 max-w-[320px] rounded-xl border border-gold/25 bg-gold/5 px-4 py-3 text-xs text-ink-muted dark:border-gold/20 dark:bg-gold/10 dark:text-gray-300">
          {isAr
            ? "لم يتغيّر نوع حسابك — يُحدَّد مرة واحدة فقط. لتغييره تحتاج إلى مراجعة إدارة المنصّة."
            : "Your account type was not changed — it is set once. Changing it requires the platform administrators."}
        </p>
      )}
      <div className="space-y-3 text-start">
        {[
          { icon: Briefcase, ar: "اذهب للوحة التحكم", en: "Go to My Dashboard", href: dashLink },
          { icon: Brain,     ar: "جرّب نظامي AI",     en: "Try Nezamy AI",     href: "/ai" },
          { icon: Gavel,     ar: "احجز استشارة",       en: "Book a Consultation", href: "/book/consultation" },
        ].map((link, i) => {
          const Icon = link.icon;
          return (
            <motion.a
              key={i}
              href={link.href}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="flex items-center gap-4 rounded-2xl border border-slate-200/50 dark:border-white/10 bg-white dark:bg-dark-card p-4 hover:border-royal/15 hover:shadow-sm transition-all"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-royal/6 dark:bg-royal/15 text-royal dark:text-gold">
                <Icon size={20} weight="duotone" />
              </span>
              <span className="flex-1 text-sm font-medium text-ink">{isAr ? link.ar : link.en}</span>
              {isAr ? <ArrowLeft size={14} className="text-ink-faint" /> : <ArrowRight size={14} className="text-ink-faint" />}
            </motion.a>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { lang, theme, toggleTheme, toggleLang } = useTheme();
  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";

  const [step, setStep] = useState<Step>(1);
  /** What the user clicked in step 1 — a PICKER id, or null when they have not. */
  const [pickerId, setPickerId] = useState<string | null>(null);
  /**
   * `profiles.user_type` when it is already something other than the signup
   * default. `individual` is NOT recorded here: it is what the signup trigger
   * writes for every new account, including every Google one
   * (supabase/migrations/20260716_security_hardening.sql:19), so treating it as
   * "already chosen" would leave a Google user unable to say they are a company.
   */
  const [existingUserType, setExistingUserType] = useState<DbUserType | null>(null);
  /**
   * What `profiles.user_type` holds once the writes below are done — which is
   * not always what was picked. The success screen links to this and to nothing
   * else: a link to the dashboard of a type the account does not have would be
   * bounced straight back out by ROUTE_ACCESS (src/proxy.ts:13-37).
   */
  const [resolvedUserType, setResolvedUserType] = useState<DbUserType | null>(null);
  const [services, setServices] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  /**
   * Every notification category of the role, on or off — not just the ones step
   * 4 shows. The step asks about three; the rest ride along at their own
   * defaults so that the settings tab, which shows all of them, opens on the
   * same answers this wizard wrote instead of on a half-empty row.
   *
   * The seed is empty because the role is not known at mount: it arrives either
   * from the picker in step 1 or from the profile read below. `["case"]` used
   * to be the seed, which pre-ticked «تحديثات القضايا» for a جهة حكومية and a
   * موثّق alike — the same role-blindness obs-24 is about, one line up.
   */
  const [notifs, setNotifs] = useState<Record<string, boolean>>({});
  /** عروض وخصومات — `user_settings.marketing_emails`, off by default. */
  const [marketing, setMarketing] = useState(false);
  const [hasLawyer, setHasLawyer] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * The type this wizard is working with: whatever the account already has,
   * otherwise the picker's choice translated into a database value. Never a
   * picker id, and never `admin` — the picker offers no such option and
   * `isAssignableUserType` refuses it before any write.
   */
  const userType: UserType =
    existingUserType ?? (pickerId ? toDbUserType(pickerId) : null);

  // Read the account's real type from `profiles` — not from user_metadata,
  // which an OAuth provider never populates. A type that is already set is
  // preserved: a lawyer who registered through /register/provider and later
  // lands here must not be reset by a picker default.
  useEffect(() => {
    if (!isSupabaseMode) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<ProfileEnvelope>("/api/v1/profile");
        if (cancelled) return;
        const known = res.profile?.user_type ?? "";
        if (isDbUserType(known) && known !== "individual") {
          setExistingUserType(known);
          setStep(2); // Nothing to choose — skip "Who are you?"
        }
        // Prefill what the account already holds, so a returning user is not
        // asked to retype it.
        if (res.profile?.phone) setPhone(res.profile.phone);
        if (res.profile?.city) setCity(res.profile.city);
      } catch {
        // Leave step 1 showing. The submit below re-reads the authoritative
        // type from the PATCH response before it claims anything, so a failed
        // read here cannot overwrite an established type.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // The notification defaults follow the role, and are re-derived whenever the
  // role changes — a user who goes back to step 1 and picks differently is
  // answering a different set of questions, so keeping the old answers would
  // carry a lawyer's switches onto a company's categories. `userType` only ever
  // changes when the picker changes or when the profile read resolves, both of
  // which happen before step 4 is reachable.
  useEffect(() => {
    setNotifs(readCategoryStates(userType, null));
  }, [userType]);

  const toggleService = (id: string) =>
    setServices((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);

  const toggleSpec = (s: string) =>
    setSpecialties((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const toggleNotif = (key: string) =>
    setNotifs((prev) => ({ ...prev, [key]: !prev[key] }));

  const canNext = () => {
    if (saving) return false;
    if (step === 1) return userType !== null;
    if (step === 2) return services.length > 0;
    // The phone is required, and required means the step does not advance
    // without it: profiles.phone is the only number the outbound notification
    // payload can carry, and all 16 live accounts have none.
    if (step === 3) return city.length > 0 && normalizeSaudiMobile(phone) !== null;
    return true;
  };

  /**
   * Persist the wizard, in the only order that is safe to fail in.
   *
   *   1. the phone, through PATCH /api/v1/profile
   *   2. the account type, through POST /api/v1/onboarding/account-type
   *   3. the notification preferences, through PUT /api/v1/settings
   *   4. `onboarding_completed`, through PATCH /api/v1/profile
   *
   * Why this order. `needsOnboarding` exempts `lawyer` and `firm`
   * unconditionally (src/lib/auth/onboardingGate.ts), and the claim endpoint
   * only fires while the account is still the untouched `individual` default.
   * So a type written before the phone would strand a lawyer or a firm: exempt
   * from the gate, phone-less, with nothing left to bring them back. And
   * `onboarding_completed` written before the claim would make the claim
   * ineligible — the wizard would lock every non-individual out of their own
   * account type. The preferences go before the commit for the same reason: a
   * failure there leaves `onboarding_completed` false, so the retry re-runs a
   * sequence that is idempotent from the top instead of stranding the answers
   * behind a wizard the user can no longer reach.
   *
   * Each step failing leaves a state the next attempt can recover from, and
   * every failure stops the wizard where it is with an Arabic message. It never
   * advances on a failed write: a user who was told "done" while nothing was
   * saved would be redirected back here by the proxy on their next page load,
   * with no explanation.
   *
   * Returns true only when everything that had to be written was written.
   */
  const persistOnboarding = async (): Promise<boolean> => {
    // Demo mode has no session and no database; the wizard is a preview there.
    if (!isSupabaseMode) return true;

    const normalizedPhone = normalizeSaudiMobile(phone);
    if (!normalizedPhone) {
      setSaveError("رقم الجوال غير صحيح. أدخل رقم جوال سعودي يبدأ بـ 05 — مثال: 0512345678");
      return false;
    }

    setSaving(true);
    setSaveError(null);
    try {
      // ── 1. The phone, first and alone ──────────────────────────────────────
      // The response carries the whole updated row, so this doubles as the
      // authoritative read of user_type — no second round trip.
      const patched = await apiMutate<ProfileEnvelope>("/api/v1/profile", "PATCH", {
        phone: normalizedPhone,
        ...(city ? { city } : {}),
      });
      const currentType = patched.profile?.user_type ?? "";
      const alreadyCompleted = patched.profile?.onboarding_completed === true;

      // ── 2. The account type, only while it is still the signup default ─────
      let finalType: UserType = isDbUserType(currentType) ? currentType : userType;
      const wanted = userType;
      if (
        wanted &&
        wanted !== "individual" &&
        currentType === "individual" &&
        // The claim is one-time: the endpoint refuses an account that has
        // already finished onboarding (src/lib/auth/accountTypeClaim.ts:343-344).
        // Asking anyway would answer a 403 the user could never clear by
        // retrying — the refusal is a rule, not a failure. So the same rule is
        // read here, off the row we just wrote, and the success screen says the
        // type did not change.
        !alreadyCompleted &&
        // `admin` has no picker option and cannot come out of toDbUserType, so
        // this can only fail if someone adds one. Keep the guard in the path.
        isAssignableUserType(wanted) &&
        pickerId
      ) {
        // `subRole` goes on the wire for the three service-provider options
        // and is omitted for the other seven — the route refuses a specialty
        // sent with an option that takes none, and refuses a provider option
        // that arrives without one, so this is not a field to send "just in
        // case". `toProviderSubRole` is the single translation of معقّب →
        // 'bailiff'; this file does not repeat it.
        const subRole = toProviderSubRole(pickerId);
        const claim = await apiMutate<AccountTypeClaimResult>(
          "/api/v1/onboarding/account-type",
          "POST",
          subRole === null ? { pickerId } : { pickerId, subRole },
        );
        // Trust the server's answer over the local pick; fall back to the pick
        // only if the response does not name a type this app knows.
        const claimed = claim?.userType ?? "";
        finalType = isDbUserType(claimed) ? claimed : wanted;
        setExistingUserType(finalType);
      } else if (isDbUserType(currentType) && currentType !== "individual") {
        // Already had a type. Preserve it, and say so on the success screen
        // rather than showing a dashboard the account cannot open.
        setExistingUserType(currentType);
      }
      // Whatever the branch above decided, the success screen follows the
      // database, not the picker.
      setResolvedUserType(finalType);

      // ── 3. The notification preferences, where /settings reads them ────────
      // The keys are the settings tab's own (`readCategoryStates`), so the two
      // screens are answering into one row rather than two vocabularies. The
      // existing `preferences` object is read first and carried through: PUT
      // replaces the whole jsonb column, and this wizard owns one key of it.
      const currentSettings = await apiGet<UserSettingsEnvelope>("/api/v1/settings");
      await apiMutate("/api/v1/settings", "PUT", {
        marketing_emails: marketing,
        preferences: buildNotificationPreferences(
          currentSettings.settings?.preferences,
          notifs,
        ),
      });

      // ── 4. Commit: the wizard is finished ──────────────────────────────────
      await apiMutate("/api/v1/profile", "PATCH", { onboarding_completed: true });

      // ── 5. Mirror into user_metadata, for backwards compatibility only ─────
      // Nothing routes or authorizes on these values any more — `profiles` is
      // the source of truth — so a failure here is logged and not shown: it
      // costs the user nothing, and blocking a finished wizard on it would.
      // The preferences below have no profiles column today; user_metadata is
      // still the only place they are kept. The notification answers are no
      // longer among them — they have a real home now (step 3), and mirroring
      // them here would put the same question in two rows that can disagree.
      try {
        const supabase = createClient();
        const mirrored: Record<string, unknown> = {
          onboarding_completed: true,
          preferred_services: services,
          city: city || undefined,
          specialties: specialties.length > 0 ? specialties : undefined,
          has_in_house_lawyer: hasLawyer,
          phone: normalizedPhone,
        };
        // Mirror the type the database actually holds — never `admin`, which
        // this wizard must not be able to write anywhere.
        if (finalType && isAssignableUserType(finalType)) mirrored.user_type = finalType;
        await supabase.auth.updateUser({ data: mirrored });
      } catch (err) {
        console.warn("[Nzamy] onboarding metadata mirror failed:", err);
      }

      return true;
    } catch (err) {
      setSaveError(arabicError(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const totalSteps = 5;

  const sideLabels = {
    ar: ["من أنت؟", "ما تحتاجه", "جوالك ومدينتك", "الإشعارات", "مكتمل"],
    en: ["Who Are You?", "Services", "Phone & City", "Notifications", "Done"],
  };

  return (
    <div dir={dir} className="min-h-screen bg-surface font-body dark:bg-dark-bg transition-colors duration-300">
      <div className="flex min-h-screen">

        {/* ── Brand panel ── */}
        <div className="hidden md:flex md:w-[40%] lg:w-[44%] relative overflow-hidden bg-royal flex-col justify-between p-10 lg:p-14">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(200,167,98,0.12),transparent_60%)]" />
            <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid-ob" width="48" height="48" patternUnits="userSpaceOnUse">
                  <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid-ob)" />
            </svg>
          </div>

          <div className="relative z-10">
            <a href="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 border border-white/20 text-white">
                <Scales weight="bold" size={22} />
              </div>
              <span className="font-brand text-2xl font-bold text-white">{isAr ? "نظامي" : "Nezamy"}</span>
            </a>
          </div>

          <div className="relative z-10">
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
              className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 border border-white/15 text-gold"
            >
              <GraduationCap size={30} weight="duotone" />
            </motion.div>
            <h2 className="font-brand text-3xl font-bold text-white mb-3">
              {isAr ? "نخصّص تجربتك" : "Personalizing Your Experience"}
            </h2>
            <p className="text-white/60 text-sm leading-relaxed mb-10">
              {isAr
                ? "خطوات سريعة لنعرف احتياجاتك ونوفر لك أفضل تجربة قانونية."
                : "A few quick steps to understand your needs and provide you with the best legal experience."}
            </p>
            <div className="space-y-3">
              {(isAr ? sideLabels.ar : sideLabels.en).map((label, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                    i + 1 < step ? "bg-gold text-white" : i + 1 === step ? "bg-white text-royal" : "bg-white/10 text-white/30"
                  }`}>
                    {i + 1 < step ? <Check size={13} weight="bold" /> : i + 1}
                  </div>
                  <span className={`text-sm transition-colors ${i + 1 === step ? "font-semibold text-white" : i + 1 < step ? "text-white/60" : "text-white/30"}`}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* This used to read "you can skip this and edit it later in Settings".
              Both halves are now false: there is no skip, and /settings keeps its
              profile fields in localStorage only
              (src/app/settings/components/tabs/ProfileTab.tsx:172-193), so a phone
              typed there never reaches the profiles row. */}
          <div className="relative z-10 text-sm text-white/40">
            {isAr
              ? "رقم جوالك مطلوب لإكمال الإعداد، ونستخدمه للتواصل معك بخصوص طلباتك."
              : "Your mobile number is required to finish setup; we use it to contact you about your requests."}
          </div>
        </div>

        {/* ── Form panel ── */}
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-dark-border md:px-8">
            <a href="/" className="flex items-center gap-2 md:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-royal text-white">
                <Scales weight="bold" size={18} />
              </div>
              <span className="font-brand text-xl font-bold text-royal">{isAr ? "نظامي" : "Nezamy"}</span>
            </a>
            <div className="hidden md:flex text-sm text-ink-muted dark:text-gray-400">
              {isAr ? "إعداد الحساب" : "Account Setup"}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={toggleLang} className="rounded-lg border border-slate-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-royal transition-colors dark:text-gray-400 dark:hover:text-gold">
                {isAr ? "EN" : "عربي"}
              </button>
              <button onClick={toggleTheme} className="rounded-lg border border-slate-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-royal transition-colors dark:text-gray-400">
                {theme === "light" ? "🌙" : "☀️"}
              </button>
            </div>
          </div>

          <div className="flex flex-1 items-start justify-center px-5 py-10 md:py-12 md:px-12">
            <div className="w-full max-w-[480px]">
              {step < totalSteps && (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-3">
                    <StepDots step={step} total={totalSteps - 1} />
                    <span className="text-xs text-ink-faint dark:text-gray-500">
                      {isAr ? `${step} من ٤` : `${step} of 4`}
                    </span>
                  </div>
                </div>
              )}

              <AnimatePresence mode="wait">
                {step === 1 && <S1 key="1" isAr={isAr} selected={pickerId} onSelect={(id) => { setPickerId(id); }} />}
                {step === 2 && <S2 key="2" isAr={isAr} selected={services} onToggle={toggleService} userType={userType} hasLawyer={hasLawyer} onSetHasLawyer={setHasLawyer} />}
                {step === 3 && <S3 key="3" isAr={isAr} userType={userType} phone={phone} setPhone={setPhone} city={city} setCity={setCity} specialties={specialties} onToggleSpec={toggleSpec} />}
                {step === 4 && <S4 key="4" isAr={isAr} userType={userType} states={notifs} onToggle={toggleNotif} marketing={marketing} onToggleMarketing={() => setMarketing((m) => !m)} />}
                {step === 5 && (
                  <S5
                    key="5"
                    isAr={isAr}
                    // The database's answer wins over the picker's.
                    userType={resolvedUserType ?? userType}
                    hasLawyer={hasLawyer}
                    typeWasNotChanged={
                      resolvedUserType !== null && pickerId !== null && resolvedUserType !== toDbUserType(pickerId)
                    }
                  />
                )}
              </AnimatePresence>

              {step < 5 && (
                <div className="mt-8">
                  {saveError && (
                    <div
                      role="alert"
                      className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                    >
                      {saveError}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    {/* No way back to the picker for an account whose type is
                        already set: that step could not change anything, and
                        the database would refuse the change even if it tried
                        (trg_lock_user_type). */}
                    {step > 1 && !(step === 2 && existingUserType !== null) ? (
                      <button
                        onClick={() => { setSaveError(null); setStep((s) => (s - 1) as Step); }}
                        disabled={saving}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card px-5 py-3 text-sm font-medium text-ink-muted hover:border-royal/20 hover:text-royal dark:text-gray-400 dark:hover:text-gold transition-all disabled:opacity-40"
                      >
                        {isAr ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
                        {isAr ? "السابق" : "Back"}
                      </button>
                    ) : (
                      // Spacer, so the primary button keeps its place when
                      // there is nothing to go back to. There is no "Skip"
                      // control here any more either: the onboarding gate
                      // (src/proxy.ts) sends anyone without a phone straight
                      // back to this wizard, so a skip could not do what its
                      // label promised.
                      <span />
                    )}
                    <motion.button
                      whileHover={{ scale: canNext() ? 1.015 : 1 }}
                      whileTap={{ scale: canNext() ? 0.985 : 1 }}
                      onClick={async () => {
                        if (!canNext()) return;
                        if (step === 4) {
                          const saved = await persistOnboarding();
                          // A failed write keeps the user on step 4 with the
                          // Arabic reason above the button, free to retry.
                          if (!saved) return;
                        }
                        setSaveError(null);
                        setStep((s) => (s + 1) as Step);
                      }}
                      disabled={!canNext()}
                      className="flex-1 rounded-xl bg-royal py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] hover:bg-royal-light transition-all disabled:opacity-40"
                    >
                      {saving
                        ? (isAr ? "جارٍ الحفظ…" : "Saving…")
                        : step === 4
                          ? (isAr ? "إتمام الإعداد" : "Complete Setup")
                          : (isAr ? "التالي" : "Next")}
                    </motion.button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
