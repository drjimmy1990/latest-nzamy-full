"use client";

import { useDeferredValue, useEffect, useState } from "react";
import {
  ArrowRight, CaretDown, CaretLeft, Clock, Info, MagnifyingGlass, Phone, Warning,
} from "@phosphor-icons/react";
import { HighlightProvider, Hl } from "@/components/search/MultiColorHighlight";
import { toArabicDigits } from "@/lib/services/arabicCount";
import type {
  MurshidCard, MurshidDeadline, MurshidSearchEntry, MurshidSector, MurshidSectorSummary,
} from "@/lib/murshid/murshidData";
import { CircuitEmail } from "./_data";
import { SEARCH_SYNTAX_HINT } from "./_circuitsSearch";
import { CHANNEL_LABEL, SafeLink, arabicDate, tone, useMurshidJson } from "./_murshidShared";

/**
 * «إجراءات التظلم حسب القطاع» — the owner's corrected grievance procedures
 * (murshid package 2026-10-28): 32 sectors → procedure cards → numbered steps
 * with channel, place (link) and deadline.
 *
 * Data: GET /api/v1/murshid/sectors (index), /sectors/[n] (one sector's cards,
 * fetched when opened) and /search?q= (agency / problem type across sectors).
 * The sector files themselves (~2 MB) never reach the browser.
 */

interface IndexResponse { sourceDate: string; sectors: MurshidSectorSummary[] }
interface SectorResponse { sector: MurshidSector }
interface SearchResponse { total: number; matches: MurshidSearchEntry[]; suggestions: MurshidSearchEntry[]; unmatchedTerms: string[] }

function DeadlineLine({ d, isDark }: { d: MurshidDeadline; isDark: boolean }) {
  const t = tone(isDark);
  return (
    <div className={`mt-1.5 rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed ${isDark ? "bg-zinc-950/40" : "bg-slate-50"}`}>
      <p className={`flex items-start gap-1 ${t.strong}`}>
        <Clock size={11} className="mt-0.5 flex-shrink-0 text-amber-500" />
        <span>
          <span className="font-bold">المدة: </span>{d.duration || "—"}
          {d.fromEvent && <><span className={t.muted}> · تبدأ من: </span>{d.fromEvent}</>}
        </span>
      </p>
      {d.basis && <p className={`mt-0.5 ${t.muted}`}>السند: {d.basis}</p>}
    </div>
  );
}

function CardDetails({ card, isDark }: { card: MurshidCard; isDark: boolean }) {
  const t = tone(isDark);
  const label = `text-[11px] font-bold ${t.strong}`;
  return (
    <div className="mt-3 space-y-3 text-[12px] leading-relaxed">
      {card.whoCanFile && (
        <p className={t.body}><span className={label}>من يحق له التقديم: </span>{card.whoCanFile}</p>
      )}

      <div>
        <p className={label}>الخطوات</p>
        <ol className="mt-1.5 space-y-2">
          {card.steps.map((s) => (
            <li key={s.n} className="flex items-start gap-2.5">
              <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black flex-shrink-0 border ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-300" : "border-slate-200 bg-slate-100 text-slate-600"}`}>
                {toArabicDigits(s.n)}
              </span>
              <div className="flex-1 min-w-0">
                <p className={t.strong}>{s.action}</p>
                <p className={`mt-0.5 text-[11px] flex flex-wrap items-center gap-x-2 gap-y-0.5 ${t.muted}`}>
                  {s.channel && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${t.chip}`}>{CHANNEL_LABEL[s.channel] ?? s.channel}</span>}
                  {s.whereUrl ? <SafeLink url={s.whereUrl} isDark={isDark} /> : s.where && <span>{s.where}</span>}
                </p>
                {s.deadline && <DeadlineLine d={s.deadline} isDark={isDark} />}
                {s.source && <p className={`mt-0.5 text-[10px] ${t.muted}`}>المصدر: {s.source}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {card.escalation.length > 0 && (
        <div>
          <p className={label}>إن لم يُحل: الجهة التالية</p>
          <ul className="mt-1.5 space-y-2">
            {card.escalation.map((e, i) => (
              <li key={i} className={t.body}>
                <p className={t.strong}>{e.body}</p>
                <p className={`mt-0.5 text-[11px] flex flex-wrap items-center gap-x-2 ${t.muted}`}>
                  {e.channel && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${t.chip}`}>{CHANNEL_LABEL[e.channel] ?? e.channel}</span>}
                  {e.whereUrl ? <SafeLink url={e.whereUrl} isDark={isDark} /> : e.where && <span>{e.where}</span>}
                </p>
                {e.deadline && <DeadlineLine d={e.deadline} isDark={isDark} />}
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.finalForum && <p className={t.body}><span className={label}>جهة الفصل النهائية: </span>{card.finalForum}</p>}

      {card.documents.length > 0 && (
        <div>
          <p className={label}>المستندات المطلوبة</p>
          <ul className={`mt-1 list-disc ps-5 space-y-0.5 ${t.body}`}>
            {card.documents.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      )}

      {card.fees && <p className={t.body}><span className={label}>الرسوم: </span>{card.fees}</p>}

      {(card.contacts.phones.length > 0 || card.contacts.emails.length > 0 || card.contacts.portals.length > 0) && (
        <div className="space-y-1.5">
          <p className={label}>قنوات التواصل</p>
          {card.contacts.phones.map((p) => (
            <p key={p} className={`flex items-center gap-1.5 ${t.strong}`}>
              <Phone size={12} className={t.muted} />
              <span dir="ltr" className="font-mono select-all">{p}</span>
            </p>
          ))}
          {card.contacts.emails.map((e) => <CircuitEmail key={e} email={e} isDark={isDark} verified={false} />)}
          {card.contacts.portals.length > 0 && (
            <ul className="space-y-0.5 text-[11px]">
              {card.contacts.portals.map((p) => (
                <li key={p.url}><SafeLink url={p.url} label={p.name || undefined} isDark={isDark} /></li>
              ))}
            </ul>
          )}
          <p className={`inline-flex items-center gap-1 text-[10px] font-bold ${t.warn}`}>
            <Warning size={10} weight="fill" /> الهواتف وعناوين البريد كما وردت في ملفات المرشد؛ تأكّد منها قبل الاعتماد عليها
          </p>
        </div>
      )}

      {card.legalBasis.length > 0 && (
        <div>
          <p className={label}>السند النظامي</p>
          <ul className={`mt-1 list-disc ps-5 space-y-0.5 text-[11px] ${t.body}`}>
            {card.legalBasis.map((b) => <li key={b.id}>{b.label}</li>)}
          </ul>
        </div>
      )}

      {card.najiz.length > 0 && (
        <div>
          <p className={label}>صلته بتصنيفات ناجز</p>
          <ul className={`mt-1 list-disc ps-5 space-y-0.5 text-[11px] ${t.body}`}>
            {card.najiz.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}

      {card.unverified.length > 0 && (
        <div className={`rounded-xl border px-3 py-2 text-[11px] ${isDark ? "border-amber-500/20 bg-amber-500/5 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <p className="font-bold flex items-center gap-1"><Warning size={11} weight="fill" /> بنود غير مُتحقَّق منها</p>
          <ul className="mt-1 list-disc ps-5 space-y-0.5">
            {card.unverified.map((u, i) => <li key={i}>{u}</li>)}
          </ul>
        </div>
      )}

      <p className={`text-[10px] ${t.muted}`}>
        {card.lastVerified && <>آخر تحقق: {arabicDate(card.lastVerified) || card.lastVerified}</>}
        {card.confidence === "medium" && <span className={`ms-2 font-bold ${t.warn}`}>درجة الثقة: متوسطة</span>}
      </p>
    </div>
  );
}

function CardItem({ card, open, onToggle, isDark }: { card: MurshidCard; open: boolean; onToggle: () => void; isDark: boolean }) {
  const t = tone(isDark);
  return (
    <li id={`murshid-${card.id}`} className={`${t.card} p-3.5`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex items-start gap-2 text-start">
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-bold ${t.strong}`}>{card.agency.name}</p>
          <p className={`mt-0.5 text-[12px] leading-relaxed ${t.body} ${open ? "" : "line-clamp-2"}`}>{card.problemType}</p>
          <p className="mt-1 flex flex-wrap gap-1.5">
            {card.stage && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${t.chip}`}>{card.stage}</span>}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${t.chip}`}>الخطوات: {toArabicDigits(card.steps.length)}</span>
            {card.confidence === "medium" && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700"}`}>ثقة متوسطة</span>}
          </p>
        </div>
        <CaretDown size={13} className={`mt-1 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""} ${t.muted}`} />
      </button>
      {open && <CardDetails card={card} isDark={isDark} />}
    </li>
  );
}

function ResultRow({ e, onOpen, isDark }: { e: MurshidSearchEntry; onOpen: (e: MurshidSearchEntry) => void; isDark: boolean }) {
  const t = tone(isDark);
  return (
    <li>
      <button type="button" onClick={() => onOpen(e)} className={`${t.card} w-full p-3 flex items-start gap-2 text-start`}>
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-bold ${t.strong}`}><Hl text={e.agency} /></p>
          <p className={`mt-0.5 text-[12px] leading-relaxed line-clamp-2 ${t.body}`}><Hl text={e.problemType} /></p>
          <p className={`mt-0.5 text-[10px] ${t.muted}`}>القطاع {toArabicDigits(e.sectorNo)}: <Hl text={e.sectorTitle} /></p>
        </div>
        <CaretLeft size={13} className={`mt-1 flex-shrink-0 ${t.muted}`} />
      </button>
    </li>
  );
}

export function MurshidGrievances({ isDark }: { isDark: boolean }) {
  const t = tone(isDark);
  const index = useMurshidJson<IndexResponse>("/api/v1/murshid/sectors");
  const [sectorNo, setSectorNo] = useState<number | null>(null);
  const sector = useMurshidJson<SectorResponse>(sectorNo ? `/api/v1/murshid/sectors/${sectorNo}` : null);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(id);
  }, [query]);
  const search = useMurshidJson<SearchResponse>(debounced ? `/api/v1/murshid/search?q=${encodeURIComponent(debounced)}` : null);

  // A search result opens its sector with the card expanded; scroll to it once loaded.
  useEffect(() => {
    if (!openCard || !sector.data) return;
    document.getElementById(`murshid-${openCard}`)?.scrollIntoView({ block: "nearest" });
  }, [openCard, sector.data]);

  const openResult = (e: MurshidSearchEntry) => {
    setQ("");
    setDebounced("");
    setSectorNo(e.sectorNo);
    setOpenCard(e.cardId);
  };

  if (index.failed) return <p className={`text-[12px] ${t.muted}`}>تعذّر تحميل إجراءات التظلم — أعد تحميل الصفحة.</p>;
  if (!index.data) return <p className={`text-[12px] ${t.muted}`}>جارٍ تحميل إجراءات التظلم…</p>;

  const sectors = index.data.sectors;
  const totalCards = sectors.reduce((a, s) => a + s.total, 0);
  const current = sectors.find((s) => s.no === sectorNo) ?? null;
  const cards = sector.data?.sector.cards ?? [];
  const problemCards = cards.filter((c) => c.kind === "problem");
  const agencyCards = cards.filter((c) => c.kind === "agency");
  const toggle = (id: string) => setOpenCard((cur) => (cur === id ? null : id));

  return (
    <div className="space-y-3">
      <div>
        <h2 className={`text-[14px] font-bold ${t.strong}`}>إجراءات التظلم حسب القطاع</h2>
        <p className={`mt-0.5 text-[12px] leading-relaxed ${t.muted}`}>
          خطوات التظلم والشكوى لدى الجهات الحكومية ومددها والجهة التالية إن لم يُحل الأمر —
          {" "}{toArabicDigits(totalCards)} بطاقة في {toArabicDigits(sectors.length)} قطاعاً، من ملفات المرشد القضائي المصححة ({arabicDate(index.data.sourceDate)}).
        </p>
      </div>

      <label className="relative block">
        <MagnifyingGlass size={14} className={`absolute top-1/2 -translate-y-1/2 start-3 ${t.muted}`} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={120}
          placeholder="ابحث باسم الجهة أو نوع المشكلة في كل القطاعات"
          aria-label="البحث في إجراءات التظلم"
          aria-describedby="murshid-search-syntax"
          className={`${t.field} w-full ps-9`}
        />
      </label>
      <p id="murshid-search-syntax" className={`text-[11px] ${t.muted}`}>{SEARCH_SYNTAX_HINT}</p>

      {query ? (
        <HighlightProvider query={debounced}>
          <div className="space-y-2" aria-live="polite">
            {search.failed && <p className={`text-[12px] ${t.muted}`}>تعذّر البحث — حاول مرة أخرى.</p>}
            {!search.failed && !search.data && <p className={`text-[12px] ${t.muted}`}>جارٍ البحث…</p>}
            {search.data && (
              <>
                <p className={`text-[11px] ${t.muted}`}>
                  {search.data.total === 0
                    ? "لا توجد نتائج مطابقة."
                    : search.data.total > search.data.matches.length
                      ? `${toArabicDigits(search.data.total)} نتيجة — تُعرض أول ${toArabicDigits(search.data.matches.length)}؛ أضف كلمة لتضييق البحث`
                      : `${toArabicDigits(search.data.total)} نتيجة`}
                </p>
                {search.data.total === 0 && search.data.unmatchedTerms.length > 0 && (
                  <p className={`text-[12px] ${t.body}`}>لم نجد أي بطاقة تحوي: {search.data.unmatchedTerms.map((w) => `«${w}»`).join("، ")}</p>
                )}
                {search.data.total === 0 && search.data.suggestions.length > 0 && (
                  <>
                    <p className={`text-[12px] font-bold ${t.strong}`}>هل تقصد؟</p>
                    <ul className="space-y-2">{search.data.suggestions.map((e) => <ResultRow key={e.cardId} e={e} onOpen={openResult} isDark={isDark} />)}</ul>
                  </>
                )}
                <ul className="space-y-2">{search.data.matches.map((e) => <ResultRow key={e.cardId} e={e} onOpen={openResult} isDark={isDark} />)}</ul>
              </>
            )}
          </div>
        </HighlightProvider>
      ) : !current ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {sectors.map((s) => (
            <li key={s.no}>
              <button type="button" onClick={() => { setSectorNo(s.no); setOpenCard(null); }}
                className={`${t.card} w-full h-full p-3 flex items-start gap-2.5 text-start`}>
                <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black flex-shrink-0 ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700"}`}>
                  {toArabicDigits(s.no)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-[12px] font-bold leading-snug ${t.strong}`}>{s.title}</span>
                  <span className={`block mt-0.5 text-[10px] ${t.muted}`}>{toArabicDigits(s.total)} بطاقة</span>
                </span>
                <CaretLeft size={13} className={`mt-1 flex-shrink-0 ${t.muted}`} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <button type="button" onClick={() => { setSectorNo(null); setOpenCard(null); }}
              className={`flex items-center gap-1.5 text-[12px] px-3 py-2 rounded-xl border flex-shrink-0 transition-colors ${isDark ? "border-white/[0.06] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:text-slate-700"}`}>
              <ArrowRight size={13} /> القطاعات
            </button>
            <div className="min-w-0">
              <h3 className={`text-[13px] font-bold ${t.strong}`}>القطاع {toArabicDigits(current.no)}: {current.title}</h3>
              <p className={`text-[11px] ${t.muted}`}>{toArabicDigits(current.total)} بطاقة</p>
            </div>
          </div>
          {sector.failed && <p className={`text-[12px] ${t.muted}`}>تعذّر تحميل هذا القطاع — حاول مرة أخرى.</p>}
          {!sector.failed && !sector.data && <p className={`text-[12px] ${t.muted}`}>جارٍ تحميل البطاقات…</p>}
          {problemCards.length > 0 && (
            <section className="space-y-2">
              <p className={`text-[12px] font-bold ${t.strong}`}>مشكلات متخصصة ({toArabicDigits(problemCards.length)})</p>
              <ul className="space-y-2">
                {problemCards.map((c) => <CardItem key={c.id} card={c} open={openCard === c.id} onToggle={() => toggle(c.id)} isDark={isDark} />)}
              </ul>
            </section>
          )}
          {agencyCards.length > 0 && (
            <section className="space-y-2">
              <p className={`text-[12px] font-bold ${t.strong}`}>التظلم لدى كل جهة ({toArabicDigits(agencyCards.length)})</p>
              <ul className="space-y-2">
                {agencyCards.map((c) => <CardItem key={c.id} card={c} open={openCard === c.id} onToggle={() => toggle(c.id)} isDark={isDark} />)}
              </ul>
            </section>
          )}
        </div>
      )}

      <div className={`rounded-xl flex items-start gap-2.5 p-3.5 border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
        <Info size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <p className={`text-[11px] leading-relaxed ${t.muted}`}>
          المعلومات للإرشاد العام فقط. المدد والإجراءات قد تختلف حسب الحالة وتحديث الأنظمة؛ تأكّد من الجهة قبل فوات أي مدة. <span className={`font-semibold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>استشر محاميك.</span>
        </p>
      </div>
    </div>
  );
}
