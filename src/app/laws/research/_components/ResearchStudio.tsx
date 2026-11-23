"use client";

/**
 * ResearchStudio — «باحث المكتبة الذكي» as its own page, /laws/research, in the
 * owner's binding V3 layout (file 11, `saudi_library_agent_studio_v2.html`;
 * phase A6): a header with «جولة في الواجهة», a history sidebar beside an
 * editorial reading column, the live stage card, answers with their sources
 * and action strip, a side panel for each cited text, a selection toolbar, and
 * the question box at the bottom.
 *
 * Built from what exists, nothing invented:
 *  - every question is the library assistant call (useLibraryResearch →
 *    askLibrary), with the same guest / «قريباً» / open states, price,
 *    free-question counter and disclaimer as the /laws tab;
 *  - the sidebar lists THIS visit's questions only. The durable history across
 *    devices (pin, rename, archive) needs a table and an API — phase B — so it
 *    says «قريباً» instead of the prototype's cloud-sync pill;
 *  - not shown until built: the stance switch and the structured answer
 *    (phase E), listening (C), attachments and web search (F). The question
 *    box keeps the scope chips and the existing voice dictation button, which
 *    hides itself where the browser cannot take dictation.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpenText, ClockCounterClockwise, MagnifyingGlass, NotePencil, PaperPlaneTilt, Question, WarningDiamond, X } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { useToolUsable } from "@/hooks/useToolUsable";
import { useDraftCart } from "@/hooks/useDraftCart";
import { aiToolPointRange, aiToolPriceText } from "@/lib/ai/toolPointsDisplay";
import { FREE_QUESTION_COPY } from "@/lib/ai/freeQuestion";
import LibraryScopeChips, { type LibraryScopeChoice } from "@/components/ai/LibraryScopeChips";
import { VoiceInput } from "@/components/ui/VoiceInput";
import type { Citation } from "@/components/ai/CitedAnswer";
import { LIBRARY_AI_SOON } from "../../[slug]/_library-assistant";
import { LiteMarkdown } from "../../components/AiTabContent";
import { QUESTION_MAX, useLibraryResearch } from "./useLibraryResearch";
import { ResearchTurnView } from "./ResearchTurn";
import { ResearchRefDrawer } from "./ResearchRefDrawer";
import { readTourHidden, ResearchTour } from "./ResearchTour";
import { ResearchSelectionBar } from "./ResearchSelectionBar";
import { arabicDigits } from "./researchStages";
import ToolPointsAvailable from "@/components/payments/ToolPointsAvailable";

const ROYAL = "#0B3D2E";
const GOLD = "#C8A762";
const TOOL = "library-assistant";

type Access = "checking" | "guest" | "soon" | "open";

const EXAMPLES = [
  { label: "نص نظامي وتعديلاته", prompt: "ما نص المادة المتعلقة بـ… في نظام…؟ وهل عُدّلت؟" },
  { label: "المبادئ والسوابق القضائية", prompt: "ما المبادئ القضائية في مسألة…؟" },
  { label: "المادة ولائحتها التنفيذية", prompt: "ما الذي تضيفه اللائحة التنفيذية إلى المادة… من نظام…؟" },
  { label: "شرح مادة بعينها", prompt: "اشرح لي المادة… من نظام… وشروط تطبيقها." },
] as const;

export default function ResearchStudio() {
  const user = useUser();
  if (user.loading) return <Studio access="checking" />;
  if (!user.isLoggedIn) return <Studio access="guest" />;
  return <SignedIn />;
}

function SignedIn() {
  const usable = useToolUsable(TOOL);
  return <Studio access={usable === null ? "checking" : usable ? "open" : "soon"} />;
}

function Studio({ access }: { access: Access }) {
  const { isDark } = useTheme();
  const { turns, running, send, reset } = useLibraryResearch();
  const { cart } = useDraftCart();
  const [input, setInput] = useState("");
  const [scope, setScope] = useState<LibraryScopeChoice>("all");
  const [openCite, setOpenCite] = useState<{ cite: Citation; n: number } | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [free, setFree] = useState<{ left: number; total: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // The tour opens by itself once, until «إغلاق وعدم الإظهار».
  useEffect(() => {
    if (access === "open" && !readTourHidden()) setTourOpen(true);
  }, [access]);

  // Owner ٣٠ (l7): the free questions left, as the server counts them.
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
    if (access !== "open" || running) return;
    const q = input.trim();
    if (!q) return;
    setInput("");
    await send(q, scope);
  }

  function prefill(text: string) {
    setInput(text.slice(0, QUESTION_MAX));
    setOpenCite(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(text.length, text.length);
    });
  }

  const shown = useMemo(() => {
    const f = filter.trim();
    return turns.filter((t) => !f || t.question.includes(f));
  }, [turns, filter]);

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const strong = isDark ? "text-white" : "text-[#0B3D2E]";
  const line = isDark ? "border-white/[0.07]" : "border-slate-200";
  const press = "transition-transform motion-safe:active:scale-[0.97]";
  const ghost = `${press} inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[12px] font-medium ${
    isDark ? "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-[#C8A762]/50" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-[#C8A762]"
  }`;

  const sidebar = (
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className={`flex items-center gap-1.5 text-[12.5px] font-bold ${strong}`}>
            <ClockCounterClockwise size={15} style={{ color: GOLD }} aria-hidden="true" /> أبحاث هذه الجلسة
          </p>
          <button type="button" onClick={() => setHistoryOpen(false)} aria-label="إغلاق السجل" className={`lg:hidden rounded-lg border p-1 ${line}`}>
            <X size={12} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => { reset(); setHistoryOpen(false); requestAnimationFrame(() => inputRef.current?.focus()); }}
          disabled={running}
          className={`${press} flex items-center justify-between rounded-xl px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50`}
          style={{ background: ROYAL }}
        >
          <span>بحث جديد</span>
          <NotePencil size={15} style={{ color: GOLD }} aria-hidden="true" />
        </button>
        <label className="relative block">
          <span className="sr-only">ابحث في أسئلة هذه الجلسة</span>
          <MagnifyingGlass size={13} className={`absolute right-2.5 top-2.5 ${muted}`} aria-hidden="true" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value.slice(0, 80))}
            placeholder="ابحث في أسئلة هذه الجلسة…"
            className={`w-full rounded-xl border bg-transparent py-1.5 pr-8 pl-2 text-[12px] outline-none ${line} ${isDark ? "text-zinc-100 placeholder:text-zinc-500" : "text-slate-800 placeholder:text-slate-400"}`}
          />
        </label>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {shown.length === 0 ? (
            <p className={`px-1 text-[12px] leading-relaxed ${muted}`}>{turns.length === 0 ? "لا أسئلة في هذه الجلسة بعد." : "لا سؤال يطابق بحثك."}</p>
          ) : (
            shown.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { document.getElementById(t.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); setHistoryOpen(false); }}
                className={`${press} block w-full truncate rounded-lg px-2.5 py-2 text-start text-[12px] ${isDark ? "text-zinc-300 hover:bg-white/[0.05]" : "text-slate-700 hover:bg-white"}`}
                title={t.question}
              >
                {t.question}
              </button>
            ))
          )}
        </div>
      </div>
      <div className={`space-y-2 border-t pt-3 text-[11.5px] ${line} ${muted}`}>
        <div className="flex items-center justify-between">
          <span>مسودة التجميع</span>
          <span className="rounded px-1.5 py-0.5 font-mono font-bold" style={{ background: "rgba(200,167,98,0.14)", color: GOLD }}>{arabicDigits(cart.length)}</span>
        </div>
        <p className="leading-relaxed">حفظ سجل أبحاثك في حسابك ومزامنته بين أجهزتك — قريباً.</p>
      </div>
    </div>
  );

  return (
    <div dir="rtl" className={`min-h-[calc(100dvh-4rem)] ${isDark ? "bg-[#0b0f11] text-zinc-100" : "bg-[#f7f8f7] text-slate-800"}`}>
      {/* Header */}
      <header className={`flex h-14 items-center justify-between gap-3 border-b px-4 lg:px-6 ${line} ${isDark ? "bg-[#0f1417]" : "bg-white"}`}>
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: ROYAL }}>
            <BookOpenText size={16} weight="duotone" style={{ color: GOLD }} aria-hidden="true" />
          </span>
          <h1 className={`text-sm font-bold ${strong}`} style={{ fontFamily: "var(--font-brand)" }}>باحث المكتبة الذكي</h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setHistoryOpen(true)} className={`${ghost} lg:hidden`}>
            <ClockCounterClockwise size={14} style={{ color: GOLD }} aria-hidden="true" /> السجل
          </button>
          <button type="button" onClick={() => setTourOpen(true)} className={ghost}>
            <Question size={14} style={{ color: GOLD }} aria-hidden="true" /> جولة في الواجهة
          </button>
          <Link href="/laws" className={ghost}>المكتبة</Link>
        </div>
      </header>

      <div className="flex min-h-[calc(100dvh-7.5rem)]">
        {/* History sidebar: open by default on wide screens, a panel on small ones. */}
        <aside className={`hidden w-72 shrink-0 border-l p-3.5 lg:block ${line} ${isDark ? "bg-[#0d1214]" : "bg-[#f1f3f2]"}`}>{sidebar}</aside>
        {historyOpen && (
          <div className="fixed inset-0 z-[65] lg:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setHistoryOpen(false)} aria-hidden="true" />
            <aside className={`absolute inset-y-0 right-0 w-[85vw] max-w-xs border-l p-3.5 ${line} ${isDark ? "bg-[#0d1214]" : "bg-[#f1f3f2]"}`}>{sidebar}</aside>
          </div>
        )}

        {/* Reading column */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div ref={threadRef} className="flex-1 px-4 py-6 sm:px-8">
            <div className="mx-auto max-w-[74ch] space-y-6">
              {turns.length === 0 && (
                <div className="space-y-5">
                  <p className={`text-[13.5px] leading-relaxed ${muted}`}>
                    يبحث في نصوص الأنظمة واللوائح والمبادئ القضائية بمكتبة نظامي، ويجيب موثّقاً بالمواد ومصادرها.
                  </p>
                  {access !== "soon" && (
                    <div>
                      <p className={`mb-2 text-[11.5px] font-bold ${muted}`}>أمثلة لأسئلة بحثية</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {EXAMPLES.map((ex) => {
                          const body = (
                            <>
                              <span className={`flex items-center gap-1.5 text-[12.5px] font-bold ${strong}`}>
                                <BookOpenText size={14} style={{ color: GOLD }} aria-hidden="true" /> {ex.label}
                              </span>
                              <span className={`mt-1 block text-[12px] leading-snug ${muted}`}>{ex.prompt}</span>
                            </>
                          );
                          const card = `rounded-xl border px-3.5 py-3 text-start ${isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-slate-200 bg-white"}`;
                          return access === "open" ? (
                            <button key={ex.label} type="button" onClick={() => prefill(ex.prompt)} className={`${card} ${press} ${isDark ? "hover:border-[#C8A762]/40" : "hover:border-[#0B3D2E]/50"}`}>
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
              )}
              {turns.map((t) => (
                <div key={t.id} id={t.id} className="scroll-mt-4">
                  <ResearchTurnView
                    turn={t}
                    isDark={isDark}
                    onOpenCite={(cite, n) => setOpenCite({ cite, n })}
                    renderPlain={(text) => <LiteMarkdown text={text} />}
                  />
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Question box */}
          <div className={`sticky bottom-0 border-t px-4 pb-4 pt-3 sm:px-8 ${line} ${isDark ? "bg-[#0b0f11]/95" : "bg-[#f7f8f7]/95"} backdrop-blur`}>
            <div className="mx-auto max-w-[74ch]">
              {access === "checking" && <p role="status" className={`py-4 text-center text-[12.5px] ${muted}`}>جارٍ التحقق…</p>}
              {access === "soon" && (
                <div className={`whitespace-pre-line rounded-xl border px-4 py-4 text-[13px] leading-relaxed ${isDark ? "border-[#C8A762]/25 bg-[#C8A762]/[0.06] text-zinc-200" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                  <p className="mb-1 font-bold">قريباً</p>
                  {LIBRARY_AI_SOON}
                </div>
              )}
              {access === "guest" && (
                <div className={`flex flex-col justify-between gap-3 rounded-xl border px-4 py-4 sm:flex-row sm:items-center ${isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-white"}`}>
                  <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-200" : "text-slate-700"}`}>سجّل الدخول لتستخدم باحث المكتبة الذكي. يفتحه اشتراك المكتبة، وكل سؤال بنقاط.</p>
                  <Link href="/login?next=%2Flaws%2Fresearch" className={`${press} inline-flex flex-shrink-0 items-center justify-center rounded-xl px-4 py-2 text-[12.5px] font-bold text-white hover:opacity-90`} style={{ background: ROYAL }}>
                    تسجيل الدخول
                  </Link>
                </div>
              )}
              {access === "open" && (
                <div data-research="composer" className="space-y-2">
                  <LibraryScopeChips value={scope} onChange={setScope} isDark={isDark} disabled={running} />
                  <div className={`flex items-end gap-2 rounded-2xl border px-3.5 py-2.5 transition-colors ${
                    isDark ? "border-white/10 bg-[#0f1417] focus-within:border-[#C8A762]/50" : "border-slate-300 bg-white focus-within:border-[#0B3D2E]"
                  }`}>
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value.slice(0, QUESTION_MAX))}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
                      placeholder="اكتب سؤالك عن نص نظامي أو مبدأ قضائي…"
                      aria-label="سؤالك لباحث المكتبة"
                      rows={2}
                      dir="rtl"
                      className={`flex-1 resize-none bg-transparent text-[14px] leading-relaxed outline-none ${isDark ? "text-zinc-100 placeholder:text-zinc-500" : "text-slate-900 placeholder:text-slate-400"}`}
                      style={{ maxHeight: 160 }}
                    />
                    <VoiceInput onTranscript={(text) => setInput((prev) => `${prev}${prev ? " " : ""}${text}`.slice(0, QUESTION_MAX))} />
                    <button
                      type="button"
                      onClick={() => void submit()}
                      disabled={!input.trim() || running}
                      aria-label="إرسال السؤال"
                      className={`${press} flex h-10 flex-shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[12.5px] font-bold text-white disabled:opacity-35`}
                      style={{ background: ROYAL, border: "1px solid rgba(200,167,98,0.5)" }}
                    >
                      {running ? "يبحث…" : "إرسال"} <PaperPlaneTilt size={14} weight="fill" style={{ color: GOLD }} aria-hidden="true" />
                    </button>
                  </div>
                  <div className={`flex flex-wrap items-center justify-between gap-2 text-[11.5px] ${muted}`}>
                    <span>
                      {aiToolPriceText(TOOL, "ar")} للسؤال
                      <ToolPointsAvailable tool={TOOL} price={aiToolPointRange(TOOL)[0]} leading=" · " />
                      {free && <> · <span className={`font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>{FREE_QUESTION_COPY.left(free.left, free.total)}</span></>}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <WarningDiamond size={11} aria-hidden="true" /> الإجابات استرشادية ولا تُعدّ استشارة قانونية رسمية
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {openCite && (
        <ResearchRefDrawer cite={openCite.cite} n={openCite.n} isDark={isDark} onClose={() => setOpenCite(null)} onAsk={prefill} />
      )}
      <ResearchSelectionBar containerRef={threadRef} onPrefill={prefill} />
      <ResearchTour open={tourOpen} onClose={() => setTourOpen(false)} isDark={isDark} />
    </div>
  );
}
