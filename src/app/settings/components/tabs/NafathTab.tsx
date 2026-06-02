"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Fingerprint, Link, Clock,
} from "@phosphor-icons/react";
import { BackendReadyNotice, LocalActionStatus, SectionTitle } from "./_shared";

export function NafathTab() {
  const [linked, setLinked] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const handleLink = () => {
    setVerifying(true);
    setCode("74");
    setTimeout(() => {
      setVerifying(false);
      setLinked(true);
      setCode(null);
      setLocalMessage("تمت محاكاة ربط نفاذ محلياً فقط؛ التكامل الرسمي ينتظر Nafath/SSO API.");
    }, 4000);
  };

  return (
    <div className="space-y-8">
      <BackendReadyNotice />

      {/* Status */}
      <div className={`rounded-2xl p-5 border ${linked ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10" : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${linked ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
            <Fingerprint size={24} weight="fill" className={linked ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"} />
          </div>
          <div>
            <p className={`text-sm font-bold ${linked ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
              {linked ? "نفاذ مربوط بنجاح" : "نفاذ غير مربوط"}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {linked
                ? "محاكاة ربط ناجحة — تسجيل الدخول عبر نفاذ غير إنتاجي بعد"
                : "ربط نفاذ إلزامي للجهات الحكومية للتحقق من الهوية الرسمية"}
            </p>
          </div>
        </div>
      </div>

      {/* Link flow */}
      {!linked && (
        <div>
          <SectionTitle>ربط حساب نفاذ</SectionTitle>
          <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                رقم الهوية الوطنية
              </label>
              <input
                type="text"
                placeholder="1XXXXXXXXX"
                maxLength={10}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-dark-bg text-zinc-800 dark:text-zinc-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-royal/30 transition-colors"
              />
            </div>

            {verifying && code && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 rounded-xl bg-[#0B3D2E]/5 dark:bg-[#0B3D2E]/30 border border-[#0B3D2E]/20 text-center"
              >
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                  افتح تطبيق نفاذ على جوالك وتحقق من الرمز:
                </p>
                <div className="text-5xl font-bold font-mono text-[#0B3D2E] dark:text-emerald-300 tracking-widest">
                  {code}
                </div>
                <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-zinc-400 dark:text-zinc-500">
                  <Clock size={12} className="animate-pulse" />
                  في انتظار التأكيد من التطبيق...
                </div>
              </motion.div>
            )}

            <motion.button
              whileTap={{ scale: 0.98, y: 1 }}
              onClick={handleLink}
              disabled={verifying}
              className="flex items-center gap-2 px-6 py-2.5 bg-royal text-white rounded-xl text-sm font-semibold hover:bg-royal/90 disabled:opacity-60 transition-colors shadow-[0_4px_14px_-4px_rgba(11,61,46,0.4)]"
            >
              {verifying
                ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <Link size={16} />}
              {verifying ? "جارٍ التحقق..." : "ربط عبر نفاذ"}
            </motion.button>
          </div>
        </div>
      )}

      {/* Linked view */}
      {linked && (
        <div>
          <SectionTitle>بيانات الحساب الموثّق</SectionTitle>
          <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] p-5 space-y-3">
            {[
              { label: "رقم الهوية", value: "1XXXXXXXXX" },
              { label: "الاسم (من نفاذ)", value: "عبدالله بن محمد الشهراني" },
              { label: "تاريخ الربط", value: "1447/10/15" },
              { label: "صلاحية الشهادة", value: "1448/10/15" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-white/[0.04] last:border-0">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">{row.label}</span>
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{row.value}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              setLinked(false);
              setLocalMessage("تم إلغاء ربط نفاذ محلياً فقط؛ لا يوجد فصل خادمي الآن.");
            }}
            className="mt-3 text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
          >
            إلغاء ربط نفاذ
          </button>
        </div>
      )}
      <LocalActionStatus show={Boolean(localMessage)} message={localMessage ?? undefined} />
    </div>
  );
}
