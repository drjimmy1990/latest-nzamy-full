"use client";

import { motion } from "framer-motion";
import { useState } from "react";
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
} from "@phosphor-icons/react";
import { ProviderType, Step } from "../types";
import { providerTypes, specializations, plans } from "../data";

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

const inputBase = "w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-royal focus:ring-2 focus:ring-royal/10 transition-all dark:border-white/10 dark:bg-dark-card dark:text-gray-200 dark:placeholder:text-gray-600 dark:focus:border-gold dark:focus:ring-gold/10";

// ─── Step 1: Provider type ────────────────────────────────────────────────────
export function Step1({ isAr, selected, onSelect }: { isAr: boolean; selected: ProviderType; onSelect: (t: ProviderType) => void }) {
  const types = isAr ? providerTypes.ar : providerTypes.en;
  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
      <h2 className="font-brand text-2xl font-bold text-ink dark:text-gray-100">
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
                <div className="text-sm font-semibold text-ink dark:text-gray-100">{type.label}</div>
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
export function Step2({ isAr, providerType, data, onChange, selectedSpecs, setSelectedSpecs }: { isAr: boolean; providerType: ProviderType; data: Record<string, string>; onChange: (k: string, v: string) => void; selectedSpecs: string[]; setSelectedSpecs: React.Dispatch<React.SetStateAction<string[]>> }) {
  const isFirm = providerType === "firm";
  const specs = isAr ? specializations.ar : specializations.en;

  const toggleSpec = (spec: string) => {
    setSelectedSpecs(prev => prev.includes(spec) ? prev.filter(s => s !== spec) : [...prev, spec]);
  };

  // Type-specific license label/placeholder/hint
  const licenseMap: Record<string, { label: string; ph: string; hint: string }> = {
    lawyer:     { label: isAr ? "رقم الترخيص (وزارة العدل)" : "MOJ License No.",            ph: "MOJ-XXXXXXXX", hint: isAr ? "رقم القيد في هيئة المحامين السعوديين"      : "Saudi Bar Association membership" },
    firm:       { label: isAr ? "السجل التجاري للمكتب"        : "Commercial Reg. No.",        ph: "XXXXXXXXXXX",  hint: isAr ? "رقم السجل التجاري من وزارة التجارة"          : "MCI Commercial Registration" },
    notary:     { label: isAr ? "رقم ترخيص التوثيق (وزارة العدل)" : "Notary License No.",   ph: "NOT-XXXXXXXX", hint: isAr ? "رقم القيد في سجل الموثقين"                : "MOJ Notaries Register" },
    tracker:    { label: isAr ? "رقم هوية المعقّب الرسمي"    : "Gov. Agent ID",              ph: "AGT-XXXXXXXX", hint: isAr ? "الرقم الصادر عن الجهة المرخّصة للتعقيب" : "Issued by licensed bailiff authority" },
    arbitrator: { label: isAr ? "رقم الترخيص (مركز التحكيم)" : "Arbitration License No.",   ph: "ARB-XXXXXXXX", hint: isAr ? "رقم القيد في قائمة المحكّمين المعتمدين"  : "Accredited arbitrators registry" },
  };
  const lc = licenseMap[providerType ?? "lawyer"] ?? licenseMap.lawyer;

  // Type-specific specialisation chips
  const notarySpecs     = isAr ? ["عقود بيع","وكالات","إقرارات","عقود زواج","وصايا","توثيق تجاري"] : ["Sale Contracts","POA","Declarations","Marriage","Wills","Commercial"];
  const trackerSpecs    = isAr ? ["تسجيل عقارات","استخراج وثائق","الجوازات","الأحوال المدنية","التأمينات","وزارة العمل"] : ["Real Estate","Documents","Passports","Civil Affairs","Insurance","Labor"];
  const arbitratorSpecs = isAr ? ["تجاري","عقاري","عمالي","بنكي","شركات","دولي"] : ["Commercial","Real Estate","Labor","Banking","Corporate","International"];
  const activeSpecs = providerType === "notary" ? notarySpecs : providerType === "tracker" ? trackerSpecs : providerType === "arbitrator" ? arbitratorSpecs : specs;

  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
      <h2 className="font-brand text-2xl font-bold text-ink dark:text-gray-100">
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

        {/* License — type-specific */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{lc.label}</label>
          <div className="relative">
            <IdentificationCard size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            <input type="text" dir="ltr" placeholder={lc.ph} value={data.licenseNumber || ""} onChange={e => onChange("licenseNumber", e.target.value)} className={`${inputBase} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`} />
          </div>
          <p className="mt-1 text-xs text-ink-faint dark:text-gray-500">{lc.hint}</p>
        </div>

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
              value={data.country || "SA"}
              onChange={(e) => {
                onChange("country", e.target.value);
                onChange("city", ""); // Reset city when country changes
              }}
              className={`${inputBase} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"} cursor-pointer`}
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
        </div>

        {/* City */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{isAr ? "المدينة" : "City"}</label>
          <div className="relative">
            <MapPin size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            {!data.country || data.country === "SA" ? (
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
export function Step3({ isAr, data, onChange }: { isAr: boolean; data: Record<string, string>; onChange: (k: string, v: string) => void }) {
  const [show, setShow] = useState(false);

  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
      <h2 className="font-brand text-2xl font-bold text-ink dark:text-gray-100">
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
            <input type="email" dir="ltr" placeholder="name@firm.com" value={data.email || ""} onChange={e => onChange("email", e.target.value)} className={`${inputBase} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{isAr ? "رقم الجوال" : "Phone Number"}</label>
          <div className="relative">
            <Phone size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            <input type="tel" dir="ltr" placeholder="05XXXXXXXX" value={data.phone || ""} onChange={e => onChange("phone", e.target.value)} className={`${inputBase} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`} />
          </div>
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

        {/* Document upload placeholder */}
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
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" />
          </label>
          <p className="mt-2 text-xs text-ink-faint dark:text-gray-500">
            {isAr ? "سيتم مراجعة الوثائق خلال ٢٤ ساعة من قِبل فريق نظامي" : "Documents will be reviewed within 24 hours by the Nezamy team"}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Step 4: Plan selection ───────────────────────────────────────────────────
export function Step4({ isAr, selectedPlan, onSelect }: { isAr: boolean; selectedPlan: string; onSelect: (id: string) => void }) {
  const planList = isAr ? plans.ar : plans.en;
  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
      <h2 className="font-brand text-2xl font-bold text-ink dark:text-gray-100">
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
              {plan.highlighted && !isActive && (
                <span className="absolute top-3 end-3 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-white">
                  {isAr ? "الأكثر طلباً" : "Most Popular"}
                </span>
              )}
              {isActive && !plan.highlighted && (
                <span className="absolute top-3 end-3 flex h-5 w-5 items-center justify-center rounded-full bg-royal">
                  <Check size={11} weight="bold" className="text-white" />
                </span>
              )}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className={`text-sm font-bold ${isActive && plan.highlighted ? "text-white" : "text-ink dark:text-gray-100"}`}>{plan.name}</div>
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
export function Step5({ isAr, providerType, selectedPlan }: { isAr: boolean; providerType: ProviderType; selectedPlan: string }) {
  const typeLabel = {
    lawyer: isAr ? "محامي" : "Lawyer",
    firm: isAr ? "شركة محاماة" : "Law Firm",
    notary: isAr ? "موثّق" : "Notary",
    tracker: isAr ? "معقّب" : "Gov. Agent",
    arbitrator: isAr ? "محكّم" : "Arbitrator",
    null: "",
  }[providerType ?? "null"];

  const planLabel = {
    lite: isAr ? "نظامي لايت" : "Nezamy Lite",
    ai: isAr ? "نظامي AI" : "Nezamy AI",
    pro: isAr ? "نظامي برو" : "Nezamy Pro",
  }[selectedPlan] ?? selectedPlan;

  // Smart redirect: go to the correct dashboard based on provider type
  const dashboardHref: Record<string, string> = {
    lawyer:     "/dashboard/lawyer",
    firm:       "/dashboard/firm",
    notary:     "/dashboard/provider",
    tracker:    "/dashboard/provider",
    arbitrator: "/dashboard/provider",
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

      <h2 className="font-brand text-2xl font-bold text-ink dark:text-gray-100">
        {isAr ? "طلبك قيد المراجعة!" : "Your Application Is Under Review!"}
      </h2>
      <p className="mt-3 text-sm text-ink-muted dark:text-gray-400">
        {isAr
          ? `تم استلام طلبك كـ${typeLabel} بباقة ${planLabel}. سيتم مراجعة وثائقك خلال ٢٤ ساعة وإشعارك على بريدك.`
          : `Your application as ${typeLabel} with the ${planLabel} plan has been received. Your documents will be reviewed within 24 hours.`}
      </p>

      {/* Review steps */}
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
              <div className="flex-1 text-sm font-medium text-ink dark:text-gray-100">{isAr ? item.labelAr : item.labelEn}</div>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                {isAr ? "قريباً" : "Soon"}
              </span>
            </motion.div>
          );
        })}
      </div>

      <motion.a href={href} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
        className="inline-flex items-center gap-2 rounded-2xl bg-royal px-8 py-4 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)]">
        {isAr ? "انتقل للوحة التحكم" : "Go to Dashboard"}
        {isAr ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
      </motion.a>
    </motion.div>
  );
}
