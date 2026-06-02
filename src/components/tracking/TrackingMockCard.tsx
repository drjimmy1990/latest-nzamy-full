import { motion } from "framer-motion";
import { CheckCircle, Clock, Spinner, ArrowSquareOut } from "@phosphor-icons/react";
import { TrackingStep } from "@/components/tracking/types";

interface TrackingMockCardProps {
  isRTL: boolean;
  trackingSteps: TrackingStep[];
}

export function TrackingMockCard({ isRTL, trackingSteps }: TrackingMockCardProps) {
  return (
    <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-black/10">
      {/* Card Header */}
      <div className="bg-gradient-to-r from-[#0B3D2E] to-[#0d5038] p-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white/60 text-xs">
              {isRTL ? "رقم المعاملة" : "Transaction No."}
            </span>
            <span className="bg-[#C8A762]/20 border border-[#C8A762]/30 text-[#C8A762] text-xs font-mono px-2 py-0.5 rounded-full">
              2024-12345
            </span>
          </div>
          <h3 className="text-white font-bold text-lg">
            {isRTL ? "تجديد السجل التجاري" : "Commercial Registration Renewal"}
          </h3>
          <p className="text-white/50 text-sm mt-1">
            {isRTL ? "وزارة التجارة" : "Ministry of Commerce"}
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/30 rounded-full px-3 py-1.5">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          >
            <Spinner size={14} className="text-amber-400" />
          </motion.div>
          <span className="text-amber-300 text-xs font-semibold">
            {isRTL ? "قيد التنفيذ" : "In Progress"}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-6 py-5 border-b border-gray-100 dark:border-white/5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {isRTL ? "نسبة الإنجاز" : "Completion"}
          </span>
          <span className="text-xs font-bold text-[#0B3D2E] dark:text-[#C8A762]">
            ٥٠٪
          </span>
        </div>
        <div className="h-2.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-[#0B3D2E] to-[#C8A762] rounded-full"
            initial={{ width: "0%" }}
            whileInView={{ width: "50%" }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, ease: "easeOut", delay: 0.3 }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="p-6 space-y-1">
        {trackingSteps.map((step, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: isRTL ? 20 : -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className="flex items-center gap-4 py-3"
          >
            {/* Status Icon */}
            <div className="flex-shrink-0 relative">
              {step.status === "done" ? (
                <div className="w-9 h-9 rounded-full bg-[#0B3D2E]/15 dark:bg-[#0B3D2E]/40 flex items-center justify-center">
                  <CheckCircle size={20} className="text-[#0B3D2E] dark:text-[#C8A762]" weight="fill" />
                </div>
              ) : step.status === "active" ? (
                <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  >
                    <Spinner size={20} className="text-amber-500" />
                  </motion.div>
                </div>
              ) : (
                <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center">
                  <Clock size={18} className="text-gray-400" />
                </div>
              )}
              {i < trackingSteps.length - 1 && (
                <div
                  className={`absolute top-full start-1/2 -translate-x-1/2 w-0.5 h-4 mt-1 ${
                    step.status === "done"
                      ? "bg-[#0B3D2E]/30 dark:bg-[#C8A762]/30"
                      : "bg-gray-200 dark:bg-white/10"
                  }`}
                />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-semibold ${
                  step.status === "done"
                    ? "text-gray-900 dark:text-white"
                    : step.status === "active"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-gray-400 dark:text-gray-600"
                }`}
              >
                {isRTL ? step.ar : step.en}
              </p>
            </div>

            <div className="flex-shrink-0">
              <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                {isRTL ? step.time_ar : step.time_en}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Card Footer */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-[#111620] border-t border-gray-100 dark:border-white/5 flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {isRTL ? "آخر تحديث: منذ ٥ دقائق" : "Last updated: 5 minutes ago"}
        </span>
        <button className="flex items-center gap-1.5 text-xs font-semibold text-[#0B3D2E] dark:text-[#C8A762] hover:underline">
          {isRTL ? "عرض التفاصيل" : "View Details"}
          <ArrowSquareOut size={12} />
        </button>
      </div>
    </div>
  );
}
