"use client";

/**
 * The articles an AI result relies on, each with the LIBRARY's verdict
 * (citationCheck.ts on the server: in force / amended / repealed / not in the
 * library / not checked). The model only says what it cites; it never says
 * whether an article exists. Shared by L8, L9 and L10.
 */
import Link from "next/link";
import { SealWarning, CheckCircle, XCircle, Question, ArrowSquareOut } from "@phosphor-icons/react";

export interface CitationVerdict {
  cited: string;
  law: string;
  article: number;
  status: "ok" | "amended" | "repealed" | "not_found" | "unchecked";
  missing?: "law" | "article";
  law_title?: string;
  url?: string;
}

export function asCitationVerdicts(v: unknown): CitationVerdict[] {
  return Array.isArray(v) ? (v as CitationVerdict[]) : [];
}

function verdictOf(c: CitationVerdict) {
  switch (c.status) {
    case "ok": return { label: "سارية", Icon: CheckCircle, cls: "text-emerald-500" };
    case "amended": return { label: "معدّلة — راجع نصها الحالي", Icon: SealWarning, cls: "text-amber-500" };
    case "repealed": return { label: "ملغاة", Icon: XCircle, cls: "text-red-500" };
    case "not_found":
      return {
        label: c.missing === "law" ? "لم يُعثر على النظام في المكتبة" : "لا توجد مادة بهذا الرقم في النظام",
        Icon: XCircle,
        cls: "text-red-500",
      };
    default: return { label: "لم يُتحقق منها", Icon: Question, cls: "text-zinc-400" };
  }
}

export default function CitationCheckList({ items, isDark, title, empty }: {
  items: CitationVerdict[];
  isDark: boolean;
  title: string;
  empty: string;
}) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const head = `text-[11px] font-black uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-zinc-400"}`;
  const body = isDark ? "text-zinc-300" : "text-zinc-700";
  return (
    <div className={`${card} p-5 shadow-sm space-y-3`}>
      <p className={head}>{title}</p>
      {items.length === 0 && <p className={`text-[12px] ${body}`}>{empty}</p>}
      {items.map((c, i) => {
        const v = verdictOf(c);
        return (
          <div key={i} className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 ${isDark ? "bg-white/[0.03]" : "bg-zinc-50"}`}>
            <v.Icon size={15} weight="fill" className={`mt-0.5 flex-shrink-0 ${v.cls}`} />
            <div className="min-w-0 flex-1">
              <p className={`text-[12px] font-semibold ${body}`}>{c.cited}</p>
              <p className={`text-[11px] ${v.cls}`}>
                {v.label}
                {c.law_title && c.status !== "not_found" ? ` · ${c.law_title} — المادة ${c.article.toLocaleString("ar-SA")}` : ""}
              </p>
            </div>
            {c.url && (
              <Link href={c.url} target="_blank" className={`flex-shrink-0 text-[11px] font-bold inline-flex items-center gap-1 ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                النص <ArrowSquareOut size={11} />
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
