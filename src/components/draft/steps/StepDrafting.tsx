"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  PencilSimple, Copy, CheckCircle, Microphone, TextT,
  MagicWand, DownloadSimple, ArrowCounterClockwise, ChatCenteredText,
  Gavel, Shield, BookOpen, Scales, ChatCircleDots, Sparkle, X,
} from "@phosphor-icons/react";
import { useState, useEffect, useMemo } from "react";
import { VoiceInput } from "@/components/ui/VoiceInput";
import BetaReviewGate from "@/components/BetaReviewGate";
import { PartyData, MainDefense } from "@/components/draft/draftConstants";

// ─── Types ────────────────────────────────────────────────────────────────────
interface MemoSection {
  id: string;
  type: "header" | "heading" | "defense" | "sub-defense" | "text" | "requests";
  label?: string;        // e.g. "الدفع الأول"
  tag?: string;          // e.g. "أساسي" | "إجرائي"
  tagColor?: string;
  heading?: string;      // section heading text
  content: string;       // full body text
  lawRef?: string;       // e.g. "المادة ٧٧ — نظام العمل"
}

const PLACEHOLDER = "[أكمل هذا الجزء]";

// ─── Mail-merge helpers — build memo sections from real wizard state ──────────
// Deterministic, no LLM — mirrors src/app/ai/debt-collection/page.tsx's generateNotice():
// structured state in, Arabic text out. Any field the lawyer hasn't filled in yet
// renders as PLACEHOLDER; nothing here is an invented fact.

function partyDisplayName(p?: PartyData | null): string {
  if (!p) return "";
  if (p.type === "company") return p.companyName.trim();
  if (p.type === "government") return p.entityName.trim();
  return p.fullName.trim();
}

interface BuildSectionsParams {
  memoType: string;
  clientRole: "plaintiff" | "defendant" | "";
  partyOne: PartyData;
  partyTwo: PartyData;
  plaintiffName: string;
  defendantName: string;
  judgmentCourt: string;
  judgmentNumber: string;
  judgmentDate: string;
  judgmentText: string;
  judgmentReasons: string;
  disputeSummary: string;
  caseText: string;
  customLegalTexts: string;
  defenses: MainDefense[];
}

function buildMemoSections(params: BuildSectionsParams): MemoSection[] {
  const {
    memoType, clientRole, partyOne, partyTwo, plaintiffName, defendantName,
    judgmentCourt, judgmentNumber, judgmentDate, judgmentText, judgmentReasons,
    disputeSummary, caseText, customLegalTexts, defenses,
  } = params;

  const isAppeal = memoType === "appeal" || memoType === "reply";
  const sections: MemoSection[] = [];

  // ── Opening — formulaic judicial salutation (not case-specific) ──
  sections.push({
    id: "header", type: "header",
    content: "بسم الله الرحمن الرحيم\n\nأصحاب الفضيلة / السادة القضاة حفظهم الله\n\nالسلام عليكم ورحمة الله وبركاته",
  });

  // ── أطراف المذكرة ──
  let partiesLine = PLACEHOLDER;
  if (memoType === "case") {
    const p1 = partyDisplayName(partyOne) || PLACEHOLDER;
    const p2 = partyDisplayName(partyTwo) || PLACEHOLDER;
    const plaintiff = clientRole === "defendant" ? p2 : p1;
    const defendant = clientRole === "defendant" ? p1 : p2;
    partiesLine = `المدعي: ${plaintiff}\nالمدعى عليه: ${defendant}`;
  } else if (isAppeal) {
    partiesLine = `الطاعن / المدعي: ${plaintiffName || PLACEHOLDER}\nالمطعون ضده / المدعى عليه: ${defendantName || PLACEHOLDER}`;
  }
  sections.push({
    id: "subject", type: "heading", heading: "الموضوع",
    content: partiesLine,
  });

  // ── أولاً: الوقائع — judgment refs (appeal/reply) + user's dispute summary ──
  const factParts: string[] = [];
  if (isAppeal) {
    if (judgmentNumber || judgmentCourt || judgmentDate) {
      factParts.push(`صدر الحكم المطعون فيه برقم (${judgmentNumber || PLACEHOLDER}) بتاريخ ${judgmentDate || PLACEHOLDER} عن ${judgmentCourt || PLACEHOLDER}.`);
    }
    if (judgmentText) factParts.push(`منطوق الحكم: ${judgmentText}`);
    if (judgmentReasons) factParts.push(`أسباب الحكم: ${judgmentReasons}`);
  }
  if (disputeSummary.trim()) factParts.push(disputeSummary.trim());
  else if (caseText.trim()) factParts.push(caseText.trim());

  sections.push({
    id: "facts", type: "heading", heading: "أولاً: الوقائع",
    content: factParts.length ? factParts.join("\n\n") : PLACEHOLDER,
  });

  // ── ثانياً: الأسباب والاعتراضات — confirmed defenses + custom legal texts ──
  const confirmed = defenses.filter(d => d.status === "confirmed");
  if (confirmed.length === 0) {
    sections.push({
      id: "grounds-empty", type: "heading", heading: "ثانياً: الأسباب والاعتراضات",
      content: PLACEHOLDER,
    });
  } else {
    sections.push({
      id: "grounds-title", type: "heading", heading: "ثانياً: الأسباب والاعتراضات",
      content: `فيما يلي الدفوع التي أكّدها المحامي (${confirmed.length}):`,
    });
    confirmed.forEach((d, i) => {
      sections.push({
        id: `defense-${d.id}`, type: "defense",
        label: `الدفع ${i + 1}`,
        tag: d.isCore ? "أساسي" : undefined,
        tagColor: d.isCore ? "red" : undefined,
        heading: d.title,
        content: d.summary,
        lawRef: d.legalBase,
      });
      d.subDefenses.filter(sd => sd.status === "confirmed").forEach((sd, j) => {
        sections.push({
          id: `subdefense-${sd.id}`, type: "sub-defense",
          label: `الدفع الفرعي ${i + 1}/${j + 1}`,
          heading: sd.title,
          content: sd.note?.trim() || sd.legalBase || sd.title,
        });
      });
    });
  }

  if (customLegalTexts.trim()) {
    sections.push({
      id: "custom-laws", type: "text", heading: "نصوص نظامية إضافية",
      content: customLegalTexts.trim(),
    });
  }

  // ── ثالثاً: الطلبات — derived only from the lawyer's own confirmed grounds ──
  if (confirmed.length > 0) {
    const items = confirmed.map((d, i) => `${i + 1}. الحكم بما يقرره النظام بشأن: ${d.title}`);
    items.push(`${items.length + 1}. إلزام الطرف الآخر بالمصروفات القضائية والرسوم.`);
    sections.push({
      id: "requests", type: "requests", heading: "ثالثاً: الطلبات",
      content: `نلتمس من عدالتكم الحكم بما يلي:\n${items.join("\n")}`,
    });
  } else {
    sections.push({
      id: "requests", type: "requests", heading: "ثالثاً: الطلبات",
      content: PLACEHOLDER,
    });
  }

  // ── الخاتمة — formulaic closing ──
  sections.push({
    id: "closing", type: "text", heading: "الخاتمة",
    content: "وتفضلوا بقبول فائق الاحترام والتقدير،\nوالله يحفظكم ويرعاكم.",
  });

  return sections;
}

// ─── Revision Panel ───────────────────────────────────────────────────────────
function RevisionPanel({
  isDark, sectionLabel, onClose, onApply,
}: {
  isDark: boolean; sectionLabel?: string;
  onClose: () => void; onApply: (inst: string) => void;
}) {
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [instruction, setInstruction] = useState("");
  const presets = [
    "اجعل الأسلوب أكثر رسمية",
    "شدّد لهجة المطالبة",
    "اختصر الفقرة",
    "أضف مرجعاً نظامياً",
    "استبدل الألفاظ العامية",
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
      className={`rounded-2xl border shadow-lg p-4 space-y-3 ${isDark ? "bg-zinc-900 border-white/[0.08]" : "bg-white border-slate-200"}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MagicWand size={14} weight="duotone" className="text-[#C8A762]" />
          <p className={`text-[12px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
            تعديل AI{sectionLabel ? ` — ${sectionLabel}` : ""}
          </p>
        </div>
        <button onClick={onClose}><X size={13} className={isDark ? "text-zinc-600 hover:text-zinc-300" : "text-slate-400"} /></button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(p => (
          <button key={p} onClick={() => setInstruction(prev => prev ? prev + " — " + p : p)}
            className={`text-[10px] px-2.5 py-1 rounded-full border font-medium transition-all ${isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:border-royal/30 hover:text-royal"}`}>
            {p}
          </button>
        ))}
      </div>
      <div className={`flex rounded-xl p-0.5 ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
        {(["text", "voice"] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-bold transition-all ${mode === m ? isDark ? "bg-zinc-700 text-white" : "bg-white text-slate-800 shadow-sm" : isDark ? "text-zinc-500" : "text-slate-500"}`}>
            {m === "text" ? <><TextT size={11} />نصي</> : <><Microphone size={11} />صوتي</>}
          </button>
        ))}
      </div>
      {mode === "text" ? (
        <textarea value={instruction} onChange={e => setInstruction(e.target.value)}
          rows={2} placeholder="اكتب تعليمات التعديل..."
          className={`w-full resize-none rounded-xl border px-3 py-2 text-[12px] outline-none ${isDark ? "border-white/[0.07] bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400"}`} />
      ) : (
        <div className={`p-3 rounded-xl border ${isDark ? "border-white/[0.07] bg-zinc-800/40" : "border-slate-100 bg-slate-50"}`}>
          <VoiceInput onTranscript={t => setInstruction(prev => prev ? prev + " " + t : t)} compact />
          {instruction && <p className={`text-[11px] italic mt-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{instruction}</p>}
        </div>
      )}
      <button disabled={!instruction.trim()} onClick={() => { onApply(instruction); setInstruction(""); }}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold disabled:opacity-40">
        <MagicWand size={12} weight="fill" />✨ طبّق التعديل
      </button>
    </motion.div>
  );
}

// ─── Single memo block ────────────────────────────────────────────────────────
function MemoBlock({
  section, isDark, index, amendments, onApplyAmendment,
}: {
  section: MemoSection; isDark: boolean; index: number;
  amendments: string[];
  onApplyAmendment: (sectionId: string, instruction: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const tagColors: Record<string, { d: string; l: string }> = {
    red:  { d: "border-red-700/30 bg-red-900/10 text-red-400",     l: "border-red-200 bg-red-50 text-red-600" },
    blue: { d: "border-blue-700/30 bg-blue-900/10 text-blue-400",  l: "border-blue-200 bg-blue-50 text-blue-600" },
  };

  const typeIcon: Record<string, React.ElementType> = {
    defense: Gavel, "sub-defense": Shield, heading: BookOpen,
    requests: Scales, header: Sparkle, text: ChatCircleDots,
  };
  const TypeIcon = typeIcon[section.type] ?? BookOpen;

  if (section.type === "header") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04 }}
        className={`rounded-2xl p-5 text-center space-y-1 ${isDark ? "bg-zinc-900/60 border border-white/[0.04]" : "bg-gradient-to-b from-slate-50 to-white border border-slate-100"}`}
      >
        <p className={`text-[13px] leading-relaxed font-medium ${isDark ? "text-zinc-300" : "text-slate-700"}`} dir="rtl">
          {section.content}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => !chatOpen && setHover(false)}
      className={`group relative rounded-2xl border overflow-hidden transition-all duration-200 ${
        chatOpen
          ? isDark ? "border-[#C8A762]/30 ring-1 ring-[#C8A762]/20" : "border-[#C8A762]/40 ring-1 ring-[#C8A762]/20"
          : hover
          ? isDark ? "border-white/[0.12]" : "border-slate-300 shadow-sm"
          : isDark ? "border-white/[0.06]" : "border-slate-100"
      } ${
        section.type === "defense"
          ? isDark ? "bg-zinc-900/80" : "bg-white"
          : section.type === "sub-defense"
          ? isDark ? "bg-zinc-900/40 mr-4 border-r-2 border-r-[#C8A762]/20" : "bg-slate-50/80 mr-4 border-r-2 border-r-amber-200"
          : section.type === "requests"
          ? isDark ? "bg-[#0B3D2E]/10 border-[#0B3D2E]/30" : "bg-emerald-50/50 border-emerald-200"
          : isDark ? "bg-zinc-900/40" : "bg-white"
      }`}
    >
      {/* Main content */}
      <div className="px-4 py-3.5">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
            section.type === "defense" ? isDark ? "bg-zinc-800" : "bg-slate-100"
            : section.type === "sub-defense" ? isDark ? "bg-[#C8A762]/10" : "bg-amber-50"
            : section.type === "requests" ? isDark ? "bg-emerald-900/30" : "bg-emerald-100"
            : isDark ? "bg-zinc-800" : "bg-slate-100"
          }`}>
            <TypeIcon size={13} weight="duotone" className={
              section.type === "defense" ? isDark ? "text-zinc-400" : "text-slate-500"
              : section.type === "sub-defense" ? "text-[#C8A762]"
              : section.type === "requests" ? "text-emerald-500"
              : isDark ? "text-zinc-500" : "text-slate-400"
            } />
          </div>

          <div className="flex-1 min-w-0">
            {/* Label + tags */}
            {(section.label || section.tag) && (
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {section.label && (
                  <span className={`text-[10px] font-bold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{section.label}</span>
                )}
                {section.tag && section.tagColor && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${isDark ? tagColors[section.tagColor].d : tagColors[section.tagColor].l}`}>
                    {section.tag}
                  </span>
                )}
                {section.lawRef && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-mono ${isDark ? "border-white/[0.06] text-zinc-600" : "border-slate-200 text-slate-400"}`}>
                    {section.lawRef}
                  </span>
                )}
              </div>
            )}

            {/* Heading */}
            {section.heading && (
              <p className={`text-[13px] font-bold mb-1.5 ${
                section.type === "defense" ? isDark ? "text-zinc-100" : "text-zinc-800"
                : section.type === "requests" ? isDark ? "text-emerald-300" : "text-emerald-800"
                : isDark ? "text-zinc-200" : "text-zinc-700"
              }`}>{section.heading}</p>
            )}

            {/* Content */}
            <p className={`text-[12px] leading-[1.85] whitespace-pre-line ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
              {section.content}
            </p>

            {/* Applied amendments — visible, honest result of "طبّق التعديل" (FIX 2) */}
            {amendments.length > 0 && (
              <div className="mt-2.5 space-y-1.5">
                {amendments.map((a, i) => (
                  <div key={i}
                    className={`rounded-lg border-r-2 px-2.5 py-1.5 text-[11px] leading-relaxed ${isDark ? "border-[#C8A762] bg-[#C8A762]/[0.06] text-[#C8A762]" : "border-[#C8A762] bg-amber-50 text-amber-800"}`}>
                    🖊 تعديل مطلوب: {a}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hover actions */}
          <AnimatePresence>
            {hover && (
              <motion.div
                initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 4 }}
                className="flex items-center gap-1 flex-shrink-0"
              >
                <button
                  onClick={() => {
                    const text = amendments.length ? `${section.content}\n${amendments.map(a => `🖊 تعديل مطلوب: ${a}`).join("\n")}` : section.content;
                    navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500);
                  }}
                  title="نسخ"
                  className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${isDark ? "border-white/[0.08] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-400 hover:text-slate-600"}`}
                >
                  {copied ? <CheckCircle size={11} className="text-emerald-500" weight="fill" /> : <Copy size={11} />}
                </button>
                <button
                  onClick={() => setChatOpen(v => !v)}
                  title="تعديل AI"
                  className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${
                    chatOpen
                      ? "border-[#C8A762]/40 bg-[#C8A762]/10 text-[#C8A762]"
                      : isDark ? "border-white/[0.08] text-zinc-500 hover:text-[#C8A762]" : "border-slate-200 text-slate-400 hover:text-[#C8A762]"
                  }`}
                >
                  <ChatCenteredText size={11} weight="duotone" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Inline AI revision panel */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="overflow-hidden"
          >
            <div className={`border-t px-4 pb-4 pt-3 ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
              <RevisionPanel
                isDark={isDark}
                sectionLabel={section.label ?? section.heading}
                onClose={() => { setChatOpen(false); setHover(false); }}
                onApply={(inst) => { onApplyAmendment(section.id, inst); setChatOpen(false); setHover(false); }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Streaming intro for header ───────────────────────────────────────────────
function useStreamSections(sections: MemoSection[]) {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    setVisible(0);
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setVisible(i);
      if (i >= sections.length) clearInterval(iv);
    }, 80);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return visible;
}

// ─── Main StepDrafting ────────────────────────────────────────────────────────
interface StepDraftingProps {
  isDark: boolean;
  memoType: string;
  memoSubType: string;
  clientRole: "plaintiff" | "defendant" | "";
  partyOne: PartyData;
  partyTwo: PartyData;
  plaintiffName: string;
  defendantName: string;
  judgmentCourt: string;
  judgmentNumber: string;
  judgmentDate: string;
  judgmentText: string;
  judgmentReasons: string;
  disputeSummary: string;
  caseText: string;
  customLegalTexts: string;
  defenses: MainDefense[];
}

interface RevisionEntry {
  scope: "global" | "section";
  sectionId?: string;
  instruction: string;
}

export function StepDrafting({
  isDark, memoType, memoSubType, clientRole,
  partyOne, partyTwo, plaintiffName, defendantName,
  judgmentCourt, judgmentNumber, judgmentDate, judgmentText, judgmentReasons,
  disputeSummary, caseText, customLegalTexts, defenses,
}: StepDraftingProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const [copied, setCopied]               = useState(false);
  const [showRevision, setShowRevision]   = useState(false);
  const [revisionHistory, setRevisionHistory] = useState<RevisionEntry[]>([]);
  const [sectionAmendments, setSectionAmendments] = useState<Record<string, string[]>>({});
  const [globalAmendments, setGlobalAmendments]   = useState<string[]>([]);

  const sections = useMemo(() => buildMemoSections({
    memoType, clientRole, partyOne, partyTwo, plaintiffName, defendantName,
    judgmentCourt, judgmentNumber, judgmentDate, judgmentText, judgmentReasons,
    disputeSummary, caseText, customLegalTexts, defenses,
  }), [
    memoType, clientRole, partyOne, partyTwo, plaintiffName, defendantName,
    judgmentCourt, judgmentNumber, judgmentDate, judgmentText, judgmentReasons,
    disputeSummary, caseText, customLegalTexts, defenses,
  ]);

  const visible = useStreamSections(sections);

  function applySectionAmendment(sectionId: string, instruction: string) {
    setSectionAmendments(prev => ({ ...prev, [sectionId]: [...(prev[sectionId] ?? []), instruction] }));
    setRevisionHistory(prev => [...prev, { scope: "section", sectionId, instruction }]);
  }

  function applyGlobalAmendment(instruction: string) {
    setGlobalAmendments(prev => [...prev, instruction]);
    setRevisionHistory(prev => [...prev, { scope: "global", instruction }]);
  }

  function undoLastRevision() {
    setRevisionHistory(prev => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      if (last.scope === "global") {
        setGlobalAmendments(g => g.slice(0, -1));
      } else if (last.sectionId) {
        const sid = last.sectionId;
        setSectionAmendments(s => ({ ...s, [sid]: (s[sid] ?? []).slice(0, -1) }));
      }
      return prev.slice(0, -1);
    });
  }

  function getFullText(): string {
    const body = sections.map(s => {
      const own = sectionAmendments[s.id] ?? [];
      return own.length ? `${s.content}\n${own.map(a => `🖊 تعديل مطلوب: ${a}`).join("\n")}` : s.content;
    }).join("\n\n");
    const globalBlock = globalAmendments.length
      ? `\n\n${globalAmendments.map(a => `🖊 تعديل مطلوب: ${a}`).join("\n")}`
      : "";
    return body + globalBlock;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

      {/* Toolbar */}
      <div className={`${card} px-4 py-3 flex items-center gap-3 shadow-sm`}>
        <PencilSimple size={14} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
        <span className={`text-[12px] font-semibold flex-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
          {memoType}: {memoSubType}
        </span>
        <div className="flex items-center gap-1.5">
          {revisionHistory.length > 0 && (
            <button onClick={undoLastRevision}
              className={`flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] border ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}>
              <ArrowCounterClockwise size={11} />تراجع
            </button>
          )}
          <button
            onClick={() => { navigator.clipboard.writeText(getFullText()); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[11px] border ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}>
            {copied ? <CheckCircle size={11} className="text-emerald-500" /> : <Copy size={11} />}
            {copied ? "تم" : "نسخ الكل"}
          </button>
          <button
            onClick={() => setShowRevision(!showRevision)}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[11px] border font-bold transition-all ${showRevision ? "border-[#C8A762]/40 bg-[#C8A762]/10 text-[#C8A762]" : isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}>
            <ChatCenteredText size={11} weight="duotone" />تعديل AI
          </button>
        </div>
      </div>

      {/* Global AI revision panel */}
      <AnimatePresence>
        {showRevision && (
          <RevisionPanel
            isDark={isDark}
            onClose={() => setShowRevision(false)}
            onApply={(inst) => {
              applyGlobalAmendment(inst);
              setShowRevision(false);
            }}
          />
        )}
      </AnimatePresence>

      <BetaReviewGate toolId="draft.final" toolName={memoType === "contract" ? "صياغة العقد" : "الصائغ القانوني"} reviewScope="legal-data">
        {/* Honesty disclaimer */}
        <p className={`text-[10.5px] px-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          مسودة أولية مبنية على مدخلاتك — راجعها قبل الاستخدام
        </p>

        {/* Hint */}
        <p className={`text-[10px] px-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          💡 اضغط على أي بند للتعديل بالذكاء الاصطناعي أو نسخه منفرداً
        </p>

        {/* Global amendments — visible, honest result of the toolbar "تعديل AI" (FIX 2) */}
        {globalAmendments.length > 0 && (
          <div className={`${card} px-4 py-3 space-y-1.5`}>
            <p className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>تعديلات عامة مطبّقة</p>
            {globalAmendments.map((a, i) => (
              <div key={i}
                className={`rounded-lg border-r-2 px-2.5 py-1.5 text-[11px] leading-relaxed ${isDark ? "border-[#C8A762] bg-[#C8A762]/[0.06] text-[#C8A762]" : "border-[#C8A762] bg-amber-50 text-amber-800"}`}>
                🖊 تعديل مطلوب: {a}
              </div>
            ))}
          </div>
        )}

        {/* Structured memo blocks */}
        <div className="space-y-2">
          {sections.slice(0, visible).map((section, i) => (
            <MemoBlock
              key={section.id}
              section={section}
              isDark={isDark}
              index={i}
              amendments={sectionAmendments[section.id] ?? []}
              onApplyAmendment={applySectionAmendment}
            />
          ))}
        </div>

        {/* Downloads */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button className="flex items-center justify-center gap-2 rounded-xl border py-2.5 text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] col-span-2 hover:bg-[#0a3328]">
            <DownloadSimple size={14} />تنزيل Word
          </button>
          <button className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-[12px] font-bold transition-all ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-zinc-200 bg-white text-zinc-600"}`}>
            <DownloadSimple size={14} />PDF
          </button>
        </div>
      </BetaReviewGate>
    </motion.div>
  );
}
