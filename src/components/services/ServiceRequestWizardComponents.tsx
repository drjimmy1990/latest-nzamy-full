"use client";

import { motion } from "framer-motion";
import { CheckCircle } from "@phosphor-icons/react";

export function SummaryRow({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-[11px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>{label}</span>
      <span className={`text-[11px] font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{value}</span>
    </div>
  );
}

interface SuccessScreenProps {
  isRTL: boolean;
  isDark: boolean;
  heading: string;
  muted: string;
  requestId: string | null;
  onClose: () => void;
}

export function SuccessScreen({ isRTL, isDark, heading, muted, requestId, onClose }: SuccessScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center text-center py-8 gap-4"
    >
      <div className="w-20 h-20 rounded-full bg-[#0B3D2E]/10 dark:bg-[#C8A762]/10 flex items-center justify-center">
        <CheckCircle size={44} weight="fill" className="text-[#0B3D2E] dark:text-[#C8A762]" />
      </div>
      <div>
        <h3 className={`text-xl font-black mb-2 ${heading}`}>{isRTL ? "تم إرسال الطلب" : "Request Sent"}</h3>
        <p className={`text-sm max-w-sm mx-auto leading-relaxed ${muted}`}>
          {isRTL
            ? "تم حفظ الطلب وإرساله إلى لوحة المستلم المناسبة في بيانات الديمو."
            : "The request was saved and routed to the right recipient dashboard in demo data."}
        </p>
        {requestId && (
          <p className={`mt-2 text-xs font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
            {isRTL ? `رقم الطلب: ${requestId}` : `Request ID: ${requestId}`}
          </p>
        )}
      </div>
      <div className={`w-full rounded-2xl border p-4 ${isDark ? "border-[#2d3748] bg-white/3" : "border-gray-100 bg-gray-50"}`}>
        <div className="flex items-center justify-center gap-6 text-center">
          {[
            { v: "~2h", l: isRTL ? "أول رد" : "First Reply" },
            { v: "3-5", l: isRTL ? "عروض متوقعة" : "Expected Bids" },
            { v: "NDA", l: isRTL ? "محمي" : "Protected" },
          ].map(item => (
            <div key={item.l}>
              <p className="text-lg font-black text-[#0B3D2E] dark:text-[#C8A762]">{item.v}</p>
              <p className={`text-[10px] ${muted}`}>{item.l}</p>
            </div>
          ))}
        </div>
      </div>
      <button onClick={onClose} className="mt-2 px-8 py-3 bg-[#0B3D2E] hover:bg-[#0a3328] text-white text-sm font-bold rounded-xl transition">
        {isRTL ? "إغلاق" : "Close"}
      </button>
    </motion.div>
  );
}
