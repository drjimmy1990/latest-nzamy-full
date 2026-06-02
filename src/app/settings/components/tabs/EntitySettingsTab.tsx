"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Buildings,
  Upload,
  CheckCircle,
} from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { BackendReadyNotice, LocalActionStatus, SectionTitle } from "./_shared";

// ── Field definitions per entity type ─────────────────────────────────
interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  type?: string;
  span?: 2;
}

function getFieldsForType(userType: string | null): FieldDef[] {
  switch (userType) {
    case "firm":
      return [
        { key: "firmName",       label: "اسم المكتب الرسمي",           placeholder: "مكتب نظامي للمحاماة والاستشارات القانونية" },
        { key: "tradeName",      label: "الاسم التجاري",               placeholder: "نظامي" },
        { key: "crNumber",       label: "رقم السجل التجاري",           placeholder: "4030XXXXXX" },
        { key: "licenseNumber",  label: "رقم ترخيص المكتب (وزارة العدل)", placeholder: "44/XXXXX" },
        { key: "licenseExpiry",  label: "تاريخ انتهاء الترخيص",         placeholder: "1448/06/15", type: "text" },
        { key: "vatNumber",      label: "الرقم الضريبي (VAT)",          placeholder: "3XXXXXXXXXXXXXXX" },
        { key: "address",        label: "العنوان الرسمي",              placeholder: "حي الملقا، طريق الأمير محمد بن سلمان", span: 2 },
        { key: "city",           label: "المدينة",                     placeholder: "الرياض" },
        { key: "region",         label: "المنطقة",                     placeholder: "منطقة الرياض" },
        { key: "poBox",          label: "صندوق البريد",                placeholder: "ص.ب XXXX" },
        { key: "phone",          label: "الرقم الموحد",                placeholder: "920XXXXXXX" },
        { key: "email",          label: "البريد الإلكتروني الرسمي",      placeholder: "info@nezamy.sa" },
        { key: "website",        label: "الموقع الإلكتروني",            placeholder: "https://nezamy.sa" },
        { key: "specialties",    label: "التخصصات الرئيسية",            placeholder: "قانون تجاري، منازعات، ملكية فكرية", span: 2 },
        { key: "description",    label: "نبذة عن المكتب",              placeholder: "مكتب محاماة متخصص في القضايا التجارية والملكية الفكرية منذ 2014", span: 2 },
      ];

    case "corporate":
      return [
        { key: "companyName",    label: "اسم الشركة",                  placeholder: "شركة البناء المتقدمة المحدودة" },
        { key: "crNumber",       label: "رقم السجل التجاري",           placeholder: "1010XXXXXX" },
        { key: "vatNumber",      label: "الرقم الضريبي (VAT)",          placeholder: "3XXXXXXXXXXXXXXX" },
        { key: "gosiNumber",     label: "رقم منشأة التأمينات",          placeholder: "XXXXXXXXX" },
        { key: "activityType",   label: "نوع النشاط التجاري",           placeholder: "مقاولات وبناء" },
        { key: "employeeCount",  label: "عدد الموظفين",                placeholder: "187" },
        { key: "address",        label: "العنوان الرسمي",              placeholder: "حي العليا، شارع التحلية", span: 2 },
        { key: "city",           label: "المدينة",                     placeholder: "جدة" },
        { key: "phone",          label: "الرقم الموحد",                placeholder: "920XXXXXXX" },
        { key: "email",          label: "البريد الإلكتروني الرسمي",      placeholder: "legal@advancedco.sa" },
        { key: "website",        label: "الموقع الإلكتروني",            placeholder: "https://advancedco.sa" },
        { key: "legalRep",       label: "اسم الممثل النظامي",           placeholder: "عبدالعزيز محمد القرني" },
        { key: "legalRepId",     label: "رقم هوية الممثل النظامي",      placeholder: "1XXXXXXXXX" },
      ];

    case "micro":
      return [
        { key: "ownerName",      label: "اسم صاحب المنشأة",            placeholder: "خالد عبدالرحمن السبيعي" },
        { key: "businessName",   label: "اسم المنشأة التجاري",          placeholder: "مؤسسة خالد للتجارة" },
        { key: "crNumber",       label: "رقم السجل التجاري",           placeholder: "4650XXXXXX" },
        { key: "freelanceDoc",   label: "رقم وثيقة العمل الحر",         placeholder: "FL-XXXXXXX" },
        { key: "activityType",   label: "نوع النشاط",                  placeholder: "تجارة إلكترونية" },
        { key: "vatNumber",      label: "الرقم الضريبي (إن وُجد)",     placeholder: "—" },
        { key: "address",        label: "العنوان",                     placeholder: "حي النسيم، الرياض", span: 2 },
        { key: "phone",          label: "رقم التواصل",                 placeholder: "05X XXX XXXX" },
        { key: "email",          label: "البريد الإلكتروني",            placeholder: "khaled@mybiz.sa" },
      ];

    case "government":
      return [
        { key: "entityName",     label: "اسم الجهة الحكومية",          placeholder: "وزارة العدل" },
        { key: "entityType",     label: "نوع الجهة",                   placeholder: "وزارة" },
        { key: "address",        label: "العنوان الرسمي",              placeholder: "حي المعذر، الرياض", span: 2 },
        { key: "phone",          label: "رقم التواصل",                 placeholder: "1950" },
        { key: "email",          label: "البريد الإلكتروني الرسمي",      placeholder: "info@moj.gov.sa" },
      ];

    case "ngo":
      return [
        { key: "ngoName",        label: "اسم الجمعية",                 placeholder: "جمعية حقوق للتوعية القانونية" },
        { key: "licenseNumber",  label: "رقم ترخيص الجمعية",           placeholder: "XXXX" },
        { key: "licenseAuthority", label: "جهة الترخيص",               placeholder: "وزارة الموارد البشرية" },
        { key: "foundedDate",    label: "تاريخ التأسيس",               placeholder: "1440/03/01" },
        { key: "licenseExpiry",  label: "تاريخ انتهاء الترخيص",         placeholder: "1450/03/01" },
        { key: "activityType",   label: "نوع النشاط الخيري",           placeholder: "توعية قانونية ومناصرة حقوقية" },
        { key: "address",        label: "العنوان",                     placeholder: "حي الورود، الرياض", span: 2 },
        { key: "phone",          label: "الرقم الموحد",                placeholder: "920XXXXXXX" },
        { key: "email",          label: "البريد الإلكتروني",            placeholder: "info@huquq.org.sa" },
        { key: "website",        label: "الموقع الإلكتروني",            placeholder: "https://huquq.org.sa" },
        { key: "legalRep",       label: "اسم الممثل النظامي",           placeholder: "د. سعاد الحربي" },
      ];

    default:
      return [];
  }
}

// ── Component ─────────────────────────────────────────────────────────
export function EntitySettingsTab() {
  const { userType } = useUser();
  const fields = getFieldsForType(userType);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setLocalMessage("تم حفظ بيانات الكيان محلياً فقط؛ الاعتماد والتحديث الرسمي ينتظران الباك إند.");
      setTimeout(() => setSaved(false), 2500);
    }, 1200);
  };

  const entityLabel: Record<string, string> = {
    firm: "بيانات المكتب",
    corporate: "بيانات الشركة",
    micro: "بيانات المنشأة",
    government: "بيانات الجهة",
    ngo: "بيانات الجمعية",
  };

  return (
    <div className="space-y-8">
      <BackendReadyNotice />

      {/* Logo upload */}
      <div>
        <SectionTitle>{entityLabel[userType ?? ""] ?? "بيانات الكيان"}</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] p-6">
          <div className="flex items-center gap-5 mb-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-emerald-700 flex items-center justify-center shadow-[0_8px_24px_-8px_rgba(11,61,46,0.3)]">
              <Buildings size={32} weight="fill" className="text-white" />
            </div>
            <div>
              <button
                onClick={() => setLocalMessage("رفع الشعار محلي في الواجهة فقط؛ التخزين الحقيقي ينتظر Storage/API.")}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-royal dark:text-[#C8A762] border border-royal/20 dark:border-[#C8A762]/20 rounded-xl hover:bg-royal/5 dark:hover:bg-[#C8A762]/5 transition-colors"
              >
                <Upload size={16} />
                رفع الشعار
              </button>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1.5">
                PNG, SVG — بحد أقصى 2MB
              </p>
            </div>
          </div>

          {/* Fields grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {fields.map((field) => (
              <div key={field.key} className={field.span === 2 ? "sm:col-span-2" : ""}>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  {field.label}
                </label>
                <input
                  type={field.type ?? "text"}
                  placeholder={field.placeholder}
                  defaultValue={field.placeholder}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-dark-card text-zinc-800 dark:text-zinc-200 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-royal/30 focus:border-royal dark:focus:border-[#C8A762] transition-colors"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Save */}
      <LocalActionStatus show={Boolean(localMessage)} message={localMessage ?? undefined} />
      <motion.button
        whileTap={{ scale: 0.98, y: 1 }}
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-8 py-3 bg-royal hover:bg-royal/90 text-white rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-70 shadow-[0_4px_14px_-4px_rgba(11,61,46,0.4)]"
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
