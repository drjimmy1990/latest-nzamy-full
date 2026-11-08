"use client";

/**
 * AiTabContent — «باحث المكتبة الذكي», the AI tab of /laws (owner note 02, P0).
 *
 * It used to answer every question, after a fake delay, with one fixed text
 * about the labour law, beside a file button that sent nothing, a green
 * "online" pill and eight platform-wide tool cards. It now asks the real
 * library assistant, the same call as the law page's chat: askLibrary →
 * POST /api/v1/ai/runs, tool `library-assistant` (5 points, owner ٢٥٧). The
 * server checks the sign-in, the library gate and tier, the library lock, the
 * tool's mode and the points, charges, searches the library and answers only
 * from what it found; a failed run is refunded and says so. This screen shows
 * the server's reply with its citations as links into the library, or the
 * refusal it gave — never an invented answer.
 *
 * Before any question: a visitor is asked to sign in; a signed-in user sees no
 * box and no price until GET /api/v1/ai/tool-status says he may run the tool
 * (useToolUsable), and «قيد التفعيل» when it says no.
 *
 * Each question is sent on its own (the tool keeps no conversation), so the
 * screen does not pretend to remember earlier questions. The search covers the
 * law and regulation articles and the judicial principles (lib/ai/retrieval.ts);
 * it has no scope filter, so the screen offers none.
 */

import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  BookOpenText,
  CheckCircle,
  Copy,
  PaperPlaneTilt,
  Sparkle,
  WarningDiamond,
} from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { useToolUsable } from "@/hooks/useToolUsable";
import { aiToolPriceText } from "@/lib/ai/toolPointsDisplay";
import { asCitations, CitedText, SourceList, stripCitationMarkers, type Citation } from "@/components/ai/CitedAnswer";
import { askLibrary, LIBRARY_AI_SOON } from "../[slug]/_library-assistant";
import type { LibraryAiAction } from "../[slug]/_ai-reply";

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const ROYAL = "#0B3D2E";
const GOLD = "#C8A762";

const TOOL = "library-assistant";
const QUESTION_MAX = 2000;

/**
 * Four research questions the library can answer (owner note 02 §2.3). They
 * fill the box; nothing is sent, and charged, until the user presses send.
 * The fiqh-books example of the note is left out: the assistant does not
 * search the books yet.
 */
const EXAMPLES = [
  { label: "نص نظامي وتعديلاته", prompt: "ما نص المادة المتعلقة بـ… في نظام…؟ وهل عُدّلت؟" },
  { label: "المبادئ والسوابق القضائية", prompt: "ما المبادئ القضائية في مسألة…؟" },
  { label: "المادة ولائحتها التنفيذية", prompt: "ما الذي تضيفه اللائحة التنفيذية إلى المادة… من نظام…؟" },
  { label: "شرح مادة بعينها", prompt: "اشرح لي المادة… من نظام… وشروط تطبيقها." },
] as const;

// ─── Lightweight Markdown (bold + bullet lists — no external dependency) ─────
// Exported: the law page's chat (../[slug]/_ai-components.tsx) uses it too.
function renderInlineBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

export const LiteMarkdown = memo(function LiteMarkdown({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/).filter(Boolean);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter(l => l.trim().length > 0);
        const isList = lines.length > 0 && lines.every(l => /^[•\-]\s+/.test(l.trim()));
        if (isList) {
          return (
            <ul key={bi} className="space-y-1.5">
              {lines.map((l, li) => (
                <li key={li} className="flex items-start gap-2">
                  <span className="mt-[9px] h-1 w-1 rounded-full bg-current opacity-40 flex-shrink-0" />
                  <span className="flex-1">{renderInlineBold(l.trim().replace(/^[•\-]\s+/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <span key={li}>
                {renderInlineBold(l)}
                {li < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface Turn {
  id: string;
  question: string;
  /** null while the run is in flight. */
  answer: null | {
    text: string;
    cites: Citation[];
    action?: LibraryAiAction;
    refused: boolean;
  };
}

type Access = "checking" | "guest" | "soon" | "open";

// ─── Main Component ───────────────────────────────────────────────────────────
interface AiTabContentProps {
  isDark: boolean;
  isRTL: boolean;
}

export function AiTabContent({ isDark }: AiTabContentProps) {
  const user = useUser();
  if (user.loading) return <Shell isDark={isDark} access="checking" />;
  if (!user.isLoggedIn) return <Shell isDark={isDark} access="guest" />;
  return <SignedIn isDark={isDark} />;
}

function SignedIn({ isDark }: { isDark: boolean }) {
  const usable = useToolUsable(TOOL);
  return <Shell isDark={isDark} access={usable === null ? "checking" : usable ? "open" : "soon"} />;
}

function Shell({ isDark, access }: { isDark: boolean; access: Access }) {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const running = turns.some(t => t.answer === null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (turns.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns]);

  async function send() {
    const q = input.trim().slice(0, QUESTION_MAX);
    if (!q || running || access !== "open") return;
    setInput("");
    const id = `t-${Date.now()}`;
    setTurns(prev => [...prev, { id, question: q, answer: null }]);
    // The server's reply and citations, or the refusal it gave (askLibrary).
    const res = await askLibrary({ message: q }, window.location.pathname + window.location.search);
    setTurns(prev => prev.map(t => t.id === id
      ? { ...t, answer: { text: res.text, cites: asCitations(res.citations), action: res.action, refused: res.refused === true } }
      : t));
  }

  function fillExample(prompt: string) {
    setInput(prompt);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const strong = isDark ? "text-white" : "text-[#0B3D2E]";

  return (
    <div
      dir="rtl"
      className={`rounded-2xl border ${isDark ? "border-white/[0.07] bg-[#0f1417]" : "border-slate-200 bg-white shadow-[0_8px_32px_-16px_rgba(11,61,46,0.18)]"}`}
    >
      {/* Header */}
      <div className={`flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-10 w-10 flex-shrink-0 rounded-xl flex items-center justify-center" style={{ background: ROYAL }}>
            <Sparkle size={18} weight="duotone" style={{ color: GOLD }} />
          </div>
          <div>
            <h2 className={`text-base font-bold ${strong}`} style={{ fontFamily: "var(--font-brand)" }}>باحث المكتبة الذكي</h2>
            <p className={`text-[12.5px] leading-relaxed mt-0.5 max-w-[60ch] ${muted}`}>
              يبحث في نصوص الأنظمة واللوائح والمبادئ القضائية بمكتبة نظامي، ويجيب موثّقاً بالمواد ومصادرها.
            </p>
          </div>
        </div>
        {turns.length > 0 && (
          <button
            onClick={() => setTurns([])}
            disabled={running}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold border transition-colors disabled:opacity-40 ${
              isDark ? "border-white/10 text-zinc-300 hover:text-white" : "border-slate-200 text-slate-600 hover:text-[#0B3D2E] hover:border-[#0B3D2E]"
            }`}
          >
            <ArrowCounterClockwise size={13} /> بحث جديد
          </button>
        )}
      </div>

      {/* Thread */}
      {turns.length > 0 && (
        <div className="max-h-[60vh] overflow-y-auto px-5 py-5 space-y-6">
          {turns.map(t => <TurnView key={t.id} turn={t} isDark={isDark} />)}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Composer / access state */}
      <div className={`px-5 pb-5 ${turns.length > 0 ? `pt-4 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}` : "pt-5"}`}>
        {access === "checking" && (
          <p role="status" className={`py-6 text-center text-[12.5px] ${muted}`}>جارٍ التحقق…</p>
        )}

        {access === "soon" && (
          <div className={`rounded-xl border px-4 py-4 text-[13px] leading-relaxed whitespace-pre-line ${
            isDark ? "border-[#C8A762]/25 bg-[#C8A762]/[0.06] text-zinc-200" : "border-amber-200 bg-amber-50 text-amber-900"
          }`}>
            <p className="font-bold mb-1">قريباً</p>
            {LIBRARY_AI_SOON}
          </div>
        )}

        {access === "guest" && (
          <div className={`rounded-xl border px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between ${
            isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50"
          }`}>
            <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              سجّل الدخول لتستخدم باحث المكتبة الذكي. اشتراك المكتبة يشمل النصوص دون المساعد.
            </p>
            <Link
              href="/login?next=%2Flaws"
              className="inline-flex flex-shrink-0 items-center justify-center rounded-xl px-4 py-2 text-[12.5px] font-bold text-white hover:opacity-90"
              style={{ background: ROYAL }}
            >
              تسجيل الدخول
            </Link>
          </div>
        )}

        {access === "open" && (
          <>
            <div className={`flex items-end gap-2 rounded-2xl border px-3.5 py-2.5 transition-colors ${
              isDark
                ? "border-white/10 bg-white/[0.03] focus-within:border-[#C8A762]/50"
                : "border-slate-300 bg-white focus-within:border-[#0B3D2E]"
            }`}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value.slice(0, QUESTION_MAX))}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                placeholder="اكتب سؤالك عن نص نظامي أو مبدأ قضائي…"
                aria-label="سؤالك لباحث المكتبة"
                rows={2}
                dir="rtl"
                className={`flex-1 resize-none bg-transparent text-[14px] leading-relaxed outline-none ${
                  isDark ? "text-zinc-100 placeholder:text-zinc-500" : "text-slate-900 placeholder:text-slate-400"
                }`}
                style={{ maxHeight: 160 }}
              />
              <button
                onClick={() => void send()}
                disabled={!input.trim() || running}
                aria-label="إرسال السؤال"
                className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-xl text-white transition-opacity disabled:opacity-35"
                style={{ background: ROYAL }}
              >
                <PaperPlaneTilt size={15} weight="fill" />
              </button>
            </div>
            <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px] ${muted}`}>
              <span>{aiToolPriceText(TOOL, "ar")} للسؤال · كل سؤال يُجاب مستقلاً</span>
              <span className="inline-flex items-center gap-1">
                <WarningDiamond size={11} /> الإجابات استرشادية ولا تُعدّ استشارة قانونية رسمية
              </span>
            </div>
          </>
        )}

        {/* Examples: before the first question only; they fill the box, they are not answers. */}
        {turns.length === 0 && access !== "soon" && (
          <div className="mt-5">
            <p className={`text-[11.5px] font-bold mb-2 ${muted}`}>أمثلة لأسئلة بحثية</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EXAMPLES.map(ex => {
                const body = (
                  <>
                    <span className={`flex items-center gap-1.5 text-[12.5px] font-bold ${strong}`}>
                      <BookOpenText size={14} style={{ color: GOLD }} /> {ex.label}
                    </span>
                    <span className={`block mt-1 text-[12px] leading-snug ${muted}`}>{ex.prompt}</span>
                  </>
                );
                const card = `text-start rounded-xl border px-3.5 py-3 transition-colors ${
                  isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-slate-200 bg-white"
                }`;
                // Clickable only when the box is there to fill; otherwise a plain, readable card.
                return access === "open" ? (
                  <button
                    key={ex.label}
                    onClick={() => fillExample(ex.prompt)}
                    className={`${card} ${isDark ? "hover:border-[#C8A762]/40" : "hover:border-[#0B3D2E]/50"}`}
                  >
                    {body}
                  </button>
                ) : (
                  <div key={ex.label} className={card}>{body}</div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── One question and its answer ──────────────────────────────────────────────
function TurnView({ turn, isDark }: { turn: Turn; isDark: boolean }) {
  const [copied, setCopied] = useState(false);
  const a = turn.answer;
  return (
    <div className="space-y-3">
      {/* Question */}
      <div className="flex justify-start">
        <p className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-[13.5px] leading-relaxed text-white whitespace-pre-wrap" style={{ background: ROYAL }}>
          {turn.question}
        </p>
      </div>

      {/* Running */}
      {a === null && (
        <div role="status" className={`flex items-center gap-2.5 text-[12.5px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
          <span className="flex gap-1">
            {[0, 1, 2].map(i => (
              <span key={i} className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: GOLD, animationDelay: `${i * 150}ms` }} />
            ))}
          </span>
          يبحث في نصوص المكتبة ويكتب الجواب…
        </div>
      )}

      {/* Refusal / closed / error: the server's own wording and the way forward */}
      {a?.refused && (
        <div className={`rounded-xl border px-4 py-3 text-[13px] leading-relaxed ${
          isDark ? "border-amber-500/25 bg-amber-500/[0.07] text-amber-100" : "border-amber-200 bg-amber-50 text-amber-900"
        }`}>
          <p className="whitespace-pre-line">{a.text}</p>
          {a.action && (
            <Link href={a.action.href} className="inline-block mt-2.5 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90" style={{ background: ROYAL }}>
              {a.action.label}
            </Link>
          )}
        </div>
      )}

      {/* The assistant's answer with its sources */}
      {a && !a.refused && (
        <div className={`rounded-2xl border px-4 py-4 ${isDark ? "border-white/[0.07] bg-white/[0.02] text-zinc-100" : "border-slate-200 bg-slate-50/60 text-slate-800"}`}>
          <p className="text-[11px] font-bold mb-2" style={{ color: isDark ? GOLD : ROYAL }}>باحث المكتبة</p>
          {a.cites.length > 0
            ? <CitedText text={a.text} cites={a.cites} isDark={isDark} className="text-[13.5px] leading-[1.85]" />
            : <div className="text-[13.5px] leading-[1.85]"><LiteMarkdown text={a.text} /></div>}
          {a.cites.length > 0 && (
            <div className="mt-4">
              <p className={`text-[11.5px] font-bold mb-1.5 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>المصادر — تُفتح في صفحة النص</p>
              <SourceList cites={a.cites} isDark={isDark} compact />
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(stripCitationMarkers(a.text)).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }).catch(() => {});
              }}
              className={`inline-flex items-center gap-1 text-[11.5px] font-semibold ${isDark ? "text-zinc-400 hover:text-white" : "text-slate-500 hover:text-[#0B3D2E]"}`}
            >
              {copied ? <CheckCircle size={12} className="text-emerald-500" /> : <Copy size={12} />}
              {copied ? "نُسخ" : "نسخ الجواب"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
