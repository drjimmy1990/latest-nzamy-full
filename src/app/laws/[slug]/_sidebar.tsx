"use client";

import { useState, type ReactNode } from "react";
import {
  Stack, BookOpen, Scroll, CalendarBlank, Buildings, Tag, FolderSimple, Lock, Crown, CaretDown
} from "@phosphor-icons/react";
import type { LawSystem, LawArticle } from "../data";
import { lawStatusPresentation } from "../law-status";
import { OfficialMetaLockedRow } from "../components/OfficialMetaLockedRow";
import { dbOfficialRowsUnderCard, gazetteIssueLabel, type LawOfficialMeta } from "./_official-meta";
import { buildChapterTree } from "./_chapter-tree";
import { jumpToReaderAnchor } from "./_reader-anchors";
import {
  articleTallyLabel,
  collectOfficialLinks,
  isLinkOnlyValue,
  lawCardLayout,
  officialSourceName,
  type OfficialSourceLink,
} from "@/lib/library/lawCardFields";
import type { LawCardField } from "@/lib/library/lawPreambleBlocks";

// ك-13: نفس دمج regulations[]→{ref,text} المستعمل بـpage.tsx — يحافظ على
// سلوك عرض الشارة/الاسم المدموج بلا تغيير، بمصدر بيانات جديد فقط.
function getMergedReg(a: LawArticle): { ref: string; text: string } | null {
  if (!a.regulations || a.regulations.length === 0) return null;
  const distinctRefs = Array.from(new Set(a.regulations.map((r) => r.ref || "").filter(Boolean)));
  return {
    ref: distinctRefs.join("، "),
    text: a.regulations.map((r) => r.text || "").join("\n\n"),
  };
}

interface SidebarPanelProps {
  isDark: boolean;
  isRTL: boolean;
  law: LawSystem;
  lawMeta: any;
  sectionColors: any;
  activeId: string;
  setActiveId: (id: string) => void;
  jumpQuery: string;
  setJumpQuery: (q: string) => void;
  filteredArticles: LawArticle[] | null;
  cartMap: Map<string, any>;
  isScrolling: React.MutableRefObject<boolean>;
  setShowFolderModal: (show: boolean) => void;
  setShowPaywall: (show: boolean) => void;
  userType: string | null;
  mode?: "identity" | "index" | "all";
  viewMode?: "all" | "law" | "regulation";
  /** T28-22/26: lock flag, official URL and Umm al-Qura issue from the detail API. */
  officialMeta?: LawOfficialMeta;
  /**
   * Set while the reader shows the flat «التشريعات الفرعية» view: the DOM id
   * of the regulation card a نظام article's entry jumps to (that view renders
   * no نظام article, so its id is not on the page). Entries without a card in
   * the current view are not listed. See _reader-anchors.ts.
   */
  regulationAnchorFor?: (articleId: string) => string | undefined;
}

export default function SidebarPanel({
  isDark,
  isRTL,
  law,
  lawMeta,
  sectionColors,
  activeId,
  setActiveId,
  jumpQuery,
  setJumpQuery,
  filteredArticles,
  cartMap,
  isScrolling,
  setShowFolderModal,
  setShowPaywall,
  userType,
  mode = "all",
  viewMode = "all",
  officialMeta,
  regulationAnchorFor,
}: SidebarPanelProps) {
  const muted = isDark ? "text-zinc-500" : "text-slate-400";
  // Two-level contents: level-1 groups the reader has folded (by chapter id).
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /**
   * Jump to an article (or to the element standing in for it) — the heading
   * lands just below the fixed bar (scroll-margin on the target, block:start).
   */
  const jumpTo = (articleId: string, anchorId?: string) => {
    jumpToReaderAnchor(isScrolling, anchorId ?? articleId);
    setActiveId(articleId);
  };
  const tocTitle = (title: string) => title.replace("الباب الأول: ", "").replace("الفصل الثاني: ", "");
  // T28-22: for a non-subscriber the API withholds the issuance data. The
  // hand-written law-metadata-map still carries a decree for a few dozen laws
  // (lawMeta.issuanceDecree / regulation_decree / latestAmendmentDecree), so
  // those are suppressed too — otherwise the lock would hold for most laws and
  // leak for the mapped ones.
  const metaLocked = officialMeta?.locked === true;
  // Owner ٢٩٧: the law's official page beside «الجهة المصدرة» — a
  // SUBSCRIBER's since owner ٣١٨ (the route sends it to subscribers only and
  // parseOfficialMeta drops it when locked). http(s) only.
  const officialLink = metaLocked ? null : (officialMeta?.officialLink ?? null);
  // Owner ٣١٨: the ONE public date, «آخر تحديث تشريعي» — the date alone, for
  // a guest in place of the issue date and the amendment (subscribers read
  // «آخر تعديل» / «تاريخ الإصدار» instead).
  const publicLegislativeDate = metaLocked ? (officialMeta?.latestLegislativeUpdate ?? null) : null;
  const articleCounts = officialMeta?.articleCounts ?? null;
  const issuanceDecree = metaLocked ? "" : (law.issuanceDecree || lawMeta.issuanceDecree || "");
  const border = isDark ? "border-white/[0.07]" : "border-slate-200";
  const card = `rounded-2xl border ${isDark ? "bg-zinc-900" : "bg-white shadow-sm"}`;
  const textStart = isRTL ? "text-right" : "text-left";
  // `0 && …` would print a literal 0 for a law with no articles (an unpublished-text
  // notice, 2026-10-04) — render the row only for a positive count.
  // Note ٠١ item ٦: the base law's own articles, counted live by the route
  // (articleCounts.law) when it sent them; else the old total.
  const articleCount = articleCounts?.law.total || Number(lawMeta.total_articles) || law.chapters?.flatMap(c => c.articles).length || 0;
  const articleCountText = articleCounts && articleCounts.law.total > 0 ? articleTallyLabel(articleCounts.law) : String(articleCount);
  const regulationArticleCount = articleCounts?.regulations.length
    ? articleCounts.regulations.reduce((n, r) => n + r.total, 0)
    : lawMeta.regulation_articles;

  const renderLawStatus = () => {
    const status = lawStatusPresentation(law.law_status);
    // Owner ٢٥٩: no recorded status → no row (never «ساري» by default).
    if (!status) return null;
    const dotColor = status.tone === "effective" ? "bg-emerald-500"
      : status.tone === "repealed" ? "bg-red-500"
      : status.tone === "caution" ? "bg-amber-500" : "bg-slate-400";
    const textColor = status.tone === "effective" ? (isDark ? "text-emerald-400" : "text-emerald-600")
      : status.tone === "repealed" ? "text-red-500"
      : status.tone === "caution" ? "text-amber-500" : (isDark ? "text-zinc-400" : "text-slate-500");
    return (
      <div className="flex items-start gap-1.5 pt-1" data-law-status={law.law_status}>
        <span className={`w-1.5 h-1.5 mt-1 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className={`text-[9px] font-bold ${textColor}`}>{isRTL ? status.labelAr : status.labelEn}</span>
      </div>
    );
  };

  const renderParentLaw = () => {
    const sourceName = String(law.parentLaw || "").trim();
    const resolvedName = String(law.parentLawLink?.title || "").trim();
    const displayName = sourceName || resolvedName;
    const enablingArticle = String(law.enablingArticle || "").trim();
    if (!displayName && !enablingArticle) return null;

    const nameNode = displayName && law.parentLawLink?.slug ? (
      <a
        href={`/laws/${encodeURIComponent(law.parentLawLink.slug)}`}
        className="font-bold text-[#C8A762] hover:underline"
      >
        {displayName}
      </a>
    ) : displayName ? (
      <span className={`font-semibold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{displayName}</span>
    ) : null;

    return (
      <div
        className="flex gap-1.5 items-start border-t border-dashed border-slate-100 dark:border-white/[0.05] pt-2.5 mt-2.5"
        data-parent-law-id={law.parentLawId || undefined}
      >
        <Stack size={10} className="mt-0.5 flex-shrink-0 text-[#C8A762]" />
        <div className="min-w-0">
          <p className={`text-[8px] uppercase tracking-wider ${muted}`}>
            {isRTL ? "ينفّذ النظام / الأداة الأصلية" : "Implements parent instrument"}
          </p>
          {nameNode && <p className="text-[10px] leading-tight break-words">{nameNode}</p>}
          {enablingArticle && (
            <p className={`text-[9px] leading-tight mt-1 ${muted}`}>
              {isRTL ? `استناداً إلى ${enablingArticle}` : `Enabled by ${enablingArticle}`}
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderValue = (val: string) => {
    // A markdown link, or a bare http(s) URL (note ١٢ item ٧: «laws.moj.gov.sa
    // ظهر خاماً») — both read as the source's name, never a raw host.
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s)\]»"'<>]+)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(val)) !== null) {
      if (match.index > lastIndex) {
        parts.push(val.substring(lastIndex, match.index));
      }
      const url = (match[2] ?? match[3]).trim().replace(/[.,،;؛]+$/, "");
      const text = match[1] ?? officialSourceName(url);
      // Card values come from the library files: only an http(s) link is a
      // link; anything else (a relative file path, a script URL) is its text.
      if (!/^https?:\/\/\S+$/i.test(url)) {
        parts.push(text);
        lastIndex = linkRegex.lastIndex;
        continue;
      }
      // Link text that is itself a host or a URL reads as the source's name.
      const shown = /https?:|www\.|^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?$/i.test(text.trim()) ? officialSourceName(url) : text;
      parts.push(
        <a
          key={match.index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#C8A762] hover:underline font-bold"
        >
          {shown}
        </a>
      );
      lastIndex = linkRegex.lastIndex;
    }

    if (lastIndex < val.length) {
      parts.push(val.substring(lastIndex));
    }

    return parts.length > 0 ? parts : val;
  };

  // Owner note ٠١ item ٣ / note ١٢ item ٧: an official link reads as the
  // source's Arabic name («هيئة الخبراء»), never a raw host.
  const renderOfficialLink = (url: string) => (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      data-card-field="official-link"
      className={`inline-block mt-0.5 text-[10px] leading-tight break-words underline decoration-dotted ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}
    >
      {isRTL ? `الرابط الرسمي ↗ ${officialSourceName(url)}` : `Official page ↗ ${officialSourceName(url)}`}
    </a>
  );

  /** Note ٠١ item ٣: every official source at the top of the card, by name, each a new-tab link. */
  const renderOfficialLinks = (links: OfficialSourceLink[]) =>
    links.length === 0 ? null : (
      <div className="flex gap-1.5 items-start" data-card-field="official-links">
        <BookOpen size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "المصادر الرسمية" : "Official sources"}</p>
          <p className="text-[10px] font-semibold leading-tight break-words">
            {links.map((l, i) => (
              <span key={l.url}>
                {i > 0 && <span className={muted}> · </span>}
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline decoration-dotted ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}
                >
                  {l.label}
                </a>
              </span>
            ))}
          </p>
        </div>
      </div>
    );

  /** Owner ٣١٨: a guest's one date row — «آخر تحديث تشريعي», the date alone. */
  const renderPublicLegislativeDate = () =>
    publicLegislativeDate ? (
      <div className="flex gap-1.5 items-start" data-card-field="latest-legislative-update">
        <CalendarBlank size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "آخر تحديث تشريعي" : "Latest legislative update"}</p>
          <p className={`text-[10px] font-semibold leading-tight ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{publicLegislativeDate}</p>
        </div>
      </div>
    ) : null;

  const getFieldIcon = (key: string) => {
    if (key.includes("نوع") || key.includes("تصنيف") || key.includes("التصنيف")) return <Tag size={10} className={muted} />;
    if (key.includes("حالة") || key.includes("سريان") || key.includes("نفاذ")) return <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1 flex-shrink-0" />;
    if (key.includes("أداة") || key.includes("مرسوم") || key.includes("قرار") || key.includes("أمر")) return <Scroll size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />;
    if (key.includes("تاريخ") || key.includes("نشر") || key.includes("إصدار")) return <CalendarBlank size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />;
    if (key.includes("مصدر") || key.includes("بوابة") || key.includes("رابط")) return <BookOpen size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />;
    if (key.includes("جهة") || key.includes("وزارة") || key.includes("مجلس")) return <Buildings size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />;
    if (key.includes("لائحة") || key.includes("لوائح")) return <Stack size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />;
    return <Scroll size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />;
  };

  /**
   * N2.1: the official link and the gazette issue from the database
   * (subscribers, T28-26) — under the file's card only when the card has no
   * row of its own for them, so a subscriber loses nothing the fallback card
   * showed and nothing is said twice.
   */
  const renderDbOfficialRows = (rows: { key: string; value: string }[], shownLinks: OfficialSourceLink[] = []) => {
    if (metaLocked || !officialMeta) return null;
    const found = dbOfficialRowsUnderCard(rows, officialMeta, officialLink);
    const gazette = found.gazette;
    // Note ٠١ item ٣: a link already in «المصادر الرسمية» at the top is not said again here.
    const sourceUrl = shownLinks.some((l) => l.url === found.sourceUrl) ? "" : found.sourceUrl;
    if (!sourceUrl && !gazette) return null;
    return (
      <>
        {sourceUrl && (
          <div className="flex gap-1.5 items-start">
            <BookOpen size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
            <div className="min-w-0">
              <p className={`text-[8px] uppercase tracking-wider ${muted}`}>المصدر الرسمي</p>
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`block text-[10px] leading-tight break-words underline decoration-dotted ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}
              >
                {officialSourceName(sourceUrl)}
              </a>
            </div>
          </div>
        )}
        {gazette && (
          <div className="flex gap-1.5 items-start">
            <CalendarBlank size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
            <div className="min-w-0">
              <p className={`text-[8px] uppercase tracking-wider ${muted}`}>النشر في الجريدة الرسمية</p>
              <p className={`text-[10px] font-semibold leading-tight break-words ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                {gazette.url ? (
                  <a
                    href={gazette.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`underline decoration-dotted ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}
                  >
                    {gazetteIssueLabel(gazette)}
                  </a>
                ) : (
                  gazetteIssueLabel(gazette)
                )}
                {gazette.publicationDate && <span className={`font-normal ${muted}`}>{` · ${gazette.publicationDate}`}</span>}
              </p>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderIdentity = () => {
    if (law.metadata_card) {
      // Owner ٢٦١: five fields always shown (LAW_CARD_PRIMARY_FIELDS — the
      // one list), every other row behind one «المزيد». The type is the
      // badge: the card's own type row, else library.laws.type — never an
      // invented «نظام». The status is the recorded one (owner ٢٥٩: none
      // recorded → none shown).
      // C04 (note ٠١ item ٤): the category badge; an «التصنيف» row saying the same is not repeated.
      const categoryBadge = (lawMeta.section_name || law.metadata_card.more.find(f => f.key === "التصنيف")?.value || "").trim();
      const layout = lawCardLayout(law.metadata_card, {
        status: lawStatusPresentation(law.law_status),
        issueDate: metaLocked ? "" : law.issuanceDate,
        // Note ٠١ item ٢: the merged file's latest event fills «آخر تعديل» (subscribers).
        latestUpdate: metaLocked ? "" : officialMeta?.latestUpdate,
        category: categoryBadge,
      });
      const typeField = layout.primary.find(f => f.id === "type");
      const typeBadge = (typeField?.value || law.documentType || "").trim();
      const cardRows = [...law.metadata_card.main, ...law.metadata_card.more];
      // Note ٠١ item ٣: every official source at the top, by name (subscribers;
      // ٣١٨ — the server sends a guest none and the guest card has no links).
      const topLinks = metaLocked ? [] : collectOfficialLinks(officialMeta?.officialLinks ?? [], cardRows);
      // A «المزيد» row that was only a link now shown at the top is not repeated.
      const notShownAbove = (f: LawCardField) => !(topLinks.length && isLinkOnlyValue(f.value));
      const dbOfficialRows = renderDbOfficialRows(cardRows, topLinks);
      const parentLaw = renderParentLaw();
      // Owner ٣٢٠ (أ): «ملغى» alone in the status; the law that replaced it on its own row here.
      const replacedBy = officialMeta?.replacedBy ?? null;
      const replacedRow = replacedBy ? (
        <div className="flex gap-1.5 items-start" data-card-field="replaced-by">
          {getFieldIcon("تشريع")}
          <div className="flex-1 min-w-0">
            <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "النظام البديل" : "Replaced by"}</p>
            <a href={`/laws/${encodeURIComponent(replacedBy.slug)}`} className="text-[10px] font-bold leading-tight break-words text-[#C8A762] hover:underline">
              {replacedBy.title || replacedBy.slug}
            </a>
          </div>
        </div>
      ) : null;
      // Note ٠١ items ٥–٦ / note ١٢ item ٧: two layers — the base law, then
      // the merged regulation(s). The regulation layer exists only when the
      // file has one (a regulation row, the regulation's own card, or
      // regulation articles); else it is not drawn at all.
      const regulationCard = officialMeta?.regulationCard ?? null;
      const regCounts = articleCounts?.regulations ?? [];
      const annexes = articleCounts?.annexes ?? 0;
      const lawTally = articleCounts && articleCounts.law.total > 0 ? articleCounts.law : null;
      // The file's own count rows give way to the live counts (note ٠١ item ٦).
      const lawRows = layout.moreLaw
        .filter(notShownAbove)
        .filter((f) => !(lawTally && /^عدد\s+(?:ال)?مواد(?:\s+(?:ال)?نظام)?$/u.test(f.key.trim())));
      const regulationRows = [
        ...layout.moreRegulation,
        ...(regulationCard ? [...regulationCard.main, ...regulationCard.more] : []),
      ]
        .filter(notShownAbove)
        .filter((f) => !(regCounts.length && /^عدد\s+مواد\s+(?:ال)?لائح/u.test(f.key.trim())))
        .filter((f, i, all) => all.findIndex((g) => g.key === f.key && g.value === f.value) === i);
      const hasRegulationLayer = regulationRows.length > 0 || regCounts.length > 0 || annexes > 0;
      const hasMore = lawRows.length > 0 || hasRegulationLayer || !!dbOfficialRows || !!parentLaw || !!replacedRow || !!lawTally;
      const renderRow = (key: string, value: string, idx: number | string, extra?: ReactNode) => (
        <div key={idx} className="flex gap-1.5 items-start">
          {getFieldIcon(key)}
          <div className="flex-1 min-w-0">
            <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{key}</p>
            <p className={`text-[10px] font-semibold leading-tight break-words whitespace-pre-line ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
              {renderValue(value)}
            </p>
            {extra}
          </div>
        </div>
      );
      return (
        <div className={`${card} ${border} p-3`}>
          {/* نوع الوثيقة + القسم */}
          <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
            {typeBadge && (
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full border border-[#C8A762]/20 text-[#C8A762] bg-[#C8A762]/5">
              {typeBadge}
            </span>
            )}
            {categoryBadge && (
              <span className={`text-[9px] px-2 py-0.5 rounded-full border ${isDark ? "border-white/10 text-zinc-500" : "border-slate-200 text-slate-500"}`}>
                {categoryBadge}
              </span>
            )}
          </div>

          {/* الحقول الظاهرة دائماً */}
          <div className="space-y-2">
            {/* ٣١٨: a guest's one date, first (where «آخر تعديل» sits for a subscriber). */}
            {renderPublicLegislativeDate()}
            {layout.primary.map((f) => {
              if (f.id === "type") return null;
              if (f.id === "status" && f.source === "db") {
                return (
                  <div key="status" className="flex gap-1.5 items-start" data-card-field="status">
                    {getFieldIcon("حالة")}
                    <div className="flex-1 min-w-0">
                      <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "الحالة" : "Status"}</p>
                      {renderLawStatus()}
                    </div>
                  </div>
                );
              }
              return renderRow(f.key, f.value, f.id, f.id === "issuer" && officialLink && !topLinks.length ? renderOfficialLink(officialLink) : undefined);
            })}
            {officialLink && !topLinks.length && !layout.primary.some((f) => f.id === "issuer") && (
              <div className="flex gap-1.5 items-start" data-card-field="issuer-link">
                {getFieldIcon("رابط")}
                <div className="flex-1 min-w-0">{renderOfficialLink(officialLink)}</div>
              </div>
            )}
            {/* Note ٠١ item ٣: all official sources at the top, clickable, by name (subscribers). */}
            {renderOfficialLinks(topLinks)}

            {/* Owner ٢٦٠: the card reaches every viewer; for a non-subscriber the
                API removed its T28-22 rows (decree, dates, official links), so
                one row says they are for subscribers — no silent gap. */}
            {metaLocked && (
              <OfficialMetaLockedRow isDark={isDark} onUnlock={() => setShowPaywall(true)} className="w-full" />
            )}

            {/* المزيد: every other row of the card */}
            {hasMore && (
              <div className="border-t border-dashed border-slate-100 dark:border-white/[0.05] pt-2.5 mt-2.5">
                <details className="group">
                  <summary className="list-none flex items-center justify-between text-[10px] font-black text-[#C8A762] cursor-pointer hover:underline focus:outline-none">
                    <span>{isRTL ? "➕ المزيد من بيانات التشريع" : "➕ More Details"}</span>
                    <span className="transition-transform duration-200 group-open:rotate-180 text-[8px]">▼</span>
                  </summary>
                  <div className="mt-2.5 space-y-2 pl-0.5">
                    {/* أولاً: بيانات النظام / التشريع الأساسي */}
                    {hasRegulationLayer && (
                      <p className="text-[9px] font-black text-[#C8A762]" data-card-group="law">{isRTL ? "بيانات النظام" : "Law details"}</p>
                    )}
                    {lawTally && renderRow("عدد المواد الكلي", articleTallyLabel(lawTally), "law-count")}
                    {lawRows.map((item, idx) => renderRow(item.key, item.value, `law-${idx}`))}
                    {dbOfficialRows}
                    {replacedRow}
                    {parentLaw}
                    {/* ثانياً: بيانات اللائحة التنفيذية / التشريعات الفرعية المدمجة —
                        not drawn at all for a law with none (note ٠١ item ٥). */}
                    {hasRegulationLayer && (
                      <div className="border-t border-dashed border-slate-100 dark:border-white/[0.05] pt-2.5 space-y-2" data-card-group="regulation">
                        <p className="text-[9px] font-black text-[#C8A762]">
                          {isRTL ? "بيانات اللائحة التنفيذية / التشريعات الفرعية المدمجة" : "Merged regulations"}
                        </p>
                        {regCounts.map((r, idx) => renderRow(regCounts.length > 1 || r.name !== "اللائحة التنفيذية" ? `عدد مواد ${r.name}` : "عدد مواد اللائحة", articleTallyLabel(r), `reg-count-${idx}`))}
                        {annexes > 0 && renderRow("الملاحق", String(annexes), "annexes")}
                        {regulationRows.map((item, idx) => renderRow(item.key, item.value, `reg-${idx}`))}
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}

            {/* زر حفظ في مجلداتي */}
            <div className="border-t border-dashed border-slate-100 dark:border-white/[0.05] pt-2.5 mt-2.5">
              <button
                onClick={() => setShowFolderModal(true)}
                className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border transition ${
                  isDark
                    ? "border-[#C8A762]/30 text-[#C8A762] bg-[#C8A762]/5 hover:bg-[#C8A762]/10"
                    : "border-[#0B3D2E]/20 text-[#0B3D2E] bg-[#0B3D2E]/5 hover:bg-[#0B3D2E]/10"
                }`}
              >
                <FolderSimple size={14} weight="bold" />
                <span>{isRTL ? "حفظ في مجلداتي" : "Save to Folders"}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={`${card} ${border} p-3`}>
        {/* نوع الوثيقة + القسم */}
        <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
          {lawMeta.document_type && (
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
              sectionColors?.bg ?? "bg-slate-500/10"
            } ${sectionColors?.text ?? "text-slate-500"} ${sectionColors?.border ?? "border-slate-500/20"}`}>
              {lawMeta.document_type === "نظام_ولائحة" ? "نظام + لائحة" : lawMeta.document_type}
            </span>
          )}
          {lawMeta.section_name && (
            <span className={`text-[9px] px-2 py-0.5 rounded-full border ${
              isDark ? "border-white/10 text-zinc-500" : "border-slate-200 text-slate-500"
            }`}>
              {lawMeta.section_name}
            </span>
          )}
        </div>

        {/* حقول البطاقة */}
        <div className="space-y-2">
          {lawMeta.document_type === "نظام_ولائحة" ? (
            <>
              {/* قسم النظام */}
              <div className="space-y-1.5 pb-2 border-b border-dashed border-slate-100 dark:border-white/[0.05]">
                <div className="flex items-center gap-1 mb-1">
                  <Stack size={11} className="text-[#C8A762]" weight="fill" />
                  <span className="text-[9px] font-black text-[#C8A762]">{isRTL ? "تفاصيل النظام" : "Law Details"}</span>
                </div>
                
                {issuanceDecree && (
                  <div className="flex gap-1.5 items-start">
                    <Scroll size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
                    <div>
                      <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "أداة الإصدار" : "Issuance"}</p>
                      <p className={`text-[10px] font-semibold leading-tight ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{issuanceDecree}</p>
                    </div>
                  </div>
                )}

                {articleCount > 0 && (
                  <div className="flex items-center justify-between text-[9px] mt-1">
                    <span className={muted}>{isRTL ? "عدد مواد النظام" : "Law Articles"}</span>
                    <span className={`text-[10px] font-black ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{articleCountText}</span>
                  </div>
                )}
              </div>

              {/* قسم اللائحة التنفيذية */}
              <div className="space-y-1.5 pb-2 border-b border-dashed border-slate-100 dark:border-white/[0.05]">
                <div className="flex items-center gap-1 mb-1">
                  <BookOpen size={11} className="text-[#C8A762]" weight="fill" />
                  <span className="text-[9px] font-black text-[#C8A762]">{isRTL ? "تفاصيل اللائحة التنفيذية" : "Regulation Details"}</span>
                </div>
                
                {!metaLocked && lawMeta.regulation_decree && (
                  <div className="flex gap-1.5 items-start">
                    <Scroll size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
                    <div>
                      <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "أداة إصدار اللائحة" : "Regulation Instrument"}</p>
                      <p className={`text-[10px] font-semibold leading-tight ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{lawMeta.regulation_decree}</p>
                    </div>
                  </div>
                )}
                
                {!!regulationArticleCount && (
                  <div className="flex items-center justify-between text-[9px] mt-1">
                    <span className={muted}>{isRTL ? "عدد مواد اللائحة" : "Reg Articles"}</span>
                    <span className={`text-[10px] font-black ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{regulationArticleCount}</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {issuanceDecree && (
                <div className="flex gap-1.5 items-start">
                  <Scroll size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
                  <div>
                    <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "أداة الإصدار" : "Issuance"}</p>
                    <p className={`text-[10px] font-semibold leading-tight ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{issuanceDecree}</p>
                  </div>
                </div>
              )}
              {articleCount > 0 && (
                <div className="flex items-center justify-between text-[9px]">
                  <span className={muted}>{isRTL ? "عدد المواد" : "Articles"}</span>
                  <span className={`text-[10px] font-black ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{articleCountText}</span>
                </div>
              )}
            </>
          )}

          {/* الحقول العامة المشتركة */}
          {/* ٣١٨: a guest's one public date. */}
          {renderPublicLegislativeDate()}
          {/* T28-22: one row stands in for every withheld issuance field
              (أداة الإصدار، آخر تعديل، المصدر) — no blank labels. */}
          {metaLocked && (
            <OfficialMetaLockedRow isDark={isDark} onUnlock={() => setShowPaywall(true)} className="w-full" />
          )}
          {!metaLocked && lawMeta.latestAmendmentDecree && (
            <div className="flex gap-1.5 items-start">
              <CalendarBlank size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
              <div>
                <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "آخر تعديل" : "Last Amendment"}</p>
                <p className={`text-[10px] font-semibold leading-tight ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{lawMeta.latestAmendmentDecree}</p>
              </div>
            </div>
          )}
          {lawMeta.issuing_authority && (
            <div className="flex gap-1.5 items-start">
              <Buildings size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
              <div>
                <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "الجهة المصدرة" : "Authority"}</p>
                <p className={`text-[10px] font-semibold leading-tight ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{lawMeta.issuing_authority}</p>
                {officialLink && renderOfficialLink(officialLink)}
              </div>
            </div>
          )}
          {officialLink && !lawMeta.issuing_authority && (
            <div className="flex gap-1.5 items-start" data-card-field="issuer-link">
              <BookOpen size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
              <div className="min-w-0">{renderOfficialLink(officialLink)}</div>
            </div>
          )}
          {!metaLocked && law.source && (
            <div className="flex gap-1.5 items-start">
              <Tag size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
              <div className="min-w-0">
                <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "المصدر" : "Source"}</p>
                {/* A real link that wraps inside the card: the raw URL used to
                    run past the card edge as plain text (owner test 2026-09-28, T28-07). */}
                {/^https?:\/\//i.test(law.source) ? (
                  <a
                    href={law.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block text-[10px] leading-tight break-words underline decoration-dotted ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}
                  >
                    {/* Note ٠١ item ٣: the source's Arabic name, never a raw host. */}
                    {officialSourceName(law.source)}
                  </a>
                ) : (
                  <p className={`text-[10px] leading-tight break-words ${muted}`}>{law.source}</p>
                )}
              </div>
            </div>
          )}

          {/* T28-26: the official page, only as the server sent it (http/https),
              and not repeated when it is the same link as «المصدر» above. */}
          {!metaLocked && officialMeta?.officialSourceUrl && officialMeta.officialSourceUrl !== law.source && officialMeta.officialSourceUrl !== officialLink && (
            <div className="flex gap-1.5 items-start">
              <BookOpen size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
              <div className="min-w-0">
                <p className={`text-[8px] uppercase tracking-wider ${muted}`}>المصدر الرسمي</p>
                <a
                  href={officialMeta.officialSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block text-[10px] leading-tight break-words underline decoration-dotted ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}
                >
                  {officialSourceName(officialMeta.officialSourceUrl)}
                </a>
              </div>
            </div>
          )}

          {/* T28-26: the Umm al-Qura issue — rendered only when the API names
              one, linked only when it sent the issue's own URL. */}
          {!metaLocked && officialMeta?.gazette && (
            <div className="flex gap-1.5 items-start">
              <CalendarBlank size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
              <div className="min-w-0">
                <p className={`text-[8px] uppercase tracking-wider ${muted}`}>النشر في الجريدة الرسمية</p>
                <p className={`text-[10px] font-semibold leading-tight break-words ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                  {officialMeta.gazette.url ? (
                    <a
                      href={officialMeta.gazette.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`underline decoration-dotted ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}
                    >
                      {gazetteIssueLabel(officialMeta.gazette)}
                    </a>
                  ) : (
                    gazetteIssueLabel(officialMeta.gazette)
                  )}
                  {officialMeta.gazette.publicationDate && (
                    <span className={`font-normal ${muted}`}>{` · ${officialMeta.gazette.publicationDate}`}</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* حالة الأداة من البيانات الحية، لا خريطة lawMeta اليدوية. */}
          {renderParentLaw()}
          {renderLawStatus()}

          <div className="border-t border-dashed border-slate-100 dark:border-white/[0.05] pt-2.5 mt-2.5">
            <button
              onClick={() => setShowFolderModal(true)}
              className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border transition ${
                isDark
                  ? "border-[#C8A762]/30 text-[#C8A762] bg-[#C8A762]/5 hover:bg-[#C8A762]/10"
                  : "border-[#0B3D2E]/20 text-[#0B3D2E] bg-[#0B3D2E]/5 hover:bg-[#0B3D2E]/10"
              }`}
            >
              <FolderSimple size={14} weight="bold" />
              <span>{isRTL ? "حفظ في مجلداتي" : "Save to Folders"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderIndex = () => (
    <div className="space-y-3">
      {/* ── فهرس المواد + Quick Jump ── */}
      <div className={`${card} ${border} p-3`}>
        {/* خانة البحث السريع */}
        <div className={`flex items-center gap-1.5 mb-2.5 px-2 py-1.5 rounded-xl border transition ${isDark ? "bg-zinc-800/60 border-white/[0.06] focus-within:border-[#C8A762]/30" : "bg-slate-50 border-slate-200 focus-within:border-[#0B3D2E]/30"}`}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={muted}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            value={jumpQuery}
            onChange={e => setJumpQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && filteredArticles?.length) {
                const a = filteredArticles[0];
                jumpTo(a.id, regulationAnchorFor?.(a.id));
                setJumpQuery("");
              }
            }}
            placeholder={isRTL ? "انتقل لمادة... (١، ثامنة، ...)" : "Jump to article..."}
            dir={isRTL ? "rtl" : "ltr"}
            className={`flex-1 bg-transparent text-[11px] outline-none placeholder:text-[10px] ${isDark ? "text-zinc-300 placeholder:text-zinc-600" : "text-zinc-700 placeholder:text-slate-400"}`}
          />
          {jumpQuery && (
            <button onClick={() => setJumpQuery("")} className={`flex-shrink-0 ${muted} hover:text-zinc-400`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        {/* النتائج */}
        <div className="space-y-0.5">
          {viewMode === "regulation" ? (
            /* وضع اللائحة فقط — قائمة مسطحة من مواد اللائحة */
            (() => {
              const regArticles = law.chapters
                .flatMap(ch => ch.articles)
                .filter(a => a.regulations && a.regulations.length > 0)
                // Flat view: only entries that have a card on the page (the
                // instrument filter can hide the rest), so every click lands.
                .filter(a => !regulationAnchorFor || !!regulationAnchorFor(a.id));
              const visibleRegArts = filteredArticles
                ? regArticles.filter(a => filteredArticles.some(f => f.id === a.id))
                : regArticles;

              if (visibleRegArts.length === 0) {
                return <p className={`text-[10px] text-center py-3 ${muted}`}>{isRTL ? "لا توجد نتائج" : "No results"}</p>;
              }

              return visibleRegArts.map(a => {
                const hasRegInCart = cartMap.has(a.id) && cartMap.get(a.id)?.isExecRegAdded;
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      // The flat view renders regulation cards, not this نظام
                      // article: jump to its first card (_reader-anchors.ts).
                      jumpTo(a.id, regulationAnchorFor?.(a.id));
                      setJumpQuery("");
                    }}
                    className={`w-full ${textStart} flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] transition ${
                      activeId === a.id
                        ? isDark ? "bg-[#C8A762]/20 text-[#C8A762] font-bold" : "bg-amber-100 text-amber-800 font-bold"
                        : a.status === "repealed" ? (isDark ? "text-red-400 hover:text-red-300 font-medium" : "text-red-600 hover:text-red-700 font-medium") : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {!a.free && <Lock size={9} className="flex-shrink-0" />}
                    {/* The article the regulation hangs off, not the regulation's
                        name: that name is the same on every row, so the list read
                        «اللائحة التنفيذية لنظام العمل» thirty times (owner test
                        2026-09-28, T28-06). The name stays in the tooltip. */}
                    <span className="truncate flex-1 font-medium" title={getMergedReg(a)?.ref}>{a.num}</span>
                    {a.status === "repealed" && <span className="text-[8px] flex-shrink-0 px-1 py-0.5 rounded font-black text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20">{isRTL ? "ملغى" : "Repealed"}</span>}
                    {hasRegInCart && <span className="w-1.5 h-1.5 rounded-full bg-[#C8A762] flex-shrink-0" />}
                  </button>
                );
              });
            })()
          ) : filteredArticles ? (
            /* وضع البحث — قائمة مسطحة */
            filteredArticles.length === 0 ? (
              <p className={`text-[10px] text-center py-3 ${muted}`}>{isRTL ? "لا توجد نتائج" : "No results"}</p>
            ) : filteredArticles.map(a => (
              <button
                key={a.id}
                onClick={() => {
                  jumpTo(a.id, regulationAnchorFor?.(a.id));
                  setJumpQuery("");
                }}
                className={`w-full ${textStart} flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] transition ${
                  activeId === a.id
                    ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
                    : a.status === "repealed" ? (isDark ? "text-red-400 hover:text-red-300 font-medium" : "text-red-600 hover:text-red-700 font-medium") : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {!a.free && <Lock size={9} className="flex-shrink-0" />}
                <span className="truncate flex-1">{a.num}</span>
                {a.status === "repealed" && <span className="text-[8px] flex-shrink-0 px-1 py-0.5 rounded font-black text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20">{isRTL ? "ملغى" : "Repealed"}</span>}
                {!!(a.regulations && a.regulations.length > 0) && <span className={`text-[8px] flex-shrink-0 px-1 rounded font-black ${activeId === a.id ? "text-[#C8A762]/70" : isDark ? "text-zinc-500" : "text-slate-400"}`}>ل</span>}
                {cartMap.has(a.id) && <span className="w-1.5 h-1.5 rounded-full bg-[#C8A762] flex-shrink-0" />}
              </button>
            ))
          ) : (
            /* وضع عادي — شجرة الأبواب. Two-level chapters (2026-10-04): a
               level-1 heading groups the level-2 chapters under it; with no
               level data every node is a plain chapter, rendered exactly as
               before (_chapter-tree.ts). */
            buildChapterTree(law.chapters).map((node) => {
              const renderArticleEntry = (a: LawArticle) => (
                <button
                  key={a.id}
                  onClick={() => jumpTo(a.id)}
                  className={`w-full ${textStart} flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] transition ${
                    activeId === a.id
                      ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
                      : a.status === "repealed" ? (isDark ? "text-red-400 hover:text-red-300 font-medium" : "text-red-600 hover:text-red-700 font-medium") : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {!a.free && <Lock size={9} className="flex-shrink-0" />}
                  <span className="truncate flex-1">{a.num}</span>
                  {a.status === "repealed" && <span className="text-[8px] flex-shrink-0 px-1 py-0.5 rounded font-black text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20">{isRTL ? "ملغى" : "Repealed"}</span>}
                  {!!(a.regulations && a.regulations.length > 0) && (
                    <span title={isRTL ? "يحتوي لائحة تنفيذية" : "Has executive regulation"}
                      className={`text-[8px] flex-shrink-0 px-1 rounded font-black ${
                        activeId === a.id ? "text-[#C8A762]/70" : isDark ? "text-zinc-500" : "text-slate-400"
                      }`}>ل</span>
                  )}
                  {cartMap.has(a.id) && <span className="w-1.5 h-1.5 rounded-full bg-[#C8A762] flex-shrink-0" />}
                </button>
              );

              if (node.children.length === 0) {
                const ch = node.chapter;
                return (
                  <div key={node.index}>
                    <p className={`text-[9px] font-bold px-2 py-1 ${muted}`}>{tocTitle(ch.title)}</p>
                    {ch.articles.map(renderArticleEntry)}
                  </div>
                );
              }

              const groupKey = node.chapter.id || `#${node.index}`;
              const collapsed = collapsedGroups.has(groupKey);
              return (
                <div key={node.index}>
                  <button
                    type="button"
                    aria-expanded={!collapsed}
                    onClick={(e) => {
                      // Folding is not navigation: keep the phone index sheet open.
                      e.stopPropagation();
                      toggleGroup(groupKey);
                    }}
                    className={`w-full ${textStart} flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition ${
                      isDark ? "text-zinc-300 hover:bg-white/[0.04]" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <CaretDown
                      size={9}
                      weight="bold"
                      className={`flex-shrink-0 transition-transform ${collapsed ? (isRTL ? "rotate-90" : "-rotate-90") : ""}`}
                    />
                    <span className="truncate flex-1">{tocTitle(node.chapter.title)}</span>
                  </button>
                  {!collapsed && (
                    <>
                      {node.chapter.articles.map(renderArticleEntry)}
                      <div className={`ms-2 ps-1.5 border-s ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
                        {node.children.map((child) => (
                          <div key={child.index}>
                            <p className={`text-[9px] font-bold px-2 py-1 ${muted}`}>{tocTitle(child.chapter.title)}</p>
                            {child.chapter.articles.map(renderArticleEntry)}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* CTA */}
      {userType !== "lawyer" && userType !== "firm" && (
        <div className={`${card} ${border} p-3 text-center`}>
          <Crown size={20} color="#C8A762" weight="fill" className="mx-auto mb-1.5" />
          <p className={`text-[11px] font-bold mb-2 ${isDark ? "text-[#C8A762]" : "text-amber-800"}`}>{isRTL ? "وصول كامل للمكتبة" : "Full library access"}</p>
          <button onClick={() => setShowPaywall(true)} className="w-full py-1.5 bg-[#0B3D2E] text-white text-[11px] font-bold rounded-xl hover:opacity-90 transition">
            {isRTL ? "اشترك الآن" : "Subscribe"}
          </button>
        </div>
      )}
    </div>
  );

  if (mode === "identity") {
    return renderIdentity();
  }

  if (mode === "index") {
    return renderIndex();
  }

  return (
    <aside className="hidden lg:block w-56 shrink-0 sticky top-6 z-50 space-y-3">
      {renderIdentity()}
      {renderIndex()}
    </aside>
  );
}
