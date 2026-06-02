"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { BackendReadyNotice, LocalActionStatus, SectionTitle, ToggleRow } from "./_shared";

export function ProfessionTab() {
  const { userType, subRole } = useUser();
  const [visible, setVisible] = useState(true);
  const [proBono, setProBono] = useState(false);
  const [instantReq, setInstantReq] = useState(true);
  const [saved, setSaved] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const isLawyer = userType === "lawyer";
  const isProvider = userType === "provider";

  const serviceLabel = subRole === "notary" ? "التوثيق"
    : subRole === "arbitrator" ? "التحكيم"
    : subRole === "bailiff" ? "التعقيب"
    : "المحاماة";

  const specialties = isLawyer
    ? ["قانون تجاري", "ملكية فكرية", "قانون العمل", "منازعات إدارية", "عقارات", "جنائي", "أحوال شخصية", "قانون دولي"]
    : subRole === "arbitrator"
      ? ["تحكيم تجاري", "تحكيم عمالي", "تحكيم دولي", "تحكيم عقاري"]
      : ["توثيق عقود", "توثيق وكالات", "توثيق شهادات", "توثيق تجاري"];

  const [selected, setSelected] = useState<string[]>([specialties[0], specialties[1]]);

  const toggleSpec = (s: string) =>
    setSelected((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s]);

  const handleSave = () => {
    setSaved(true);
    setLocalMessage("تم حفظ إعدادات المهنة محلياً فقط؛ ظهور السوق والأسعار ينتظران API.");
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-8">
      <BackendReadyNotice />

      {/* Marketplace visibility */}
      <div>
        <SectionTitle>الظهور في السوق</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] px-5 divide-y divide-gray-100 dark:divide-white/[0.04]">
          <ToggleRow
            label={`إظهار ملفي في سوق ${serviceLabel}`}
            description="العملاء يستطيعون العثور عليك والتواصل معك"
            checked={visible}
            onChange={() => {
              setVisible(!visible);
              setLocalMessage("ظهور السوق تغيّر محلياً فقط.");
            }}
          />
          {isProvider && (
            <ToggleRow
              label="قبول الطلبات الفورية"
              description="يستطيع العملاء طلب خدمتك مباشرة دون انتظار"
              checked={instantReq}
              onChange={() => {
                setInstantReq(!instantReq);
                setLocalMessage("الطلبات الفورية تغيّرت محلياً فقط.");
              }}
            />
          )}
          {isLawyer && (
            <ToggleRow
              label="قبول قضايا مجانية (Pro Bono)"
              description="إظهار ملفك للعملاء الذين يحتاجون مساعدة مجانية"
              checked={proBono}
              onChange={() => {
                setProBono(!proBono);
                setLocalMessage("قبول قضايا Pro Bono تغيّر محلياً فقط.");
              }}
            />
          )}
        </div>
      </div>

      {/* Specialties */}
      <div>
        <SectionTitle>التخصصات ({selected.length} مختار)</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] p-5">
          <div className="flex flex-wrap gap-2">
            {specialties.map((s) => (
              <button
                key={s}
                onClick={() => toggleSpec(s)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                  selected.includes(s)
                    ? "bg-royal text-white border-transparent"
                    : "bg-white dark:bg-dark-bg border-gray-200 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-400 hover:border-royal/30"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pricing & hours */}
      <div>
        <SectionTitle>الأسعار وساعات العمل</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              {isLawyer ? "الحد الأدنى للاستشارة (ر.س)" : "سعر الخدمة الابتدائي (ر.س)"}
            </label>
            <input
              type="number"
              defaultValue={isLawyer ? "250" : "500"}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-dark-bg text-zinc-800 dark:text-zinc-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-royal/30 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              {isLawyer ? "مدة الاستشارة الافتراضية (دقيقة)" : "المدة الافتراضية للخدمة (يوم)"}
            </label>
            <input
              type="number"
              defaultValue={isLawyer ? "30" : "3"}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-dark-bg text-zinc-800 dark:text-zinc-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-royal/30 transition-colors"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              مناطق التغطية الجغرافية
            </label>
            <input
              type="text"
              defaultValue="الرياض، جدة، الدمام"
              placeholder="الرياض، جدة، الدمام..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-dark-bg text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-royal/30 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">بداية ساعات العمل</label>
            <input type="time" defaultValue="08:30" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-dark-bg text-zinc-800 dark:text-zinc-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-royal/30 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">نهاية ساعات العمل</label>
            <input type="time" defaultValue="17:00" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-dark-bg text-zinc-800 dark:text-zinc-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-royal/30 transition-colors" />
          </div>
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.98, y: 1 }}
        onClick={handleSave}
        className="flex items-center gap-2 px-8 py-3 bg-royal hover:bg-royal/90 text-white rounded-xl font-semibold text-sm transition-all shadow-[0_4px_14px_-4px_rgba(11,61,46,0.4)]"
      >
        {saved && <CheckCircle size={18} weight="fill" />}
        {saved ? "تم الحفظ" : "حفظ إعدادات المهنة"}
      </motion.button>
      <LocalActionStatus show={Boolean(localMessage)} message={localMessage ?? undefined} />
    </div>
  );
}
