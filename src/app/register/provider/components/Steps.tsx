"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { normalizeSaudiMobile, sanitizePhoneDigits, saudiMobileMessage } from "@/lib/services/saudiMobile";
import {
  Check,
  EnvelopeSimple,
  Phone,
  Lock,
  Eye,
  EyeSlash,
  User,
  IdentificationCard,
  MapPin,
  UploadSimple,
  Star,
  Buildings,
  ArrowLeft,
  ArrowRight,
  Globe,
  CheckCircle,
} from "@phosphor-icons/react";
import { ProviderType, Step } from "../types";
import { providerTypes, specializations, plans } from "../data";
import { signupCountry } from "../signupMetadata";
import { BACKEND_MODE } from "@/lib/runtimeMode";
import { LawyerRegistryLookup } from "./LawyerRegistryLookup";
import { LICENCE_ACCEPT, LICENCE_MAX_BYTES, LICENCE_MIME_TYPES } from "@/lib/services/licenceUpload";
import { isFourPartName } from "@/lib/lawyerSignup/nameLicence";
import { latinLicenceInput } from "@/lib/forms/latinDigits";
import { licenceFormatIssue } from "@/lib/lawyerSignup/licenceFormat";
import { isThrowawayEmail, THROWAWAY_EMAIL_AR } from "@/lib/lawyerSignup/throwawayEmail";

export function StepIndicator({ step, total }: { step: Step; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
            i + 1 < step ? "bg-royal text-white" :
            i + 1 === step ? "bg-royal text-white shadow-[0_0_0_3px_rgba(11,61,46,0.15)]" :
            "border border-slate-200 bg-white text-ink-faint dark:border-white/10 dark:bg-dark-card dark:text-gray-500"
          }`}>
            {i + 1 < step ? <Check size={14} weight="bold" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`mx-1 h-0.5 w-6 rounded-full transition-colors ${i + 1 < step ? "bg-royal" : "bg-slate-200 dark:bg-white/10"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

const inputBase = "w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-royal focus:ring-2 focus:ring-royal/10 transition-all dark:border-white/10 dark:bg-dark-card dark:placeholder:text-gray-600 dark:focus:border-gold dark:focus:ring-gold/10";

// ─── Step 1: Provider type ────────────────────────────────────────────────────
export function Step1({ isAr, selected, onSelect }: { isAr: boolean; selected: ProviderType; onSelect: (t: ProviderType) => void }) {
  const types = isAr ? providerTypes.ar : providerTypes.en;
  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
      <h2 className="font-brand text-2xl font-bold text-ink">
        {isAr ? "ما دورك في المنصة؟" : "What is your role on the platform?"}
      </h2>
      <p className="mt-2 text-sm text-ink-muted dark:text-gray-400">
        {isAr ? "سنُعِدّ ملفك المهني وأدواتك بناءً على تخصصك" : "We'll set up your professional profile and tools based on your specialty"}
      </p>
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {types.map(type => {
          const Icon = type.icon;
          const isActive = selected === type.id;
          return (
            <motion.button
              key={type.id}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(type.id)}
              className={`relative flex items-center gap-4 rounded-2xl border p-4 text-start transition-all ${
                isActive ? `${type.borderActive} border-2 shadow-sm` :
                "border-slate-200/70 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-dark-card dark:hover:border-white/20"
              }`}
            >
              {isActive && (
                <span className="absolute top-3 end-3 flex h-5 w-5 items-center justify-center rounded-full bg-royal">
                  <Check size={11} weight="bold" className="text-white" />
                </span>
              )}
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${type.color}`}>
                <Icon size={22} weight="duotone" />
              </span>
              <div>
                <div className="text-sm font-semibold text-ink">{type.label}</div>
                <div className="mt-0.5 text-xs text-ink-muted dark:text-gray-400">{type.desc}</div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Step 2: Professional info (Type-Aware) ──────────────────────────────────
/**
 * Owner decisions ٢٠–٢١: the lawyer (and the legal consultant, a lawyer
 * account) gives a four-part name and a licence photo. Supabase mode only —
 * the demo has no server to verify anything.
 */
export function needsLicenceProofFor(providerType: ProviderType): boolean {
  return BACKEND_MODE === "supabase" && (providerType === "lawyer" || providerType === "consultant");
}

/** Four Arabic words, or exactly the name the registry lookup filled in. */
export function signupNameOk(data: Record<string, string>): boolean {
  const n = (data.registryFullName ?? "").trim();
  return isFourPartName(n) || (n !== "" && n === (data.registryNameFromLookup ?? "").trim());
}

export function Step2({ isAr, providerType, data, onChange, selectedSpecs, setSelectedSpecs, licenceFile = null, onLicenceFile }: { isAr: boolean; providerType: ProviderType; data: Record<string, string>; onChange: (k: string, v: string) => void; selectedSpecs: string[]; setSelectedSpecs: React.Dispatch<React.SetStateAction<string[]>>; licenceFile?: File | null; onLicenceFile?: (f: File | null) => void }) {
  const isFirm = providerType === "firm";
  // A consultant registers in Saudi Arabia only (owner answer ٢١٩): the
  // country is SA and its select is disabled, whatever the form holds.
  const isConsultant = providerType === "consultant";
  const country = signupCountry(providerType, data.country);
  const specs = isAr ? specializations.ar : specializations.en;

  const toggleSpec = (spec: string) => {
    setSelectedSpecs(prev => prev.includes(spec) ? prev.filter(s => s !== spec) : [...prev, spec]);
  };

  // Type-specific license label/placeholder/hint
  const licenseMap: Record<string, { label: string; ph: string; hint: string }> = {
    lawyer:     { label: isAr ? "رقم الترخيص (وزارة العدل)" : "MOJ License No.",            ph: "12345",        hint: isAr ? "رقم القيد في هيئة المحامين السعوديين"      : "Saudi Bar Association membership" },
    firm:       { label: isAr ? "السجل التجاري للمكتب"        : "Commercial Reg. No.",        ph: "XXXXXXXXXXX",  hint: isAr ? "رقم السجل التجاري من وزارة التجارة"          : "MCI Commercial Registration" },
    notary:     { label: isAr ? "رقم ترخيص التوثيق (وزارة العدل)" : "Notary License No.",   ph: "NOT-XXXXXXXX", hint: isAr ? "رقم القيد في سجل الموثقين"                : "MOJ Notaries Register" },
    tracker:    { label: isAr ? "رقم هوية المراجع الحكومي الرسمي"    : "Gov. Agent ID",              ph: "AGT-XXXXXXXX", hint: isAr ? "الرقم الصادر عن الجهة المرخّصة للتعقيب" : "Issued by licensed bailiff authority" },
    arbitrator: { label: isAr ? "رقم الترخيص (مركز التحكيم)" : "Arbitration License No.",   ph: "ARB-XXXXXXXX", hint: isAr ? "رقم القيد في قائمة المحكّمين المعتمدين"  : "Accredited arbitrators registry" },
    // Owner answer ٢١٩ names the document: «رقم الترخيص المهني». The lawyer's
    // hint (Saudi Bar membership) is not said of a consultant.
    consultant: { label: isAr ? "رقم الترخيص المهني" : "Professional Licence No.", ph: "XXXXXXXX", hint: isAr ? "ترخيص مستشار قانوني في المملكة العربية السعودية" : "A legal consultant's licence in Saudi Arabia" },
  };
  const lc = licenseMap[providerType ?? "lawyer"] ?? licenseMap.lawyer;

  // Type-specific specialisation chips
  const notarySpecs     = isAr ? ["عقود بيع","وكالات","إقرارات","عقود زواج","وصايا","توثيق تجاري"] : ["Sale Contracts","POA","Declarations","Marriage","Wills","Commercial"];
  const trackerSpecs    = isAr ? ["تسجيل عقارات","استخراج وثائق","الجوازات","الأحوال المدنية","التأمينات","وزارة العمل"] : ["Real Estate","Documents","Passports","Civil Affairs","Insurance","Labor"];
  const arbitratorSpecs = isAr ? ["تجاري","عقاري","عمالي","بنكي","شركات","دولي"] : ["Commercial","Real Estate","Labor","Banking","Corporate","International"];
  const activeSpecs = providerType === "notary" ? notarySpecs : providerType === "tracker" ? trackerSpecs : providerType === "arbitrator" ? arbitratorSpecs : specs;
  const needsLicenceProof = needsLicenceProofFor(providerType);
  const nameTouched = Boolean(data.registryFullName);
  const nameOk = signupNameOk(data);
  const [fileError, setFileError] = useState<string | null>(null);

  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
      <h2 className="font-brand text-2xl font-bold text-ink">
        {isAr ? "معلوماتك المهنية" : "Your Professional Information"}
      </h2>
      <p className="mt-2 text-sm text-ink-muted dark:text-gray-400">
        {isAr ? "هذه المعلومات ستظهر في ملفك الشخصي للعملاء" : "This information will appear in your public profile for clients"}
      </p>
      <div className="mt-8 space-y-4">
        {isFirm ? (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{isAr ? "اسم الشركة / المكتب" : "Firm / Office Name"}</label>
            <div className="relative">
              <Buildings size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
              <input type="text" placeholder={isAr ? "مكتب / شركة..." : "Firm name..."} value={data.firmName || ""} onChange={e => onChange("firmName", e.target.value)} className={`${inputBase} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`} />
            </div>
            {/* R9: the entity type. «مكتب استشارات مرخص (م١٨)» travels in the
                signup metadata (firmKindMetadata); the default is a law firm. */}
            <fieldset className="mt-3">
              <legend className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{isAr ? "نوع المنشأة" : "Entity type"}</legend>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: "law_firm", ar: "شركة / مكتب محاماة", en: "Law firm / office" },
                  { id: "consulting_office", ar: "مكتب استشارات مرخص (م١٨)", en: "Licensed consulting office (Art. 18)" },
                ] as const).map(k => {
                  const active = (data.firmKind || "law_firm") === k.id;
                  return (
                    <button key={k.id} type="button" aria-pressed={active} onClick={() => onChange("firmKind", k.id)}
                      className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${active ? "border-royal/30 bg-royal/5 text-royal dark:border-gold/30 dark:bg-royal/15 dark:text-gold" : "border-slate-200 bg-white text-ink-muted dark:border-white/10 dark:bg-dark-card dark:text-gray-400"}`}>
                      {isAr ? k.ar : k.en}
                    </button>
                  );
                })}
              </div>
              {data.firmKind === "consulting_office" && (
                <p className="mt-1.5 text-xs text-ink-muted dark:text-gray-400">{isAr ? "مكتب الاستشارات لا يترافع أمام المحاكم (المادة ١٨)." : "A consulting office does not plead in court (Art. 18)."}</p>
              )}
            </fieldset>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{isAr ? "الاسم الأول" : "First Name"}</label>
              <input type="text" placeholder={isAr ? "محمد" : "John"} value={data.firstName || ""} onChange={e => onChange("firstName", e.target.value)} className={inputBase} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{isAr ? "اسم العائلة" : "Last Name"}</label>
              <input type="text" placeholder={isAr ? "الأحمدي" : "Smith"} value={data.lastName || ""} onChange={e => onChange("lastName", e.target.value)} className={inputBase} />
            </div>
          </div>
        )}

        {/* Owner decision ٢٠: the four-part name exactly as on the licence
            (lawyer and consultant, Supabase mode). Compared with the lawyers'
            registry on the server after signup. */}
        {needsLicenceProof && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{isAr ? "الاسم الرباعي كما في الترخيص" : "Four-part name as on the licence"}</label>
            <input
              type="text"
              value={data.registryFullName || ""}
              onChange={(e) => onChange("registryFullName", e.target.value)}
              placeholder={isAr ? "الاسم الأول واسم الأب والجد والعائلة" : "First, father's, grandfather's and family name"}
              aria-invalid={nameTouched && !nameOk}
              className={`${inputBase} ${nameTouched && !nameOk ? "border-red-400 dark:border-red-500/60" : ""}`}
              maxLength={120}
            />
            {nameTouched && !nameOk && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{isAr ? "اكتب اسمك الرباعي بالعربية كما في الترخيص." : "Write your four-part name in Arabic as on the licence."}</p>
            )}
          </div>
        )}

        {/* License — type-specific */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{lc.label}</label>
          <div className="relative">
            <IdentificationCard size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            <input type="text" dir="ltr" placeholder={lc.ph} value={data.licenseNumber || ""} onChange={e => onChange("licenseNumber", latinLicenceInput(e.target.value))} className={`${inputBase} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`} />
          </div>
          <p className="mt-1 text-xs text-ink-faint dark:text-gray-500">{lc.hint}</p>
          {/* R9a (l11): an advocate's licence is digits with an optional slash. */}
          {providerType === "lawyer" && licenceFormatIssue(data.licenseNumber) && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {isAr ? licenceFormatIssue(data.licenseNumber) : "The licence number is digits only; it may include a slash (/)."}
            </p>
          )}
        </div>

        {/* Launch batch R2/R3/R5: fill the licence and the name from the
            lawyers' register. Advocates only (the register lists advocates,
            not consultants). A hint for the form, never a verification. */}
        {providerType === "lawyer" && BACKEND_MODE === "supabase" && (
          <LawyerRegistryLookup isAr={isAr} data={data} onChange={onChange} />
        )}

        {/* Owner decision ٢٠: a photo of the licence is mandatory. Kept in
            memory and uploaded to the private bucket right after the account
            is created (or on /register/provider/verify after sign-in). */}
        {needsLicenceProof && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
              {isAr ? "صورة الترخيص (إلزامية)" : "Licence photo (required)"}
            </label>
            <label
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 p-5 transition-colors ${
                licenceFile
                  ? "border-solid border-emerald-400 bg-emerald-50/60 dark:border-emerald-500/50 dark:bg-emerald-900/10"
                  : "border-dashed border-slate-200 hover:border-royal/30 hover:bg-royal/[0.02] dark:border-white/10 dark:hover:border-gold/30"
              }`}
            >
              {licenceFile ? (
                <>
                  <CheckCircle size={24} weight="fill" className="text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    {isAr ? "تم اختيار صورة الترخيص" : "Licence photo selected"}
                  </span>
                  <span className="max-w-full truncate text-xs text-ink-muted dark:text-gray-400" dir="ltr">
                    {licenceFile.name} · {Math.max(1, Math.round(licenceFile.size / 1024))} KB
                  </span>
                  <span className="text-[11px] text-ink-muted dark:text-gray-400">
                    {isAr
                      ? "تُرفع بعد إنشاء الحساب وتأكيد بريدك. اضغط هنا لتغييرها."
                      : "It is uploaded once the account is created and your e-mail confirmed. Click to change it."}
                  </span>
                </>
              ) : (
                <>
                  <UploadSimple size={22} className="text-ink-faint dark:text-gray-500" />
                  <span className="text-xs font-medium text-ink-muted dark:text-gray-400">
                    {isAr ? "اضغط لاختيار صورة الترخيص" : "Click to choose the licence photo"}
                  </span>
                  <span className="text-[10px] text-ink-faint dark:text-gray-500">JPG, PNG, WEBP, PDF — {isAr ? "حتى ٥ ميغابايت" : "up to 5 MB"}</span>
                </>
              )}
              <input
                type="file"
                accept={LICENCE_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && (f.size > LICENCE_MAX_BYTES || !(LICENCE_MIME_TYPES as readonly string[]).includes(f.type))) {
                    setFileError(isAr ? "صورة JPG أو PNG أو WEBP أو ملف PDF حتى ٥ ميغابايت." : "JPG, PNG, WEBP or PDF up to 5 MB.");
                    onLicenceFile?.(null);
                    return;
                  }
                  setFileError(null);
                  onLicenceFile?.(f);
                }}
              />
            </label>
            {fileError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fileError}</p>}
          </div>
        )}

        {/* Arbitrator: affiliated centre */}
        {providerType === "arbitrator" && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{isAr ? "مركز التحكيم المنتسب إليه" : "Affiliated Arbitration Centre"}</label>
            <select value={data.arbitrationCenter || ""} onChange={e => onChange("arbitrationCenter", e.target.value)} className={`${inputBase} cursor-pointer`}>
              <option value="">{isAr ? "اختر المركز" : "Select centre"}</option>
              {["مركز التحكيم التجاري الخليجي","مركز الرياض الإقليمي للتحكيم","هيئة التحكيم السعودية","مركز الملك عبدالعزيز للتحكيم","أخرى"].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}

        {/* Tracker: gov entity */}
        {providerType === "tracker" && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{isAr ? "الجهات الحكومية التي تعمل معها" : "Government Entities Covered"}</label>
            <select value={data.govEntity || ""} onChange={e => onChange("govEntity", e.target.value)} className={`${inputBase} cursor-pointer`}>
              <option value="">{isAr ? "اختر" : "Select"}</option>
              {["وزارة العدل","وزارة الداخلية","الأحوال المدنية","التأمينات الاجتماعية","وزارة العمل","وزارة التجارة","متعدد"].map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{isAr ? "سنوات الخبرة" : "Years of Experience"}</label>
          <select value={data.experience || ""} onChange={e => onChange("experience", e.target.value)} className={`${inputBase} cursor-pointer`}>
            <option value="">{isAr ? "اختر" : "Select"}</option>
            {[isAr ? "أقل من سنة" : "Less than 1 year", isAr ? "١-٣ سنوات" : "1-3 years", isAr ? "٣-٧ سنوات" : "3-7 years", isAr ? "٧-١٥ سنة" : "7-15 years", isAr ? "أكثر من ١٥ سنة" : "15+ years"].map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        {/* Country */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{isAr ? "البلد" : "Country"}</label>
          <div className="relative">
            <Globe size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            <select
              value={country}
              disabled={isConsultant}
              onChange={(e) => {
                onChange("country", e.target.value);
                onChange("city", ""); // Reset city when country changes
              }}
              className={`${inputBase} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"} cursor-pointer disabled:cursor-not-allowed disabled:opacity-70`}
            >
              <option value="SA">{isAr ? "المملكة العربية السعودية (SA)" : "Saudi Arabia (SA)"}</option>
              <option value="AE">{isAr ? "الإمارات العربية المتحدة (AE)" : "United Arab Emirates (AE)"}</option>
              <option value="EG">{isAr ? "جمهورية مصر العربية (EG)" : "Egypt (EG)"}</option>
              <option value="JO">{isAr ? "المملكة الأردنية الهاشمية (JO)" : "Jordan (JO)"}</option>
              <option value="KW">{isAr ? "الكويت (KW)" : "Kuwait (KW)"}</option>
              <option value="QA">{isAr ? "قطر (QA)" : "Qatar (QA)"}</option>
              <option value="BH">{isAr ? "البحرين (BH)" : "Bahrain (BH)"}</option>
              <option value="OM">{isAr ? "سلطنة عُمان (OM)" : "Oman (OM)"}</option>
              <option value="MA">{isAr ? "المملكة المغربية (MA)" : "Morocco (MA)"}</option>
            </select>
          </div>
          {isConsultant && (
            <p className="mt-1 text-xs text-ink-faint dark:text-gray-500">
              {isAr ? "المستشار القانوني: للمرخّصين في المملكة العربية السعودية" : "Legal consultant: for those licensed in Saudi Arabia"}
            </p>
          )}
        </div>

        {/* City */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{isAr ? "المدينة" : "City"}</label>
          <div className="relative">
            <MapPin size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            {country === "SA" ? (
              <select value={data.city || ""} onChange={e => onChange("city", e.target.value)} className={`${inputBase} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"} cursor-pointer`}>
                <option value="">{isAr ? "اختر المدينة" : "Select city"}</option>
                {["الرياض", "جدة", "الدمام", "مكة المكرمة", "المدينة المنورة", "الطائف", "أخرى"].map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder={isAr ? "اسم المدينة (مثال: دبي، القاهرة، عمان)" : "City name (e.g. Dubai, Cairo, Amman)"}
                value={data.city || ""}
                onChange={(e) => onChange("city", e.target.value)}
                className={`${inputBase} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`}
              />
            )}
          </div>
        </div>

        {/* Specializations — type-specific chips */}
        {providerType !== "firm" && (
        <div>
          <label className="mb-2 block text-sm font-medium text-ink dark:text-gray-300">
            {isAr ? "التخصصات (اختر ما ينطبق)" : "Specializations (select all that apply)"}
          </label>
          <div className="flex flex-wrap gap-2">
            {activeSpecs.map(spec => {
              const active = selectedSpecs.includes(spec);
              return (
                <button
                  key={spec}
                  type="button"
                  onClick={() => toggleSpec(spec)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                    active ? "border-royal/30 bg-royal/5 text-royal dark:border-gold/30 dark:bg-gold/10 dark:text-gold" :
                    "border-slate-200 bg-white text-ink-muted hover:border-royal/20 dark:border-white/10 dark:bg-dark-card dark:text-gray-400"
                  }`}
                >
                  {spec}
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

// ─── Step 3: Account & documents ─────────────────────────────────────────────
export function Step3({ isAr, data, onChange, providerType = null }: { isAr: boolean; data: Record<string, string>; onChange: (k: string, v: string) => void; providerType?: ProviderType }) {
  // Owner decision ٢١: no throwaway e-mail domains (the server refuses them too).
  const throwaway = isThrowawayEmail(data.email);
  const [show, setShow] = useState(false);
  const phoneTouched = Boolean(data.phone);
  const phoneResult = normalizeSaudiMobile(data.phone);
  const phoneValid = phoneResult.ok;

  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
      <h2 className="font-brand text-2xl font-bold text-ink">
        {isAr ? "بيانات الحساب والوثائق" : "Account & Documents"}
      </h2>
      <p className="mt-2 text-sm text-ink-muted dark:text-gray-400">
        {isAr ? "نحتاج التحقق من هويتك المهنية لضمان الجودة" : "We need to verify your professional identity to ensure quality"}
      </p>
      <div className="mt-8 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{isAr ? "البريد الإلكتروني المهني" : "Professional Email"}</label>
          <div className="relative">
            <EnvelopeSimple size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            <input type="email" dir="ltr" placeholder="name@firm.com" value={data.email || ""} onChange={e => onChange("email", e.target.value)} aria-invalid={throwaway} className={`${inputBase} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"} ${throwaway ? "border-red-400 dark:border-red-500/60" : ""}`} />
          </div>
          {throwaway && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{isAr ? THROWAWAY_EMAIL_AR : "This is a throwaway e-mail domain. Use a permanent address."}</p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{isAr ? "رقم الجوال" : "Phone Number"}</label>
          <div className="relative">
            <Phone size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              dir="ltr"
              placeholder="05XXXXXXXX"
              value={data.phone || ""}
              onChange={(e) => onChange("phone", sanitizePhoneDigits(e.target.value))}
              aria-invalid={phoneTouched && !phoneValid}
              className={`${inputBase} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"} ${phoneTouched && !phoneValid ? "border-red-400 dark:border-red-500/60" : ""}`}
            />
          </div>
          <p className={`mt-1.5 text-xs ${phoneTouched && !phoneValid ? "text-red-600 dark:text-red-400" : "text-ink-faint dark:text-gray-500"}`}>
            {phoneTouched && !phoneValid
              ? (isAr ? saudiMobileMessage(phoneResult) : "Invalid mobile number — e.g. 0512345678")
              : (isAr ? "أرقام فقط، ويُحفظ بصيغة دولية صحيحة" : "Digits only; stored in valid international format")}
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{isAr ? "كلمة المرور" : "Password"}</label>
          <div className="relative">
            <Lock size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            <input type={show ? "text" : "password"} placeholder={isAr ? "كلمة مرور قوية" : "Strong password"} value={data.password || ""} onChange={e => onChange("password", e.target.value)} className={`${inputBase} ${isAr ? "pr-10 pl-10" : "pl-10 pr-10"}`} />
            <button type="button" onClick={() => setShow(!show)} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-muted dark:text-gray-500 dark:hover:text-gray-300 ${isAr ? "left-3.5" : "right-3.5"}`}>
              {show ? <EyeSlash size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Document upload placeholder — not for the lawyer / consultant,
            whose licence photo is a real upload on step 2 (owner ٢٠). */}
        {!needsLicenceProofFor(providerType) && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
            {isAr ? "رفع شهادة الترخيص / الهوية المهنية" : "Upload License / Professional ID"}
          </label>
          <label className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 transition-colors hover:border-royal/30 hover:bg-royal/[0.02] dark:hover:border-gold/30 ${
            "border-slate-200 dark:border-white/10"
          }`}>
            <UploadSimple size={24} className="text-ink-faint dark:text-gray-500" />
            <span className="text-xs font-medium text-ink-muted dark:text-gray-400">
              {isAr ? "اسحب الملف هنا أو اضغط للرفع" : "Drag file here or click to upload"}
            </span>
            <span className="text-[10px] text-ink-faint dark:text-gray-500">PDF, JPG, PNG — {isAr ? "حتى ٥ ميجا" : "Up to 5MB"}</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              multiple
              className="hidden"
              onChange={(e) => {
                const names = Array.from(e.target.files ?? []).map((f) => f.name);
                onChange("verification_docs", names.join(", "));
              }}
            />
          </label>
          {data.verification_docs && (
            <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {isAr ? "الملفات المختارة (لم تُرفع بعد): " : "Selected (not uploaded yet): "}
              {data.verification_docs}
            </p>
          )}
          <p className="mt-2 text-xs text-ink-faint dark:text-gray-500">
            {isAr ? "لا تُرفع هذه الملفات الآن؛ يطلب منك فريق نظامي الوثائق بعد إنشاء الحساب." : "These files are not uploaded now; the Nezamy team will ask you for the documents after sign-up."}
          </p>
        </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Step 4: Plan selection ───────────────────────────────────────────────────
export function Step4({ isAr, selectedPlan, onSelect }: { isAr: boolean; selectedPlan: string; onSelect: (id: string) => void }) {
  const planList = isAr ? plans.ar : plans.en;
  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
      <h2 className="font-brand text-2xl font-bold text-ink">
        {isAr ? "اختر باقتك" : "Choose Your Plan"}
      </h2>
      <p className="mt-2 text-sm text-ink-muted dark:text-gray-400">
        {isAr ? "يمكنك الترقية أو التخفيض في أي وقت" : "You can upgrade or downgrade at any time"}
      </p>
      <div className="mt-6 space-y-3">
        {planList.map(plan => {
          const isActive = selectedPlan === plan.id;
          return (
            <motion.button
              key={plan.id}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onSelect(plan.id)}
              className={`relative w-full overflow-hidden rounded-2xl border p-5 text-start transition-all ${
                isActive
                  ? plan.highlighted ? "border-royal/30 bg-royal shadow-[0_8px_24px_-8px_rgba(11,61,46,0.3)]" : "border-royal/30 bg-royal/5"
                  : "border-slate-200/70 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-dark-card"
              }`}
            >
              {/* No «الأكثر طلباً» badge on the highlighted plan (owner, Q164,
                  2026-10-03): no subscription data supports a popularity
                  claim. `highlighted` still drives the active-state styling. */}
              {isActive && !plan.highlighted && (
                <span className="absolute top-3 end-3 flex h-5 w-5 items-center justify-center rounded-full bg-royal">
                  <Check size={11} weight="bold" className="text-white" />
                </span>
              )}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className={`text-sm font-bold ${isActive && plan.highlighted ? "text-white" : "text-ink"}`}>{plan.name}</div>
                  <div className={`mt-0.5 text-xs ${isActive && plan.highlighted ? "text-white/70" : "text-ink-muted dark:text-gray-400"}`}>{plan.desc}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {plan.features.slice(0, 3).map(f => (
                      <span key={f} className={`flex items-center gap-1 text-xs ${isActive && plan.highlighted ? "text-white/80" : "text-ink-muted dark:text-gray-400"}`}>
                        <Check size={10} weight="bold" className={isActive && plan.highlighted ? "text-gold" : "text-royal dark:text-gold"} />
                        {f}
                      </span>
                    ))}
                    {plan.features.length > 3 && (
                      <span className={`text-xs ${isActive && plan.highlighted ? "text-white/60" : "text-ink-faint dark:text-gray-500"}`}>
                        +{plan.features.length - 3} {isAr ? "مزايا" : "more"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-end">
                  <div className={`font-brand text-xl font-extrabold ${isActive && plan.highlighted ? "text-white" : "text-royal dark:text-gold"}`}>{plan.price}</div>
                  {plan.period && <div className={`text-[10px] ${isActive && plan.highlighted ? "text-white/60" : "text-ink-faint dark:text-gray-500"}`}>{plan.period}</div>}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-ink-faint dark:text-gray-500">
        {isAr ? "لا يلزم بطاقة ائتمانية للباقة المجانية" : "No credit card required for the free plan"}
      </p>
    </motion.div>
  );
}

// ─── Step 5: Success ──────────────────────────────────────────────────────────
export function Step5({ isAr, providerType, selectedPlan, verificationOwnsStatus = false }: { isAr: boolean; providerType: ProviderType; selectedPlan: string; verificationOwnsStatus?: boolean }) {
  const typeLabel = {
    lawyer: isAr ? "محامي" : "Lawyer",
    firm: isAr ? "شركة محاماة" : "Law Firm",
    notary: isAr ? "موثّق" : "Notary",
    tracker: isAr ? "مراجع حكومي" : "Gov. Agent",
    arbitrator: isAr ? "محكّم" : "Arbitrator",
    consultant: isAr ? "مستشار قانوني" : "Legal Consultant",
    null: "",
  }[providerType ?? "null"];

  const planLabel = {
    lite: isAr ? "نظامي لايت" : "Nezamy Lite",
    ai: isAr ? "ذكاء نظامي" : "Nezamy AI",
    pro: isAr ? "نظامي برو" : "Nezamy Pro",
  }[selectedPlan] ?? selectedPlan;

  // Smart redirect: go to the correct dashboard based on provider type
  const dashboardHref: Record<string, string> = {
    lawyer:     "/dashboard/lawyer",
    firm:       "/dashboard/firm",
    notary:     "/dashboard/provider",
    tracker:    "/dashboard/provider",
    arbitrator: "/dashboard/provider",
    // A consultant is a lawyer account (practice_kind 'consultant').
    consultant: "/dashboard/lawyer",
  };
  const href = dashboardHref[providerType ?? "lawyer"] ?? "/dashboard/provider";

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
        className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-royal shadow-[0_12px_32px_-8px_rgba(11,61,46,0.4)]"
      >
        <Check size={36} weight="bold" className="text-white" />
      </motion.div>

      <h2 className="font-brand text-2xl font-bold text-ink">
        {verificationOwnsStatus
          ? (isAr ? "تم إنشاء حسابك" : "Your account is created")
          : (isAr ? "طلبك قيد المراجعة!" : "Your Application Is Under Review!")}
      </h2>
      <p className="mt-3 text-sm text-ink-muted dark:text-gray-400">
        {verificationOwnsStatus
          ? (isAr
              ? `سجّلنا حسابك كـ${typeLabel} بباقة ${planLabel}. أكمل توثيق ترخيصك أدناه.`
              : `Your ${typeLabel} account with the ${planLabel} plan is created. Finish verifying your licence below.`)
          : (isAr
              ? `تم استلام طلبك كـ${typeLabel} بباقة ${planLabel}. سيتم مراجعة وثائقك خلال ٢٤ ساعة وإشعارك على بريدك.`
              : `Your application as ${typeLabel} with the ${planLabel} plan has been received. Your documents will be reviewed within 24 hours.`)}
      </p>

      {/* Review steps — the verification panel below owns the status for a
          lawyer with a session (owner ٢٠–٢١), so they are not shown then. */}
      {!verificationOwnsStatus && (
      <div className="my-8 space-y-3 text-start">
        {[
          { icon: IdentificationCard, labelAr: "مراجعة الوثائق — ٢٤ ساعة", labelEn: "Document review — 24 hours", done: false },
          { icon: User, labelAr: "تفعيل الملف المهني", labelEn: "Professional profile activation", done: false },
          { icon: Star, labelAr: "البدء في استقبال الطلبات", labelEn: "Start receiving client requests", done: false },
        ].map((item, i) => {
          const Icon = item.icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.12 }}
              className="flex items-center gap-4 rounded-2xl border border-slate-200/50 bg-white p-4 dark:border-white/10 dark:bg-dark-card">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-royal/5 text-royal dark:bg-royal/20">
                <Icon size={20} weight="duotone" />
              </span>
              <div className="flex-1 text-sm font-medium text-ink">{isAr ? item.labelAr : item.labelEn}</div>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                {isAr ? "قريباً" : "Soon"}
              </span>
            </motion.div>
          );
        })}
      </div>
      )}

      <motion.a href={href} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
        className="inline-flex items-center gap-2 rounded-2xl bg-royal px-8 py-4 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)]">
        {isAr ? "انتقل للوحة التحكم" : "Go to Dashboard"}
        {isAr ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
      </motion.a>

      {/* File 15 row 24 (l9): the founder offer right after signup. Advocate
          lawyers only (the consultant is outside it); /founder itself says
          whether the campaign is open and what a pending licence means. */}
      {providerType === "lawyer" && (
        <div className="mt-4">
          <a href="/founder" className="text-sm font-semibold text-royal underline-offset-4 hover:underline dark:text-[#C8A762]">
            {isAr ? "تعرّف على العضوية المؤسِّسة للمحامين" : "See the founding membership for lawyers"}
          </a>
        </div>
      )}
    </motion.div>
  );
}
