"use client";

/**
 * _article-links-bar.tsx — «الإحالات المرتبطة بهذه المادة» under an article
 * (owner TODO N02-16): the articles and laws it cites and those that cite it,
 * from the library graph's edges (read-only, GET …/citations?article=<id>).
 *
 * Folded by default and fetched on the first open only — a law has up to
 * 1,838 articles, so nothing loads on first paint or on scroll. At most eight
 * a side (the route caps it). Titles, numbers and statuses only. Four honest
 * empty states: the graph function is not there, the article is not in the
 * graph yet, it has no recorded link, the request failed.
 */

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { CaretDown, CaretUp, LinkSimple } from "@phosphor-icons/react";
import { apiSlug } from "@/utils/apiSlug";
import { pillClass, statusPill } from "./_cite-status";
import { scrollToReaderAnchor } from "./_reader-anchors";

interface Link_ {
  articleId: string | null;
  kind: "article" | "law";
  lawSlug: string;
  title: string;
  articleNumber: number | null;
  status: string | null;
  linkType: string;
  direction: "out" | "in";
}
type Answer =
  | { available: false }
  | { available: true; found: boolean; outgoing: Link_[]; incoming: Link_[] };

/** Per page view: an article opened twice is fetched once. */
const cache = new Map<string, Answer>();

/** The kind of link, beyond a plain citation (the group title says the direction). */
const LINK_LABEL: Record<string, { out: string; in: string }> = {
  EXEMPTS_FROM: { out: "استثناء منها", in: "تستثني منها" },
  SUBJECT_TO: { out: "مع مراعاتها", in: "تُراعيها" },
  PENALIZES: { out: "عقوبة مخالفتها", in: "تعاقب على مخالفتها" },
  PARENT_LAW: { out: "النظام الأصل", in: "لائحة أو نظام تابع" },
  SUPERSEDES_LAW: { out: "حلّت محله", in: "حلّ محلها" },
  REPLACED_BY: { out: "استُبدلت بها", in: "حلّت محلها" },
  IMPLEMENTED_BY: { out: "تنفّذها", in: "تنفيذ لها" },
};

export function ArticleLinksBar({ articleId, lawSlug, isDark, isRTL }: { articleId: string; lawSlug: string; isDark: boolean; isRTL: boolean }) {
  const key = `${lawSlug}|${articleId}`;
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "failed"; data?: Answer }>(() =>
    cache.has(key) ? { status: "done", data: cache.get(key) } : { status: "idle" },
  );

  const load = useCallback(() => {
    if (cache.has(key)) {
      setState({ status: "done", data: cache.get(key) });
      return;
    }
    setState({ status: "loading" });
    fetch(`/api/library/laws/${apiSlug(lawSlug)}/citations?article=${encodeURIComponent(articleId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Answer) => {
        cache.set(key, data);
        setState({ status: "done", data });
      })
      .catch(() => setState({ status: "failed" }));
  }, [key, lawSlug, articleId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && (state.status === "idle" || state.status === "failed")) load();
  };

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const data = state.data;
  let body: ReactNode = null;
  if (state.status === "loading") body = <p className={muted}>{isRTL ? "جارٍ تحميل الإحالات…" : "Loading links…"}</p>;
  else if (state.status === "failed") body = <p className={muted}>{isRTL ? "تعذّر تحميل الإحالات الآن." : "Could not load the links."}</p>;
  else if (data && !data.available) body = <p className={muted}>{isRTL ? "شبكة الإحالات غير متاحة بعد." : "The links network is not available yet."}</p>;
  else if (data && data.available && !data.found) body = <p className={muted}>{isRTL ? "هذه المادة لم تُفهرس في شبكة الإحالات بعد." : "This article is not in the links network yet."}</p>;
  else if (data && data.available && data.outgoing.length + data.incoming.length === 0) {
    body = <p className={muted}>{isRTL ? "لا توجد إحالات مسجّلة لهذه المادة." : "No links are recorded for this article."}</p>;
  } else if (data && data.available) {
    body = (
      <div className="space-y-2">
        <Group title={isRTL ? "تُحيل إليها هذه المادة" : "This article refers to"} items={data.outgoing} lawSlug={lawSlug} isDark={isDark} isRTL={isRTL} />
        <Group title={isRTL ? "تُحيل إلى هذه المادة" : "Referring to this article"} items={data.incoming} lawSlug={lawSlug} isDark={isDark} isRTL={isRTL} />
      </div>
    );
  }

  return (
    <div className={`rounded-xl border text-[11px] print:hidden ${isDark ? "border-white/[0.07] bg-white/[0.02]" : "border-slate-200 bg-slate-50/60"}`}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={`w-full flex items-center gap-1.5 px-3 py-2 font-bold ${isDark ? "text-zinc-300 hover:text-white" : "text-slate-600 hover:text-slate-900"}`}
      >
        <LinkSimple size={12} className="text-[#C8A762]" />
        <span className="flex-1 text-start">{isRTL ? "الإحالات المرتبطة بهذه المادة" : "Links of this article"}</span>
        {open ? <CaretUp size={11} /> : <CaretDown size={11} />}
      </button>
      {open && <div className="px-3 pb-3">{body}</div>}
    </div>
  );
}

function Group({ title, items, lawSlug, isDark, isRTL }: { title: string; items: Link_[]; lawSlug: string; isDark: boolean; isRTL: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={`mb-1 font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{title}</p>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((l) => {
          const pill = statusPill(l.status);
          const same = l.lawSlug === lawSlug && l.articleId;
          const href = l.articleId ? `/laws/${encodeURIComponent(l.lawSlug)}#${encodeURIComponent(l.articleId)}` : `/laws/${encodeURIComponent(l.lawSlug)}`;
          const label = LINK_LABEL[l.linkType]?.[l.direction];
          const cls = `inline-flex items-center gap-1 max-w-full px-2 py-1 rounded-lg border ${isDark ? "border-white/[0.08] bg-zinc-900 text-zinc-200 hover:border-[#C8A762]/40" : "border-slate-200 bg-white text-zinc-700 hover:border-amber-300"}`;
          const inner = (
            <>
              <span aria-hidden title={isRTL ? pill.labelAr : pill.labelEn}>{pill.emoji}</span>
              <span className="truncate">{l.title}</span>
              {label && isRTL && <span className={`flex-shrink-0 text-[9px] px-1 rounded border ${pillClass("unknown", isDark)}`}>{label}</span>}
            </>
          );
          return (
            <li key={`${l.direction}|${l.articleId ?? l.lawSlug}|${l.linkType}`} className="max-w-full">
              {same ? (
                <a
                  href={`#${encodeURIComponent(l.articleId!)}`}
                  className={cls}
                  onClick={(e) => {
                    if (scrollToReaderAnchor(l.articleId)) {
                      e.preventDefault();
                      window.history.replaceState(null, "", `#${encodeURIComponent(l.articleId!)}`);
                    }
                  }}
                >
                  {inner}
                </a>
              ) : (
                <Link href={href} className={cls}>{inner}</Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
