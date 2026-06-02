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
  Briefcase,
  GraduationCap,
  Users,
  ChartLine,
  Shield,
  CheckCircle,
  Storefront,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

type UserType = "individual" | "company" | "micro" | "government" | "ngo" | "lawyer" | "firm" | null;
type Step = 1 | 2 | 3 | 4 | 5;

// ── Step 1: confirm user type ──────────────────────────────────────────────────

const userTypeOptions = {
  ar: [
    { id: "individual", icon: User,       label: "فرد",             desc: "مواطن أو مقيم يبحث عن خدمة قانونية" },
    { id: "company",    icon: Buildings,  label: "شركة / مؤسسة",   desc: "شركة تجارية أو مؤسسة خاصة" },
    { id: "micro",      icon: Storefront, label: "مؤسسة / منشأة",    desc: "محل تجاري أو مؤسسة فردية أو مطعم" },
    { id: "government", icon: Bank,       label: "جهة حكومية",      desc: "وزارة أو هيئة أو مؤسسة حكومية" },
    { id: "ngo",        icon: Handshake,  label: "جمعية / منظمة",   desc: "منظمة غير ربحية أو جمعية أهلية" },
    { id: "lawyer",     icon: Gavel,      label: "محامي / مستشار",   desc: "ممارس قانوني مرخّص" },
    { id: "firm",       icon: Scales,     label: "شركة محاماة",     desc: "مكتب أو شركة محاماة" },
  ],
  en: [
    { id: "individual", icon: User,       label: "Individual",           desc: "Citizen or resident seeking legal service" },
    { id: "company",    icon: Buildings,  label: "Company / Enterprise", desc: "A commercial or private entity" },
    { id: "micro",      icon: Storefront, label: "Small Business",       desc: "Shop, sole proprietorship, or restaurant" },
    { id: "government", icon: Bank,       label: "Government Entity",    desc: "Ministry, authority, or public body" },
    { id: "ngo",        icon: Handshake,  label: "Association / NGO",    desc: "Non-profit or charitable organization" },
    { id: "lawyer",     icon: Gavel,      label: "Lawyer / Consultant",  desc: "Licensed legal practitioner" },
    { id: "firm",       icon: Scales,     label: "Law Firm",             desc: "Legal office or firm" },
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
const notifOptions = {
  ar: [
    { id: "case",   icon: Gavel,    label: "تحديثات القضايا",       desc: "عند تغيير حالة قضية" },
    { id: "lawyer", icon: Star,     label: "محامون موصى بهم",        desc: "عروض من المحامين" },
    { id: "law",    icon: FileText, label: "أنظمة ولوائح جديدة",    desc: "تغييرات تشريعية" },
    { id: "promo",  icon: Bell,     label: "عروض وخصومات",           desc: "باقات مخفّضة" },
  ],
  en: [
    { id: "case",   icon: Gavel,    label: "Case Updates",         desc: "When a case status changes" },
    { id: "lawyer", icon: Star,     label: "Recommended Lawyers",  desc: "Offers from lawyers" },
    { id: "law",    icon: FileText, label: "New Laws & Regulations", desc: "Legislative changes" },
    { id: "promo",  icon: Bell,     label: "Offers & Discounts",   desc: "Discounted packages" },
  ],
};

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
  selected: UserType;
  onSelect: (t: UserType) => void;
}) {
  const opts = isAr ? userTypeOptions.ar : userTypeOptions.en;
  return (
    <motion.div key="s1" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ type: "spring", stiffness: 280, damping: 26 }}>
      <h2 className="font-brand text-2xl font-bold text-ink dark:text-gray-100 mb-1">
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
              onClick={() => onSelect(o.id as UserType)}
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
                <div className="text-sm font-semibold text-ink dark:text-gray-100">{o.label}</div>
                <div className="text-xs text-ink-muted dark:text-gray-400 mt-0.5">{o.desc}</div>
              </div>
            </motion.button>
          );
        })}
      </div>
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
  const showLawyerQ = userType === "company" || userType === "micro";
  return (
    <motion.div key="s2" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ type: "spring", stiffness: 280, damping: 26 }}>
      <h2 className="font-brand text-2xl font-bold text-ink dark:text-gray-100 mb-1">
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
                <div className="text-sm font-semibold text-ink dark:text-gray-100">{o.label}</div>
                <div className="text-xs text-ink-muted dark:text-gray-400">{o.desc}</div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* ── Lawyer question for Company / Micro ── */}
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
              <div className="text-sm font-semibold text-ink dark:text-gray-100">
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

// ── Step 3: location + specialty ─────────────────────────────────────────────
function S3({
  isAr,
  userType,
  city,
  setCity,
  specialties,
  onToggleSpec,
}: {
  isAr: boolean;
  userType: UserType;
  city: string;
  setCity: (c: string) => void;
  specialties: string[];
  onToggleSpec: (s: string) => void;
}) {
  const isLegal = userType === "lawyer" || userType === "firm";
  const inputCls = "w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-ink outline-none focus:border-royal focus:ring-2 focus:ring-royal/10 transition-all dark:border-white/10 dark:bg-dark-card dark:text-gray-200 dark:focus:border-gold dark:focus:ring-gold/10";
  return (
    <motion.div key="s3" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ type: "spring", stiffness: 280, damping: 26 }}>
      <h2 className="font-brand text-2xl font-bold text-ink dark:text-gray-100 mb-1">
        {isAr ? (isLegal ? "تخصصاتك وموقعك" : "أين تتواجد؟") : (isLegal ? "Your Specialties & Location" : "Where are you located?")}
      </h2>
      <p className="text-sm text-ink-muted dark:text-gray-400 mb-7">
        {isAr ? "لتوصيل الخدمات المناسبة لك" : "To connect you with the right services"}
      </p>
      <div className="space-y-5">
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
  selected,
  onToggle,
}: {
  isAr: boolean;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const opts = isAr ? notifOptions.ar : notifOptions.en;
  return (
    <motion.div key="s4" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ type: "spring", stiffness: 280, damping: 26 }}>
      <h2 className="font-brand text-2xl font-bold text-ink dark:text-gray-100 mb-1">
        {isAr ? "أي إشعارات تريد؟" : "Which notifications do you want?"}
      </h2>
      <p className="text-sm text-ink-muted dark:text-gray-400 mb-7">
        {isAr ? "لن نزعجك — فقط ما يهمك" : "We won't spam you — only what matters to you"}
      </p>
      <div className="space-y-3">
        {opts.map((o) => {
          const Icon = o.icon;
          const active = selected.includes(o.id);
          return (
            <motion.button
              key={o.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => onToggle(o.id)}
              className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-start transition-all ${
                active ? "border-royal/30 bg-royal/5 dark:border-gold/30 dark:bg-royal/12" : "border-slate-200/70 bg-white dark:border-white/10 dark:bg-dark-card"
              }`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? "bg-royal/10 text-royal dark:bg-gold/15 dark:text-gold" : "bg-slate-100 text-ink-faint dark:bg-white/10 dark:text-gray-400"}`}>
                <Icon size={20} weight="duotone" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-ink dark:text-gray-100">{o.label}</div>
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
function S5({ isAr, userType, hasLawyer }: { isAr: boolean; userType: UserType; hasLawyer: boolean | null }) {
  // Smart routing: each entity type goes to the correct dashboard
  const getDashLink = () => {
    switch (userType) {
      case "lawyer":     return "/dashboard/lawyer";
      case "firm":       return "/dashboard/firm";
      case "company":    return hasLawyer ? "/dashboard/business?mode=erp" : "/dashboard/business?mode=service";
      case "micro":      return hasLawyer ? "/dashboard/business?mode=erp&tier=micro" : "/dashboard/micro";
      case "individual": return "/dashboard/client";
      case "government": return "/dashboard/business";
      case "ngo":        return "/dashboard/client";
      default:           return "/dashboard/client";
    }
  };
  const dashLink = getDashLink();
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
      <h2 className="font-brand text-2xl font-bold text-ink dark:text-gray-100 mb-2">
        {isAr ? "حسابك جاهز تماماً!" : "Your Account Is All Set!"}
      </h2>
      <p className="text-sm text-ink-muted dark:text-gray-400 max-w-[280px] mx-auto mb-8">
        {isAr ? "خصّصنا تجربتك. الآن استكشف خدمات نظامي." : "We've personalized your experience. Now explore Nezamy's services."}
      </p>
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
              <span className="flex-1 text-sm font-medium text-ink dark:text-gray-100">{isAr ? link.ar : link.en}</span>
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
  const [userType, setUserType] = useState<UserType>(null);
  const [services, setServices] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [notifs, setNotifs] = useState<string[]>(["case"]);
  const [hasLawyer, setHasLawyer] = useState<boolean | null>(null);

  // Pre-fill from URL param and skip Step 1 if type is already set
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("type") as UserType;
    if (t && ["individual", "company", "micro", "government", "ngo", "lawyer", "firm"].includes(t)) {
      setUserType(t);
      setStep(2);
    }
  }, []);

  const toggleService = (id: string) =>
    setServices((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);

  const toggleSpec = (s: string) =>
    setSpecialties((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const toggleNotif = (id: string) =>
    setNotifs((prev) => prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]);

  const canNext = () => {
    if (step === 1) return userType !== null;
    if (step === 2) return services.length > 0;
    if (step === 3) return city.length > 0;
    return true;
  };

  const totalSteps = 5;

  const sideLabels = {
    ar: ["من أنت؟", "ما تحتاجه", "مدينتك", "الإشعارات", "مكتمل"],
    en: ["Who Are You?", "Services", "Location", "Notifications", "Done"],
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

          <div className="relative z-10 text-sm text-white/40">
            {isAr ? "يمكنك تخطي هذا وتعديله لاحقاً من الإعدادات" : "You can skip this and edit it later in Settings"}
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
                {step === 1 && <S1 key="1" isAr={isAr} selected={userType} onSelect={(t) => { setUserType(t); }} />}
                {step === 2 && <S2 key="2" isAr={isAr} selected={services} onToggle={toggleService} userType={userType} hasLawyer={hasLawyer} onSetHasLawyer={setHasLawyer} />}
                {step === 3 && <S3 key="3" isAr={isAr} userType={userType} city={city} setCity={setCity} specialties={specialties} onToggleSpec={toggleSpec} />}
                {step === 4 && <S4 key="4" isAr={isAr} selected={notifs} onToggle={toggleNotif} />}
                {step === 5 && <S5 key="5" isAr={isAr} userType={userType} hasLawyer={hasLawyer} />}
              </AnimatePresence>

              {step < 5 && (
                <div className="mt-8 flex items-center justify-between gap-3">
                  {step > 1 ? (
                    <button
                      onClick={() => setStep((s) => (s - 1) as Step)}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card px-5 py-3 text-sm font-medium text-ink-muted hover:border-royal/20 hover:text-royal dark:text-gray-400 dark:hover:text-gold transition-all"
                    >
                      {isAr ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
                      {isAr ? "السابق" : "Back"}
                    </button>
                  ) : (
                    <button
                      onClick={() => setStep(5)}
                      className="text-sm text-ink-faint hover:text-ink-muted dark:text-gray-600 dark:hover:text-gray-400 transition-colors"
                    >
                      {isAr ? "تخطّى" : "Skip"}
                    </button>
                  )}
                  <motion.button
                    whileHover={{ scale: canNext() ? 1.015 : 1 }}
                    whileTap={{ scale: canNext() ? 0.985 : 1 }}
                    onClick={() => { if (canNext()) setStep((s) => (s + 1) as Step); }}
                    disabled={!canNext()}
                    className="flex-1 rounded-xl bg-royal py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] hover:bg-royal-light transition-all disabled:opacity-40"
                  >
                    {step === 4 ? (isAr ? "إتمام الإعداد" : "Complete Setup") : (isAr ? "التالي" : "Next")}
                  </motion.button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
