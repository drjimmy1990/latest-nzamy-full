"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowSquareOut, BookOpen, Gavel } from "@phosphor-icons/react";
import ModalShell from "@/components/ui/ModalShell";
import { statusPill } from "@/lib/ai/citationStatus";
import { mentionLookupUrl, readMentionLookup, splitAnswer, type AnswerPart, type MentionLookup } from "@/lib/ai/answerMentions";

/**
 * A library tool's answer (wave 2): the text with its [S…] markers as numbered
 * links, and the list of the texts they point to. The citations are the
 * server's (runCore.mapCitations): only ids the app itself sent, each resolved
 * to a library title and link. A marker the server dropped is dropped here too.
 *
 * Owner N06-34/35 (batch l6): a marker or a source row opens the cited text in
 * a sheet on the same screen (CitationSheet below) instead of a new tab, and a
 * cited article shows its status — 🟢 سارية / 🟡 معدّلة / 🔴 ملغاة — from the
 * library row (citationStatus.ts), never from the model. Every AI result view
 * renders citations through CitedText / SourceList, so they all get both.
 *
 * N06-34..39 remainder (batch l11): an article the answer names in its own
 * words («المادة الثمانين من نظام العمل») is a chip too (answerMentions.ts,
 * the reader's parser). It resolves on click through the reader's lookup —
 * title, number, status, never text. When the run CITED that article, the
 * chip offers the same CitationSheet (source-preview, with its 100-character
 * rule for a viewer without the library); any other article is shown by title
 * and status only, with its library link. A mention never reads text the
 * caller's own run did not cite.
 */

export interface Citation {
  sid: string;
  kind: string;
  title: string;
  url: string;
  /** The library id (runCore spreads the source map entry): what the sheet reads. */
  id?: string;
  /** The article's library status when the run stored one (retrieval.ts, 2026-11-18 on). */
  status?: string;
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
export { stripCitationMarkers } from "@/lib/ai/citationMarkers";

// ── status pill ──────────────────────────────────────────────────────────────

const PILL_TONE = {
  ok: { light: "bg-emerald-50 text-emerald-700 border-emerald-200", dark: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25" },
  caution: { light: "bg-amber-50 text-amber-800 border-amber-200", dark: "bg-amber-500/10 text-amber-300 border-amber-500/25" },
  danger: { light: "bg-red-50 text-red-700 border-red-200", dark: "bg-red-500/10 text-red-300 border-red-500/25" },
} as const;

/** 🟢 سارية / 🟡 معدّلة / 🔴 ملغاة, or nothing when the library stated none of the three. */
export function CitationStatusPill({ status, isDark }: { status: unknown; isDark: boolean }) {
  const pill = statusPill(status);
  if (!pill) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-bold leading-4 ${PILL_TONE[pill.tone][isDark ? "dark" : "light"]}`}
      title={pill.spoken}
    >
      <span aria-hidden="true">{pill.emoji}</span>
      <span className="sr-only">{pill.spoken}</span>
      <span aria-hidden="true">{pill.label}</span>
    </span>
  );
}

// ── the sheet ────────────────────────────────────────────────────────────────

interface Preview {
  lawTitle: string | null;
  label: string | null;
  status: string | null;
  excerpt: string;
  truncated: boolean;
  locked: boolean;
  deviceRefused: boolean;
}

type PreviewState = { phase: "loading" } | { phase: "ready"; preview: Preview } | { phase: "error"; message: string } | { phase: "none" };

/** One read per cited text per page view: the sheet reopens instantly. */
const previewCache = new Map<string, Promise<PreviewState>>();

function previewable(c: Citation): c is Citation & { id: string } {
  return (c.kind === "article" || c.kind === "principle") && typeof c.id === "string" && c.id.length > 0;
}

function loadPreview(c: Citation & { id: string }): Promise<PreviewState> {
  const key = `${c.kind}:${c.id}`;
  const hit = previewCache.get(key);
  if (hit) return hit;
  const p = fetch(`/api/v1/ai/source-preview?kind=${encodeURIComponent(c.kind)}&id=${encodeURIComponent(c.id)}`, { credentials: "same-origin" })
    .then(async (res): Promise<PreviewState> => {
      const body = (await res.json().catch(() => null)) as (Preview & { error?: string }) | null;
      if (!res.ok || !body || typeof body.excerpt !== "string") {
        previewCache.delete(key); // a failed read is tried again next time
        return {
          phase: "error",
          message: res.status === 401 ? "سجّل الدخول لعرض النص." : res.status === 404 ? "لم يُعثر على هذا النص في سجل طلباتك." : "تعذّر تحميل النص الآن.",
        };
      }
      return { phase: "ready", preview: body };
    })
    .catch((): PreviewState => {
      previewCache.delete(key);
      return { phase: "error", message: "تعذّر تحميل النص الآن." };
    });
  previewCache.set(key, p);
  return p;
}

function CitationSheet({ cite, n, isDark, onClose }: { cite: Citation; n: number; isDark: boolean; onClose: () => void }) {
  const [state, setState] = useState<PreviewState>(() => (previewable(cite) ? { phase: "loading" } : { phase: "none" }));
  useEffect(() => {
    if (!previewable(cite)) return;
    let live = true;
    loadPreview(cite).then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, [cite]);

  const preview = state.phase === "ready" ? state.preview : null;
  // The live library status wins; the one stored with the run stands in until it arrives.
  const status = preview ? preview.status : cite.status;
  const muted = isDark ? "text-zinc-400" : "text-zinc-500";
  const KindIcon = cite.kind === "principle" ? Gavel : BookOpen;

  return (
    <ModalShell
      title={<span className="flex items-start gap-2"><KindIcon size={18} aria-hidden="true" className={`mt-0.5 shrink-0 ${cite.kind === "principle" ? "text-amber-500" : "text-blue-500"}`} /><span>{cite.title}</span></span>}
      subtitle={<>المصدر {n}{preview?.label && !cite.title.includes(preview.label) ? ` · ${preview.label}` : ""}{preview?.lawTitle && !cite.title.includes(preview.lawTitle) ? ` · ${preview.lawTitle}` : ""}</>}
      onClose={onClose}
      isDark={isDark}
      maxWidthClass="max-w-lg"
      zIndexClass="z-[80]"
    >
      <div className="space-y-4">
        <CitationStatusPill status={status} isDark={isDark} />
        {statusPill(status)?.tone === "danger" && (
          <p className={`rounded-xl border px-3 py-2 text-[12px] leading-relaxed ${isDark ? "border-red-500/25 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>
            هذه المادة ملغاة في المكتبة — تحقّق قبل الاستشهاد بها.
          </p>
        )}
        {statusPill(status)?.tone === "caution" && (
          <p className={`rounded-xl border px-3 py-2 text-[12px] leading-relaxed ${isDark ? "border-amber-500/25 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            عُدّلت هذه المادة — راجع نصها النافذ وتعديلاتها في المكتبة.
          </p>
        )}

        <div aria-live="polite" aria-busy={state.phase === "loading" || undefined}>
          {state.phase === "loading" && (
            <div className="space-y-2" aria-label="جارٍ تحميل النص">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`h-3 animate-pulse rounded ${isDark ? "bg-white/[0.06]" : "bg-zinc-100"}`} style={{ width: `${95 - i * 20}%` }} />
              ))}
            </div>
          )}
          {state.phase === "error" && <p className={`text-[13px] ${isDark ? "text-amber-300" : "text-amber-700"}`}>{state.message} يمكنك فتحه في المكتبة.</p>}
          {state.phase === "none" && <p className={`text-[13px] ${muted}`}>لا معاينة لهذا النوع من المصادر هنا بعد — افتحه في المكتبة.</p>}
          {preview && (
            <>
              {preview.excerpt ? (
                <blockquote className={`whitespace-pre-wrap rounded-2xl border p-4 text-[13.5px] leading-[1.9] ${isDark ? "border-white/[0.06] bg-white/[0.03] text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`}>
                  {preview.excerpt}
                </blockquote>
              ) : (
                <p className={`text-[13px] ${muted}`}>لا نص محفوظاً لهذا المصدر في المكتبة.</p>
              )}
              {preview.locked && preview.excerpt && (
                <p className={`mt-2 text-[12px] ${muted}`}>
                  {preview.deviceRefused
                    ? "مقتطف فقط: النص الكامل يُفتح على أجهزتك المعتمدة للمكتبة."
                    : "مقتطف فقط: النص الكامل لمشتركي المكتبة القانونية."}
                </p>
              )}
              {!preview.locked && preview.truncated && <p className={`mt-2 text-[12px] ${muted}`}>النص طويل: تتمته في المكتبة.</p>}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={cite.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-bold ${isDark ? "bg-[#C8A762] text-black hover:bg-[#d4b874]" : "bg-[#0B3D2E] text-white hover:bg-[#0e4a38]"}`}
          >
            افتح في المكتبة
            <ArrowSquareOut size={14} aria-hidden="true" />
            <span className="sr-only">(في تبويب جديد، وتبقى المحادثة مفتوحة هنا)</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-xl border px-4 py-2 text-[12.5px] font-bold ${isDark ? "border-white/[0.1] text-zinc-300 hover:bg-white/[0.05]" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}
          >
            رجوع إلى الإجابة
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/**
 * The open sheet, portalled to <body>: never inside the <p>/<ol> it was opened
 * from, never clipped by a transformed parent. Mounted only once a click opened
 * it, so the server render and hydration never see a portal.
 */
function useCitationSheet(isDark: boolean): [(c: Citation, n: number) => void, ReactNode] {
  const [open, setOpen] = useState<{ cite: Citation; n: number } | null>(null);
  const node =
    open && typeof document !== "undefined"
      ? createPortal(<CitationSheet cite={open.cite} n={open.n} isDark={isDark} onClose={() => setOpen(null)} />, document.body)
      : null;
  return [(cite, n) => setOpen({ cite, n }), node];
}

// ── the answer and its sources ───────────────────────────────────────────────

type MentionPart = Extract<AnswerPart, { type: "mention" }>;
type LookupState = { phase: "loading" } | { phase: "ready"; lookup: MentionLookup } | { phase: "error" };

/** One lookup per reference per page view. */
const lookupCache = new Map<string, Promise<LookupState>>();

function loadLookup(url: string): Promise<LookupState> {
  const hit = lookupCache.get(url);
  if (hit) return hit;
  const p = fetch(url, { credentials: "same-origin" })
    .then(async (res): Promise<LookupState> => {
      if (!res.ok) {
        lookupCache.delete(url);
        return { phase: "error" };
      }
      return { phase: "ready", lookup: readMentionLookup(await res.json().catch(() => null)) };
    })
    .catch((): LookupState => {
      lookupCache.delete(url);
      return { phase: "error" };
    });
  lookupCache.set(url, p);
  return p;
}

function MentionSheet({
  mention,
  citedById,
  isDark,
  onOpenCite,
  onClose,
}: {
  mention: MentionPart;
  citedById: Map<string, Citation & { n: number }>;
  isDark: boolean;
  onOpenCite: (c: Citation, n: number) => void;
  onClose: () => void;
}) {
  const url = mentionLookupUrl(mention);
  const [state, setState] = useState<LookupState>(() => (url ? { phase: "loading" } : { phase: "error" }));
  useEffect(() => {
    if (!url) return;
    let live = true;
    loadLookup(url).then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, [url]);
  const muted = isDark ? "text-zinc-400" : "text-zinc-500";
  const lookup = state.phase === "ready" ? state.lookup : null;
  const linkBtn = `inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11.5px] font-bold ${isDark ? "border-white/[0.1] text-zinc-300 hover:bg-white/[0.05]" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`;

  return (
    <ModalShell
      title={<span className="flex items-start gap-2"><BookOpen size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-blue-500" /><span>{mention.text}</span></span>}
      subtitle={lookup?.lawTitle ?? "مرجع ورد في نص الإجابة"}
      onClose={onClose}
      isDark={isDark}
      maxWidthClass="max-w-lg"
      zIndexClass="z-[80]"
    >
      <div className="space-y-3" aria-live="polite" aria-busy={state.phase === "loading" || undefined}>
        {state.phase === "loading" && (
          <div className="space-y-2" aria-label="جارٍ البحث عن المادة">
            {[0, 1].map((i) => <div key={i} className={`h-3 animate-pulse rounded ${isDark ? "bg-white/[0.06]" : "bg-zinc-100"}`} style={{ width: `${90 - i * 25}%` }} />)}
          </div>
        )}
        {state.phase === "error" && <p className={`text-[13px] ${isDark ? "text-amber-300" : "text-amber-700"}`}>تعذّر البحث عن هذه المادة الآن.</p>}
        {lookup && lookup.articles.length === 0 && (
          <p className={`text-[13px] ${muted}`}>
            لم نجد هذه المادة في المكتبة.
            {lookup.lawUrl && <> <a href={lookup.lawUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline">افتح النظام في المكتبة</a></>}
          </p>
        )}
        {lookup && lookup.articles.length > 0 && (
          <ul className="space-y-2">
            {lookup.articles.map((a) => {
              const cited = citedById.get(a.id);
              return (
                <li key={a.id} className={`rounded-xl border p-3 ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
                  <div className="flex items-start gap-2">
                    <span className={`flex-1 text-[13px] font-bold leading-relaxed ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{a.title}</span>
                    <CitationStatusPill status={a.status} isDark={isDark} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {cited && (
                      <button type="button" onClick={() => onOpenCite(cited, cited.n)} className={linkBtn} aria-haspopup="dialog">
                        اعرض النص (المصدر {cited.n})
                      </button>
                    )}
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className={linkBtn}>
                      افتح في المكتبة <ArrowSquareOut size={12} aria-hidden="true" />
                      <span className="sr-only">(في تبويب جديد)</span>
                    </a>
                  </div>
                  {!cited && <p className={`mt-1.5 text-[11.5px] ${muted}`}>لم تكن هذه المادة من النصوص التي استندت إليها الإجابة؛ نصها في المكتبة.</p>}
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          onClick={onClose}
          className={`rounded-xl border px-4 py-2 text-[12.5px] font-bold ${isDark ? "border-white/[0.1] text-zinc-300 hover:bg-white/[0.05]" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}
        >
          رجوع إلى الإجابة
        </button>
      </div>
    </ModalShell>
  );
}

export function CitedText({ text, cites, isDark, className = "" }: { text: string; cites: Citation[]; isDark: boolean; className?: string }) {
  const bySid = new Map(cites.map((c, i) => [c.sid, { ...c, n: i + 1 }]));
  const citedById = new Map<string, Citation & { n: number }>();
  cites.forEach((c, i) => { if (c.kind === "article" && c.id && !citedById.has(c.id)) citedById.set(c.id, { ...c, n: i + 1 }); });
  const [openSheet, sheet] = useCitationSheet(isDark);
  const [mention, setMention] = useState<MentionPart | null>(null);
  const mentionNode =
    mention && typeof document !== "undefined"
      ? createPortal(
          <MentionSheet
            mention={mention}
            citedById={citedById}
            isDark={isDark}
            onOpenCite={(c, n) => { setMention(null); openSheet(c, n); }}
            onClose={() => setMention(null)}
          />,
          document.body,
        )
      : null;
  return (
    <>
      <p className={`whitespace-pre-wrap ${className}`}>
        {splitAnswer(text, cites).map((part, i) => {
          if (part.type === "text") return <Fragment key={i}>{part.text}</Fragment>;
          if (part.type === "mention") {
            return (
              <button
                key={i}
                type="button"
                onClick={() => setMention(part)}
                aria-haspopup="dialog"
                title="اعرض المادة"
                className={`inline rounded px-0.5 text-start underline decoration-dotted underline-offset-4 focus:outline-none focus-visible:ring-2 ${
                  isDark ? "text-[#C8A762] hover:bg-[#C8A762]/10 focus-visible:ring-[#C8A762]" : "text-[#0B3D2E] hover:bg-[#0B3D2E]/5 focus-visible:ring-[#0B3D2E]"
                }`}
              >
                {part.text}
              </button>
            );
          }
          const c = bySid.get(part.sid);
          if (!c) return null;
          return (
            <button
              key={i}
              type="button"
              onClick={() => openSheet(c, c.n)}
              aria-haspopup="dialog"
              aria-label={`المصدر ${c.n}: ${c.title}`}
              title={c.title}
              className={`mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 align-super text-[10px] font-black focus:outline-none focus-visible:ring-2 ${
                isDark ? "bg-[#C8A762]/15 text-[#C8A762] hover:bg-[#C8A762]/25 focus-visible:ring-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E] hover:bg-[#0B3D2E]/20 focus-visible:ring-[#0B3D2E]"
              }`}
            >
              {c.n}
            </button>
          );
        })}
      </p>
      {sheet}
      {mentionNode}
    </>
  );
}

export function SourceList({ cites, isDark, compact = false, startAt = 1 }: { cites: Citation[]; isDark: boolean; compact?: boolean; startAt?: number }) {
  const [openSheet, sheet] = useCitationSheet(isDark);
  if (cites.length === 0) return null;
  return (
    <>
      <ol className={compact ? "space-y-1" : "space-y-1.5"}>
        {cites.map((c, i) => (
          <li key={c.sid}>
            <button
              type="button"
              onClick={() => openSheet(c, i + startAt)}
              aria-haspopup="dialog"
              className={`flex w-full items-start gap-2 rounded-xl border text-start transition-colors focus:outline-none focus-visible:ring-2 ${compact ? "px-2 py-1.5 text-[11px]" : "px-3 py-2 text-[12px]"} ${
                isDark ? "border-white/[0.06] hover:bg-white/[0.03] text-zinc-300 focus-visible:ring-[#C8A762]" : "border-zinc-100 hover:bg-zinc-50 text-zinc-700 focus-visible:ring-[#0B3D2E]"
              }`}
            >
              <span className={`mt-0.5 font-black ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{i + startAt}</span>
              {c.kind === "principle" ? (
                <Gavel size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-500" />
              ) : (
                <BookOpen size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-blue-500" />
              )}
              <span className="flex-1 leading-relaxed">{c.title}</span>
              <CitationStatusPill status={c.status} isDark={isDark} />
            </button>
          </li>
        ))}
      </ol>
      {sheet}
    </>
  );
}
