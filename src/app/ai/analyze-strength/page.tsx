"use client";

/**
 * محلل قوة الموقف — L10 (plan §5, wave 4): a real `analyze-strength` job.
 *
 * This page used to wait a `setTimeout(2500)` and show the same hard-coded
 * case (an overall score of 68, dimension scores, risks with likelihood
 * percentages) whatever the lawyer typed, behind BetaReviewGate. Nothing read
 * the file. Now the summary, the evidence notes, what the opponent said and
 * the uploaded case files go to the job (250 points), and its answer renders
 * in four tabs with LEVELS IN WORDS: owner ١٩٣ bans any chance of winning, so
 * there is no score, no percentage and no likelihood. Every article the
 * answer relies on is checked against the library by the platform.
 *
 * The «ذاكرة المكتب» switch had nothing behind it and is gone; the opponent's
 * memo is a real file or pasted text.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Gauge, Crosshair, TrendUp, Sword, Shield, Warning, CheckCircle, Lightbulb,
  CloudArrowUp, Paperclip, X, Sparkle, SignIn, ArrowsCounterClockwise,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { useAiRun } from "@/hooks/useAiRun";
import { useOrderAttachments } from "@/hooks/useOrderAttachments";
import { VoiceInput } from "@/components/ui/VoiceInput";
import AiResultActions from "@/components/AiResultActions";
import CitationCheckList, { asCitationVerdicts } from "@/components/ai/CitationCheckList";
import { AI_READABLE_ACCEPT, isAiReadable, splitAiReadable } from "@/components/ai/aiReadable";
import { CASE_SUMMARY_MAX, CASE_SUMMARY_MIN, WAVE4_FILES, WAVE4_PRICE } from "@/lib/ai/tools";
import { asStrengthReport, strengthReportText, LEVEL_LABEL, RISK_LABEL, type StrengthReport } from "./_report";

type TabKey = "strength" | "opponent" | "risks" | "devil";
const TABS: { key: TabKey; label: string; icon: typeof Gauge }[] = [
  { key: "strength", label: "قوة الأسانيد", icon: Gauge },
  { key: "opponent", label: "توقعات الخصم", icon: Crosshair },
  { key: "risks", label: "المخاطر الإجرائية", icon: TrendUp },
  { key: "devil", label: "محامي الشيطان", icon: Sword },
];
const ROLES = [
  { id: "plaintiff", label: "مدّعٍ / موكلي مدّعٍ" },
  { id: "defendant", label: "مدّعى عليه / دفاع" },
  { id: "other", label: "غير ذلك" },
] as const;
const LEVEL_TONE = { strong: "text-emerald-500", medium: "text-amber-500", weak: "text-red-500" } as const;
const RISK_TONE = {
  high: "border-red-500/25 bg-red-500/10 text-red-500",
  medium: "border-amber-500/25 bg-amber-500/10 text-amber-500",
  low: "border-blue-500/25 bg-blue-500/10 text-blue-500",
} as const;
const DEVIL_LABEL = { critical: "حرج", high: "مرتفع", medium: "متوسط" } as const;

export default function AIStrengthPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const ai = useAiRun();
  const { attachments, uploading, attachError, attachFile, removeAttachment, clearAttachError } = useOrderAttachments();
  const fileRef = useRef<HTMLInputElement>(null);

  const [role, setRole] = useState<string>("");
  const [summary, setSummary] = useState("");
  const [evidence, setEvidence] = useState("");
  const [opponent, setOpponent] = useState("");
  const [fileError, setFileError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("strength");

  const signedIn = !user.loading && user.isLoggedIn;
  const report = ai.phase === "done" ? asStrengthReport(ai.output) : null;
  const { ids: fileIds } = splitAiReadable(attachments);
  const summaryOk = summary.trim().length >= CASE_SUMMARY_MIN;
  const canRun = signedIn && !!role && summaryOk && !uploading && !ai.busy;

  async function pickFiles(files: File[]) {
    setFileError("");
    clearAttachError();
    let count = attachments.length;
    for (const f of files) {
      if (!isAiReadable(f.name)) { setFileError("المحلل يقرأ PDF والصور فقط — احفظ ملف Word بصيغة PDF ثم أرفقه"); continue; }
      if (count >= WAVE4_FILES.max) { setFileError(`الحد ${WAVE4_FILES.max.toLocaleString("ar-SA")} ملفات`); break; }
      try { await attachFile(f); count++; } catch { /* attachFile set attachError */ }
    }
  }

  function run() {
    if (!canRun) return;
    setActiveTab("strength");
    void ai.start(
      "analyze-strength",
      { role, case_summary: summary.trim(), evidence_notes: evidence.trim() || null, opponent_points: opponent.trim() || null },
      { fileIds },
    );
  }

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const label = `block text-[12px] font-semibold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`;
  const hint = `text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`;
  const field = `w-full resize-none rounded-xl border p-3.5 text-[13px] outline-none leading-relaxed ${isDark
    ? "border-white/[0.07] bg-zinc-950 text-zinc-200 placeholder:text-zinc-600 focus:border-[#C8A762]/40"
    : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 focus:border-[#0B3D2E]/40"}`;
  const pill = (active: boolean) => `rounded-xl border px-3.5 py-2 text-[12px] font-semibold transition-colors ${active
    ? isDark ? "border-[#C8A762]/50 bg-[#C8A762]/10 text-[#C8A762]" : "border-[#0B3D2E]/40 bg-[#0B3D2E]/5 text-[#0B3D2E]"
    : isDark ? "border-white/[0.07] text-zinc-400 hover:border-white/20" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`;

  return (
    <div className={`p-5 md:p-7 max-w-5xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">
      <div>
        <h1 className={`text-xl font-bold mb-1 ${isDark ? "text-white" : "text-zinc-900"}`}>محلل الموقف والخصم</h1>
        <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          قوة الأسانيد · تحركات الخصم المتوقعة · المخاطر الإجرائية · محامي الشيطان — تحليل قبل الترافع، بلا نسب ولا توقّع للحكم
        </p>
      </div>

      {user.loading && <p className={hint}>جارٍ التحقق من الجلسة…</p>}
      {!user.loading && !user.isLoggedIn && (
        <div className={`${card} p-6 space-y-3`}>
          <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>سجّل الدخول لتحليل قضيتك</p>
          <Link href="/login?from=%2Fai%2Fanalyze-strength" className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[12px] font-bold text-white">
            <SignIn size={14} /> تسجيل الدخول
          </Link>
        </div>
      )}

      {signedIn && !report && (
        <div className={`${card} p-5 md:p-6 space-y-6`}>
          <div>
            <p className={label}>١. صفة موكّلك</p>
            <div className="flex flex-wrap gap-2">
              {ROLES.map(r => <button key={r.id} type="button" onClick={() => setRole(r.id)} className={pill(role === r.id)}>{r.label}</button>)}
            </div>
          </div>

          <div>
            <p className={label}>٢. ملخص القضية</p>
            <div className="relative">
              <textarea value={summary} onChange={e => setSummary(e.target.value)} maxLength={CASE_SUMMARY_MAX} rows={6}
                placeholder="الأطراف · الوقائع وتواريخها · الطلبات · الأدلة المتاحة · الشهود · ما تستند إليه نظاماً"
                className={`${field} pe-14`} />
              <div className="absolute bottom-3 start-3">
                <VoiceInput onTranscript={t => setSummary(p => (p ? `${p} ${t}` : t))} compact />
              </div>
            </div>
            {summary.trim().length > 0 && !summaryOk && (
              <p className="mt-1 text-[11px] text-amber-500">اكتب {CASE_SUMMARY_MIN.toLocaleString("ar-SA")} حرفاً على الأقل</p>
            )}
          </div>

          <div>
            <p className={label}>٣. مستندات القضية (اختياري)</p>
            <div
              role="button" tabIndex={0}
              onClick={() => { if (!uploading) fileRef.current?.click(); }}
              onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !uploading) { e.preventDefault(); fileRef.current?.click(); } }}
              className={`rounded-2xl border-2 border-dashed p-5 text-center ${uploading ? "cursor-wait" : "cursor-pointer"} ${isDark ? "border-white/[0.08] hover:border-[#C8A762]/30" : "border-zinc-200 hover:border-[#0B3D2E]/30"}`}
            >
              <input ref={fileRef} type="file" multiple className="hidden" accept={AI_READABLE_ACCEPT}
                onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void pickFiles(files); }} />
              <CloudArrowUp size={22} className={`mx-auto mb-2 ${uploading ? "text-[#C8A762]" : isDark ? "text-zinc-500" : "text-zinc-400"}`} />
              <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>{uploading ? "جارٍ الرفع…" : "العقد، الصحيفة، مذكرة الخصم، المراسلات…"}</p>
              <p className={hint}>PDF أو صور (والممسوحة تُقرأ) · حتى {WAVE4_FILES.max.toLocaleString("ar-SA")} ملفات و{WAVE4_FILES.maxPages.toLocaleString("ar-SA")} صفحة</p>
            </div>
            {attachments.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {attachments.map(a => (
                  <div key={a.documentId} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] ${isDark ? "bg-white/[0.03] text-zinc-300" : "bg-zinc-50 text-zinc-700"}`}>
                    <Paperclip size={13} className="text-[#C8A762]" />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <button type="button" aria-label={`إزالة ${a.name}`} onClick={() => removeAttachment(a.documentId)}><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            {(fileError || attachError) && <p className="mt-1 text-[11px] text-red-500">{fileError || attachError}</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className={label}>٤. ما تعوّل عليه في أدلتك (اختياري)</p>
              <textarea value={evidence} onChange={e => setEvidence(e.target.value)} maxLength={3000} rows={4}
                placeholder="مثلاً: العقد موثق، والمراسلات تثبت الإنذار، والشاهد حاضر" className={field} />
            </div>
            <div>
              <p className={label}>٥. ما قاله الخصم أو ما في مذكرته (اختياري)</p>
              <textarea value={opponent} onChange={e => setOpponent(e.target.value)} maxLength={4000} rows={4}
                placeholder="الصق دفوع الخصم، أو أرفق مذكرته في المستندات" className={field} />
            </div>
          </div>

          <div className="space-y-2">
            <button type="button" onClick={run} disabled={!canRun}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] py-3 text-[13px] font-bold text-white shadow-md disabled:opacity-40">
              <Sparkle size={15} weight="fill" />
              {ai.busy ? "جارٍ التحليل… (دقيقة أو أكثر)" : `حلّل الموقف الآن (${WAVE4_PRICE.toLocaleString("ar-SA")} نقطة)`}
            </button>
            <p className={hint}>
              تُرسل نسخة من الملخص والمستندات إلى مزوّد ذكاء اصطناعي خارج المملكة لقراءتها. تحليل مبدئي؛ القرار للمحامي.
            </p>
            {ai.phase === "error" && ai.error && <p role="alert" className="text-[12px] text-red-500">{ai.error}</p>}
            {ai.phase === "review" && <p role="status" className={hint}>التحليل جاهز وينتظر مراجعة الفريق قبل عرضه.</p>}
          </div>
        </div>
      )}

      {report && (
        <StrengthReportView report={report} isDark={isDark} activeTab={activeTab} setActiveTab={setActiveTab}
          chargedPoints={ai.chargedPoints} onReset={ai.reset} />
      )}
    </div>
  );
}

function StrengthReportView({ report, isDark, activeTab, setActiveTab, chargedPoints, onReset }: {
  report: StrengthReport; isDark: boolean; activeTab: TabKey; setActiveTab: (t: TabKey) => void; chargedPoints: number; onReset: () => void;
}) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const head = `text-[11px] font-black uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-zinc-400"}`;
  const body = isDark ? "text-zinc-300" : "text-zinc-700";
  const empty = <p className={`text-[12px] ${body}`}>لا شيء في هذا القسم.</p>;
  const g = report.grounds;
  const bullets = (title: string, items: string[], Icon: typeof Shield, tone: string) => (
    <div className={`${card} p-5 space-y-2`}>
      <p className={head}>{title}</p>
      {items.length === 0 ? empty : items.map((s, i) => (
        <p key={i} className={`flex items-start gap-2 text-[13px] leading-relaxed ${body}`}><Icon size={14} weight="fill" className={`mt-1 flex-shrink-0 ${tone}`} />{s}</p>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(t => {
          const active = activeTab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => setActiveTab(t.key)} aria-pressed={active}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12px] font-semibold ${active
                ? isDark ? "border-[#C8A762]/50 bg-[#C8A762]/10 text-[#C8A762]" : "border-[#0B3D2E]/40 bg-[#0B3D2E]/5 text-[#0B3D2E]"
                : isDark ? "border-white/[0.07] text-zinc-400" : "border-zinc-200 text-zinc-600"}`}>
              <t.icon size={14} /> {t.label}
            </button>
          );
        })}
        <button type="button" onClick={onReset} className={`ms-auto flex items-center gap-1 text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          <ArrowsCounterClockwise size={12} /> تحليل جديد
        </button>
      </div>

      <AiResultActions text={strengthReportText(report)} filename="nzamy-strength-analysis" collectorSource="other" />

      {activeTab === "strength" && (
        <div className="space-y-4">
          <div className={`${card} p-5`}>
            <p className={head}>قوة الأسانيد</p>
            <p className={`mt-1 text-[18px] font-bold ${LEVEL_TONE[g.level]}`}>{LEVEL_LABEL[g.level]}</p>
            <p className={`mt-2 text-[13px] leading-relaxed ${body}`}>{g.summary}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {bullets("نقاط القوة", g.strengths, CheckCircle, "text-emerald-500")}
            {bullets("نقاط الضعف", g.weaknesses, Warning, "text-red-500")}
          </div>
          {bullets("ما يقوّي موقفك", g.recommendations, Lightbulb, "text-[#C8A762]")}
        </div>
      )}

      {activeTab === "opponent" && (
        <div className={`${card} p-5 space-y-3`}>
          {report.opponent.length === 0 ? empty : report.opponent.map((m, i) => (
            <div key={i} className={`rounded-xl border p-3.5 ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
              <span className={`text-[10px] font-bold ${m.kind === "attack" ? "text-red-500" : "text-blue-500"}`}>{m.kind === "attack" ? "هجوم" : "دفاع"}</span>
              <p className={`mt-1 text-[13px] leading-relaxed ${body}`}>{m.move}</p>
              {m.counter && <p className={`mt-1.5 text-[12px] leading-relaxed ${isDark ? "text-emerald-400/90" : "text-emerald-700"}`}>الرد: {m.counter}</p>}
            </div>
          ))}
        </div>
      )}

      {activeTab === "risks" && (
        <div className={`${card} p-5 space-y-3`}>
          {report.risks.length === 0 ? empty : report.risks.map((r, i) => (
            <div key={i} className={`rounded-xl border p-3.5 ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold ${RISK_TONE[r.level] ?? RISK_TONE.medium}`}>{RISK_LABEL[r.level] ?? "متوسط"}</span>
                <p className={`text-[13px] font-semibold ${body}`}>{r.risk}</p>
              </div>
              {r.mitigation && <p className={`mt-1.5 text-[12px] leading-relaxed ${isDark ? "text-emerald-400/90" : "text-emerald-700"}`}>الوقاية: {r.mitigation}</p>}
            </div>
          ))}
        </div>
      )}

      {activeTab === "devil" && (
        <div className={`${card} p-5 space-y-3`}>
          {report.devil.length === 0 ? empty : report.devil.map((d, i) => (
            <div key={i} className={`rounded-xl border p-3.5 ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold ${d.severity === "critical" ? RISK_TONE.high : RISK_TONE.medium}`}>{DEVIL_LABEL[d.severity] ?? "مرتفع"}</span>
                <p className={`text-[13px] font-semibold ${body}`}>{d.label}</p>
              </div>
              <p className={`mt-1.5 text-[13px] leading-relaxed ${body}`}>{d.text}</p>
            </div>
          ))}
        </div>
      )}

      <CitationCheckList
        items={asCitationVerdicts(report.citation_check)}
        isDark={isDark}
        title="المواد التي استند إليها التحليل — تحقّقت منها المنصة في مكتبة الأنظمة"
        empty="لم يستند التحليل إلى مواد نظامية مرقّمة."
      />

      <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
        تحليل آلي مبدئي لا يتوقع الحكم؛ المحكمة تحكم بقناعتها والقرار للمحامي. حالة كل مادة من مكتبة نظامي لا من الذكاء الاصطناعي.
        {chargedPoints > 0 && <> · خُصمت {chargedPoints.toLocaleString("ar-SA")} نقطة</>}
      </p>
    </div>
  );
}
