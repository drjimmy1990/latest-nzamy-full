"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  CheckCircle,
  Sun,
  Moon,
  Calendar as CalendarIcon,
  UserSwitch,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser, setDemoSession } from "@/hooks/useUser";
import { DEMO_ACCOUNTS } from "@/constants/demoAccountsData";
import { BackendReadyNotice, LocalActionStatus, SectionTitle } from "./_shared";

// ── Field definitions per user type ───────────────────────────────────
interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  type?: string;
  span?: 2;
}

function getProfileFields(userType: string | null, subRole: string | null): FieldDef[] {
  const base: FieldDef[] = [
    { key: "fullName", label: "الاسم الكامل", placeholder: "فهد بن عبدالرحمن النمر", type: "text" },
    { key: "phone",    label: "رقم الجوال",   placeholder: "054 839 2716",            type: "tel" },
    { key: "email",    label: "البريد الإلكتروني", placeholder: "f.alnmer@nezamy.sa",  type: "email" },
    { key: "city",     label: "المدينة",       placeholder: "الرياض",                  type: "text" },
  ];

  switch (userType) {
    case "individual":
      return [
        ...base,
        { key: "nationalId",  label: "رقم الهوية الوطنية / الإقامة", placeholder: "1XXXXXXXXX" },
        { key: "birthDate",   label: "تاريخ الميلاد",               placeholder: "1410/07/23" },
        { key: "nationality", label: "الجنسية",                     placeholder: "سعودي" },
      ];

    case "lawyer":
      return [
        ...base,
        { key: "licenseNumber", label: "رقم ترخيص المحاماة",         placeholder: "44/XXXXX" },
        { key: "nationalId",    label: "رقم الهوية الوطنية",         placeholder: "1XXXXXXXXX" },
        { key: "licenseIssue",  label: "تاريخ إصدار الترخيص",        placeholder: "1440/01/15" },
        { key: "licenseExpiry",  label: "تاريخ انتهاء الترخيص",        placeholder: "1450/01/15" },
        { key: "specialties",   label: "التخصصات",                   placeholder: "قانون تجاري، ملكية فكرية، عقود", span: 2 },
        { key: "experience",    label: "سنوات الخبرة",               placeholder: "12" },
        { key: "officeAddress", label: "عنوان المكتب",               placeholder: "حي الملقا، طريق الأمير محمد بن سلمان", span: 2 },
        { key: "bio",           label: "نبذة مهنية",                 placeholder: "محامٍ متخصص في القضايا التجارية والملكية الفكرية منذ أكثر من 12 عاماً", span: 2 },
      ];

    case "firm":
      return [
        ...base,
        { key: "role",         label: "الدور في المكتب",              placeholder: "شريك مدير" },
        { key: "licenseNumber", label: "رقم ترخيص المحاماة",         placeholder: "44/XXXXX" },
        { key: "department",   label: "القسم / الفرع",               placeholder: "القضايا التجارية" },
        { key: "joinDate",     label: "تاريخ الانضمام",              placeholder: "1443/08/01" },
      ];

    case "corporate":
      return [
        ...base,
        { key: "jobTitle",     label: "المسمى الوظيفي",              placeholder: "مدير الشؤون القانونية" },
        { key: "platformRole", label: "الدور في المنصة",             placeholder: "مدير قانوني" },
        { key: "department",   label: "القسم",                       placeholder: "الشؤون القانونية" },
        { key: "joinDate",     label: "تاريخ الانضمام",              placeholder: "1445/03/15" },
      ];

    case "micro":
      return [
        ...base,
        { key: "businessName", label: "اسم المنشأة",                 placeholder: "مؤسسة خالد للتجارة" },
        { key: "activityType", label: "نوع النشاط",                  placeholder: "تجارة إلكترونية" },
        { key: "employeeCount", label: "عدد الموظفين",               placeholder: "8" },
      ];

    case "government":
      return [
        ...base,
        { key: "employeeId",   label: "الرقم الوظيفي",               placeholder: "XXXXXXX" },
        { key: "govRole",      label: "الدور الحكومي",               placeholder: "قاضي" },
        { key: "rank",         label: "المرتبة / الدرجة",            placeholder: "الرابعة عشرة" },
        { key: "entity",       label: "الجهة التابع لها",             placeholder: "وزارة العدل" },
        { key: "department",   label: "الإدارة / القسم",             placeholder: "الدائرة التجارية الأولى" },
      ];

    case "ngo":
      return [
        ...base,
        { key: "title",        label: "المسمى",                      placeholder: "رئيس مجلس الإدارة" },
        { key: "ngoName",      label: "اسم الجمعية",                 placeholder: "جمعية حقوق للتوعية القانونية" },
      ];

    case "provider": {
      const providerFields: FieldDef[] = [
        ...base,
        { key: "serviceType",   label: "نوع الخدمة",                 placeholder: subRole === "notary" ? "موثق" : subRole === "arbitrator" ? "محكّم" : "معقّب" },
        { key: "licenseNumber", label: "رقم الترخيص / التأهيل",      placeholder: "ARB-XXXXXX" },
        { key: "licenseExpiry", label: "تاريخ انتهاء الترخيص",        placeholder: "1450/06/30" },
        { key: "experience",    label: "سنوات الخبرة",               placeholder: "8" },
        { key: "bio",           label: "نبذة مهنية",                 placeholder: "محكّم معتمد من المركز السعودي للتحكيم التجاري", span: 2 },
      ];
      return providerFields;
    }

    default:
      return base;
  }
}

// ── Component ─────────────────────────────────────────────────────────
export function ProfileTab() {
  const { lang, theme, calendarType, setTheme, setLang, setCalendarType } = useTheme();
  const user = useUser();
  const { userType, subRole } = user;

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  // Profile field states
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("054 839 2716");
  const [email, setEmail] = useState("f.alnmer@nezamy.sa");
  const [city, setCity] = useState("الرياض");
  const [additionalFields, setAdditionalFields] = useState<Record<string, string>>({});

  // Developer switcher state
  const [activeDemoKey, setActiveDemoKey] = useState("");

  const fields = getProfileFields(userType, subRole);

  // Sync inputs on mount or user session change
  useEffect(() => {
    if (user) {
      setFullName(user.name ?? "");
      
      if (typeof window !== "undefined") {
        setActiveDemoKey(localStorage.getItem("nzamy_demo_key") || "lawyer");
        
        const stored = localStorage.getItem(`nzamy_profile_fields_${user.userType}`);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setPhone(parsed.phone ?? "054 839 2716");
            setEmail(parsed.email ?? "f.alnmer@nezamy.sa");
            setCity(parsed.city ?? "الرياض");
            setAdditionalFields(parsed.additional ?? {});
          } catch {
            setPhone("054 839 2716");
            setEmail("f.alnmer@nezamy.sa");
            setCity("الرياض");
            setAdditionalFields({});
          }
        } else {
          setPhone("054 839 2716");
          setEmail(user.userType === "admin" ? "admin@nezamy.sa" : `${user.userType || "user"}@nezamy.sa`);
          setCity("الرياض");
          setAdditionalFields({});
        }
      }
    }
  }, [user]);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      // Update session in localStorage
      const updatedSession = {
        ...user,
        name: fullName,
      };
      delete (updatedSession as any).isDemoBypass;

      const currentDemoKey = localStorage.getItem("nzamy_demo_key") || "lawyer";
      
      setDemoSession(updatedSession, currentDemoKey);

      // Save additional fields
      const toStore = {
        phone,
        email,
        city,
        additional: additionalFields
      };
      localStorage.setItem(`nzamy_profile_fields_${user.userType}`, JSON.stringify(toStore));

      setSaving(false);
      setSaved(true);
      setLocalMessage("تم حفظ التغييرات وتحديث الحساب المفعّل في المتصفح بنجاح!");
      setTimeout(() => {
        setSaved(false);
        setLocalMessage(null);
      }, 2500);
    }, 850);
  };

  const handleSwitchAccount = (key: string) => {
    const acc = DEMO_ACCOUNTS.find(a => a.key === key);
    if (acc) {
      setDemoSession(acc.session, key);
      setActiveDemoKey(key);
      setLocalMessage(`جاري التحويل وتفعيل حساب: ${acc.label}...`);
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };

  // Extract first letter for avatar
  const avatarLetter = fullName?.charAt(0) ?? "م";

  return (
    <div className="space-y-8">
      <BackendNoticeWrapper />

      {/* Avatar */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-24 h-24">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-emerald-700 flex items-center justify-center text-white text-3xl font-bold shadow-[0_8px_24px_-8px_rgba(11,61,46,0.4)] transition-all">
            {avatarLetter}
          </div>
          <div className="absolute -bottom-1 -end-1 w-7 h-7 bg-white dark:bg-zinc-800 border-2 border-gray-200 dark:border-white/[0.08] rounded-full flex items-center justify-center shadow">
            <Plus size={14} className="text-zinc-600 dark:text-zinc-300" />
          </div>
        </div>
        <button
          onClick={() => setLocalMessage("تغيير الصورة جاهز للربط لاحقاً برفع ملفات حقيقي.")}
          className="text-sm text-royal dark:text-[#C8A762] font-semibold hover:underline transition-all"
        >
          تغيير الصورة
        </button>
      </div>

      {/* Dynamic form fields */}
      <div>
        <SectionTitle>البيانات الشخصية</SectionTitle>
        <div className="bg-white/80 dark:bg-[#161b22]/80 backdrop-blur-xl rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] p-7 shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {fields.map((field) => {
              const val = field.key === "fullName" 
                ? fullName 
                : field.key === "phone"
                ? phone
                : field.key === "email"
                ? email
                : field.key === "city"
                ? city
                : (additionalFields[field.key] ?? "");

              const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                const text = e.target.value;
                if (field.key === "fullName") setFullName(text);
                else if (field.key === "phone") setPhone(text);
                else if (field.key === "email") setEmail(text);
                else if (field.key === "city") setCity(text);
                else {
                  setAdditionalFields(prev => ({
                    ...prev,
                    [field.key]: text
                  }));
                }
              };

              return (
                <div key={field.key} className={field.span === 2 ? "sm:col-span-2" : ""}>
                  <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    {field.label}
                  </label>
                  {field.span === 2 && (field.key === "bio" || field.key === "specialties") ? (
                    <textarea
                      rows={3}
                      placeholder={field.placeholder}
                      value={val}
                      onChange={handleChange}
                      className="w-full px-5 py-3 rounded-2xl border border-slate-200/60 dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.02] text-zinc-800 dark:text-zinc-200 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]/20 transition-all resize-none shadow-inner"
                    />
                  ) : (
                    <input
                      type={field.type ?? "text"}
                      placeholder={field.placeholder}
                      value={val}
                      onChange={handleChange}
                      className="w-full px-5 py-3 rounded-2xl border border-slate-200/60 dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.02] text-zinc-800 dark:text-zinc-200 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]/20 transition-all shadow-inner"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div>
        <SectionTitle>التفضيلات</SectionTitle>
        <div className="bg-white/80 dark:bg-[#161b22]/80 backdrop-blur-xl rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] p-7 shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)] space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* Language */}
            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                اللغة المفضلة
              </label>
              <div className="flex rounded-2xl border border-slate-200/60 dark:border-white/[0.06] overflow-hidden shadow-inner bg-white/50 dark:bg-white/[0.02]">
                {[
                  { l: "ar" as const, label: "العربية" },
                  { l: "en" as const, label: "English" },
                ].map((item) => (
                  <button
                    key={item.l}
                    onClick={() => setLang(item.l)}
                    className={`flex-1 py-3 text-[13.5px] font-semibold transition-colors ${
                      lang === item.l
                        ? "bg-[#0B3D2E] text-white"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                المظهر
              </label>
              <div className="flex rounded-2xl border border-slate-200/60 dark:border-white/[0.06] overflow-hidden shadow-inner bg-white/50 dark:bg-white/[0.02]">
                {(["light", "dark"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-[13.5px] font-semibold transition-colors ${
                      theme === t
                        ? "bg-[#0B3D2E] text-white"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    {t === "light" ? <Sun size={16} /> : <Moon size={16} />}
                    {t === "light" ? "فاتح" : "داكن"}
                  </button>
                ))}
              </div>
            </div>

            {/* Calendar Type */}
            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <CalendarIcon size={16} />
                  نظام التاريخ
                </span>
              </label>
              <div className="flex rounded-2xl border border-slate-200/60 dark:border-white/[0.06] overflow-hidden shadow-inner bg-white/50 dark:bg-white/[0.02]">
                {(["hijri", "miladi", "both"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCalendarType(c)}
                    className={`flex-1 py-3 text-xs font-semibold transition-colors ${
                      calendarType === c
                        ? "bg-[#0B3D2E] text-white"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    {c === "hijri" ? "هجري" : c === "miladi" ? "ميلادي" : "مزدوج"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Developer Demo Console */}
      <div className="bg-amber-500/[0.03] dark:bg-amber-500/[0.02] rounded-[2rem] border border-amber-500/20 p-7 shadow-[0_20px_40px_-15px_rgba(245,158,11,0.02)] space-y-5">
        <div className="flex items-center gap-3 border-b border-amber-500/10 pb-4">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 dark:text-amber-400">
            <UserSwitch size={20} weight="fill" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">منطقة ديمو التطوير — مخصص للاختبار</h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">تبديل فوري بين كافة مستخدمي ومستويات المنصة لمعاينة الإعدادات والواجهات</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
          <div>
            <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 mb-2">
              اختر الحساب والفرع المراد تفعيله
            </label>
            <select
              value={activeDemoKey}
              onChange={(e) => handleSwitchAccount(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200/60 dark:border-white/[0.08] bg-white dark:bg-[#161b22] text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]/20 transition-all shadow-sm"
            >
              {DEMO_ACCOUNTS.map((acc) => (
                <option key={acc.key} value={acc.key}>
                  {acc.label} ({acc.labelEn}) {acc.badge ? `[${acc.badge}]` : ""}
                </option>
              ))}
            </select>
          </div>
          
          {/* Active account info card */}
          {(() => {
            const activeAcc = DEMO_ACCOUNTS.find(a => a.key === activeDemoKey) || DEMO_ACCOUNTS[0];
            return (
              <div className="rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/[0.01] p-4 flex flex-col justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${activeAcc?.color || "from-[#0B3D2E] to-emerald-700"} flex items-center justify-center text-white text-xs font-bold shadow-sm`}>
                    {activeAcc?.session?.name?.charAt(0) ?? "ن"}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{activeAcc?.session?.name}</p>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">الدور: {activeAcc?.label} | الباقة: {activeAcc?.session?.tier.toUpperCase()}</p>
                  </div>
                </div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 border-t border-amber-500/5 mt-3 pt-3 flex items-center justify-between">
                  <span>البلد: {activeAcc?.session?.country || "SA"}</span>
                  <span>الرصيد: {activeAcc?.session?.credits} / {activeAcc?.session?.creditsMax}</span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Action alerts and Save button */}
      <LocalActionStatus show={Boolean(localMessage)} message={localMessage ?? undefined} />
      
      <motion.button
        whileTap={{ scale: 0.98, y: 1 }}
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-8 py-3.5 bg-[#0B3D2E] hover:bg-[#0a3328] text-white rounded-2xl font-bold text-[13.5px] transition-all shadow-[0_4px_14px_0_rgba(11,61,46,0.3)] active:scale-[0.98] disabled:opacity-70"
      >
        {saving ? (
          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : saved ? (
          <CheckCircle size={18} weight="fill" />
        ) : null}
        {saving ? "جاري الحفظ..." : saved ? "تم الحفظ" : "حفظ التغييرات"}
      </motion.button>
    </div>
  );
}

/** Dynamic wrapper to bypass backend-ready styling for the preview sandbox */
function BackendNoticeWrapper() {
  const user = useUser();
  if (user.userType === "admin") return null; // Admin notices are handled separately
  return <BackendReadyNotice />;
}
