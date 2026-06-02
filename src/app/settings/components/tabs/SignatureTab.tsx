"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  PenNib, Upload, CheckCircle, Shield,
} from "@phosphor-icons/react";
import { BackendReadyNotice, LocalActionStatus, SectionTitle } from "./_shared";

export function SignatureTab() {
  const [hasSignature, setHasSignature] = useState(false);
  const [hasStamp, setHasStamp] = useState(false);
  const [digitalActive, setDigitalActive] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const signRef = useRef<HTMLInputElement>(null);
  const stampRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-8">
      <BackendReadyNotice />

      {/* Explainer */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-[#C8A762]/20 bg-[#C8A762]/[0.04]">
        <PenNib size={22} weight="fill" className="text-[#C8A762] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">التوقيع الإلكتروني</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
            يُستخدم توقيعك وختمك في المستندات المُولَّدة والعقود والمذكرات داخل المنصة.
            يُحفظ مشفراً ولا يُشارَك مع أي طرف خارجي.
          </p>
        </div>
      </div>

      {/* Handwritten signature */}
      <div>
        <SectionTitle>التوقيع المكتوب</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] p-5">
          {hasSignature ? (
            <div className="flex items-center gap-4">
              <div className="flex-1 h-24 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10 flex items-center justify-center">
                <p className="font-bold text-2xl text-zinc-700 dark:text-zinc-300 italic" style={{ fontFamily: "serif" }}>
                  فهد النمر
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setHasSignature(false);
                    setLocalMessage("حذف التوقيع محلي فقط؛ لا يوجد حذف من التخزين الآن.");
                  }}
                  className="text-xs text-red-500 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-lg transition-colors font-medium"
                >
                  حذف
                </button>
                <button
                  onClick={() => {
                    signRef.current?.click();
                    setLocalMessage("تغيير التوقيع جاهز لرفع ملفات حقيقي لاحقاً.");
                  }}
                  className="text-xs text-royal dark:text-[#C8A762] border border-royal/20 dark:border-[#C8A762]/20 px-3 py-1.5 rounded-lg hover:bg-royal/5 transition-colors font-medium"
                >
                  تغيير
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                signRef.current?.click();
                setHasSignature(true);
                setLocalMessage("تمت محاكاة رفع التوقيع محلياً فقط.");
              }}
              className="w-full h-24 border-2 border-dashed border-gray-200 dark:border-white/[0.08] rounded-xl flex flex-col items-center justify-center gap-2 hover:border-royal/40 dark:hover:border-[#C8A762]/40 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-all group"
            >
              <Upload size={20} className="text-zinc-400 group-hover:text-royal dark:group-hover:text-[#C8A762] transition-colors" />
              <span className="text-sm text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
                رفع صورة التوقيع (PNG شفاف)
              </span>
            </button>
          )}
          <input ref={signRef} type="file" accept="image/*" className="hidden" />
        </div>
      </div>

      {/* Official stamp */}
      <div>
        <SectionTitle>الختم الرسمي</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] p-5">
          {hasStamp ? (
            <div className="flex items-center gap-4">
              <div className="flex-1 h-24 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full border-2 border-[#0B3D2E] flex items-center justify-center">
                  <Shield size={24} className="text-[#0B3D2E] dark:text-emerald-400" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setHasStamp(false);
                    setLocalMessage("حذف الختم محلي فقط؛ لا يوجد حذف من التخزين الآن.");
                  }}
                  className="text-xs text-red-500 border border-red-200 dark:border-red-800 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors font-medium"
                >
                  حذف
                </button>
                <button
                  onClick={() => {
                    stampRef.current?.click();
                    setLocalMessage("تغيير الختم جاهز لرفع ملفات حقيقي لاحقاً.");
                  }}
                  className="text-xs text-royal dark:text-[#C8A762] border border-royal/20 dark:border-[#C8A762]/20 px-3 py-1.5 rounded-lg transition-colors font-medium"
                >
                  تغيير
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                stampRef.current?.click();
                setHasStamp(true);
                setLocalMessage("تمت محاكاة رفع الختم محلياً فقط.");
              }}
              className="w-full h-24 border-2 border-dashed border-gray-200 dark:border-white/[0.08] rounded-xl flex flex-col items-center justify-center gap-2 hover:border-royal/40 dark:hover:border-[#C8A762]/40 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-all group"
            >
              <Upload size={20} className="text-zinc-400 group-hover:text-royal dark:group-hover:text-[#C8A762] transition-colors" />
              <span className="text-sm text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
                رفع صورة الختم (PNG شفاف)
              </span>
            </button>
          )}
          <input ref={stampRef} type="file" accept="image/*" className="hidden" />
        </div>
      </div>

      {/* Digital signature */}
      <div>
        <SectionTitle>التوقيع الرقمي (eSignature)</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">تفعيل التوقيع الرقمي الموثوق</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                عبر خدمة Nafath / emdha — للتوقيع على العقود بقوة قانونية ملزمة
              </p>
            </div>
            <button
              onClick={() => {
                setDigitalActive(!digitalActive);
                setLocalMessage("تفعيل التوقيع الرقمي محاكاة محلية؛ التكامل مع نفاذ/إمضاء مؤجل.");
              }}
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${digitalActive ? "bg-royal" : "bg-gray-200 dark:bg-gray-700"}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${digitalActive ? "start-6" : "start-0.5"}`} />
            </button>
          </div>
          {digitalActive && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 flex items-center gap-3"
            >
              <CheckCircle size={18} weight="fill" className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  جارٍ التحقق عبر Nafath
                </p>
                <p className="text-[11px] text-emerald-600/70 dark:text-emerald-400/70">
                  ستصلك رسالة نفاذ للتأكيد على جوالك
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <LocalActionStatus show={Boolean(localMessage)} message={localMessage ?? undefined} />
    </div>
  );
}
