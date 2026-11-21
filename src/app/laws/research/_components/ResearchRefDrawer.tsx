"use client";

/**
 * The researcher's reference panel (owner file 11, V3 «درج الاستشهادات وفحص
 * السريان», phase A4): a cited article or principle opens beside the answer
 * instead of a new tab — its live library status, its text (the same
 * source-preview read and cache as CitedAnswer's sheet: a non-subscriber sees
 * the excerpt only), a search inside the open text, «اسأل عن المرجع» (fills the
 * question box; nothing is sent or charged) and «حفظ للتجميع» (the draft cart,
 * complete texts only — researchCart.ts).
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowSquareOut, BookmarkSimple, BookOpen, CheckCircle, Gavel, MagnifyingGlass, X } from "@phosphor-icons/react";
import {
  CitationStatusPill,
  loadPreview,
  previewable,
  type Citation,
  type PreviewState,
} from "@/components/ai/CitedAnswer";
import { statusPill } from "@/lib/ai/citationStatus";
import { useDraftCart } from "@/hooks/useDraftCart";
import { cartRefusal, citationCartEntry } from "./researchCart";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlighted({ text, query, isDark }: { text: string; query: string; isDark: boolean }) {
  const q = query.trim();
  if (q.length < 2) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "g"));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className={`rounded px-0.5 ${isDark ? "bg-[#C8A762]/30 text-white" : "bg-amber-200 text-slate-900"}`}>{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function ResearchRefDrawer({
  cite,
  n,
  isDark,
  onClose,
  onAsk,
}: {
  cite: Citation;
  n: number;
  isDark: boolean;
  onClose: () => void;
  /** Fills the question box with a follow-up about this source. */
  onAsk: (prefill: string) => void;
}) {
  const [state, setState] = useState<PreviewState>(() => (previewable(cite) ? { phase: "loading" } : { phase: "none" }));
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);
  const { cart, setCart } = useDraftCart();

  useEffect(() => {
    setQuery("");
    setSaved(false);
    if (!previewable(cite)) {
      setState({ phase: "none" });
      return;
    }
    setState({ phase: "loading" });
    let live = true;
    loadPreview(cite).then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, [cite]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const preview = state.phase === "ready" ? state.preview : null;
  const status = preview ? preview.status : cite.status;
  const refusal = cartRefusal(cite, preview);
  const inCart = useMemo(() => !!cite.id && cart.some((e) => e.articleId === cite.id), [cart, cite.id]);
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const Icon = cite.kind === "principle" ? Gavel : BookOpen;

  function save() {
    const entry = citationCartEntry(cite, preview);
    if (!entry) return;
    setCart((prev) => (prev.find((e) => e.articleId === entry.articleId) ? prev : [...prev, entry]));
    setSaved(true);
  }

  const btn = "transition-transform motion-safe:active:scale-[0.97]";

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/30 lg:bg-black/10" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`المصدر ${n}: ${cite.title}`}
        dir="rtl"
        className={`fixed inset-y-0 left-0 z-[71] flex w-full max-w-[26rem] flex-col border-r shadow-2xl ${
          isDark ? "border-white/[0.08] bg-[#0f1417] text-zinc-100" : "border-slate-200 bg-white text-slate-800"
        }`}
      >
        <div className={`flex items-center justify-between gap-2 border-b px-4 py-3 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <div className="flex items-center gap-2">
            <CitationStatusPill status={status} isDark={isDark} />
            <span className={`text-[11px] ${muted}`}>{cite.kind === "principle" ? "مبدأ قضائي" : "نص نظامي"} · المصدر {n}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className={`rounded-lg border p-1.5 ${btn} ${isDark ? "border-white/10 hover:bg-white/5" : "border-slate-200 hover:bg-slate-50"}`}>
            <X size={14} />
          </button>
        </div>

        <div className={`border-b px-4 py-2.5 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
          <label className="relative block">
            <span className="sr-only">ابحث داخل النص المفتوح</span>
            <MagnifyingGlass size={13} className={`absolute right-2.5 top-2.5 ${muted}`} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value.slice(0, 80))}
              placeholder="ابحث داخل النص المفتوح…"
              className={`w-full rounded-xl border py-1.5 pr-8 pl-2 text-[12.5px] outline-none ${
                isDark ? "border-white/10 bg-transparent text-zinc-100 placeholder:text-zinc-500 focus:border-[#C8A762]/50" : "border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-[#0B3D2E]"
              }`}
            />
          </label>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <h3 className="flex items-start gap-2 text-[14px] font-bold leading-relaxed">
            <Icon size={16} className={`mt-1 shrink-0 ${cite.kind === "principle" ? "text-amber-500" : "text-blue-500"}`} aria-hidden="true" />
            <span>{cite.title}</span>
          </h3>
          {preview?.lawTitle && !cite.title.includes(preview.lawTitle) && <p className={`text-[12px] ${muted}`}>{preview.lawTitle}</p>}
          {statusPill(status)?.tone === "danger" && (
            <p className={`rounded-xl border px-3 py-2 text-[12px] ${isDark ? "border-red-500/25 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>
              هذه المادة ملغاة في المكتبة — تحقّق قبل الاستشهاد بها.
            </p>
          )}
          {statusPill(status)?.tone === "caution" && (
            <p className={`rounded-xl border px-3 py-2 text-[12px] ${isDark ? "border-amber-500/25 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              عُدّلت هذه المادة — راجع نصها النافذ وتعديلاتها في المكتبة.
            </p>
          )}
          <div aria-live="polite" aria-busy={state.phase === "loading" || undefined}>
            {state.phase === "loading" && (
              <div className="space-y-2" aria-label="جارٍ تحميل النص">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={`h-3 animate-pulse rounded ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`} style={{ width: `${95 - i * 20}%` }} />
                ))}
              </div>
            )}
            {state.phase === "error" && <p className={`text-[13px] ${isDark ? "text-amber-300" : "text-amber-700"}`}>{state.message} يمكنك فتحه في المكتبة.</p>}
            {state.phase === "none" && <p className={`text-[13px] ${muted}`}>لا معاينة لهذا النوع من المصادر هنا — افتحه في المكتبة.</p>}
            {preview && (
              preview.excerpt ? (
                <blockquote className={`whitespace-pre-wrap rounded-xl border p-3.5 text-[13px] leading-[1.95] ${isDark ? "border-white/[0.06] bg-white/[0.03] text-zinc-200" : "border-slate-200 bg-slate-50 text-slate-800"}`}>
                  <Highlighted text={preview.excerpt} query={query} isDark={isDark} />
                </blockquote>
              ) : (
                <p className={`text-[13px] ${muted}`}>لا نص محفوظاً لهذا المصدر في المكتبة.</p>
              )
            )}
            {preview?.locked && preview.excerpt && (
              <p className={`mt-2 text-[12px] ${muted}`}>
                {preview.deviceRefused ? "مقتطف فقط: النص الكامل يُفتح على أجهزتك المعتمدة للمكتبة." : "مقتطف فقط: النص الكامل لمشتركي المكتبة القانونية."}
              </p>
            )}
            {preview && !preview.locked && preview.truncated && <p className={`mt-2 text-[12px] ${muted}`}>النص طويل: تتمته في المكتبة.</p>}
          </div>
        </div>

        <div className={`space-y-2 border-t p-3.5 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <div className="grid grid-cols-2 gap-2 text-[12px] font-bold">
            <button
              type="button"
              onClick={() => onAsk(`فصّل شروط واستثناءات ${cite.title}: `)}
              className={`rounded-xl border px-3 py-2 ${btn} ${isDark ? "border-white/10 text-zinc-200 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
            >
              اسأل عن المرجع
            </button>
            <button
              type="button"
              onClick={save}
              disabled={refusal !== null || inCart}
              title={refusal ?? undefined}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-white disabled:opacity-50 ${btn}`}
              style={{ background: "#0B3D2E" }}
            >
              {saved || inCart ? <CheckCircle size={13} weight="bold" /> : <BookmarkSimple size={13} />}
              {saved || inCart ? "في مسودة التجميع" : "حفظ للتجميع"}
            </button>
          </div>
          {refusal && !inCart && state.phase !== "loading" && <p className={`text-[11px] ${muted}`}>{refusal}</p>}
          <a
            href={cite.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold ${btn} ${isDark ? "bg-[#C8A762] text-black hover:bg-[#d4b874]" : "border border-[#0B3D2E]/30 text-[#0B3D2E] hover:bg-[#0B3D2E]/5"}`}
          >
            افتح في المكتبة <ArrowSquareOut size={13} aria-hidden="true" />
            <span className="sr-only">(في تبويب جديد)</span>
          </a>
        </div>
      </aside>
    </>
  );
}
