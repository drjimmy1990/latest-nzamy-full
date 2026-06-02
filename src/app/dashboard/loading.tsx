"use client";

import { motion } from "framer-motion";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-[#0B3D2E] to-[#C8A762]"
        />
        <p className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">
          تحميل لوحة التحكم...
        </p>
      </div>
    </div>
  );
}
