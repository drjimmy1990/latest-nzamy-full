"use client";

import { Fragment } from "react";
import { BookOpen, Scales } from "@phosphor-icons/react";

/**
 * A library tool's answer (wave 2): the text with its [S…] markers as numbered
 * links, and the list of the texts they point to. The citations are the
 * server's (runCore.mapCitations): only ids the app itself sent, each resolved
 * to a library title and link. A marker the server dropped is dropped here too.
 */

export interface Citation {
  sid: string;
  kind: string;
  title: string;
  url: string;
}

export function asCitations(raw: unknown): Citation[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is Citation =>
      typeof c === "object" && c !== null &&
      typeof (c as Citation).sid === "string" && typeof (c as Citation).url === "string" && typeof (c as Citation).title === "string",
  );
}

/** The text without its markers, for copying. */
export const stripCitationMarkers = (text: string) => text.replace(/\s?\[S\d{1,3}\]/g, "");

export function CitedText({ text, cites, isDark, className = "" }: { text: string; cites: Citation[]; isDark: boolean; className?: string }) {
  const bySid = new Map(cites.map((c, i) => [c.sid, { ...c, n: i + 1 }]));
  return (
    <p className={`whitespace-pre-wrap ${className}`}>
      {text.split(/(\[S\d{1,3}\])/g).map((part, i) => {
        const m = /^\[(S\d{1,3})\]$/.exec(part);
        if (!m) return <Fragment key={i}>{part}</Fragment>;
        const c = bySid.get(m[1]);
        if (!c) return null;
        return (
          <a
            key={i}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            title={c.title}
            className={`mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 align-super text-[10px] font-black ${
              isDark ? "bg-[#C8A762]/15 text-[#C8A762] hover:bg-[#C8A762]/25" : "bg-[#0B3D2E]/10 text-[#0B3D2E] hover:bg-[#0B3D2E]/20"
            }`}
          >
            {c.n}
          </a>
        );
      })}
    </p>
  );
}

export function SourceList({ cites, isDark, compact = false }: { cites: Citation[]; isDark: boolean; compact?: boolean }) {
  if (cites.length === 0) return null;
  return (
    <ol className={compact ? "space-y-1" : "space-y-1.5"}>
      {cites.map((c, i) => (
        <li key={c.sid}>
          <a
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-start gap-2 rounded-xl border transition-colors ${compact ? "px-2 py-1.5 text-[11px]" : "px-3 py-2 text-[12px]"} ${
              isDark ? "border-white/[0.06] hover:bg-white/[0.03] text-zinc-300" : "border-zinc-100 hover:bg-zinc-50 text-zinc-700"
            }`}
          >
            <span className={`mt-0.5 font-black ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{i + 1}</span>
            {c.kind === "principle" ? (
              <Scales size={14} className="mt-0.5 shrink-0 text-amber-500" />
            ) : (
              <BookOpen size={14} className="mt-0.5 shrink-0 text-blue-500" />
            )}
            <span className="leading-relaxed">{c.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}
