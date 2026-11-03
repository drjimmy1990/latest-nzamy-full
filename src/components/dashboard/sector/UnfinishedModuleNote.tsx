"use client";

import { Warning } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { MODULE_PAGE_NOTE, unfinishedModuleAt } from "@/constants/sectorUnfinishedModules";

/**
 * LIVE-F07 (owner package 2026-10-30): the banner at the top of an unfinished
 * sector module's own page. Someone who reaches the page from the sidebar
 * never sees the list on the home page, so the page itself says what is
 * missing. The text comes from sectorUnfinishedModules.ts by route; a route
 * that is not listed renders nothing (the module was built and its line
 * deleted — then delete this banner too).
 */
export function UnfinishedModuleNote({ href }: { href: string }) {
  const { isDark } = useTheme();
  const mod = unfinishedModuleAt(href);
  if (!mod) return null;
  return (
    <div
      role="note"
      dir="rtl"
      className={`flex items-start gap-2 rounded-xl border p-3 text-[12px] leading-relaxed ${
        isDark ? "border-amber-500/20 bg-amber-500/5 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      <Warning size={14} weight="fill" className="mt-0.5 shrink-0" />
      <span>
        <strong>هذه الوحدة لم تكتمل بعد — {mod.name}:</strong> {mod.state} {MODULE_PAGE_NOTE}
      </span>
    </div>
  );
}
