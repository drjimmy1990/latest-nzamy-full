"use client";

import Link from "next/link";
import { ArrowRight, Books } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import SmartFolders from "../components/SmartFolders";
import { MyNotesSection } from "../components/MyNotesSection";
import { ReadingHistoryBlock } from "./_ReadingHistoryBlock";
import { PlanBlock } from "./_PlanBlock";
import { DevicesBlock } from "./_DevicesBlock";

/** The five blocks, in the owner's order; the chips jump to each. */
const SECTIONS: { id: string; label: string }[] = [
  { id: "folders", label: "مجلداتي" },
  { id: "notes", label: "ملاحظاتي" },
  { id: "history", label: "سجل القراءة" },
  { id: "plan", label: "النقاط والاشتراك" },
  { id: "devices", label: "الأجهزة" },
];

/**
 * «مكتبتي» — the signed-in reader's own library (/laws/my; the server page
 * has already sent a guest to sign in). The folders and the notes are the
 * same panels the library home shows (SmartFolders: create, rename, delete,
 * open and remove items; MyNotesSection: each note with its document and a
 * link back), so the two can never disagree. The other three blocks read
 * their own routes; each has its loading, empty and failed state.
 */
export default function MyLibraryClient({ fullAccess }: { fullAccess: boolean | null }) {
  const { isDark } = useTheme();

  return (
    <main dir="rtl" className="min-h-[75dvh] bg-zinc-50 pb-20 pt-32 text-zinc-900 dark:bg-[#0c0f12] dark:text-zinc-100">
      <div className="mx-auto max-w-6xl px-4">
        <Link
          href="/laws"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-[#0B3D2E] dark:text-zinc-400 dark:hover:text-[#C8A762]"
        >
          <ArrowRight size={13} aria-hidden /> المكتبة القانونية
        </Link>

        <header className="mt-3 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0B3D2E] text-[#C8A762]">
            <Books size={22} weight="fill" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold sm:text-3xl">مكتبتي</h1>
            <p className="mt-0.5 text-xs leading-6 text-zinc-500 dark:text-zinc-400 sm:text-sm">
              مجلداتك وملاحظاتك وما قرأته، واشتراكك وأجهزتك — في مكان واحد.
            </p>
          </div>
        </header>

        <nav aria-label="أقسام مكتبتي" className="-mx-4 mt-5 overflow-x-auto px-4">
          <ul className="flex w-max gap-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="inline-flex whitespace-nowrap rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-bold text-zinc-700 hover:border-[#0B3D2E]/40 hover:text-[#0B3D2E] dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:border-[#C8A762]/40 dark:hover:text-[#C8A762]"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <section id="folders" aria-label="مجلداتي" className="scroll-mt-28">
              <SmartFolders isDark={isDark} isRTL />
            </section>
            <section id="notes" aria-label="ملاحظاتي" className="scroll-mt-28">
              <MyNotesSection isDark={isDark} isRTL />
            </section>
          </div>
          <div className="min-w-0 space-y-6">
            <ReadingHistoryBlock />
            <PlanBlock fullAccess={fullAccess} />
            <DevicesBlock />
          </div>
        </div>
      </div>
    </main>
  );
}
