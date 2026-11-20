"use client";

/**
 * _citation-popover.tsx — the popover of a citation chip (owner TODO N02-15).
 *
 * MD (_article-components.tsx) wraps references in chip buttons
 * (_cite-links.ts) when it renders an article body inside <CitationProvider>,
 * and hands a click on one to `open`. The popover then shows:
 *   - an article of THIS law: status pill (🟢 / 🟡 / 🔴, «الحالة غير محددة»
 *     when the source says nothing), number and title, the first lines of its
 *     text ONLY when the reader already holds that text (free article or full
 *     access — the page's own rule; a locked article shows number and title
 *     only), «انتقل إلى المادة», «أضف إلى المسودة» (the page's own add, which
 *     opens the paywall for a locked article), «نسخ»;
 *   - an article of ANOTHER law («من نظام العمل», or «من النظام» in a
 *     regulation): looked up on click from /api/library/laws/[slug]/citations
 *     — title, number and status, never text — with a link to it and «نسخ»;
 *   - a named law: its title, status and a link; a decree: its words and «نسخ».
 * Nothing is fetched until a chip is clicked.
 */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowSquareOut, Check, Copy, Plus, X } from "@phosphor-icons/react";
import type { LawArticle } from "../data";
import { apiSlug } from "@/utils/apiSlug";
import { buildCitation } from "./_citation";
import { scanCitations, type CiteKind, type CiteScope } from "./_cite-links";
import { lawStatusPill, pillClass, statusPill, type StatusPill } from "./_cite-status";
import { scrollToReaderAnchor } from "./_reader-anchors";
import { parseDecreeRef } from "@/lib/library/decreeRef";

export interface CitationReaderContext {
  lawSlug: string;
  lawTitle: string;
  /**
   * O14 (owner file 16 §1): the other names this same file goes by — its
   * merged regulations. A reference to one of them is plain text, like one to
   * `lawTitle` (_cite-links.ts isOwnDocumentRef).
   */
  ownNames?: readonly string[];
  lawType?: string;
  /** A regulation's parent law, when the library links it (resolves «من النظام»). */
  parentSlug: string | null;
  byNumber: Map<number, LawArticle>;
  viewerHasFullAccess: boolean;
  isDark: boolean;
  isRTL: boolean;
  isInCart: (articleId: string) => boolean;
  onAddArticle: (a: LawArticle) => void;
  showPaywall: () => void;
}

interface CitationContextValue extends CitationReaderContext {
  open: (chip: HTMLElement) => void;
}

const CitationContext = createContext<CitationContextValue | null>(null);

/** The chips' context; null outside a provider (MD then renders no chips). */
export function useCitations(): CitationContextValue | null {
  return useContext(CitationContext);
}

interface OpenChip {
  rect: { top: number; bottom: number; left: number; right: number };
  kind: CiteKind;
  scope: CiteScope;
  numbers: number[];
  label: string;
  docName: string;
}

const MAX_ROWS = 5;

function plainText(md: string): string {
  return md.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/[#>`]/g, "").replace(/\s+/g, " ").trim();
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** «المادة (٥) من نظام (العمل)» — the citation prefix without «ونصه:». */
function referenceLabel(a: LawArticle, ctx: CitationReaderContext): string {
  const c = buildCitation(
    { docTitle: ctx.lawTitle, docType: ctx.lawType, numberText: a.numberText, displayNum: a.num, status: a.status },
    ctx.isRTL,
  );
  return c.plain.replace(/[\s,]*(?:ونصه(?: قبل الإلغاء)?|text(?: prior to repeal)?):$/u, "").trim();
}

export function CitationProvider({ value, children }: { value: CitationReaderContext | null; children: ReactNode }) {
  const [chip, setChip] = useState<OpenChip | null>(null);
  const close = useCallback(() => setChip(null), []);

  const open = useCallback(
    (el: HTMLElement) => {
      const kind = el.dataset.citeKind as CiteKind | undefined;
      const scope = el.dataset.citeScope as CiteScope | undefined;
      if (!kind || !scope) return;
      const numbers = String(el.dataset.citeN ?? "")
        .split(",")
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0);
      const label = (el.textContent ?? "").trim();
      // The name is re-read from the chip's own text, never from an attribute.
      const docName = scanCitations(label, { docTitle: value?.lawTitle })[0]?.docName ?? "";
      const r = el.getBoundingClientRect();
      setChip({ rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right }, kind, scope, numbers, label, docName });
    },
    [value?.lawTitle],
  );

  const ctx = useMemo<CitationContextValue | null>(() => (value ? { ...value, open } : null), [value, open]);

  return (
    <CitationContext.Provider value={ctx}>
      {children}
      {ctx && chip && <CitationPopover chip={chip} ctx={ctx} onClose={close} />}
    </CitationContext.Provider>
  );
}

function CitationPopover({ chip, ctx, onClose }: { chip: OpenChip; ctx: CitationReaderContext; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const { isDark, isRTL } = ctx;
  const WIDTH = 320;

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 200;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = chip.rect.bottom + 6;
    const top = below + h > vh - 8 && chip.rect.top - h - 6 > 8 ? chip.rect.top - h - 6 : Math.min(below, Math.max(8, vh - h - 8));
    const anchor = isRTL ? chip.rect.right - WIDTH : chip.rect.left;
    const left = Math.min(Math.max(8, anchor), Math.max(8, vw - WIDTH - 8));
    setPos({ top, left });
  }, [chip, isRTL]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (ref.current && t && !ref.current.contains(t) && !t.closest?.("button[data-cite-kind]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onClose, { passive: true });
    window.addEventListener("resize", onClose);
    ref.current?.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={isRTL ? "مرجع" : "Reference"}
      dir={isRTL ? "rtl" : "ltr"}
      style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: WIDTH, zIndex: 60 }}
      className={`rounded-2xl border shadow-xl p-3 text-[12px] print:hidden ${isDark ? "bg-zinc-900 border-white/[0.1] text-zinc-200" : "bg-white border-slate-200 text-zinc-800"}`}
    >
      <div className="flex items-start gap-2 mb-2">
        <p className={`flex-1 text-[11px] font-bold leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{chip.label}</p>
        <button type="button" onClick={onClose} aria-label={isRTL ? "إغلاق" : "Close"} className={`p-1 rounded-lg ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}>
          <X size={12} />
        </button>
      </div>
      {chip.kind === "article" && chip.scope === "self" ? (
        <SelfArticles chip={chip} ctx={ctx} onClose={onClose} />
      ) : chip.kind === "decree" ? (
        <DecreeBody chip={chip} ctx={ctx} />
      ) : (
        <RemoteBody chip={chip} ctx={ctx} />
      )}
    </div>
  );
}

/** A status pill; nothing at all when the source records no status. */
function Pill({ pill: p, isDark, isRTL }: { pill: StatusPill | null; isDark: boolean; isRTL: boolean }) {
  if (!p) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${pillClass(p.tone, isDark)}`}>
      <span aria-hidden>{p.emoji}</span>
      {isRTL ? p.labelAr : p.labelEn}
    </span>
  );
}

function ActionButton({ onClick, children, isDark, disabled = false }: { onClick: () => void; children: ReactNode; isDark: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition disabled:opacity-50 ${isDark ? "bg-white/[0.06] text-zinc-200 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
    >
      {children}
    </button>
  );
}

function CopyButton({ text, isDark, isRTL }: { text: string; isDark: boolean; isRTL: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <ActionButton
      isDark={isDark}
      onClick={() => {
        void copyText(text).then((ok) => {
          if (!ok) return;
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
      {isRTL ? "نسخ" : "Copy"}
    </ActionButton>
  );
}

function SelfArticles({ chip, ctx, onClose }: { chip: OpenChip; ctx: CitationReaderContext; onClose: () => void }) {
  const { isDark, isRTL } = ctx;
  return (
    <div className="space-y-2.5">
      {chip.numbers.slice(0, MAX_ROWS).map((n) => {
        const a = ctx.byNumber.get(n);
        if (!a) {
          return (
            <p key={n} className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
              {isRTL ? `لم تُعثر على المادة (${n}) في هذا المستند.` : `Article (${n}) is not in this document.`}
            </p>
          );
        }
        const locked = !a.free && !ctx.viewerHasFullAccess;
        const snippet = locked ? "" : plainText(a.text || a.originalText || "");
        const label = referenceLabel(a, ctx);
        const inCart = ctx.isInCart(a.id);
        return (
          <div key={n} className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Pill pill={statusPill(a.status)} isDark={isDark} isRTL={isRTL} />
              <span className="font-black text-[12px]">{a.num}</span>
            </div>
            {a.title && <p className="font-bold text-[12px] leading-relaxed">{a.title}</p>}
            {snippet ? (
              <p className={`leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                {snippet.length > 220 ? `${snippet.slice(0, 220)}…` : snippet}
              </p>
            ) : locked ? (
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{isRTL ? "نص المادة للمشتركين." : "The text is for subscribers."}</p>
            ) : null}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <ActionButton
                isDark={isDark}
                onClick={() => {
                  onClose();
                  if (scrollToReaderAnchor(a.id)) window.history.replaceState(null, "", `#${encodeURIComponent(a.id)}`);
                }}
              >
                <ArrowSquareOut size={11} />
                {isRTL ? "انتقل إلى المادة" : "Go to article"}
              </ActionButton>
              <ActionButton isDark={isDark} disabled={inCart} onClick={() => (locked ? ctx.showPaywall() : ctx.onAddArticle(a))}>
                {inCart ? <Check size={11} /> : <Plus size={11} />}
                {inCart ? (isRTL ? "في المسودة" : "In draft") : isRTL ? "أضف إلى المسودة" : "Add to draft"}
              </ActionButton>
              <CopyButton isDark={isDark} isRTL={isRTL} text={snippet ? `${label}:\n“${plainText(a.text || a.originalText || "")}”` : label} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface RemoteAnswer {
  law: { slug: string; title: string; status: string } | null;
  articles: Array<{ id: string; number: number; title: string; status: string }>;
}

function RemoteBody({ chip, ctx }: { chip: OpenChip; ctx: CitationReaderContext }) {
  const { isDark, isRTL } = ctx;
  const [state, setState] = useState<{ status: "loading" | "done" | "failed"; data?: RemoteAnswer }>({ status: "loading" });
  const query = useMemo(() => {
    const n = chip.numbers.length > 0 ? `&n=${chip.numbers.slice(0, MAX_ROWS).join(",")}` : "";
    if (chip.scope === "parent") return ctx.parentSlug ? `law=${encodeURIComponent(ctx.parentSlug)}${n}` : null;
    return chip.docName ? `name=${encodeURIComponent(chip.docName)}${n}` : null;
  }, [chip, ctx.parentSlug]);

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    fetch(`/api/library/laws/${apiSlug(ctx.lawSlug)}/citations?${query}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: RemoteAnswer) => { if (!cancelled) setState({ status: "done", data }); })
      .catch(() => { if (!cancelled) setState({ status: "failed" }); });
    return () => { cancelled = true; };
  }, [query, ctx.lawSlug]);

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  if (!query) {
    return <p className={`text-[11px] ${muted}`}>{isRTL ? "النظام المشار إليه غير مرتبط بالمكتبة." : "The referenced law is not linked in the library."}</p>;
  }
  if (state.status === "loading") return <p className={`text-[11px] ${muted}`}>{isRTL ? "جارٍ البحث في المكتبة…" : "Looking it up…"}</p>;
  if (state.status === "failed") return <p className={`text-[11px] ${muted}`}>{isRTL ? "تعذّر البحث الآن. حاول مرة أخرى." : "Lookup failed. Try again."}</p>;
  const law = state.data?.law;
  if (!law) {
    return (
      <div className="space-y-2">
        <p className={`text-[11px] ${muted}`}>{isRTL ? "لم يُعثر على هذا النظام في المكتبة باسمه." : "This law was not found in the library by name."}</p>
        <CopyButton isDark={isDark} isRTL={isRTL} text={chip.label} />
      </div>
    );
  }
  const lawHref = `/laws/${encodeURIComponent(law.slug)}`;
  const articles = state.data?.articles ?? [];
  const missing = chip.numbers.filter((n) => !articles.some((a) => a.number === n));
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Pill pill={lawStatusPill(law.status)} isDark={isDark} isRTL={isRTL} />
        <Link href={lawHref} className="font-black text-[12px] hover:underline">{law.title}</Link>
      </div>
      {articles.map((a) => (
        <div key={a.id} className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Pill pill={statusPill(a.status)} isDark={isDark} isRTL={isRTL} />
            <span className="font-bold">{isRTL ? `المادة (${a.number})` : `Article (${a.number})`}</span>
          </div>
          {a.title && <p className="leading-relaxed">{a.title}</p>}
          <div className="flex flex-wrap gap-1.5">
            <Link
              href={`${lawHref}#${encodeURIComponent(a.id)}`}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold ${isDark ? "bg-white/[0.06] text-zinc-200 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              <ArrowSquareOut size={11} />
              {isRTL ? "انتقل إلى المادة" : "Go to article"}
            </Link>
            <CopyButton isDark={isDark} isRTL={isRTL} text={isRTL ? `المادة (${a.number}) من (${law.title})` : `Article (${a.number}) of (${law.title})`} />
          </div>
        </div>
      ))}
      {missing.length > 0 && (
        <p className={`text-[11px] ${muted}`}>
          {isRTL ? `لم تُعثر على المادة (${missing.join("، ")}) في هذا النظام.` : `Article (${missing.join(", ")}) was not found in this law.`}
        </p>
      )}
      {chip.kind === "law" && (
        <div className="flex flex-wrap gap-1.5">
          <Link href={lawHref} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold ${isDark ? "bg-white/[0.06] text-zinc-200" : "bg-slate-100 text-slate-700"}`}>
            <ArrowSquareOut size={11} />
            {isRTL ? "افتح النظام" : "Open the law"}
          </Link>
          <CopyButton isDark={isDark} isRTL={isRTL} text={law.title} />
        </div>
      )}
    </div>
  );
}

interface DecreeAnswer {
  decree: { id: string; title: string; href: string } | null;
}

/**
 * N02-13 (batch l11): a decree whose number AND date the text gives is looked
 * up on click (citations?decree=); the route answers a library subscriber only
 * and only with the one record that fits (src/lib/library/decreeRef.ts). Not
 * found, not asked, or not answered: the plain note as before.
 */
function DecreeBody({ chip, ctx }: { chip: OpenChip; ctx: CitationReaderContext }) {
  const { isDark, isRTL } = ctx;
  const ask = ctx.viewerHasFullAccess && !!parseDecreeRef(chip.label)?.date;
  const [found, setFound] = useState<DecreeAnswer["decree"]>(null);
  useEffect(() => {
    if (!ask) return;
    let cancelled = false;
    fetch(`/api/library/laws/${apiSlug(ctx.lawSlug)}/citations?decree=${encodeURIComponent(chip.label.slice(0, 200))}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: DecreeAnswer | null) => { if (!cancelled) setFound(data?.decree ?? null); })
      .catch(() => { if (!cancelled) setFound(null); });
    return () => { cancelled = true; };
  }, [ask, chip.label, ctx.lawSlug]);
  const linkClass = `inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold ${isDark ? "bg-white/[0.06] text-zinc-200" : "bg-slate-100 text-slate-700"}`;
  if (found) {
    return (
      <div className="space-y-2">
        <Link href={found.href} className="block font-black text-[12px] leading-relaxed hover:underline">{found.title}</Link>
        <div className="flex flex-wrap gap-1.5">
          <Link href={found.href} className={linkClass}>
            <ArrowSquareOut size={11} />
            {isRTL ? "افتح الوثيقة في المكتبة" : "Open it in the library"}
          </Link>
          <CopyButton isDark={isDark} isRTL={isRTL} text={chip.label} />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
        {isRTL ? "أداة تشريعية مذكورة في النص. حالتها لا تُستنتج من هنا؛ ابحث عنها في قسم المراسيم والقرارات بالمكتبة." : "An instrument named in the text. Its status is not inferred here; look it up in the library's decrees section."}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Link href="/laws" className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold ${isDark ? "bg-white/[0.06] text-zinc-200" : "bg-slate-100 text-slate-700"}`}>
          <ArrowSquareOut size={11} />
          {isRTL ? "المكتبة" : "Library"}
        </Link>
        <CopyButton isDark={isDark} isRTL={isRTL} text={chip.label} />
      </div>
    </div>
  );
}
