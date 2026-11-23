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
 * Owner Q458: the questions of one session share the server's conversation
 * (it reads the last six turns itself). The scope chips choose the part of the
 * library searched (T14-Q485).
 *
 * Researcher V3 (owner file 11, phases A2-A4/A6): the session, the live stage
 * card, each answer with its folded «خطوات البحث», its sources (opening the side
 * panel), its action strip, the selection toolbar and the tour are the studio
 * page's own components (src/app/laws/research/_components), so the tab and
 * /laws/research behave the same. No guidance line sits inside an answer; the
 * tour explains the screen.
 */

import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import LibraryScopeChips, { type LibraryScopeChoice } from "@/components/ai/LibraryScopeChips";
import {
  ArrowSquareOut,
  BookOpenText,
  NotePencil,
  PaperPlaneTilt,
  Question,
  WarningDiamond,
} from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { useToolUsable } from "@/hooks/useToolUsable";
import { aiToolPointRange, aiToolPriceText } from "@/lib/ai/toolPointsDisplay";
import { FREE_QUESTION_COPY } from "@/lib/ai/freeQuestion";
import type { Citation } from "@/components/ai/CitedAnswer";
import { LIBRARY_AI_SOON } from "../[slug]/_library-assistant";
import { QUESTION_MAX, useLibraryResearch } from "../research/_components/useLibraryResearch";
import { ResearchTurnView } from "../research/_components/ResearchTurn";
import { ResearchRefDrawer } from "../research/_components/ResearchRefDrawer";
import { ResearchTour } from "../research/_components/ResearchTour";
import { ResearchSelectionBar } from "../research/_components/ResearchSelectionBar";
import LibraryPointsLowNotice from "@/components/library/LibraryPointsLowNotice";
import ToolPointsAvailable from "@/components/payments/ToolPointsAvailable";

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const ROYAL = "#0B3D2E";
const GOLD = "#C8A762";

const TOOL = "library-assistant";

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
  // l11-ai T14-Q485: which part of the library the assistant searches.
  const [scope, setScope] = useState<LibraryScopeChoice>("all");
  // Researcher V3: the session (askLibrary + live progress), shared with /laws/research.
  const { turns, running, send, reset } = useLibraryResearch();
  const [openCite, setOpenCite] = useState<{ cite: Citation; n: number } | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Owner ٣٠ (l7): the account's free questions left, as the server counts
  // them; null (nothing shown) until it answers or when none are left.
  const [free, setFree] = useState<{ left: number; total: number } | null>(null);
  useEffect(() => {
    if (access !== "open" || running) return;
    let live = true;
    fetch("/api/v1/ai/free-question", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        const s = j as { available?: unknown; left?: unknown; total?: unknown } | null;
        if (!live) return;
        setFree(s && s.available === true && typeof s.left === "number" && typeof s.total === "number" ? { left: s.left, total: s.total } : null);
      })
      .catch(() => { if (live) setFree(null); });
    return () => { live = false; };
  }, [access, running, turns.length]);

  useEffect(() => {
    if (turns.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns]);

  async function submit() {
    const q = input.trim();
    if (!q || running || access !== "open") return;
    setInput("");
    // The server's reply and citations, or the refusal it gave (useLibraryResearch → askLibrary).
    await send(q, scope);
  }

  function fillExample(prompt: string) {
    setInput(prompt.slice(0, QUESTION_MAX));
    setOpenCite(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const headerBtn = `inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold border transition-[colors,transform] motion-safe:active:scale-[0.97] ${
    isDark ? "border-white/10 text-zinc-300 hover:text-white" : "border-slate-200 text-slate-600 hover:text-[#0B3D2E] hover:border-[#0B3D2E]"
  }`;

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
            <BookOpenText size={18} weight="duotone" style={{ color: GOLD }} />
          </div>
          <div>
            <h2 className={`text-base font-bold ${strong}`} style={{ fontFamily: "var(--font-brand)" }}>باحث المكتبة الذكي</h2>
            <p className={`text-[12.5px] leading-relaxed mt-0.5 max-w-[60ch] ${muted}`}>
              يبحث في نصوص الأنظمة واللوائح والمبادئ القضائية بمكتبة نظامي، ويجيب موثّقاً بالمواد ومصادرها.
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5">
          {turns.length > 0 && (
            <button onClick={reset} disabled={running} className={`${headerBtn} disabled:opacity-40`}>
              <NotePencil size={13} style={{ color: GOLD }} /> بحث جديد
            </button>
          )}
          <button onClick={() => setTourOpen(true)} className={headerBtn}>
            <Question size={13} style={{ color: GOLD }} /> جولة في الواجهة
          </button>
          <Link href="/laws/research" className={headerBtn}>
            الصفحة الكاملة <ArrowSquareOut size={12} />
          </Link>
        </div>
      </div>

      {/* Thread */}
      {turns.length > 0 && (
        <div ref={threadRef} className="max-h-[60vh] overflow-y-auto px-5 py-5 space-y-6">
          {turns.map(t => (
            <ResearchTurnView
              key={t.id}
              turn={t}
              isDark={isDark}
              onOpenCite={(cite, n) => setOpenCite({ cite, n })}
              renderPlain={(text) => <LiteMarkdown text={text} />}
            />
          ))}
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
              سجّل الدخول لتستخدم باحث المكتبة الذكي. يفتحه اشتراك المكتبة، وكل سؤال بنقاط.
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
          <div data-research="composer">
            {/* 06 ج6 (l12): one question away from the 50-point lock → say so first. */}
            <LibraryPointsLowNotice isDark={isDark} refreshKey={turns.length * 2 + (running ? 1 : 0)} />
            <div className="mb-2">
              <LibraryScopeChips value={scope} onChange={setScope} isDark={isDark} disabled={running} />
            </div>
            <div className={`flex items-end gap-2 rounded-2xl border px-3.5 py-2.5 transition-colors ${
              isDark
                ? "border-white/10 bg-white/[0.03] focus-within:border-[#C8A762]/50"
                : "border-slate-300 bg-white focus-within:border-[#0B3D2E]"
            }`}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value.slice(0, QUESTION_MAX))}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
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
                onClick={() => void submit()}
                disabled={!input.trim() || running}
                aria-label="إرسال السؤال"
                className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-xl text-white transition-[opacity,transform] motion-safe:active:scale-[0.95] disabled:opacity-35"
                style={{ background: ROYAL }}
              >
                <PaperPlaneTilt size={15} weight="fill" />
              </button>
            </div>
            <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px] ${muted}`}>
              <span>
                {aiToolPriceText(TOOL, "ar")} للسؤال
                <ToolPointsAvailable tool={TOOL} price={aiToolPointRange(TOOL)[0]} leading=" · " recheck={turns.length} />
                {free && <> · <span className={`font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>{FREE_QUESTION_COPY.left(free.left, free.total)}</span></>}
              </span>
              <span className="inline-flex items-center gap-1">
                <WarningDiamond size={11} /> الإجابات استرشادية ولا تُعدّ استشارة قانونية رسمية
              </span>
            </div>
          </div>
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

      {openCite && (
        <ResearchRefDrawer cite={openCite.cite} n={openCite.n} isDark={isDark} onClose={() => setOpenCite(null)} onAsk={fillExample} />
      )}
      <ResearchSelectionBar containerRef={threadRef} onPrefill={fillExample} />
      <ResearchTour open={tourOpen} onClose={() => setTourOpen(false)} isDark={isDark} />
    </div>
  );
}
