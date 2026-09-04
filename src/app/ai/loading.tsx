"use client";

import { motion } from "framer-motion";
import Image from "next/image";

/**
 * Route-segment fallback for /ai/*.
 *
 * Owner item ٨٣ — the "double loading" flash.
 *
 * This file is not a page. `src/app/ai/layout.tsx` always wraps it in one of
 * the dashboard layouts, so it renders INSIDE `<main class="lg:mr-64 pt-[60px]
 * min-h-[100dvh]"><div class="p-4 md:p-6">` — the sidebar and the header are
 * already on screen and already painted by the time this appears.
 *
 * It was written as if it were the whole screen: `min-h-screen` plus an opaque
 * `bg-zinc-50 dark:bg-zinc-950`. Both are wrong in that slot.
 *
 *   • `min-h-screen` inside a container that is already `min-h-[100dvh]` and
 *     offset 60px adds a second viewport of height, so the page grows a
 *     scrollbar and the spinner sits below the fold rather than centred.
 *   • The opaque background is a different colour from the layout's own
 *     `bg-surface` / `dark:bg-dark-bg`, so it paints a visibly distinct panel
 *     inside the dashboard — the second loading screen the owner saw.
 *
 * Fixed by making it in-flow and transparent: it now occupies a reasonable
 * band of the content area and lets the dashboard's own background show
 * through, so there is one loading state on screen instead of two.
 */
export default function AILoading() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        {/* Owner note ٩٤ — the rotating gradient blob read as an unfinished
            placeholder rather than a designed loader. Replaced with the real
            platform mark (/logo.png, drawn the same way SharedSidebar.tsx
            draws it) doing a gentle breathing pulse instead of a spin. */}
        <motion.div
          animate={{ opacity: [0.45, 1, 0.45], scale: [0.92, 1, 0.92] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          className="h-12 w-12 rounded-2xl overflow-hidden flex items-center justify-center"
        >
          <Image src="/logo.png" alt="نظامي" width={48} height={48} className="h-12 w-12 object-contain" />
        </motion.div>
        <p className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">
          جارٍ التحميل...
        </p>
      </div>
    </div>
  );
}
