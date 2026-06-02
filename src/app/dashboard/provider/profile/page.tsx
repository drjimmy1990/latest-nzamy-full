"use client";

import { motion } from "framer-motion";
import {
  PencilSimple, Briefcase, Certificate, Clock, CurrencyDollar,
  GraduationCap, MapPin, Globe, Scales, Star, Plus, Trash,
  FloppyDisk, CheckCircle, Upload,
} from "@phosphor-icons/react";
import { useState, useEffect } from "react";
import { useTheme } from "@/components/ThemeProvider";

import { useUser } from "@/hooks/useUser";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "basic" | "specialties" | "certs" | "schedule" | "pricing";

const SPECIALTIES_AR = [
  "القانون التجاري", "العقود والاتفاقيات", "قضايا العمل", "القضايا العقارية",
  "القانون الجنائي", "قانون الأسرة", "التحكيم الدولي", "الملكية الفكرية",
  "المنازعات المدنية", "الامتثال التنظيمي", "قانون التأمين", "القانون الإداري",
  "تعقيب وتخليص", "إجراءات بلدية", "توثيق عقاري", "إفراغ عقاري", "التحكيم التجاري"
];

const DAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

const mockProfile = {
  name: "نورة بنت عبدالله الزهراني",
  title: "محامية متخصصة بالعقود التجارية",
  city: "الرياض",
  experience: "٨ سنوات",
  languages: ["العربية", "الإنجليزية"],
  bio: "خبرة واسعة في مراجعة وصياغة العقود التجارية ونزاعات المشاريع الكبرى، مع متابعة مستمرة للتحديثات التنظيمية في المملكة.",
  selectedSpecialties: ["القانون التجاري", "العقود والاتفاقيات", "التحكيم الدولي"],
  certs: [
    { id: 1, name: "شهادة المحاماة — هيئة المحامين السعوديين", year: "٢٠١٦" },
    { id: 2, name: "دبلوم التحكيم الدولي — CIARB لندن", year: "٢٠٢٠" },
  ],
  schedule: {
    "الأحد": { enabled: true, from: "09:00", to: "17:00" },
    "الاثنين": { enabled: true, from: "09:00", to: "17:00" },
    "الثلاثاء": { enabled: true, from: "10:00", to: "16:00" },
    "الأربعاء": { enabled: false, from: "09:00", to: "17:00" },
    "الخميس": { enabled: true, from: "09:00", to: "14:00" },
  },
  consultFee: "٢٩٩",
  instantFee: "٥٤٩",
  sessionDuration: "٦٠",
};

// ── Tabs config ────────────────────────────────────────────────────────────────

const tabs: { id: Tab; labelAr: string; icon: React.ElementType }[] = [
  { id: "basic", labelAr: "البيانات الأساسية", icon: Briefcase },
  { id: "specialties", labelAr: "التخصصات", icon: Scales },
  { id: "certs", labelAr: "الشهادات", icon: Certificate },
  { id: "schedule", labelAr: "ساعات العمل", icon: Clock },
  { id: "pricing", labelAr: "التسعير", icon: CurrencyDollar },
];

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ProviderProfilePage() {
  const { isDark } = useTheme();
  const user = useUser();
  const [activeTab, setActiveTab] = useState<Tab>("basic");
  const [saved, setSaved] = useState(false);
  const [specialties, setSpecialties] = useState(mockProfile.selectedSpecialties);
  
  // Sync providerSpecialties from user session if available
  useEffect(() => {
    if (user.providerSpecialties && user.providerSpecialties.length > 0) {
      setSpecialties(user.providerSpecialties);
    }
  }, [user.providerSpecialties]);

  const [certs, setCerts] = useState(mockProfile.certs);
  const [schedule, setSchedule] = useState(mockProfile.schedule);

  const surface = isDark
    ? "border-white/[0.06] bg-zinc-900"
    : "border-slate-200 bg-white";

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleSpecialty = (s: string) => {
    setSpecialties(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : prev.length < 5 ? [...prev, s] : prev
    );
  };

  return (
    <main className={`min-h-screen py-8 px-4 ${isDark ? "bg-zinc-950" : "bg-zinc-50/50"}`}>
        <div className="mx-auto max-w-4xl px-4">

          {/* Header */}
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h1 className={`font-brand text-2xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
                الملف المهني
              </h1>
              <p className={`mt-1 text-sm ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                مرئي للعملاء في دليل المحامين — احرص على اكتماله لزيادة الطلبات
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleSave}
              className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-sm font-semibold text-white"
            >
              {saved ? <CheckCircle size={15} weight="fill" className="text-emerald-300" /> : <FloppyDisk size={15} />}
              {saved ? "تم الحفظ" : "حفظ التغييرات"}
            </motion.button>
          </div>

          {/* Completion bar */}
          <div className={`mb-6 rounded-2xl border p-4 ${surface}`}>
            <div className="mb-2 flex items-center justify-between text-xs font-medium">
              <span className={isDark ? "text-zinc-300" : "text-zinc-700"}>اكتمال الملف</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">٨٣٪</span>
            </div>
            <div className={`h-2 rounded-full ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
              <motion.div
                className="h-2 rounded-full bg-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: "83%" }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <p className={`mt-1.5 text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              أضف صورة شخصية لإكمال ملفك وزيادة الظهور بنسبة ٤٠٪
            </p>
          </div>

          <div className={`rounded-2xl border overflow-hidden ${surface}`}>
            {/* Tabs */}
            <div className={`flex overflow-x-auto border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
              {tabs.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex min-w-max items-center gap-2 px-5 py-4 text-sm font-medium transition-colors border-b-2 ${
                      active
                        ? "border-[#0B3D2E] text-[#0B3D2E] dark:border-[#C8A762] dark:text-[#C8A762]"
                        : `border-transparent ${isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-500 hover:text-zinc-700"}`
                    }`}
                  >
                    <Icon size={15} weight={active ? "fill" : "regular"} />
                    {tab.labelAr}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="p-6">

              {/* ── Basic Info ── */}
              {activeTab === "basic" && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  {/* Avatar */}
                  <div className="flex items-center gap-5">
                    <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold ${isDark ? "bg-zinc-800 text-zinc-300" : "bg-slate-100 text-slate-400"}`}>
                      ن
                    </div>
                    <div>
                      <button className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium ${isDark ? "border-white/10 text-zinc-300" : "border-slate-200 text-zinc-600"}`}>
                        <Upload size={14} />
                        رفع صورة شخصية
                      </button>
                      <p className={`mt-1.5 text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>JPG أو PNG — حجم أقصى 2MB</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {[
                      { label: "الاسم الكامل", value: mockProfile.name, icon: Briefcase },
                      { label: "المسمى المهني", value: mockProfile.title, icon: Scales },
                      { label: "المدينة", value: mockProfile.city, icon: MapPin },
                      { label: "سنوات الخبرة", value: mockProfile.experience, icon: GraduationCap },
                    ].map(field => (
                      <div key={field.label}>
                        <label className={`mb-1.5 block text-xs font-semibold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                          {field.label}
                        </label>
                        <div className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 ${isDark ? "border-white/[0.06] bg-zinc-800" : "border-slate-200 bg-slate-50"}`}>
                          <field.icon size={14} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                          <input
                            defaultValue={field.value}
                            className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
                          />
                          <PencilSimple size={13} className={isDark ? "text-zinc-600" : "text-zinc-400"} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Languages */}
                  <div>
                    <label className={`mb-2 block text-xs font-semibold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>اللغات</label>
                    <div className="flex flex-wrap gap-2">
                      {["العربية", "الإنجليزية", "الفرنسية"].map(lang => (
                        <button
                          key={lang}
                          className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                            mockProfile.languages.includes(lang)
                              ? "border-[#0B3D2E] bg-[#0B3D2E]/10 text-[#0B3D2E] dark:border-[#C8A762]/50 dark:bg-[#C8A762]/10 dark:text-[#C8A762]"
                              : isDark ? "border-white/10 text-zinc-400" : "border-slate-200 text-zinc-500"
                          }`}
                        >
                          <Globe size={11} />
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bio */}
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                      نبذة مهنية (تظهر لكل العملاء)
                    </label>
                    <textarea
                      rows={4}
                      defaultValue={mockProfile.bio}
                      className={`w-full resize-none rounded-xl border px-3.5 py-3 text-sm leading-relaxed outline-none ${
                        isDark ? "border-white/[0.06] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-zinc-700"
                      }`}
                    />
                    <p className={`mt-1 text-right text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                      {mockProfile.bio.length} / ٥٠٠ حرف
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ── Specialties ── */}
              {activeTab === "specialties" && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <p className={`mb-4 text-sm ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                    اختر من ١ إلى ٥ تخصصات — هذه تحدد نوع الطلبات التي تصلك
                  </p>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {SPECIALTIES_AR.map(s => {
                      const sel = specialties.includes(s);
                      return (
                        <motion.button
                          key={s}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => toggleSpecialty(s)}
                          className={`rounded-xl border px-4 py-3 text-sm font-medium text-start transition-all ${
                            sel
                              ? "border-[#0B3D2E] bg-[#0B3D2E]/10 text-[#0B3D2E] dark:border-[#C8A762]/50 dark:bg-[#C8A762]/10 dark:text-[#C8A762]"
                              : isDark ? "border-white/[0.06] text-zinc-400 hover:bg-white/[0.03]" : "border-slate-200 text-zinc-600 hover:bg-slate-50"
                          }`}
                        >
                          {sel && <CheckCircle size={12} weight="fill" className="inline ms-0 me-1.5 mb-0.5" />}
                          {s}
                        </motion.button>
                      );
                    })}
                  </div>
                  <p className={`mt-4 text-xs ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                    مختار {specialties.length} / ٥
                  </p>
                </motion.div>
              )}

              {/* ── Certificates ── */}
              {activeTab === "certs" && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  {certs.map(cert => (
                    <motion.div
                      key={cert.id}
                      layout
                      className={`flex items-center gap-4 rounded-xl border p-4 ${isDark ? "border-white/[0.06] bg-zinc-800/60" : "border-slate-200 bg-slate-50"}`}
                    >
                      <Certificate size={20} className="text-[#C8A762] shrink-0" />
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{cert.name}</p>
                        <p className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{cert.year}</p>
                      </div>
                      <button onClick={() => setCerts(prev => prev.filter(c => c.id !== cert.id))}>
                        <Trash size={15} className={isDark ? "text-zinc-600 hover:text-red-400" : "text-zinc-400 hover:text-red-500"} />
                      </button>
                    </motion.div>
                  ))}
                  <button
                    onClick={() => setCerts(prev => [...prev, { id: Date.now(), name: "شهادة جديدة", year: "٢٠٢٤" }])}
                    className={`flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm transition-colors w-full ${
                      isDark ? "border-white/10 text-zinc-500 hover:bg-white/[0.02]" : "border-slate-300 text-zinc-400 hover:bg-slate-50"
                    }`}
                  >
                    <Plus size={14} />
                    إضافة شهادة أو مؤهل
                  </button>
                </motion.div>
              )}

              {/* ── Schedule ── */}
              {activeTab === "schedule" && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  {DAYS_AR.map(day => {
                    const d = schedule[day as keyof typeof schedule];
                    return (
                      <div key={day} className={`flex items-center gap-4 rounded-xl border p-4 ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
                        {/* Toggle */}
                        <button
                          onClick={() => setSchedule(prev => ({ ...prev, [day]: { ...prev[day as keyof typeof prev], enabled: !d.enabled } }))}
                          className={`relative h-6 w-11 rounded-full transition-colors ${d.enabled ? "bg-emerald-500" : isDark ? "bg-zinc-700" : "bg-slate-200"}`}
                        >
                          <motion.span
                            className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
                            animate={{ right: d.enabled ? "2px" : "auto", left: d.enabled ? "auto" : "2px" }}
                          />
                        </button>
                        <span className={`w-20 text-sm font-semibold ${d.enabled ? (isDark ? "text-zinc-100" : "text-zinc-800") : (isDark ? "text-zinc-600" : "text-zinc-400")}`}>
                          {day}
                        </span>
                        {d.enabled && (
                          <div className="flex items-center gap-2 text-sm">
                            <input
                              type="time"
                              defaultValue={d.from}
                              className={`rounded-lg border px-2.5 py-1.5 text-xs outline-none ${isDark ? "border-white/10 bg-zinc-800 text-zinc-300" : "border-slate-200 bg-slate-50 text-zinc-700"}`}
                            />
                            <span className={isDark ? "text-zinc-500" : "text-zinc-400"}>—</span>
                            <input
                              type="time"
                              defaultValue={d.to}
                              className={`rounded-lg border px-2.5 py-1.5 text-xs outline-none ${isDark ? "border-white/10 bg-zinc-800 text-zinc-300" : "border-slate-200 bg-slate-50 text-zinc-700"}`}
                            />
                          </div>
                        )}
                        {!d.enabled && (
                          <span className={`text-xs ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>إجازة</span>
                        )}
                      </div>
                    );
                  })}
                </motion.div>
              )}

              {/* ── Pricing ── */}
              {activeTab === "pricing" && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <div className={`rounded-2xl border p-4 text-sm ${isDark ? "border-amber-700/30 bg-amber-950/30 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                    الأسعار قابلة للتعديل. يتعامل نظامي بنظام Escrow — يُسدَّد المبلغ للعميل بشكل آمن حتى الانتهاء من الاستشارة.
                  </div>
                  {[
                    { label: "رسوم الاستشارة المعيارية (بالساعة)", key: "consultFee", value: mockProfile.consultFee, suffix: "ر.س" },
                    { label: "رسوم الاستشارة الفورية (×١.٧٥)", key: "instantFee", value: mockProfile.instantFee, suffix: "ر.س", hint: "يُطبّق تلقائياً عند اختيار العميل للوضع الفوري" },
                    { label: "مدة الجلسة الافتراضية", key: "sessionDuration", value: mockProfile.sessionDuration, suffix: "دقيقة" },
                  ].map(field => (
                    <div key={field.key}>
                      <label className={`mb-1.5 block text-xs font-semibold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                        {field.label}
                      </label>
                      <div className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 ${isDark ? "border-white/[0.06] bg-zinc-800" : "border-slate-200 bg-slate-50"}`}>
                        <input
                          type="number"
                          defaultValue={field.value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))}
                          className="flex-1 bg-transparent text-sm font-mono outline-none"
                        />
                        <span className={`text-xs font-medium ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{field.suffix}</span>
                      </div>
                      {field.hint && (
                        <p className={`mt-1 text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{field.hint}</p>
                      )}
                    </div>
                  ))}

                  {/* Rating preview */}
                  <div className={`flex items-center gap-3 rounded-2xl border p-4 ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(i => (
                        <Star key={i} size={16} weight={i <= 4 ? "fill" : "regular"} className="text-[#C8A762]" />
                      ))}
                    </div>
                    <span className={`text-sm font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>٤.٨</span>
                    <span className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>(٢٣ تقييم)</span>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
    </main>
  );
}
