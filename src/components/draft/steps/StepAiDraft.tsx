"use client";

import { useEffect, useState } from "react";
import {
  Sparkle, CheckCircle, XCircle, Plus, Trash, Warning, FileDoc, Scales, ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { useAiRun } from "@/hooks/useAiRun";
import AiResultActions from "@/components/AiResultActions";
import CitationCheckList from "@/components/ai/CitationCheckList";
import { CitedText, SourceList, asCitations } from "@/components/ai/CitedAnswer";
import { DRAFT_KINDS, type DraftKindId } from "@/lib/ai/draftKinds";
import {
  analysisInput, asDraftAnalysis, asPleading, canAnalyse, draftBlocker, draftInput, pleadingText, pleadingWordHtml,
  type DraftAnalysis, type WizardFacts,
} from "@/components/draft/legalDraft";

/**
 * StepAiDraft — L14 الصائغ القانوني (plan §5 wave 5; owner LIVE-F02 and
 * NOTE-22): the pleading is written by the AI by default, in two steps of
 * one paid work —
 *
 *   1. «تحليل الوقائع»: facts, issues and proposed defences, which the lawyer
 *      keeps, rejects or edits (the StepDefenses look);
 *   2. «اكتب المذكرة»: the pleading from what he kept, grounded in the library
 *      and checked against it (citation_check).
 *
 * The price is charged once, on the analysis; the draft is free, and a failed
 * draft is tried again free. A review by the Nzamy team is a separate,
 * optional order below this card (the page renders it), never the default.
 */

interface Props {
  isDark: boolean;
  kind: DraftKindId;
  facts: WizardFacts;
  fileIds: string[];
  skippedFiles: string[];
  /** The pleading as text once written ("" before): the optional team review carries it. */
  onPleading: (text: string) => void;
  /** The tool is switched off (the run answered `tool_off`): the page offers the team order instead. */
  onToolOff: () => void;
}

export function StepAiDraft({ isDark, kind, facts, fileIds, skippedFiles, onPleading, onToolOff }: Props) {
  const analysis = useAiRun();
  const writing = useAiRun();
  const [sent, setSent] = useState<Record<string, unknown> | null>(null);
  // The lawyer's copy of the analysis; until he edits it, the analysis as read.
  const [changes, setChanges] = useState<DraftAnalysis | null>(null);
  const [wordFailed, setWordFailed] = useState(false);

  const spec = DRAFT_KINDS[kind];
  const read = analysis.phase === "done" ? asDraftAnalysis(analysis.output) : null;
  const edited = read ? changes ?? read : null;
  const sourcesA = asCitations(analysis.citations);
  const pleading = writing.phase === "done" ? asPleading(writing.output) : null;
  const sourcesB = asCitations(writing.citations);
  const blocker = edited ? draftBlocker(edited) : null;
  const written = pleading ? pleadingText(pleading) : "";
  useEffect(() => { onPleading(written); }, [written, onPleading]);
  const toolOff = analysis.code === "tool_off";
  useEffect(() => { if (toolOff) onToolOff(); }, [toolOff, onToolOff]);
  // The analysis is fixed while the draft is written and once it exists: the
  // work is one analysis and one draft (a third run is refused).
  const locked = writing.busy || !!pleading;

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const muted = isDark ? "text-zinc-500" : "text-zinc-400";
  const field = `w-full rounded-xl p-2.5 text-[12px] border ${isDark ? "bg-zinc-950 border-white/[0.07] text-zinc-200" : "bg-white border-zinc-200 text-zinc-800"}`;

  function startAnalysis() {
    const input = analysisInput(facts);
    setSent(input);
    setChanges(null);
    writing.reset();
    void analysis.start("legal-drafter", input, { fileIds });
  }

  function startDraft() {
    if (!sent || !edited || blocker || !analysis.conversationId) return;
    void writing.start("legal-drafter", draftInput(sent, edited), { conversationId: analysis.conversationId });
  }

  function downloadWord() {
    if (!pleading) return;
    try {
      const blob = new Blob(["﻿", pleadingWordHtml(pleading)], { type: "application/msword" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${spec.label}.doc`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setWordFailed(true);
    }
  }

  const update = (patch: Partial<DraftAnalysis>) => { if (edited) setChanges({ ...edited, ...patch }); };

  return (
    <div className="space-y-4" dir="rtl">
      <div className={`${card} p-5 space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className={`flex items-center gap-2 text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
              <Sparkle size={16} weight="fill" className="text-[#C8A762]" /> الصياغة بالذكاء الاصطناعي — {spec.label}
            </h2>
            <p className={`text-[12px] ${muted}`}>
              خطوتان: يحلّل الوقائع ويقترح المسائل والدفوع فتراجعها، ثم يكتب المذكرة مما اعتمدته، مستنداً إلى المكتبة القانونية.
            </p>
          </div>
          <span className="rounded-full border border-[#C8A762]/30 bg-[#C8A762]/10 px-3 py-1 text-[11px] font-bold text-[#C8A762]">
            {spec.price.toLocaleString("ar-SA")} نقطة — تشمل التحليل والصياغة
          </span>
        </div>

        {/* ── 1. the analysis ─────────────────────────────────────────── */}
        {!edited && (
          <div className="space-y-3">
            {skippedFiles.length > 0 && (
              <p className={`text-[11px] ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                لا يقرأ الذكاء الاصطناعي ملفات Word؛ لن تُرسل: {skippedFiles.join("، ")}. أرفقها PDF إن كانت فيها الوقائع.
              </p>
            )}
            {!canAnalyse(facts) && (
              <p className={`text-[11px] ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                اكتب الوقائع (٣٠ حرفاً على الأقل) أو أرفق مستنداتها بصيغة PDF أو صورة في الخطوة السابقة.
              </p>
            )}
            <RunStatus isDark={isDark} run={analysis} busyText="يحلّل الذكاء الاصطناعي الوقائع والمستندات — قد يستغرق ذلك دقيقة أو دقيقتين." />
            <button
              type="button"
              onClick={startAnalysis}
              disabled={analysis.busy || !canAnalyse(facts)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-6 py-3 text-[13px] font-bold text-white shadow-md disabled:opacity-40"
            >
              <Sparkle size={15} /> {analysis.busy ? "جارٍ التحليل..." : analysis.phase === "error" ? "أعد التحليل" : "تحليل الوقائع"}
            </button>
          </div>
        )}

        {edited && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className={`text-[12px] font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                التحليل جاهز — راجعه وعدّله، فالمذكرة تُكتب مما تعتمده هنا وحده.
              </p>
              {analysis.chargedPoints > 0 && <span className={`text-[11px] ${muted}`}>خُصمت {analysis.chargedPoints.toLocaleString("ar-SA")} نقطة</span>}
            </div>

            <label className="block space-y-1.5">
              <span className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الوقائع كما ستُكتب في المذكرة</span>
              <textarea rows={7} value={edited.facts_summary} onChange={(e) => update({ facts_summary: e.target.value })} className={field} disabled={locked} />
            </label>

            <section className="space-y-2">
              <h3 className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>المسائل محل النزاع</h3>
              {edited.issues.map((issue, n) => (
                <div key={n} className={`rounded-xl border p-3 space-y-2 ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-black ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{(n + 1).toLocaleString("ar-SA")}</span>
                    <input value={issue.title} onChange={(e) => update({ issues: edited.issues.map((x, i) => (i === n ? { ...x, title: e.target.value } : x)) })} className={field} disabled={locked} />
                    <button type="button" aria-label="حذف المسألة" disabled={locked} onClick={() => update({ issues: edited.issues.filter((_, i) => i !== n) })} className="text-red-500 disabled:opacity-40"><Trash size={14} /></button>
                  </div>
                  <textarea rows={2} value={issue.detail} onChange={(e) => update({ issues: edited.issues.map((x, i) => (i === n ? { ...x, detail: e.target.value } : x)) })} className={field} disabled={locked} />
                </div>
              ))}
              {edited.issues.length < 12 && (
                <button type="button" disabled={locked} onClick={() => update({ issues: [...edited.issues, { title: "", detail: "" }] })} className={`flex items-center gap-1 text-[11px] font-semibold ${muted}`}>
                  <Plus size={12} /> أضف مسألة
                </button>
              )}
            </section>

            <section className="space-y-2">
              <h3 className={`flex items-center gap-1.5 text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}><Scales size={14} /> الدفوع والأسانيد المقترحة — اعتمد أو استبعد</h3>
              {edited.defenses.map((d, n) => (
                <div key={n} className={`rounded-xl border p-3 space-y-2 transition-opacity ${d.kept ? "" : "opacity-55"} ${
                  d.kept ? (isDark ? "border-emerald-500/20" : "border-emerald-200") : isDark ? "border-white/[0.06]" : "border-zinc-100"
                }`}>
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label="اعتماد الدفع" disabled={locked} onClick={() => update({ defenses: edited.defenses.map((x, i) => (i === n ? { ...x, kept: true } : x)) })}
                      className={`h-7 w-7 shrink-0 rounded-lg flex items-center justify-center ${d.kept ? "bg-emerald-500 text-white" : isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-400"}`}>
                      <CheckCircle size={13} weight="fill" />
                    </button>
                    <button type="button" aria-label="استبعاد الدفع" disabled={locked} onClick={() => update({ defenses: edited.defenses.map((x, i) => (i === n ? { ...x, kept: false } : x)) })}
                      className={`h-7 w-7 shrink-0 rounded-lg flex items-center justify-center ${!d.kept ? "bg-red-500 text-white" : isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-400"}`}>
                      <XCircle size={13} weight="fill" />
                    </button>
                    <input value={d.title} onChange={(e) => update({ defenses: edited.defenses.map((x, i) => (i === n ? { ...x, title: e.target.value } : x)) })} className={field} disabled={locked} />
                    {d.issue !== null && <span className={`shrink-0 text-[10px] ${muted}`}>المسألة {d.issue.toLocaleString("ar-SA")}</span>}
                  </div>
                  {d.basis && <CitedText text={d.basis} cites={sourcesA} isDark={isDark} className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`} />}
                </div>
              ))}
              {edited.defenses.length < 15 && (
                <button type="button" disabled={locked} onClick={() => update({ defenses: [...edited.defenses, { title: "", basis: "", issue: null, kept: true }] })} className={`flex items-center gap-1 text-[11px] font-semibold ${muted}`}>
                  <Plus size={12} /> أضف دفعاً
                </button>
              )}
            </section>

            <section className="space-y-2">
              <h3 className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الطلبات</h3>
              {edited.requests.map((r, n) => (
                <div key={n} className="flex items-center gap-2">
                  <input value={r} onChange={(e) => update({ requests: edited.requests.map((x, i) => (i === n ? e.target.value : x)) })} className={field} disabled={locked} />
                  <button type="button" aria-label="حذف الطلب" disabled={locked} onClick={() => update({ requests: edited.requests.filter((_, i) => i !== n) })} className="text-red-500 disabled:opacity-40"><Trash size={14} /></button>
                </div>
              ))}
              {edited.requests.length < 10 && (
                <button type="button" disabled={locked} onClick={() => update({ requests: [...edited.requests, ""] })} className={`flex items-center gap-1 text-[11px] font-semibold ${muted}`}>
                  <Plus size={12} /> أضف طلباً
                </button>
              )}
            </section>

            {edited.missing.length > 0 && (
              <div className={`rounded-xl border p-3 ${isDark ? "border-amber-900/40 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
                <p className={`mb-1 flex items-center gap-1.5 text-[12px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}><Warning size={13} /> ما ينقص المذكرة</p>
                <ul className={`list-disc ps-5 text-[11px] ${isDark ? "text-amber-300" : "text-amber-800"}`}>
                  {edited.missing.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </div>
            )}

            {sourcesA.length > 0 && (
              <div className="space-y-1.5">
                <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>المصادر من المكتبة</p>
                <SourceList cites={sourcesA} isDark={isDark} compact />
              </div>
            )}

            {!pleading && (
              <div className="space-y-2">
                <RunStatus isDark={isDark} run={writing} busyText="يكتب الذكاء الاصطناعي المذكرة الآن — قد يستغرق ذلك دقيقتين أو ثلاثاً." />
                {blocker && <p className={`text-[11px] ${isDark ? "text-amber-400" : "text-amber-700"}`}>{blocker}</p>}
                <button
                  type="button"
                  onClick={startDraft}
                  disabled={writing.busy || !!blocker || !analysis.conversationId}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-6 py-3 text-[13px] font-bold text-white shadow-md disabled:opacity-40"
                >
                  <FileDoc size={15} /> {writing.busy ? "جارٍ الكتابة..." : writing.phase === "error" ? "أعد المحاولة — دون خصم" : "اكتب المذكرة"}
                </button>
                <p className={`text-center text-[10px] ${muted}`}>الصياغة مشمولة بنقاط التحليل.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 2. the pleading ───────────────────────────────────────────── */}
      {pleading && (
        <div className={`${card} p-5 space-y-4`}>
          <h2 className={`text-center text-[17px] font-black ${isDark ? "text-white" : "text-zinc-900"}`}>{pleading.title}</h2>
          {pleading.sections.map((s, n) => (
            <section key={n} className="space-y-1.5">
              <h3 className={`text-[13px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{s.heading}</h3>
              <CitedText text={s.body} cites={sourcesB} isDark={isDark} className={`text-[13px] leading-loose ${isDark ? "text-zinc-200" : "text-zinc-800"}`} />
            </section>
          ))}
          {pleading.requests.length > 0 && (
            <section className="space-y-1.5">
              <h3 className={`text-[13px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>الطلبات</h3>
              <ol className={`list-decimal ps-5 text-[13px] leading-loose ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                {pleading.requests.map((r) => <li key={r}>{r}</li>)}
              </ol>
            </section>
          )}
          <SourceList cites={sourcesB} isDark={isDark} compact />
          <CitationCheckList
            items={pleading.citation_check}
            isDark={isDark}
            title="التحقق من المواد المستشهد بها في المكتبة"
            empty="لم تستشهد المذكرة بمادة نظامية برقمها."
          />
          <p className={`text-[11px] ${muted}`}>
            مسودة يكتبها الذكاء الاصطناعي من الوقائع والدفوع التي اعتمدتها — راجعها قبل تقديمها؛ المسؤولية المهنية عن المذكرة لك.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <AiResultActions text={written} filename={spec.label} collectorSource="other" />
            <button type="button" onClick={downloadWord}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold ${isDark ? "border-white/[0.07] text-zinc-300" : "border-zinc-200 text-zinc-600"}`}>
              <FileDoc size={14} /> تنزيل Word
            </button>
            <button type="button" onClick={() => { if (window.confirm(`صياغة جديدة تبدأ تحليلاً جديداً وتُخصم لها ${spec.price.toLocaleString("ar-SA")} نقطة. المذكرة الحالية تبقى في سجل الذكاء الاصطناعي. متابعة؟`)) { writing.reset(); analysis.reset(); setSent(null); setChanges(null); } }}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold ${isDark ? "border-white/[0.07] text-zinc-300" : "border-zinc-200 text-zinc-600"}`}>
              <ArrowCounterClockwise size={14} /> صياغة جديدة (بخصم جديد)
            </button>
          </div>
          {wordFailed && <p role="alert" className="text-[11px] text-red-500">تعذّر إنشاء ملف Word — انسخ النص أو نزّله .txt</p>}
        </div>
      )}
    </div>
  );
}

function RunStatus({ isDark, run, busyText }: { isDark: boolean; run: ReturnType<typeof useAiRun>; busyText: string }) {
  if (run.phase === "error" && run.error) {
    return (
      <p role="alert" className={`rounded-xl border px-3 py-2 text-[12px] ${isDark ? "border-red-900/40 bg-red-900/10 text-red-400" : "border-red-200 bg-red-50 text-red-600"}`}>
        {run.error}
      </p>
    );
  }
  if (run.phase === "review") {
    return (
      <p role="status" className={`rounded-xl border px-3 py-2 text-[12px] ${isDark ? "border-amber-900/40 bg-amber-900/10 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
        النتيجة جاهزة وتنتظر مراجعة الفريق قبل عرضها.
      </p>
    );
  }
  if (run.busy) {
    return (
      <p role="status" className={`rounded-xl border px-3 py-2 text-[12px] ${isDark ? "border-white/10 bg-white/5 text-zinc-300" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
        {busyText}
      </p>
    );
  }
  return null;
}
