"use client";

import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";

/**
 * The card every «مكتبتي» block of its own sits in — the same surface as the
 * reused library panels (SmartFolders / MyNotesSection), in both themes.
 */
export function BlockShell({
  id,
  icon: IconCmp,
  title,
  subtitle,
  children,
}: {
  id: string;
  icon: Icon;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const headingId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="scroll-mt-28 rounded-[1.75rem] border border-zinc-200/80 bg-white/80 p-4 sm:p-5 dark:border-[#2d3748] dark:bg-[#161b22]/60"
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0B3D2E]/5 text-[#0B3D2E] dark:bg-[#C8A762]/10 dark:text-[#C8A762]">
          <IconCmp size={18} weight="duotone" />
        </span>
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-bold text-zinc-900 dark:text-white">{title}</h2>
          {subtitle ? <p className="text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

/** A muted one-line state (empty, unavailable) inside a block. */
export function BlockNote({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" }) {
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      className={`text-xs leading-6 ${tone === "error" ? "text-red-600 dark:text-red-300" : "text-zinc-500 dark:text-zinc-400"}`}
    >
      {children}
    </p>
  );
}
