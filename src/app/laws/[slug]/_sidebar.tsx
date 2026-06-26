"use client";

import Link from "next/link";
import {
  Stack, BookOpen, Scroll, CalendarBlank, Buildings, Tag, FolderSimple, Lock, Crown
} from "@phosphor-icons/react";
import type { LawSystem, LawArticle } from "../data";

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
  viewMode = "all"
}: SidebarPanelProps) {
  const muted = isDark ? "text-zinc-500" : "text-slate-400";
  const border = isDark ? "border-white/[0.07]" : "border-slate-200";
  const card = `rounded-2xl border ${isDark ? "bg-zinc-900" : "bg-white shadow-sm"}`;
  const textStart = isRTL ? "text-right" : "text-left";

  const renderIdentity = () => (
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
              
              {law.issuanceDecree && (
                <div className="flex gap-1.5 items-start">
                  <Scroll size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
                  <div>
                    <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "أداة الإصدار" : "Issuance"}</p>
                    <p className={`text-[10px] font-semibold leading-tight ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{law.issuanceDecree}</p>
                  </div>
                </div>
              )}
              
              {lawMeta.total_articles && (
                <div className="flex items-center justify-between text-[9px] mt-1">
                  <span className={muted}>{isRTL ? "عدد مواد النظام" : "Law Articles"}</span>
                  <span className={`text-[10px] font-black ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{lawMeta.total_articles}</span>
                </div>
              )}
            </div>

            {/* قسم اللائحة التنفيذية */}
            <div className="space-y-1.5 pb-2 border-b border-dashed border-slate-100 dark:border-white/[0.05]">
              <div className="flex items-center gap-1 mb-1">
                <BookOpen size={11} className="text-[#C8A762]" weight="fill" />
                <span className="text-[9px] font-black text-[#C8A762]">{isRTL ? "تفاصيل اللائحة التنفيذية" : "Regulation Details"}</span>
              </div>
              
              {lawMeta.regulation_decree && (
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
            {law.issuanceDecree && (
              <div className="flex gap-1.5 items-start">
                <Scroll size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
                <div>
                  <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "أداة الإصدار" : "Issuance"}</p>
                  <p className={`text-[10px] font-semibold leading-tight ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{law.issuanceDecree}</p>
                </div>
              </div>
            )}
            {lawMeta.total_articles && (
              <div className="flex items-center justify-between text-[9px]">
                <span className={muted}>{isRTL ? "عدد المواد" : "Articles"}</span>
                <span className={`text-[10px] font-black ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{lawMeta.total_articles}</span>
              </div>
            )}
          </>
        )}

        {/* الحقول العامة المشتركة */}
        {lawMeta.latestAmendmentDecree && (
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
        {law.source && (
          <div className="flex gap-1.5 items-start">
            <Tag size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
            <div>
              <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "المصدر" : "Source"}</p>
              <p className={`text-[10px] leading-tight ${muted}`}>{law.source}</p>
            </div>
          </div>
        )}

        {/* حالة النظام */}
        <div className="flex items-center gap-1.5 pt-1">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            (lawMeta.law_status ?? "active") === "active" ? "bg-emerald-500" :
            lawMeta.law_status === "repealed" ? "bg-red-500" : "bg-amber-500"
          }`} />
          <span className={`text-[9px] font-bold ${
            (lawMeta.law_status ?? "active") === "active" ? (isDark ? "text-emerald-400" : "text-emerald-600") :
            lawMeta.law_status === "repealed" ? "text-red-500" : "text-amber-500"
          }`}>
            {(lawMeta.law_status ?? "active") === "active" ? (isRTL ? "ساري" : "Active") :
             lawMeta.law_status === "repealed" ? (isRTL ? "ملغى" : "Repealed") :
             (isRTL ? "معلّق" : "Suspended")}
          </span>
        </div>

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
                isScrolling.current = true;
                setActiveId(a.id);
                document.getElementById(a.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
                setTimeout(() => { isScrolling.current = false; }, 1000);
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
        <div className="space-y-0.5 max-h-[50vh] overflow-y-auto">
          {viewMode === "regulation" ? (
            /* وضع اللائحة فقط — قائمة مسطحة من مواد اللائحة */
            (() => {
              const regArticles = law.chapters
                .flatMap(ch => ch.articles)
                .filter(a => a.executiveReg);
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
                      isScrolling.current = true;
                      setActiveId(a.id);
                      document.getElementById(a.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
                      setTimeout(() => { isScrolling.current = false; }, 1000);
                      setJumpQuery("");
                    }}
                    className={`w-full ${textStart} flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] transition ${
                      activeId === a.id
                        ? isDark ? "bg-[#C8A762]/20 text-[#C8A762] font-bold" : "bg-amber-100 text-amber-800 font-bold"
                        : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                    } ${a.status === "repealed" ? "line-through opacity-50" : ""}`}
                  >
                    {!a.free && <Lock size={9} className="flex-shrink-0" />}
                    <span className="truncate flex-1 font-medium">{a.executiveReg?.ref}</span>
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
                  isScrolling.current = true;
                  setActiveId(a.id);
                  document.getElementById(a.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
                  setTimeout(() => { isScrolling.current = false; }, 1000);
                  setJumpQuery("");
                }}
                className={`w-full ${textStart} flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] transition ${
                  activeId === a.id
                    ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
                    : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                } ${a.status === "repealed" ? "line-through opacity-50" : ""}`}
              >
                {!a.free && <Lock size={9} className="flex-shrink-0" />}
                <span className="truncate flex-1">{a.num}</span>
                {a.executiveReg && <span className={`text-[8px] flex-shrink-0 px-1 rounded font-black ${activeId === a.id ? "text-[#C8A762]/70" : isDark ? "text-zinc-600" : "text-slate-400"}`}>ل</span>}
                {cartMap.has(a.id) && <span className="w-1.5 h-1.5 rounded-full bg-[#C8A762] flex-shrink-0" />}
              </button>
            ))
          ) : (
            /* وضع عادي — شجرة الأبواب */
            law.chapters.map((ch, ci) => (
              <div key={ci}>
                <p className={`text-[9px] font-bold px-2 py-1 ${muted}`}>{ch.title.replace("الباب الأول: ", "").replace("الفصل الثاني: ", "")}</p>
                {ch.articles.map(a => (
                  <button
                    key={a.id}
                    onClick={() => {
                      isScrolling.current = true;
                      setActiveId(a.id);
                      document.getElementById(a.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
                      setTimeout(() => { isScrolling.current = false; }, 1000);
                    }}
                    className={`w-full ${textStart} flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] transition ${
                      activeId === a.id
                        ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
                        : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                    } ${a.status === "repealed" ? "line-through opacity-50" : ""}`}
                  >
                    {!a.free && <Lock size={9} className="flex-shrink-0" />}
                    <span className="truncate flex-1">{a.num}</span>
                    {a.executiveReg && (
                      <span title={isRTL ? "يحتوي لائحة تنفيذية" : "Has executive regulation"}
                        className={`text-[8px] flex-shrink-0 px-1 rounded font-black ${
                          activeId === a.id ? "text-[#C8A762]/70" : isDark ? "text-zinc-600" : "text-slate-400"
                        }`}>ل</span>
                    )}
                    {cartMap.has(a.id) && <span className="w-1.5 h-1.5 rounded-full bg-[#C8A762] flex-shrink-0" />}
                  </button>
                ))}
              </div>
            ))
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
