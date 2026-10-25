"use client";

/**
 * «استيراد من القضية» (N3.5) — the hearings, stages, documents and parties the
 * open case really has, offered as cards. Each source is read through the same
 * RLS routes the case page uses, and each reports its own failure: a list that
 * could not be read never shows as an empty one.
 *
 * What this drawer never does: summarise, rank or score the case, or add a
 * party the file does not name. A case created from the lawyer dashboard
 * records no opponent (AddCaseModal stores the client only), and the parties
 * section says exactly that.
 */
import { useEffect, useMemo, useState } from "react";
import { CircleNotch, DownloadSimple, X } from "@phosphor-icons/react";
import type { GraphNode } from "./_graph-model";
import {
  documentCandidates,
  existingRefKeys,
  hearingCandidates,
  partyCandidates,
  refKey,
  stageCandidates,
  type ImportCandidate,
} from "./_graph-import";
import { getLawyerHearings } from "@/lib/services/lawyerHearingsService";
import { getCaseStages } from "@/lib/services/caseStagesService";
import { getServiceRequestDetail } from "@/lib/services/casesService";
import { extractCaseParties } from "@/lib/services/caseParties";
import { toArabicDigits } from "@/lib/services/arabicCount";

type SourceRead = { state: "loading" } | { state: "failed" } | { state: "ok"; items: ImportCandidate[] };

interface Section {
  id: "hearings" | "stages" | "documents" | "parties";
  title: string;
  empty: string;
  failed: string;
}

const SECTIONS: Section[] = [
  { id: "hearings", title: "جلسات القضية", empty: "لا جلسات مسجّلة لهذه القضية.", failed: "تعذّرت قراءة الجلسات." },
  { id: "stages", title: "درجات التقاضي", empty: "لا درجات تقاضٍ مسجّلة.", failed: "تعذّرت قراءة درجات التقاضي." },
  { id: "documents", title: "مستندات القضية", empty: "لا مستندات مرفقة بالقضية.", failed: "تعذّرت قراءة المستندات." },
  { id: "parties", title: "أطراف القضية", empty: "لا أطراف مسجّلون في ملف القضية.", failed: "تعذّرت قراءة أطراف القضية." },
];

export default function CaseImportDrawer({
  caseId,
  isDark,
  nodes,
  onImport,
  onClose,
}: {
  caseId: string;
  isDark: boolean;
  nodes: GraphNode[];
  onImport: (candidates: ImportCandidate[]) => void;
  onClose: () => void;
}) {
  const [reads, setReads] = useState<Record<Section["id"], SourceRead>>({
    hearings: { state: "loading" },
    stages: { state: "loading" },
    documents: { state: "loading" },
    parties: { state: "loading" },
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const onBoard = useMemo(() => existingRefKeys(nodes), [nodes]);

  useEffect(() => {
    let cancelled = false;
    const set = (id: Section["id"], r: SourceRead) => {
      if (!cancelled) setReads((prev) => ({ ...prev, [id]: r }));
    };
    getLawyerHearings({ caseId })
      .then(({ hearings }) => set("hearings", { state: "ok", items: hearingCandidates(hearings) }))
      .catch(() => set("hearings", { state: "failed" }));
    getCaseStages(caseId)
      .then(({ items }) => set("stages", { state: "ok", items: stageCandidates(items) }))
      .catch(() => set("stages", { state: "failed" }));
    getServiceRequestDetail(caseId)
      .then((detail) => {
        if (!detail) {
          set("documents", { state: "failed" });
          set("parties", { state: "failed" });
          return;
        }
        set("documents", { state: "ok", items: documentCandidates(detail.attachments ?? []) });
        set("parties", {
          state: "ok",
          items: partyCandidates(extractCaseParties({ requester: detail.requester, metadata: detail.metadata })),
        });
      })
      .catch(() => {
        set("documents", { state: "failed" });
        set("parties", { state: "failed" });
      });
    return () => { cancelled = true; };
  }, [caseId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const allCandidates = SECTIONS.flatMap((s) => {
    const r = reads[s.id];
    return r.state === "ok" ? r.items : [];
  });
  const chosen = allCandidates.filter((c) => selected.has(refKey(c.ref)) && !onBoard.has(refKey(c.ref)));

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const muted = isDark ? "text-zinc-500" : "text-zinc-500";
  return (
    <div
      role="dialog"
      aria-label="استيراد عناصر من ملف القضية"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      className={`absolute inset-y-0 start-0 z-40 flex w-80 max-w-full flex-col border-e shadow-2xl ${isDark ? "border-white/[0.08] bg-zinc-900" : "border-zinc-200 bg-white"}`}
    >
      <div className={`flex items-start justify-between gap-2 border-b p-3 ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
        <div>
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>استيراد من القضية</p>
          <p className={`mt-0.5 text-[10px] leading-relaxed ${muted}`}>
            كل بطاقة تشير إلى سجلّها في ملف القضية ولا تُستورد مرتين.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`rounded-lg p-1.5 ${isDark ? "text-zinc-400 hover:bg-white/10" : "text-zinc-500 hover:bg-zinc-100"}`}
          aria-label="إغلاق"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {SECTIONS.map((s) => {
          const r = reads[s.id];
          return (
            <section key={s.id} aria-label={s.title}>
              <p className={`mb-1.5 text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                {s.title}
                {r.state === "ok" && r.items.length > 0 && <span className={`ms-1 font-normal ${muted}`}>({toArabicDigits(r.items.length)})</span>}
              </p>
              {r.state === "loading" ? (
                <p className={`flex items-center gap-1.5 text-[11px] ${muted}`}><CircleNotch size={12} className="animate-spin" /> جارٍ القراءة...</p>
              ) : r.state === "failed" ? (
                <p className={`text-[11px] ${isDark ? "text-red-400" : "text-red-700"}`}>{s.failed}</p>
              ) : r.items.length === 0 ? (
                <p className={`text-[11px] ${muted}`}>{s.empty}</p>
              ) : (
                <ul className="space-y-1">
                  {r.items.map((c) => {
                    const key = refKey(c.ref);
                    const already = onBoard.has(key);
                    return (
                      <li key={key}>
                        <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 ${already ? "cursor-default opacity-60" : ""} ${isDark ? "border-white/[0.06] hover:bg-white/[0.03]" : "border-zinc-100 hover:bg-zinc-50"}`}>
                          <input
                            type="checkbox"
                            disabled={already}
                            checked={already || selected.has(key)}
                            onChange={() => toggle(key)}
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#C8A762]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[11px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{c.title}</span>
                            {c.desc && <span className={`block truncate text-[10px] ${muted}`}>{c.desc}</span>}
                            {already && <span className={`block text-[9px] ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>على اللوحة</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {s.id === "parties" && r.state === "ok" && !r.items.some((c) => c.desc === "الطرف الآخر") && (
                <p className={`mt-1.5 text-[10px] leading-relaxed ${muted}`}>
                  لا خصوم مسجّلون في ملف القضية — يمكنك إضافة بطاقة للخصم يدوياً.
                </p>
              )}
            </section>
          );
        })}
      </div>

      <div className={`border-t p-3 ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
        <button
          type="button"
          disabled={chosen.length === 0}
          onClick={() => { onImport(chosen); setSelected(new Set()); onClose(); }}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#C8A762] px-3 py-2 text-[12px] font-bold text-zinc-900 transition-opacity disabled:opacity-40"
        >
          <DownloadSimple size={14} />
          {chosen.length > 0 ? `استيراد المحدد (${toArabicDigits(chosen.length)})` : "اختر عناصر للاستيراد"}
        </button>
      </div>
    </div>
  );
}
