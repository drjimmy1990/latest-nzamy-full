"use client";

import { useState } from "react";
import {
  Stack, BookOpen, Scroll, CalendarBlank, Buildings, Tag, FolderSimple, Lock, Crown, CaretDown
} from "@phosphor-icons/react";
import type { LawSystem, LawArticle } from "../data";
import { lawStatusPresentation } from "../law-status";
import { OfficialMetaLockedRow } from "../components/OfficialMetaLockedRow";
import { gazetteIssueLabel, urlHostname, type LawOfficialMeta } from "./_official-meta";
import { buildChapterTree } from "./_chapter-tree";
import { jumpToReaderAnchor } from "./_reader-anchors";

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
  const issuanceDecree = metaLocked ? "" : (law.issuanceDecree || lawMeta.issuanceDecree || "");
  const border = isDark ? "border-white/[0.07]" : "border-slate-200";
  const card = `rounded-2xl border ${isDark ? "bg-zinc-900" : "bg-white shadow-sm"}`;
  const textStart = isRTL ? "text-right" : "text-left";
  // `0 && …` would print a literal 0 for a law with no articles (an unpublished-text
  // notice, 2026-10-04) — render the row only for a positive count.
  const articleCount = Number(lawMeta.total_articles) || law.chapters?.flatMap(c => c.articles).length || 0;

  const renderLawStatus = () => {
    const status = lawStatusPresentation(law.law_status);
    const dotColor = status.tone === "effective" ? "bg-emerald-500"
      : status.tone === "repealed" ? "bg-red-500"
      : status.tone === "caution" ? "bg-amber-500" : "bg-slate-400";
    const textColor = status.tone === "effective" ? (isDark ? "text-emerald-400" : "text-emerald-600")
      : status.tone === "repealed" ? "text-red-500"
      : status.tone === "caution" ? "text-amber-500" : (isDark ? "text-zinc-400" : "text-slate-500");
    return (
      <div className="flex items-start gap-1.5 pt-1" data-law-status={law.law_status ?? "status_undeclared"}>
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
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    
    while ((match = linkRegex.exec(val)) !== null) {
      if (match.index > lastIndex) {
        parts.push(val.substring(lastIndex, match.index));
      }
      const text = match[1];
      const url = match[2];
      parts.push(
        <a
          key={match.index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#C8A762] hover:underline font-bold"
        >
          {text}
        </a>
      );
      lastIndex = linkRegex.lastIndex;
    }
    
    if (lastIndex < val.length) {
      parts.push(val.substring(lastIndex));
    }
    
    return parts.length > 0 ? parts : val;
  };

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

  const renderIdentity = () => {
    if (law.metadata_card) {
      return (
        <div className={`${card} ${border} p-3`}>
          {/* نوع الوثيقة + القسم */}
          <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full border border-[#C8A762]/20 text-[#C8A762] bg-[#C8A762]/5">
              {law.metadata_card.main.find(f => f.key === "نوع التشريع")?.value || (isRTL ? "نظام" : "Law")}
            </span>
            {(lawMeta.section_name || law.metadata_card.more.find(f => f.key === "التصنيف")?.value) && (
              <span className={`text-[9px] px-2 py-0.5 rounded-full border ${isDark ? "border-white/10 text-zinc-500" : "border-slate-200 text-slate-500"}`}>
                {lawMeta.section_name || law.metadata_card.more.find(f => f.key === "التصنيف")?.value}
              </span>
            )}
          </div>

          {/* حقول البطاقة */}
          <div className="space-y-2">
            {law.metadata_card.main.map((item, idx) => {
              const val = (item.value || "").trim();
              if (!val || val === "لا يوجد" || val === "غير متوفر" || val === "غير محدد" || val === "لا يتوفر" || val === "غير متوفرة" || val === "غير مبينة") {
                return null;
              }
              return (
                <div key={idx} className="flex gap-1.5 items-start">
                  {getFieldIcon(item.key)}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{item.key}</p>
                    <p className={`text-[10px] font-semibold leading-tight break-words ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                      {renderValue(item.value)}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* المزيد من بيانات التشريع */}
            {law.metadata_card.more && law.metadata_card.more.length > 0 && (() => {
              const visibleMore = law.metadata_card.more.filter(item => {
                const val = (item.value || "").trim();
                return val && val !== "لا يوجد" && val !== "غير متوفر" && val !== "غير محدد" && val !== "لا يتوفر" && val !== "غير متوفرة" && val !== "غير مبينة";
              });
              if (visibleMore.length === 0) return null;
              return (
                <div className="border-t border-dashed border-slate-100 dark:border-white/[0.05] pt-2.5 mt-2.5">
                  <details className="group">
                    <summary className="list-none flex items-center justify-between text-[10px] font-black text-[#C8A762] cursor-pointer hover:underline focus:outline-none">
                      <span>{isRTL ? "➕ المزيد من بيانات التشريع" : "➕ More Details"}</span>
                      <span className="transition-transform duration-200 group-open:rotate-180 text-[8px]">▼</span>
                    </summary>
                    <div className="mt-2.5 space-y-2 pl-0.5">
                      {visibleMore.map((item, idx) => (
                        <div key={idx} className="flex gap-1.5 items-start">
                          {getFieldIcon(item.key)}
                          <div className="flex-1 min-w-0">
                            <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{item.key}</p>
                            <p className={`text-[10px] font-semibold leading-tight break-words ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                              {renderValue(item.value)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              );
            })()}

            {renderParentLaw()}
            {renderLawStatus()}

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
                    <span className={`text-[10px] font-black ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{articleCount}</span>
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
                
                {lawMeta.regulation_articles && (
                  <div className="flex items-center justify-between text-[9px] mt-1">
                    <span className={muted}>{isRTL ? "عدد مواد اللائحة" : "Reg Articles"}</span>
                    <span className={`text-[10px] font-black ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{lawMeta.regulation_articles}</span>
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
                  <span className={`text-[10px] font-black ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{articleCount}</span>
                </div>
              )}
            </>
          )}

          {/* الحقول العامة المشتركة */}
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
              </div>
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
                    dir="ltr"
                    className={`block text-[10px] leading-tight break-all underline decoration-dotted ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}
                  >
                    {(() => { try { return new URL(law.source).hostname; } catch { return law.source; } })()}
                  </a>
                ) : (
                  <p className={`text-[10px] leading-tight break-words ${muted}`}>{law.source}</p>
                )}
              </div>
            </div>
          )}

          {/* T28-26: the official page, only as the server sent it (http/https),
              and not repeated when it is the same link as «المصدر» above. */}
          {!metaLocked && officialMeta?.officialSourceUrl && officialMeta.officialSourceUrl !== law.source && (
            <div className="flex gap-1.5 items-start">
              <BookOpen size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
              <div className="min-w-0">
                <p className={`text-[8px] uppercase tracking-wider ${muted}`}>المصدر الرسمي</p>
                <a
                  href={officialMeta.officialSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="ltr"
                  className={`block text-[10px] leading-tight break-all underline decoration-dotted ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}
                >
                  {urlHostname(officialMeta.officialSourceUrl)}
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
