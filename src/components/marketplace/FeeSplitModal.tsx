"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Calculator, X } from "@phosphor-icons/react";
import { type CollabRequest } from "./MyMarketplaceDashboardData";

interface FeeSplitModalProps {
  collab: CollabRequest;
  onClose: () => void;
  isDark: boolean;
}

export function FeeSplitModal({
  collab, onClose, isDark,
}: FeeSplitModalProps) {
  const [mySplit, setMySplit] = useState(collab.mySplit);
  const partnerSplit = 100 - mySplit;
  const myFee = Math.round((collab.totalFee * mySplit) / 100);
  const partnerFee = collab.totalFee - myFee;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[4px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 280, damping: 24 }}
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl ${
          isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-zinc-200"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#0B3D2E] flex items-center justify-center">
              <Calculator size={16} weight="duotone" className="text-[#C8A762]" />
            </div>
            <h3 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
              حاسبة توزيع الأتعاب
            </h3>
          </div>
          <button
            onClick={onClose}
            className={`flex h-7 w-7 items-center justify-center rounded-full ${
              isDark ? "bg-white/[0.07] text-zinc-400" : "bg-zinc-100 text-zinc-500"
            }`}
          >
            <X size={14} />
          </button>
        </div>

        {/* Case info */}
        <div className={`p-3 rounded-xl mb-4 text-[12px] ${
          isDark ? "bg-white/[0.03] border border-white/[0.05]" : "bg-zinc-50 border border-zinc-100"
        }`}>
          <p className={`font-bold mb-0.5 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{collab.caseTitle}</p>
          <p className={isDark ? "text-zinc-500" : "text-zinc-400"}>مع {collab.fromLawyer} · دوري: {collab.myRole}</p>
        </div>

        {/* Total Fee */}
        <div className="flex items-center justify-between mb-4">
          <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>إجمالي الأتعاب</span>
          <span className={`text-[16px] font-bold font-mono ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
            {collab.totalFee.toLocaleString()} ر.س
          </span>
        </div>

        {/* Slider */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-[12px] mb-2">
            <span className={isDark ? "text-zinc-400" : "text-zinc-500"}>نصيبي</span>
            <span className={`font-bold font-mono ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{mySplit}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={90}
            value={mySplit}
            onChange={(e) => setMySplit(Number(e.target.value))}
            className="w-full accent-[#0B3D2E] cursor-pointer"
          />
          <div className="flex items-center justify-between text-[11px] mt-1">
            <span className={isDark ? "text-zinc-600" : "text-zinc-400"}>10٪</span>
            <span className={isDark ? "text-zinc-600" : "text-zinc-400"}>90٪</span>
          </div>
        </div>

        {/* Split result */}
        <div className={`rounded-2xl p-4 border mb-5 ${
          isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-zinc-100 bg-zinc-50"
        }`}>
          {/* Visual bar */}
          <div className="h-3 rounded-full overflow-hidden flex mb-3">
            <motion.div
              animate={{ width: `${mySplit}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
              className="bg-[#0B3D2E] h-full"
            />
            <div className="flex-1 bg-[#C8A762] h-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={`text-[10px] mb-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>نصيبي ({mySplit}٪)</p>
              <p className={`text-[16px] font-bold font-mono ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                {myFee.toLocaleString()} ر.س
              </p>
            </div>
            <div className="text-end">
              <p className={`text-[10px] mb-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>نصيب الشريك ({partnerSplit}٪)</p>
              <p className={`text-[16px] font-bold font-mono ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                {partnerFee.toLocaleString()} ر.س
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button className="flex-1 rounded-xl bg-[#0B3D2E] py-2.5 text-[14px] font-bold text-[#C8A762] hover:bg-[#155e41] transition-colors">
            اقترح هذا التوزيع
          </button>
          <button
            onClick={onClose}
            className={`rounded-xl px-4 py-2.5 text-[13px] font-bold transition-colors ${
              isDark ? "bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1]" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            إلغاء
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
