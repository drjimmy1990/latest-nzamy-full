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
  Scales,
  Shield,
  Star,
  IdentificationCard,
  MapPin,
  Buildings,
  ArrowLeft,
  Globe,
} from "@phosphor-icons/react";
import { ClientType, Step } from "../types";
import { clientTypes } from "../data";

export function StepIndicator({ step, total }: { step: Step; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center">
          <motion.div
            animate={{
              scale: i + 1 === step ? 1 : 1,
              backgroundColor: i + 1 < step ? "#0B3D2E" : i + 1 === step ? "#0B3D2E" : undefined,
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
              i + 1 < step
                ? "bg-royal text-white"
                : i + 1 === step
                ? "bg-royal text-white shadow-[0_0_0_3px_rgba(11,61,46,0.15)]"
                : "border border-slate-200 bg-white text-ink-faint dark:border-white/10 dark:bg-dark-card dark:text-gray-500"
            }`}
          >
            {i + 1 < step ? <Check size={14} weight="bold" /> : i + 1}
          </motion.div>
          {i < total - 1 && (
            <div className={`mx-1 h-0.5 w-8 rounded-full transition-colors ${i + 1 < step ? "bg-royal" : "bg-slate-200 dark:bg-white/10"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// Step 1: Client type
export function Step1({
  isAr,
  selected,
  onSelect,
}: {
  isAr: boolean;
  selected: ClientType;
  onSelect: (t: ClientType) => void;
}) {
  const types = isAr ? clientTypes.ar : clientTypes.en;
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      <h2 className="font-brand text-2xl font-bold text-ink dark:text-gray-100">
        {isAr ? "كيف تصف نفسك؟" : "How would you describe yourself?"}
      </h2>
      <p className="mt-2 text-sm text-ink-muted dark:text-gray-400">
        {isAr ? "سنخصّص تجربتك بناءً على اختيارك" : "We'll personalize your experience based on your selection"}
      </p>
      <div className="mt-8 grid grid-cols-2 gap-3">
        {types.map((type) => {
          const Icon = type.icon;
          const isActive = selected === type.id;
          return (
            <motion.button
              key={type.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(type.id)}
              className={`relative flex flex-col items-start gap-3 rounded-2xl border p-5 text-start transition-all ${
                isActive
                  ? `${type.borderActive} border-2 shadow-sm`
                  : "border-slate-200/70 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-dark-card dark:hover:border-white/20"
              }`}
            >
              {isActive && (
                <span className="absolute top-3 end-3 flex h-5 w-5 items-center justify-center rounded-full bg-royal">
                  <Check size={11} weight="bold" className="text-white" />
                </span>
              )}
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${type.color}`}>
                <Icon size={20} weight="duotone" />
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

// Step 2: Personal info
export function Step2({
  isAr,
  clientType,
  data,
  onChange,
}: {
  isAr: boolean;
  clientType: ClientType;
  data: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  const isCompany = clientType === "company" || clientType === "micro";
  const isGov = clientType === "government";
  const isNGO = clientType === "ngo";
  const inputCls = "w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-royal focus:ring-2 focus:ring-royal/10 transition-all dark:border-white/10 dark:bg-dark-card dark:text-gray-200 dark:placeholder:text-gray-600 dark:focus:border-gold dark:focus:ring-gold/10";
  const GOV_ROLES = isAr
    ? [{ v: "judge", l: "قاضٍ" }, { v: "prosecutor", l: "عضو نيابة" }, { v: "officer", l: "ضابط" }, { v: "gov_counsel", l: "مستشار قانوني" }]
    : [{ v: "judge", l: "Judge" }, { v: "prosecutor", l: "Prosecutor" }, { v: "officer", l: "Officer" }, { v: "gov_counsel", l: "Legal Counsel" }];
  const OFFICER_SPECS = isAr
    ? [{ v: "general", l: "أمن عام" }, { v: "traffic", l: "مرور" }, { v: "detective", l: "مباحث" }, { v: "narcotics", l: "مكافحة مخدرات" }, { v: "border", l: "حرس حدود" }, { v: "passport", l: "جوازات" }]
    : [{ v: "general", l: "General" }, { v: "traffic", l: "Traffic" }, { v: "detective", l: "Detective" }, { v: "narcotics", l: "Narcotics" }, { v: "border", l: "Border Guard" }, { v: "passport", l: "Passport" }];

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      <h2 className="font-brand text-2xl font-bold text-ink dark:text-gray-100">
        {isAr ? "معلوماتك الأساسية" : "Your Basic Information"}
      </h2>
      <p className="mt-2 text-sm text-ink-muted dark:text-gray-400">
        {isAr ? "نحتاج هذه المعلومات لإنشاء حسابك" : "We need this information to create your account"}
      </p>

      <div className="mt-8 space-y-4">
        {/* Government Fields */}
        {isGov && (
          <>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
                {isAr ? "اسم الجهة الحكومية" : "Government Entity Name"}
              </label>
              <div className="relative">
                <Buildings size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
                <input type="text" placeholder={isAr ? "وزارة العدل — المحكمة التجارية..." : "Ministry of Justice..."}
                  value={data.entityName || ""} onChange={(e) => onChange("entityName", e.target.value)}
                  className={`${inputCls} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`} />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
                {isAr ? "دورك الوظيفي" : "Your Role"}
              </label>
              <select value={data.governmentRole || ""} onChange={(e) => onChange("governmentRole", e.target.value)}
                className={`${inputCls} cursor-pointer`}>
                <option value="">{isAr ? "اختر دورك" : "Select role"}</option>
                {GOV_ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
              </select>
            </div>
            {data.governmentRole === "officer" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
                  {isAr ? "التخصص الأمني" : "Officer Specialty"}
                </label>
                <select value={data.officerSpecialty || ""} onChange={(e) => onChange("officerSpecialty", e.target.value)}
                  className={`${inputCls} cursor-pointer`}>
                  <option value="">{isAr ? "اختر التخصص" : "Select specialty"}</option>
                  {OFFICER_SPECS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
              </div>
            )}
          </>
        )}
        {/* NGO Fields */}
        {isNGO && (
          <>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
                {isAr ? "اسم الجمعية / المنظمة" : "Association Name"}
              </label>
              <div className="relative">
                <Buildings size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
                <input type="text" placeholder={isAr ? "جمعية البيئة السعودية" : "Saudi Environment Association"}
                  value={data.ngoName || ""} onChange={(e) => onChange("ngoName", e.target.value)}
                  className={`${inputCls} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`} />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
                {isAr ? "رقم تسجيل المركز الوطني" : "National Center Registration No."}
              </label>
              <div className="relative">
                <IdentificationCard size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
                <input type="text" dir="ltr" placeholder="NGO-XXXX"
                  value={data.ngoRegNumber || ""} onChange={(e) => onChange("ngoRegNumber", e.target.value)}
                  className={`${inputCls} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`} />
              </div>
            </div>
          </>
        )}
        {/* Company/Micro Fields */}
        {isCompany && (
          <>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
                {isAr ? "اسم الشركة / الجهة" : "Company / Entity Name"}
              </label>
              <div className="relative">
                <Buildings size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
                <input type="text" placeholder={isAr ? "اسم الشركة" : "Company name"}
                  value={data.companyName || ""} onChange={(e) => onChange("companyName", e.target.value)}
                  className={`${inputCls} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`} />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
                {isAr ? "رقم السجل التجاري" : "Commercial Registration Number"}
              </label>
              <div className="relative">
                <IdentificationCard size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
                <input type="text" dir="ltr" placeholder="1010XXXXXX"
                  value={data.crNumber || ""} onChange={(e) => onChange("crNumber", e.target.value)}
                  className={`${inputCls} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`} />
              </div>
            </div>
          </>
        )}
        {/* Individual Fields */}
        {!isCompany && !isGov && !isNGO && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
                  {isAr ? "الاسم الأول" : "First Name"}
                </label>
                <input
                  type="text"
                  placeholder={isAr ? "محمد" : "John"}
                  value={data.firstName || ""}
                  onChange={(e) => onChange("firstName", e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
                  {isAr ? "اسم العائلة" : "Last Name"}
                </label>
                <input
                  type="text"
                  placeholder={isAr ? "الأحمدي" : "Smith"}
                  value={data.lastName || ""}
                  onChange={(e) => onChange("lastName", e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
                {isAr ? "رقم الهوية / الإقامة" : "ID / Iqama Number"}
              </label>
              <div className="relative">
                <IdentificationCard size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
                <input
                  type="text"
                  dir="ltr"
                  placeholder="1XXXXXXXXX"
                  value={data.idNumber || ""}
                  onChange={(e) => onChange("idNumber", e.target.value)}
                  className={`${inputCls} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`}
                />
              </div>
            </div>
          </>
        )}

        {/* Common: Email + Phone */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
            {isAr ? "البريد الإلكتروني" : "Email Address"}
          </label>
          <div className="relative">
            <EnvelopeSimple size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            <input
              type="email"
              dir="ltr"
              placeholder="example@email.com"
              value={data.email || ""}
              onChange={(e) => onChange("email", e.target.value)}
              className={`${inputCls} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`}
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
            {isAr ? "رقم الجوال" : "Phone Number"}
          </label>
          <div className="relative">
            <Phone size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            <input
              type="tel"
              dir="ltr"
              placeholder="05XXXXXXXX"
              value={data.phone || ""}
              onChange={(e) => onChange("phone", e.target.value)}
              className={`${inputCls} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`}
            />
          </div>
        </div>
        {/* Country */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
            {isAr ? "البلد" : "Country"}
          </label>
          <div className="relative">
            <Globe size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            <select
              value={data.country || "SA"}
              onChange={(e) => {
                onChange("country", e.target.value);
                onChange("city", ""); // Reset city when country changes
              }}
              className={`${inputCls} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"} cursor-pointer`}
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
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
            {isAr ? "المدينة" : "City"}
          </label>
          <div className="relative">
            <MapPin size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            {!data.country || data.country === "SA" ? (
              <select
                value={data.city || ""}
                onChange={(e) => onChange("city", e.target.value)}
                className={`${inputCls} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"} cursor-pointer`}
              >
                <option value="">{isAr ? "اختر المدينة" : "Select city"}</option>
                {["الرياض", "جدة", "الدمام", "مكة المكرمة", "المدينة المنورة", "الطائف", "أخرى"].map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder={isAr ? "اسم المدينة (مثال: دبي، القاهرة، عمان)" : "City name (e.g. Dubai, Cairo, Amman)"}
                value={data.city || ""}
                onChange={(e) => onChange("city", e.target.value)}
                className={`${inputCls} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`}
              />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Step 3: Password
export function Step3({
  isAr,
  data,
  onChange,
}: {
  isAr: boolean;
  data: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const inputCls = "w-full rounded-xl border border-slate-200 bg-white py-3 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-royal focus:ring-2 focus:ring-royal/10 transition-all dark:border-white/10 dark:bg-dark-card dark:text-gray-200 dark:placeholder:text-gray-600 dark:focus:border-gold dark:focus:ring-gold/10";

  const strength = (() => {
    const pw = data.password || "";
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  })();

  const strengthLabel = isAr
    ? ["", "ضعيفة", "متوسطة", "جيدة", "قوية جداً"][strength]
    : ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = ["", "bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-emerald-500"][strength];

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      <h2 className="font-brand text-2xl font-bold text-ink dark:text-gray-100">
        {isAr ? "أنشئ كلمة مرور آمنة" : "Create a Secure Password"}
      </h2>
      <p className="mt-2 text-sm text-ink-muted dark:text-gray-400">
        {isAr ? "كلمة مرور قوية تحمي حسابك وبياناتك القانونية" : "A strong password protects your account and legal data"}
      </p>

      <div className="mt-8 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
            {isAr ? "كلمة المرور" : "Password"}
          </label>
          <div className="relative">
            <Lock size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            <input
              type={show ? "text" : "password"}
              placeholder={isAr ? "أدخل كلمة مرور قوية" : "Enter a strong password"}
              value={data.password || ""}
              onChange={(e) => onChange("password", e.target.value)}
              className={`${inputCls} ${isAr ? "pr-10 pl-10" : "pl-10 pr-10"}`}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className={`absolute top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-muted dark:text-gray-500 dark:hover:text-gray-300 ${isAr ? "left-3.5" : "right-3.5"}`}
            >
              {show ? <EyeSlash size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {/* Strength bar */}
          {(data.password?.length ?? 0) > 0 && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${i <= strength ? strengthColor : "bg-slate-200 dark:bg-white/10"}`}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-faint dark:text-gray-500">{strengthLabel}</p>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
            {isAr ? "تأكيد كلمة المرور" : "Confirm Password"}
          </label>
          <div className="relative">
            <Lock size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            <input
              type={showConfirm ? "text" : "password"}
              placeholder={isAr ? "أعد إدخال كلمة المرور" : "Re-enter password"}
              value={data.confirmPassword || ""}
              onChange={(e) => onChange("confirmPassword", e.target.value)}
              className={`${inputCls} ${isAr ? "pr-10 pl-10" : "pl-10 pr-10"} ${
                data.confirmPassword && data.confirmPassword !== data.password
                  ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                  : ""
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className={`absolute top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-muted dark:text-gray-500 dark:hover:text-gray-300 ${isAr ? "left-3.5" : "right-3.5"}`}
            >
              {showConfirm ? <EyeSlash size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {data.confirmPassword && data.confirmPassword !== data.password && (
            <p className="mt-1 text-xs text-red-500">{isAr ? "كلمات المرور غير متطابقة" : "Passwords don't match"}</p>
          )}
        </div>

        {/* Terms */}
        <label className="flex cursor-pointer items-start gap-3 pt-2">
          <input type="checkbox" className="mt-0.5 h-4 w-4 cursor-pointer rounded accent-royal" />
          <span className="text-xs text-ink-muted dark:text-gray-400">
            {isAr ? (
              <>أوافق على <a href="/terms" className="text-royal dark:text-gold hover:underline">الشروط والأحكام</a> و<a href="/privacy" className="text-royal dark:text-gold hover:underline">سياسة الخصوصية</a> لمنصة نظامي</>
            ) : (
              <>I agree to the <a href="/terms" className="text-royal dark:text-gold hover:underline">Terms & Conditions</a> and <a href="/privacy" className="text-royal dark:text-gold hover:underline">Privacy Policy</a> of Nezamy</>
            )}
          </span>
        </label>
      </div>
    </motion.div>
  );
}

// Step 4: Success
export function Step4({ isAr, clientType }: { isAr: boolean; clientType: ClientType }) {
  const typeLabel = {
    individual: isAr ? "فرد" : "Individual",
    company: isAr ? "شركة" : "Company",
    micro: isAr ? "منشأة صغيرة" : "Small Business",
    government: isAr ? "جهة حكومية" : "Government Entity",
    ngo: isAr ? "جمعية" : "NGO",
    null: "",
  }[clientType ?? "null"];
  const dashboardHref = {
    individual: "/dashboard/client",
    company: "/dashboard/business",
    micro: "/dashboard/micro",
    government: "/dashboard/government",
    ngo: "/dashboard/ngo",
    null: "/dashboard/client",
  }[clientType ?? "null"];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center"
    >
      <motion.div
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
        className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-royal shadow-[0_12px_32px_-8px_rgba(11,61,46,0.4)]"
      >
        <Check size={36} weight="bold" className="text-white" />
      </motion.div>
      <h2 className="font-brand text-2xl font-bold text-ink dark:text-gray-100">
        {isAr ? "تم إنشاء حسابك بنجاح!" : "Your Account Has Been Created!"}
      </h2>
      <p className="mt-3 text-sm text-ink-muted dark:text-gray-400">
        {isAr
          ? `مرحباً بك في نظامي كـ${typeLabel}. حسابك جاهز للاستخدام.`
          : `Welcome to Nezamy as ${typeLabel}. Your account is ready to use.`}
      </p>

      <div className="mt-8 space-y-3">
        {[
          { icon: Star, labelAr: "انتقل إلى لوحة التحكم", labelEn: "Go to Dashboard", href: dashboardHref },
          { icon: Scales, labelAr: "احجز استشارتك الأولى", labelEn: "Book your first consultation", href: "/services/consultations" },
          { icon: Shield, labelAr: "جرّب نظامي AI مجاناً", labelEn: "Try Nezamy AI for free", href: "/ai" },
        ].map((item, i) => {
          const Icon = item.icon;
          return (
            <motion.a
              key={i}
              href={item.href}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="flex items-center gap-4 rounded-2xl border border-slate-200/50 bg-white p-4 text-start transition-all hover:border-royal/15 hover:shadow-sm dark:border-white/10 dark:bg-dark-card"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-royal/5 text-royal dark:bg-royal/20">
                <Icon size={20} weight="duotone" />
              </span>
              <div className="text-sm font-medium text-ink dark:text-gray-100">
                {isAr ? item.labelAr : item.labelEn}
              </div>
              <ArrowLeft size={14} className="mr-auto text-ink-faint dark:text-gray-500" />
            </motion.a>
          );
        })}
      </div>
    </motion.div>
  );
}
