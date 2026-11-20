"use client";
import { motion, AnimatePresence } from "framer-motion";
import React, { useState, useRef } from "react";
import {
  Sword, Scales, Brain, SpeakerHigh, MagnifyingGlass,
  FileArrowUp, X, FileText, HandFist, Gavel,
  Buildings, User, UserFocus, Briefcase, Notebook, ArrowLeft,
  Check, CaretDown, Warning, ArrowsCounterClockwise,
  Spinner, PaperPlaneTilt, Sparkle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { VoiceInput } from "@/components/ui/VoiceInput";
import ConsultantGate from "@/components/dashboard/ConsultantGate";
import { useToolUsable } from "@/hooks/useToolUsable";
import { useOrderAttachments } from "@/hooks/useOrderAttachments";
import { createServiceOrder } from "@/lib/services/serviceOrders";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import {
  validateWargamingIntake, WARGAMING_CRITIQUE_TARGET, WARGAMING_AREA_OTHER, MAX_AREA_OTHER_LENGTH,
} from "@/lib/services/orderIntake.wargaming";
import type { OrderAttachment } from "@/lib/services/orderIntake";
import { LEGAL_TAXONOMY } from "@/constants/taxonomies";
import { useAiRun } from "@/hooks/useAiRun";
import { useToolDraft } from "@/hooks/useToolDraft";
import { draftChoice, draftText, draftTextList } from "@/lib/payments/topUpDraft";
import { AiThinkingStage } from "@/components/ai/AiThinkingStage";
import { aiToolLabelAr } from "@/lib/ai/toolLabels";
import { RUN_HELD_MESSAGE_AR } from "@/lib/ai/runPageView";
import { RUN_STILL_RUNNING_CODE } from "@/lib/ai/aiRunClient";
import { aiSkippedNote, pasteState, splitAiReadable, withTextAccept } from "@/components/ai/aiReadable";
import { AI_TEXT_FILES_ON } from "@/lib/ai/aiTextFilesFlag";
import { AttachmentPreviewButton } from "@/components/attachments/AttachmentPreviewModal";
import { WARGAMING_PASTE_MAX, WARGAMING_PASTE_MIN, WARGAMING_PRICE, WARGAMING_SINGLE_TARGET_PRICE, WAVE4_FILES, wargamingPrice } from "@/lib/ai/tools";
import { asSimResult } from "./_simResult";
import SimResultView from "./_SimResultView";
import FounderCreditChoice from "@/components/membership/FounderCreditChoice";
import { founderCreditChoiceKey, FOUNDER_CREDIT_PRICE_TEXT } from "@/lib/membership/founderPlan";

const WARGAMING_FILE_ACCEPT = withTextAccept(".pdf,.doc,.docx,.jpg,.png", AI_TEXT_FILES_ON);

// ─── Types ─────────────────────────────────────────────────────────────────────
type SimTarget  = "opponent" | "court" | "critique" | "plea";
type CaseRole   = "plaintiff" | "defendant" | "advisor";
// A LEGAL_TAXONOMY section id (SA-00 … SA-99) or WARGAMING_AREA_OTHER.
type CaseArea   = string;

interface CaseContext {
  role: CaseRole | "";
  area: CaseArea | "";
  /** The specialty in the client's own words — used only when area is «أخرى». */
  areaOther: string;
  summary: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const SIM_TARGETS: { id: SimTarget; label: string; sub: string; icon: typeof Sword; color: string; grad: string }[] = [
  { id:"opponent", label:"محاكاة الخصم",    sub:"هجماته ودفوعه المتوقعة",     icon:HandFist,        color:"text-red-400",    grad:"from-red-700 to-red-500"     },
  { id:"court",    label:"اتجاه المحكمة",  sub:"ما ستفحصه المحكمة وأسئلتها",  icon:Scales,          color:"text-amber-400",  grad:"from-amber-600 to-amber-400" },
  { id:"critique", label:"نقض المذكرة",    sub:"ثغرات كاشف الصياغة",           icon:MagnifyingGlass, color:"text-purple-400", grad:"from-purple-700 to-purple-500"},
  { id:"plea",     label:"تدريب المرافعة", sub:"سكريبت وأداء الجلسة",          icon:SpeakerHigh,     color:"text-blue-400",   grad:"from-blue-700 to-blue-500"   },
];

const CASE_ROLES: { id: CaseRole; label: string; icon: typeof Gavel }[] = [
  { id:"plaintiff", label:"مدّعٍ / موكلي مدّعٍ",  icon:HandFist  },
  { id:"defendant", label:"مدّعى عليه / دفاع",     icon:Gavel     },
  { id:"advisor",   label:"مستشار / محكّم / مراجع", icon:Brain     },
];

// Owner test 28-9 (T28-32): the picker offered 8 hand-picked areas; the owner
// asked for all 31 sections plus «أخرى». The list IS LEGAL_TAXONOMY — the
// platform's one specialisation vocabulary (owner ruling on س٥) — in its own
// order, stored by SA-xx id. The admin brief resolves the same ids from the
// same list (src/lib/services/intakeValues.ts), which also keeps the previous
// eight ids readable for orders placed before this change.
const CASE_AREAS: { id: CaseArea; label: string }[] = [
  ...LEGAL_TAXONOMY.map(c => ({ id: c.id, label: c.label })),
  { id: WARGAMING_AREA_OTHER, label: "أخرى" },
];

/** What the recap and the order title call the chosen specialty — the client's own words for «أخرى». */
function caseAreaLabel(ctx: CaseContext): string {
  // «أخرى» with nothing typed names no specialty: the run and the order send none.
  if (ctx.area === WARGAMING_AREA_OTHER) return ctx.areaOther.trim();
  return CASE_AREAS.find(a => a.id === ctx.area)?.label ?? "";
}

// ─── Case Setup ────────────────────────────────────────────────────────────────
function CaseSetup({
  D, ctx, setCtx, onNext, user,
  attachments, uploading, attachError, attachFile, removeAttachment,
}: {
  D:boolean; ctx:CaseContext; setCtx:(c:CaseContext)=>void; onNext:()=>void;
  user: ReturnType<typeof useUser>;
  attachments: OrderAttachment[]; uploading: boolean; attachError: string;
  attachFile: (file: File) => Promise<OrderAttachment>;
  removeAttachment: (documentId: string) => void;
}) {
  const inp = `w-full rounded-xl border px-4 py-3 text-[13px] outline-none resize-none ${D?"border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600":"border-zinc-200 bg-zinc-50/80 text-zinc-800 placeholder:text-zinc-400"}`;
  const card = `rounded-2xl border ${D?"bg-zinc-900 border-white/[0.07]":"bg-white border-zinc-200/70"}`;
  const fRef = useRef<HTMLInputElement>(null);
  const UserIcon = user.userType==="firm"?Buildings:user.userType==="lawyer"?UserFocus:User;
  const isOtherArea = ctx.area===WARGAMING_AREA_OTHER;
  const canNext = ctx.role!==""&&ctx.summary.trim().length>=20&&!uploading;
  // 32 chips do not fit a phone screen as one wall, so the list scrolls and a
  // filter narrows it. «أخرى» stays visible whatever the filter says: it is
  // the way out when the client's specialty is not among the 31.
  const [areaQuery, setAreaQuery] = useState("");
  const aq = areaQuery.trim();
  const visibleAreas = CASE_AREAS.filter(a => a.id===WARGAMING_AREA_OTHER || !aq || a.label.includes(aq));
  const selectedHidden = ctx.area!=="" && !visibleAreas.some(a => a.id===ctx.area);

  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="space-y-4">
      {/* User welcome */}
      <div className={`${card} p-5`}>
        <div className={`flex items-center gap-3 mb-4 pb-4 border-b ${D?"border-white/[0.06]":"border-zinc-100"}`}>
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-[#1a6b50] flex items-center justify-center"><UserIcon size={18} weight="duotone" className="text-[#C8A762]"/></div>
          <div>
            <p className={`text-[13px] font-bold ${D?"text-zinc-100":"text-zinc-800"}`}>
              {user.userType==="lawyer"?`المحامي ${user.name}`:user.userType==="firm"?`مكتب المحاماة — ${user.name}`:user.name||"المستخدم"}
            </p>
            <p className={`text-[11px] ${D?"text-zinc-500":"text-zinc-400"}`}>{user.userType==="firm"?"شركة محاماة":user.userType==="lawyer"?"محامي فرد":"مستخدم"} · باقة {user.tier.toUpperCase()}</p>
          </div>
          <span className={`ms-auto text-[10px] font-bold px-2 py-0.5 rounded-full border ${D?"border-purple-700/30 bg-purple-900/15 text-purple-400":"border-purple-200 bg-purple-50 text-purple-700"}`}>متاح ضمن الباقة</span>
        </div>
        <p className={`text-[12px] font-bold mb-3 ${D?"text-zinc-400":"text-zinc-500"}`}>موقفك في القضية</p>
        <div className="grid grid-cols-3 gap-2">
          {CASE_ROLES.map(r=>{const Icon=r.icon;const active=ctx.role===r.id;return(
            <button key={r.id} onClick={()=>setCtx({...ctx,role:r.id})}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${active?"bg-[#0B3D2E] border-[#0B3D2E] text-white":D?"border-white/[0.07] bg-zinc-800/40 text-zinc-400 hover:border-white/20":"border-zinc-200 text-zinc-500 hover:border-zinc-300"}`}>
              <Icon size={16} weight="duotone"/><p className="text-[11px] font-semibold leading-tight">{r.label}</p>
            </button>
          );})}
        </div>
      </div>

      {/* Area */}
      <div className={`${card} p-5`}>
        <p className={`text-[12px] font-bold mb-3 ${D?"text-zinc-400":"text-zinc-500"}`}>تخصص القضية (اختياري)</p>
        <div className="relative mb-3">
          <MagnifyingGlass size={14} className={`absolute inset-y-0 end-3 my-auto pointer-events-none ${D?"text-zinc-500":"text-zinc-400"}`}/>
          <input value={areaQuery} onChange={e=>setAreaQuery(e.target.value)}
            placeholder="ابحث بين الأقسام الـ٣١…" aria-label="ابحث عن تخصص القضية"
            className={`w-full rounded-xl border pe-9 ps-3 py-2 text-[12px] outline-none ${D?"border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-500":"border-zinc-200 bg-zinc-50/80 text-zinc-800 placeholder:text-zinc-400"}`}/>
        </div>
        {selectedHidden && (
          <p className={`mb-2 text-[11px] ${D?"text-zinc-400":"text-zinc-500"}`}>
            المختار: <span className="font-bold text-[#C8A762]">{caseAreaLabel(ctx)}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto p-0.5" role="radiogroup" aria-label="تخصص القضية">
          {visibleAreas.map(a=>(
            <button key={a.id} type="button" role="radio" aria-checked={ctx.area===a.id}
              onClick={()=>setCtx({...ctx,area:a.id,areaOther:a.id===WARGAMING_AREA_OTHER?ctx.areaOther:""})}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all ${ctx.area===a.id?"bg-[#C8A762] border-[#C8A762] text-[#0B3D2E]":D?"border-white/[0.07] text-zinc-400 hover:border-white/20":"border-zinc-200 text-zinc-500 hover:border-zinc-300"}`}>
              {a.label}
            </button>
          ))}
        </div>
        {aq && visibleAreas.length===1 && (
          <p className={`mt-2 text-[11px] ${D?"text-zinc-400":"text-zinc-500"}`}>لا يوجد قسم بهذا الاسم — اختر «أخرى» واكتب التخصص.</p>
        )}
        {isOtherArea && (
          <div className="mt-3 space-y-1.5">
            <input value={ctx.areaOther} onChange={e=>setCtx({...ctx,areaOther:e.target.value})}
              maxLength={MAX_AREA_OTHER_LENGTH} autoFocus
              placeholder="اكتب تخصص القضية، مثل: منازعات الأوقاف"
              aria-label="تخصص القضية (أخرى)"
              className={inp}/>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className={`${card} p-5 space-y-3`}>
        <p className={`text-[12px] font-bold ${D?"text-zinc-400":"text-zinc-500"}`}>ملخص القضية والوقائع</p>
        {attachments.length>0?(
          <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 border ${D?"border-emerald-700/30 bg-emerald-900/10":"border-emerald-200 bg-emerald-50"}`}>
            <FileText size={14} className="text-emerald-500"/>
            <span className={`flex-1 truncate text-[12px] ${D?"text-emerald-300":"text-emerald-700"}`}>{attachments[0].name}</span>
            <AttachmentPreviewButton documentId={String(attachments[0].documentId)} name={attachments[0].name} className="text-emerald-500"/>
            <button onClick={()=>removeAttachment(attachments[0].documentId)}><X size={13} className="text-emerald-500"/></button>
          </div>
        ):(
          <div onClick={()=>{if(!uploading)fRef.current?.click();}}
            className={`rounded-xl border-2 border-dashed p-3 flex items-center gap-3 ${uploading?"opacity-60":"cursor-pointer"} ${D?"border-white/[0.08] hover:border-[#C8A762]/30":"border-zinc-200 hover:border-[#C8A762]/40"}`}>
            <input ref={fRef} type="file" className="hidden" accept={WARGAMING_FILE_ACCEPT} disabled={uploading}
              onChange={async e=>{
                const f=e.target.files?.[0];
                if(!f)return;
                try { await attachFile(f); } catch { /* attachError is set inside the hook and rendered below */ }
              }}/>
            {uploading ? (
              <motion.div animate={{rotate:360}} transition={{duration:1,repeat:Infinity,ease:"linear"}}>
                <Spinner size={18} className={D?"text-zinc-500":"text-zinc-400"}/>
              </motion.div>
            ) : (
              <FileArrowUp size={18} className={D?"text-zinc-600":"text-zinc-400"}/>
            )}
            <div>
              <p className={`text-[12px] font-semibold ${D?"text-zinc-400":"text-zinc-600"}`}>{uploading?"جارٍ رفع الملف...":"ارفع ملف القضية (اختياري)"}</p>
              <p className={`text-[10px] ${D?"text-zinc-600":"text-zinc-400"}`}>PDF · Word · صور</p>
            </div>
          </div>
        )}
        {attachError && (
          <p className="flex items-center gap-1.5 text-[11px] text-red-500">
            <Warning size={12}/>{attachError}
          </p>
        )}
        <div className="relative">
          <textarea value={ctx.summary} onChange={e=>setCtx({...ctx,summary:e.target.value})}
            placeholder={`اشرح ${ctx.role==="plaintiff"?"موقفك كمدّعٍ":ctx.role==="defendant"?"موقفك في الدفاع":"قضيتك للتحليل"}: الأطراف · الوقائع · الأدلة المتوفرة...`}
            rows={5} className={inp}/>
          <div className="absolute bottom-3 start-3">
            <VoiceInput onTranscript={t=>setCtx({...ctx,summary:ctx.summary?(ctx.summary+" "+t):t})} compact/>
          </div>
        </div>
        {ctx.summary.length>0&&ctx.summary.length<20&&<p className="text-[11px] text-amber-500">أضف المزيد من التفاصيل (٢٠ حرفاً على الأقل)</p>}
      </div>

      <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} onClick={onNext} disabled={!canNext}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] py-3.5 text-[13px] font-bold text-white disabled:opacity-40 shadow-lg">
        <Brain size={15}/>التالي: اختر أهداف المحاكاة<ArrowLeft size={14}/>
      </motion.button>
    </motion.div>
  );
}

// ─── Target Selection (Step 2) ─────────────────────────────────────────────────
function TargetSelect({
  D, ctx, targets, setTargets, onRun, onBack,
  attachments, memoText, setMemoText, docsText, setDocsText,
  memoAttachmentIds, uploading, attachError, attachMemoFile, removeMemoAttachment, aiUsable,
}: {
  D:boolean; ctx:CaseContext;
  /** tool-status: the AI simulation's price shows only once the server says this caller may run it. */
  aiUsable: boolean;
  targets:Set<SimTarget>; setTargets:(t:Set<SimTarget>)=>void;
  onRun:()=>void; onBack:()=>void;
  attachments: OrderAttachment[];
  memoText: string; setMemoText: (v:string)=>void;
  docsText: string; setDocsText: (v:string)=>void;
  // memoAttachmentIds is the subset of documentIds (from the shared
  // attachments list) that the client tagged specifically as the memo via
  // this section's own dropzone — NOT every attachment on the order. A case
  // file uploaded in step 1 must not silently satisfy "provide the memo".
  memoAttachmentIds: string[];
  uploading: boolean; attachError: string;
  attachMemoFile: (file: File) => Promise<OrderAttachment>;
  removeMemoAttachment: (documentId: string) => void;
}) {
  const areaLabel = caseAreaLabel(ctx);
  const roleLabel  = CASE_ROLES.find(r=>r.id===ctx.role)?.label??"";
  const hasCritique = targets.has(WARGAMING_CRITIQUE_TARGET);
  const memoFileRef = useRef<HTMLInputElement>(null);
  const memoFiles = attachments.filter(a => memoAttachmentIds.includes(a.documentId));
  const memoSatisfied = memoText.trim().length>0 || memoAttachmentIds.length>0;
  const docsPaste = pasteState(docsText, { min: WARGAMING_PASTE_MIN, max: WARGAMING_PASTE_MAX });
  const [docsOpen, setDocsOpen] = useState(docsText !== "");

  function toggle(t:SimTarget) {
    const n = new Set(targets);
    n.has(t) ? n.delete(t) : n.add(t);
    setTargets(n);
  }

  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="space-y-4">
      {/* Context recap */}
      <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 flex-wrap ${D?"border-[#C8A762]/15 bg-[#C8A762]/5":"border-amber-100 bg-amber-50/60"}`}>
        <Briefcase size={14} className="text-[#C8A762] flex-shrink-0"/>
        <p className={`text-[12px] flex-1 ${D?"text-zinc-300":"text-zinc-600"}`}>
          {areaLabel && <><span className="font-bold text-[#C8A762]">{areaLabel}</span> · </>}{roleLabel}
          {attachments.length>0 && <span className="ms-1 opacity-60">· {attachments[0].name}</span>}
        </p>
        <button onClick={onBack} className={`text-[10px] font-semibold ${D?"text-zinc-500 hover:text-zinc-300":"text-slate-400 hover:text-slate-600"}`}>← تعديل</button>
      </div>

      <p className={`text-[13px] font-bold ${D?"text-zinc-200":"text-zinc-700"}`}>اختر ما تريد محاكاته:</p>
      <p className={`text-[11px] -mt-2 ${D?"text-zinc-500":"text-slate-400"}`}>يمكنك اختيار أكثر من هدف — سيراجع الفريق كل هدف تختاره على حدة</p>

      {/* Target chips grid */}
      <div className="grid grid-cols-2 gap-3">
        {SIM_TARGETS.map(t => {
          const Icon = t.icon;
          const active = targets.has(t.id);
          return (
            <motion.button key={t.id} whileHover={{scale:1.02}} whileTap={{scale:0.97}}
              onClick={()=>toggle(t.id)}
              className={`flex items-center gap-3 rounded-2xl border p-4 text-right transition-all ${
                active
                  ? `bg-gradient-to-br ${t.grad} border-transparent text-white shadow-lg`
                  : D?"border-white/[0.07] bg-zinc-900/60 hover:border-white/[0.14]":"border-zinc-200 bg-white hover:border-zinc-300"
              }`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${active?"bg-white/20":"bg-white/5" }`}>
                <Icon size={17} weight="duotone" className={active?"text-white":t.color}/>
              </div>
              <div className="text-right flex-1">
                <p className={`text-[12px] font-bold ${active?"text-white":D?"text-zinc-200":"text-zinc-800"}`}>{t.label}</p>
                <p className={`text-[10px] ${active?"text-white/70":D?"text-zinc-500":"text-slate-400"}`}>{t.sub}</p>
              </div>
              {active && <Check size={14} className="text-white flex-shrink-0"/>}
            </motion.button>
          );
        })}
      </div>

      {/* Select all / none */}
      <div className={`flex items-center gap-3 text-[11px] font-semibold ${D?"text-zinc-500":"text-slate-400"}`}>
        <button onClick={()=>setTargets(new Set(SIM_TARGETS.map(t=>t.id)))} className="hover:text-[#C8A762]">تحديد الكل</button>
        <span>·</span>
        <button onClick={()=>setTargets(new Set())} className="hover:text-red-400">إلغاء الكل</button>
        <span className="ms-auto">{targets.size} من {SIM_TARGETS.length} محددة</span>
      </div>
      {/* R1: the AI simulation is 75 points for one target, 150 for two or more (tools.ts wargamingPrice). */}
      {aiUsable && (
      <p className={`text-[11px] ${D?"text-zinc-400":"text-slate-500"}`}>
        المحاكاة الفورية: هدف واحد {WARGAMING_SINGLE_TARGET_PRICE.toLocaleString("ar-SA")} نقطة · هدفان فأكثر {WARGAMING_PRICE.toLocaleString("ar-SA")} نقطة
      </p>
      )}

      {/* Memo — required only when نقض المذكرة is selected; the target
          implies the client supplies the memo being critiqued. Either pasted
          text or an uploaded file satisfies it (owners field-tested the
          text-only textarea and found clients hold the memo as a PDF, not
          text they can paste) — both feed the same shared attachments list
          from useOrderAttachments() up in AIWargamingPage, so a file
          attached here reaches the order payload exactly like the case-file
          upload in step 1 does. */}
      {hasCritique && (
        <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} className="overflow-hidden">
          <div className={`rounded-2xl border p-4 space-y-2 ${D?"border-purple-700/25 bg-purple-900/8":"border-purple-200 bg-purple-50/60"}`}>
            <div className="flex items-center gap-2">
              <Notebook size={14} className="text-purple-400"/>
              <p className={`text-[12px] font-bold ${D?"text-zinc-200":"text-zinc-700"}`}>المذكرة المراد نقضها</p>
            </div>
            <p className={`text-[11px] ${D?"text-zinc-500":"text-slate-500"}`}>
              الصق نص المذكرة، أو ارفع ملفها — يكفي أحدهما.
            </p>
            <textarea value={memoText} onChange={e=>setMemoText(e.target.value)}
              placeholder="الصق نص المذكرة كاملاً هنا..." rows={6}
              className={`w-full resize-none rounded-xl border px-3 py-2.5 text-[12px] outline-none ${D?"border-white/[0.07] bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600":"border-purple-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`}/>

            {memoFiles.length>0 && (
              <div className="space-y-1.5">
                {memoFiles.map(a=>(
                  <div key={a.documentId} className={`flex items-center gap-2 rounded-xl px-3 py-2 border ${D?"border-emerald-700/30 bg-emerald-900/10":"border-emerald-200 bg-emerald-50"}`}>
                    <FileText size={13} className="text-emerald-500"/>
                    <span className={`flex-1 truncate text-[11px] ${D?"text-emerald-300":"text-emerald-700"}`}>{a.name}</span>
                    <AttachmentPreviewButton documentId={String(a.documentId)} name={a.name} size={12} className="text-emerald-500"/>
                    <button onClick={()=>removeMemoAttachment(a.documentId)}><X size={12} className="text-emerald-500"/></button>
                  </div>
                ))}
              </div>
            )}

            <div onClick={()=>{if(!uploading)memoFileRef.current?.click();}}
              className={`rounded-xl border-2 border-dashed p-2.5 flex items-center gap-2.5 ${uploading?"opacity-60":"cursor-pointer"} ${D?"border-white/[0.08] hover:border-[#C8A762]/30":"border-zinc-200 hover:border-[#C8A762]/40"}`}>
              <input ref={memoFileRef} type="file" className="hidden" accept={WARGAMING_FILE_ACCEPT} disabled={uploading}
                onChange={async e=>{
                  const f=e.target.files?.[0];
                  if(!f)return;
                  try { await attachMemoFile(f); } catch { /* attachError is set inside the hook and rendered below */ }
                  e.target.value = "";
                }}/>
              {uploading ? (
                <motion.div animate={{rotate:360}} transition={{duration:1,repeat:Infinity,ease:"linear"}}>
                  <Spinner size={15} className={D?"text-zinc-500":"text-zinc-400"}/>
                </motion.div>
              ) : (
                <FileArrowUp size={15} className={D?"text-zinc-600":"text-zinc-400"}/>
              )}
              <p className={`text-[11px] font-semibold ${D?"text-zinc-400":"text-zinc-600"}`}>{uploading?"جارٍ رفع الملف...":"أو ارفع ملف المذكرة (PDF · Word · صورة)"}</p>
            </div>

            {attachError && (
              <p className="flex items-center gap-1.5 text-[11px] text-red-500">
                <Warning size={12}/>{attachError}
              </p>
            )}
            {!memoSatisfied && (
              <p className="flex items-center gap-1.5 text-[11px] text-amber-500">
                <Warning size={12}/>المذكرة المراد نقضها غير موجودة — أدخل نصها أو ارفع ملفها هنا تحديداً
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* Only with AI_TEXT_FILES_ON. The team order carries files and the fields
          above (validateWargamingIntake keeps no pasted documents), so the box
          says who reads it. */}
      {AI_TEXT_FILES_ON && (
        <div className={`rounded-2xl border p-4 space-y-2 ${D?"border-white/[0.07] bg-zinc-900/60":"border-zinc-200 bg-white"}`}>
          <button type="button" onClick={()=>setDocsOpen(!docsOpen)} aria-expanded={docsOpen}
            className={`flex w-full items-center justify-between text-[12px] font-bold ${D?"text-zinc-200":"text-zinc-700"}`}>
            أو الصق نص المستندات
            <CaretDown size={13} className={docsOpen?"rotate-180":""}/>
          </button>
          {docsOpen && (
            <div className="space-y-1.5">
              <p className={`text-[11px] ${D?"text-zinc-400":"text-zinc-500"}`}>للمحاكاة الفورية فقط — طلب الفريق يأخذ الملفات المرفوعة.</p>
              <textarea value={docsText} onChange={e=>setDocsText(e.target.value)} rows={6} dir="auto"
                aria-label="نص المستندات" placeholder="الصق نص المستندات هنا..."
                className={`w-full resize-none rounded-xl border px-3 py-2.5 text-[12px] outline-none ${D?"border-white/[0.07] bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600":"border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400"}`}/>
              <p className={`text-[11px] ${docsPaste.tooLong?"text-red-500":D?"text-zinc-400":"text-zinc-500"}`}>
                {docsPaste.chars.toLocaleString("ar-SA")} / {WARGAMING_PASTE_MAX.toLocaleString("ar-SA")}
              </p>
              {docsPaste.tooShort && <p className="text-[11px] text-amber-500">النص الملصق قصير — الصق المستندات كاملة (٥٠ حرفاً على الأقل)</p>}
              {docsPaste.tooLong && <p className="text-[11px] text-red-500">النص الملصق أطول من ٣٠٬٠٠٠ حرف — ارفعه ملفاً</p>}
            </div>
          )}
        </div>
      )}

      <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} onClick={onRun} disabled={targets.size===0}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] py-3.5 text-[13px] font-bold text-white disabled:opacity-40 shadow-lg">
        <PaperPlaneTilt size={15} weight="duotone"/>مراجعة الطلب وإرساله
      </motion.button>
    </motion.div>
  );
}

// ─── Submit step (Step 3) ───────────────────────────────────────────────────────
// The real replacement for the old "simulating → results" theatre. Every row
// below is a read-only recap of a value already collected in steps 1–2 and
// included verbatim in buildIntake() — nothing here is a control whose value
// fails to reach the order payload.
function SubmitReview({
  D, ctx, areaLabel, roleLabel, targets, memoText, memoAttachmentIds, attachments,
  submitting, submitErrors, onBack, onSubmit,
}: {
  D:boolean; ctx:CaseContext; areaLabel:string; roleLabel:string;
  targets:Set<SimTarget>; memoText:string; memoAttachmentIds:string[]; attachments:OrderAttachment[];
  submitting:boolean; submitErrors:string[];
  onBack:()=>void; onSubmit:()=>void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const card = D ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const hasCritique = targets.has(WARGAMING_CRITIQUE_TARGET);
  const selectedTargets = SIM_TARGETS.filter(t => targets.has(t.id));

  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="space-y-4">
      <div className={`${card} p-5 space-y-5`}>
        <div>
          <h2 className={`text-[15px] font-bold ${D?"text-white":"text-zinc-900"}`}>مراجعة الطلب وإرساله</h2>
          <p className={`text-[12px] ${D?"text-zinc-500":"text-zinc-400"}`}>
            سيراجع فريق نظامي بيانات القضية والأهداف المحددة يدوياً ويُعدّ لك تحليلاً مكتوباً، وسيصلك إشعار عند جهوزيته.
          </p>
        </div>

        <dl className="space-y-2">
          <div className="flex gap-3 text-[12px]">
            <dt className={D?"text-zinc-500 w-32 shrink-0":"text-zinc-400 w-32 shrink-0"}>صفة الموكل</dt>
            <dd className={D?"text-zinc-200":"text-zinc-800"}>{roleLabel || "—"}</dd>
          </div>
          <div className="flex gap-3 text-[12px]">
            <dt className={D?"text-zinc-500 w-32 shrink-0":"text-zinc-400 w-32 shrink-0"}>تخصص القضية</dt>
            <dd className={D?"text-zinc-200":"text-zinc-800"}>{areaLabel || "—"}</dd>
          </div>
          <div className="flex gap-3 text-[12px]">
            <dt className={D?"text-zinc-500 w-32 shrink-0":"text-zinc-400 w-32 shrink-0"}>ملخص القضية</dt>
            <dd className={D?"text-zinc-200":"text-zinc-800"}>{ctx.summary.slice(0,150)}{ctx.summary.length>150?"…":""}</dd>
          </div>
          <div className="flex gap-3 text-[12px]">
            <dt className={D?"text-zinc-500 w-32 shrink-0":"text-zinc-400 w-32 shrink-0"}>أهداف المحاكاة</dt>
            <dd className={D?"text-zinc-200":"text-zinc-800"}>
              {selectedTargets.length>0 ? selectedTargets.map(t=>t.label).join(" · ") : "—"}
            </dd>
          </div>
          {hasCritique && (
            <div className="flex gap-3 text-[12px]">
              <dt className={D?"text-zinc-500 w-32 shrink-0":"text-zinc-400 w-32 shrink-0"}>المذكرة المراد نقضها</dt>
              <dd className={(memoText.trim() || memoAttachmentIds.length>0) ? (D?"text-zinc-200":"text-zinc-800") : "text-amber-500"}>
                {memoText.trim()
                  ? `${memoText.trim().slice(0,150)}${memoText.trim().length>150?"…":""}`
                  : memoAttachmentIds.length>0
                    ? "أُرفق ملف المذكرة — راجع المرفقات أدناه"
                    : "لم تُدرِج نص المذكرة ولم ترفق ملفها بعد — عد للخطوة السابقة لإضافة إحداهما قبل الإرسال"}
              </dd>
            </div>
          )}
        </dl>

        {attachments.length>0 && (
          <div className="space-y-1.5">
            <p className={`text-[12px] font-semibold ${D?"text-zinc-300":"text-zinc-700"}`}>المرفقات ({attachments.length})</p>
            {attachments.map(a=>(
              <div key={a.documentId} className={`flex items-center gap-2 text-[11px] ${D?"text-zinc-400":"text-zinc-500"}`}>
                <FileText size={12}/>{a.name}
              </div>
            ))}
          </div>
        )}

        {submitErrors.length>0 && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 space-y-1">
            {submitErrors.map(e=>(
              <p key={e} className="flex items-center gap-1.5 text-[11px] text-red-500">
                <Warning size={12}/>{e}
              </p>
            ))}
          </div>
        )}

        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-0.5"/>
          <span className={`text-[11px] ${D?"text-zinc-400":"text-zinc-500"}`}>
            أقر بأن البيانات المدخلة صحيحة، وأوافق على إرسالها لفريق نظامي لإعداد التحليل.
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-semibold border transition-colors ${D?"border-white/[0.07] bg-zinc-800 text-zinc-300":"border-zinc-200 bg-white text-zinc-600"}`}>
            <ArrowLeft size={13} className="rotate-180"/>السابق
          </button>
          <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} onClick={onSubmit} disabled={!confirmed||submitting}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] py-3 text-[13px] font-bold text-white disabled:opacity-40 shadow-lg">
            <PaperPlaneTilt size={15}/>{submitting?"جارٍ الإرسال...":"إرسال الطلب"}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Map a thrown submitOrder error to Arabic user-facing copy. The underlying
 * message (which may be English — "Unauthorized", a raw Postgres error,
 * etc.) is logged for developers via console.error but never shown to the
 * user. Mirrors useDraftState.ts's submitErrorMessageAr.
 */
function submitErrorMessageAr(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  console.error("[AIWargamingPage] submitOrder failed:", raw);
  if (raw === "Unauthorized") {
    return "انتهت جلستك — يرجى تسجيل الدخول مجدداً ثم إعادة المحاولة.";
  }
  return "تعذّر إرسال الطلب — حاول مجدداً";
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
/** Art. 18 (owner ١٧٣ / ٢١٩): a consultant gets the lock panel instead of this tool. */
export default function AIWargamingRoute() {
  return (
    <ConsultantGate>
      <AIWargamingPage />
    </ConsultantGate>
  );
}

function AIWargamingPage() {
  const { isDark:D } = useTheme();
  const user = useUser();

  // Owner ٣٨ (18 Nov 2026): the old mock simulation (an outcome prediction
  // and invented probabilities) is deleted, with its
  // "simulating" / "results" steps. "submit" sends the team order and runs
  // the real AI simulation (SimResultView).
  type PageStep = "setup" | "targets" | "submit";
  const [step,    setStep]    = useState<PageStep>("setup");
  const [ctx,     setCtx]     = useState<CaseContext>({ role:"", area:"", areaOther:"", summary:"" });
  const [targets, setTargets] = useState<Set<SimTarget>>(new Set(["opponent","court"]));
  const [memoText, setMemoText] = useState("");
  const [docsText, setDocsText] = useState("");
  // documentIds from the shared attachments list that were uploaded via the
  // memo-specific dropzone in TargetSelect — distinct from "any attachment
  // on the order" so an unrelated case file from step 1 can never silently
  // satisfy "the client supplied the memo".
  const [memoAttachmentIds, setMemoAttachmentIds] = useState<string[]>([]);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitErrors,  setSubmitErrors]  = useState<string[]>([]);
  // l11 (T8-Q511a): back from a top-up, the case, the targets and the pasted
  // texts on the last step (uploaded files are attached again)
  useToolDraft("wargaming", (d) => {
    const summary = draftText(d, "summary");
    if (!summary) return;
    const role = draftChoice(d, "role", CASE_ROLES.map((r) => r.id)) ?? "";
    setCtx((cur) => (cur.summary ? cur : { role, area: draftText(d, "area") ?? "", areaOther: draftText(d, "areaOther") ?? "", summary }));
    const known = SIM_TARGETS.map((t) => t.id as string);
    const picked = (draftTextList(d, "targets", 4) ?? []).filter((t) => known.includes(t)) as SimTarget[];
    if (picked.length > 0) setTargets(new Set(picked));
    const memo = draftText(d, "memoText");
    if (memo) setMemoText((cur) => cur || memo);
    const docs = draftText(d, "docsText");
    if (docs) setDocsText((cur) => cur || docs);
    setStep("submit");
  });

  const {
    attachments, uploading, attachError, attachFile, removeAttachment, clearAttachError,
  } = useOrderAttachments();

  // L9 (plan §5, wave 4): beside the team order, the same case can be
  // simulated at once by the `wargaming` job (owner ٤٠٩ / R1: 75 points for one
  // target, 150 for two or more — wargamingPrice, the same count the server charges). Only PDF and image
  // files go to it; a memo counts for «نقض المذكرة» only if it is one of them.
  const ai = useAiRun();
  // tool-status before the AI simulation's box and price (owner ٤١٧, 8 Nov:
  // lawyers and firms; the mode still decides). The team order does not depend on it.
  const aiUsable = useToolUsable("wargaming");
  // P3: a founder lawyer may spend his one independent output on the
  // simulation instead of points. A consultant never gets here (ConsultantGate),
  // so the choice is never offered where the run would be refused.
  const [useCredit, setUseCredit] = useState(false);
  const simResult = ai.phase === "done" ? asSimResult(ai.output) : null;
  const { ids: aiFileIds, skipped: aiSkipped } = splitAiReadable(attachments, AI_TEXT_FILES_ON);
  const critique = targets.has(WARGAMING_CRITIQUE_TARGET);
  const memoForAi = critique && (memoText.trim() !== "" || memoAttachmentIds.some(id => aiFileIds.includes(id)));
  // Pasted documents travel as one more file, so they need room among the files
  // and must be within limits. An empty box changes nothing.
  const docsPaste = pasteState(AI_TEXT_FILES_ON ? docsText : "", { min: WARGAMING_PASTE_MIN, max: WARGAMING_PASTE_MAX });
  const docsNoRoom = !docsPaste.empty && aiFileIds.length + 1 > WAVE4_FILES.max;
  const docsBlocked = docsPaste.tooShort || docsPaste.tooLong || docsNoRoom;
  const aiBlocked = uploading || ai.busy || targets.size === 0 || (critique && !memoForAi) || docsBlocked;
  const aiPrice = wargamingPrice(Array.from(targets));

  function runAi() {
    if (aiBlocked) return;
    void ai.start(
      "wargaming",
      {
        role: ctx.role,
        area: caseAreaLabel(ctx) || null,
        case_summary: ctx.summary.trim(),
        targets: Array.from(targets),
        memo_text: critique ? memoText.trim() || null : null,
        memo_in_files: critique && memoAttachmentIds.some(id => aiFileIds.includes(id)),
        ...(docsPaste.ok ? { docs_text: docsText.trim() } : {}),
      },
      { fileIds: aiFileIds, ...(useCredit ? { useCredit: true } : {}) },
      { role: ctx.role, area: ctx.area, areaOther: ctx.areaOther, summary: ctx.summary, targets: Array.from(targets), memoText, docsText },
    );
  }

  // Wraps the single shared attachFile/removeAttachment from
  // useOrderAttachments() — still one hook instance, one attachments array —
  // so a file uploaded specifically as the memo is also tagged in
  // memoAttachmentIds, and removing it drops the tag too (otherwise a
  // removed file would keep satisfying the critique gate, the same class of
  // stale-state bug memoText had when critique was deselected).
  async function attachMemoFile(file: File): Promise<OrderAttachment> {
    const attachment = await attachFile(file);
    setMemoAttachmentIds(prev => [...prev, attachment.documentId]);
    return attachment;
  }

  function removeMemoAttachment(documentId: string): void {
    removeAttachment(documentId);
    setMemoAttachmentIds(prev => prev.filter(id => id !== documentId));
  }

  function fullReset() {
    setStep("setup");
    setCtx({role:"",area:"",areaOther:"",summary:""});
    setTargets(new Set(["opponent","court"]));
    setMemoText("");
    setDocsText("");
    setMemoAttachmentIds([]);
    setSubmitErrors([]);
    clearAttachError();
    attachments.forEach(a => removeAttachment(a.documentId));
    ai.reset();
  }

  // For «أخرى» this is the client's own wording — so the recap, the order
  // title below and the team's brief all name the specialty they typed.
  const areaLabel = caseAreaLabel(ctx);
  const roleLabel  = CASE_ROLES.find(r=>r.id===ctx.role)?.label??"";

  function buildIntake(): Record<string, unknown> {
    return {
      schemaVersion: 1,
      service: "wargaming",
      role: ctx.role,
      // No specialty is left out, and so is «أخرى» with nothing typed.
      ...(ctx.area === WARGAMING_AREA_OTHER
        ? (ctx.areaOther.trim() ? { area: ctx.area, areaOther: ctx.areaOther.trim() } : {})
        : (ctx.area ? { area: ctx.area } : {})),
      caseSummary: ctx.summary,
      targets: Array.from(targets),
      // Only send memoText/memoAttachmentIds when critique is actually
      // selected — otherwise a memo typed or attached while critique was
      // toggled on, then left behind after deselecting it, would ship
      // silently in an order that never asked for a memo critique, and the
      // submit-step recap (which only shows this row when critique is
      // selected) would disagree with the payload.
      ...(targets.has(WARGAMING_CRITIQUE_TARGET) && memoText.trim()
        ? { memoText: memoText.trim() } : {}),
      ...(targets.has(WARGAMING_CRITIQUE_TARGET) && memoAttachmentIds.length > 0
        ? { memoAttachmentIds } : {}),
      attachments,
    };
  }

  async function submitOrder() {
    setSubmitErrors([]);
    const intake = buildIntake();
    const check = validateWargamingIntake(intake);
    if (!check.ok) { setSubmitErrors(check.errors); return; }

    setSubmitting(true);
    try {
      const supabase = createBrowserClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { data: profile } = authUser
        ? await supabase.from("profiles").select("display_name, phone, email").eq("id", authUser.id).single()
        : { data: null };

      const order = await createServiceOrder({
        service: "wargaming",
        title: `المحاكي الشامل — ${areaLabel || "عام"}`,
        description: ctx.summary.slice(0, 200),
        intake: check.value as unknown as Record<string, unknown>,
        attachments,
        requester: {
          name: profile?.display_name ?? undefined,
          phone: profile?.phone ?? undefined,
          email: profile?.email ?? undefined,
        },
      });
      window.location.href = `/ai/orders/${order.id}`;
    } catch (err) {
      setSubmitErrors([submitErrorMessageAr(err)]);
    } finally {
      setSubmitting(false);
    }
  }

  const stepLabels: Record<PageStep,string> = {
    setup:"بيانات القضية", targets:"أهداف المحاكاة", submit:"مراجعة وإرسال"
  };
  const stepNums: Record<PageStep,number> = { setup:1, targets:2, submit:3 };

  return (
    <div className={`p-5 md:p-7 max-w-3xl mx-auto space-y-5 ${D?"text-zinc-100":"text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className={`text-xl font-bold ${D?"text-white":"text-zinc-900"}`}>المحاكي الشامل</h1>
        </div>
        <p className={`text-[12px] ${D?"text-zinc-500":"text-zinc-400"}`}>حدد القضية → اختر الأهداف → راجع الطلب وأرسله</p>
      </div>

      {/* Progress steps */}
      <div className={`flex items-center gap-1 p-3 rounded-2xl border ${D?"border-white/[0.05] bg-white/[0.02]":"border-slate-100 bg-slate-50/60"}`}>
        {(["setup","targets","submit"] as const).map((s,i,arr)=>{
          const num = i+1;
          const active = stepNums[step]===num;
          const done   = stepNums[step]>num;
          return (
            <React.Fragment key={s}>
              {/* A completed step is a way back. The other three wizards
                  (/ai/draft, /ai/contracts and the legal-opinion sub-flows)
                  already do this; wargaming was the one indicator still built
                  from plain divs, so a client who mistyped the case summary had
                  to abandon the order. `done` is the gate — never `active`, and
                  never a later step, so this can only ever go backwards and no
                  entered data is discarded. */}
              <button
                type="button"
                onClick={() => { if (done) setStep(s); }}
                disabled={!done}
                aria-current={active ? "step" : undefined}
                aria-label={done ? `الرجوع إلى خطوة ${stepLabels[s]}` : stepLabels[s]}
                className={`flex items-center gap-1.5 flex-1 rounded-lg text-right transition-all ${done?"cursor-pointer hover:opacity-80":"cursor-default"}`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 transition-all ${ done?"bg-emerald-500 text-white":active?`bg-gradient-to-br ${s==="setup"?"from-[#0B3D2E] to-[#1a6b50]":s==="targets"?"from-amber-600 to-amber-400":"from-purple-700 to-purple-500"} text-white`:D?"bg-zinc-800 text-zinc-500":"bg-slate-200 text-slate-400"}`}>
                  {done?<Check size={10} weight="bold"/>:num}
                </div>
                <p className={`text-[10px] font-semibold hidden sm:block ${active||done?D?"text-zinc-200":"text-zinc-700":D?"text-zinc-600":"text-slate-400"}`}>{stepLabels[s]}</p>
              </button>
              {i<arr.length-1&&<div className={`w-6 h-px flex-shrink-0 ${done?D?"bg-emerald-700/60":"bg-emerald-300":D?"bg-zinc-700":"bg-slate-200"}`}/>}
            </React.Fragment>
          );
        })}

        {/* Reset to beginning */}
        {step !== "setup" && (
          <button onClick={fullReset} className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border ms-2 ${D?"border-white/[0.07] text-zinc-600 hover:text-zinc-300":"border-slate-200 text-slate-400 hover:text-slate-600"}`}>
            <ArrowsCounterClockwise size={9}/>من البداية
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {step==="setup" && (
          <motion.div key="setup" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <CaseSetup D={D} ctx={ctx} setCtx={setCtx} user={user} onNext={()=>setStep("targets")}
              attachments={attachments} uploading={uploading} attachError={attachError}
              attachFile={attachFile} removeAttachment={removeAttachment}/>
          </motion.div>
        )}

        {step==="targets" && (
          <motion.div key="targets" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <TargetSelect D={D} ctx={ctx} targets={targets} setTargets={setTargets}
              onRun={()=>setStep("submit")} onBack={()=>setStep("setup")} aiUsable={aiUsable === true}
              attachments={attachments} memoText={memoText} setMemoText={setMemoText}
              docsText={docsText} setDocsText={setDocsText}
              memoAttachmentIds={memoAttachmentIds}
              uploading={uploading} attachError={attachError}
              attachMemoFile={attachMemoFile} removeMemoAttachment={removeMemoAttachment}/>
          </motion.div>
        )}

        {step==="submit" && (
          <motion.div key="submit" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <SubmitReview D={D} ctx={ctx} areaLabel={areaLabel} roleLabel={roleLabel}
              targets={targets} memoText={memoText} memoAttachmentIds={memoAttachmentIds} attachments={attachments}
              submitting={submitting} submitErrors={submitErrors}
              onBack={()=>{setSubmitErrors([]);setStep("targets");}} onSubmit={submitOrder}/>

            {aiUsable === false && (
              <p role="status" className={`mt-4 text-[11px] ${D?"text-zinc-400":"text-zinc-500"}`}>المحاكاة الفورية بالذكاء الاصطناعي غير متاحة لحسابك بعد — أرسل الطلب للفريق أعلاه.</p>
            )}
            {aiUsable === true && (
            <div className={`mt-4 rounded-2xl border p-4 space-y-2 ${D?"border-[#C8A762]/20 bg-[#C8A762]/[0.04]":"border-[#0B3D2E]/15 bg-[#0B3D2E]/[0.03]"}`}>
              <p className={`text-[12px] font-bold ${D?"text-zinc-200":"text-zinc-800"}`}>أو: محاكاة فورية بالذكاء الاصطناعي</p>
              <p className={`text-[11px] leading-relaxed ${D?"text-zinc-400":"text-zinc-500"}`}>
                تُجري المحاكاة على الأهداف المختارة الآن وتعرض النتيجة هنا، وتتحقق المنصة من كل مادة تستند إليها في مكتبة الأنظمة ·
                {" "}{useCredit ? FOUNDER_CREDIT_PRICE_TEXT : `${aiPrice.toLocaleString("ar-SA")} نقطة`} · تُرسل نسخة من الملخص والمرفقات إلى مزوّد ذكاء اصطناعي خارج المملكة.
              </p>
              {aiSkipped.length > 0 && (
                <p className="text-[11px] text-amber-500">
                  {AI_TEXT_FILES_ON
                    ? aiSkippedNote(aiSkipped)
                    : `المحاكاة الفورية تقرأ PDF والصور فقط — لن تُرسل إليها: ${aiSkipped.join("، ")}`}
                </p>
              )}
              {critique && !memoForAi && (
                <p className="text-[11px] text-amber-500">
                  {AI_TEXT_FILES_ON
                    ? "«نقض المذكرة» في المحاكاة الفورية يحتاج نص المذكرة أو ملفها (PDF أو صورة أو Word .docx أو نص)."
                    : "«نقض المذكرة» في المحاكاة الفورية يحتاج نص المذكرة أو ملفها بصيغة PDF أو صورة."}
                </p>
              )}
              {docsPaste.tooShort && <p className="text-[11px] text-amber-500">النص الملصق قصير — الصق المستندات كاملة (٥٠ حرفاً على الأقل)</p>}
              {docsPaste.tooLong && <p className="text-[11px] text-red-500">النص الملصق أطول من ٣٠٬٠٠٠ حرف — ارفعه ملفاً</p>}
              {docsNoRoom && <p className="text-[11px] text-amber-500">النص الملصق يُحسب ملفاً، والحد {WAVE4_FILES.max.toLocaleString("ar-SA")} ملفات — احذف ملفاً أو أفرغ النص.</p>}
              {ai.code !== RUN_STILL_RUNNING_CODE && (<>
              <FounderCreditChoice key={founderCreditChoiceKey(ai.phase, ai.creditUsed, ai.runId)} kind="independent_output"
                value={useCredit} onChange={setUseCredit} isDark={D} disabled={ai.busy}/>
              <button type="button" onClick={runAi} disabled={aiBlocked}
                className={`flex w-full items-center justify-center gap-2 rounded-xl border px-6 py-2.5 text-[13px] font-bold disabled:opacity-40 ${D?"border-[#C8A762]/40 text-[#C8A762]":"border-[#0B3D2E]/30 text-[#0B3D2E]"}`}>
                <Sparkle size={14} weight="fill"/>
                {ai.busy ? "جارٍ المحاكاة… (دقيقة أو أكثر)" : `شغّل المحاكاة الآن (${useCredit ? FOUNDER_CREDIT_PRICE_TEXT : `${aiPrice.toLocaleString("ar-SA")} نقطة`})`}
              </button>
              </>)}
              {ai.phase === "error" && ai.error && <p role="alert" className="text-[11px] text-red-500">{ai.error}</p>}
              {ai.phase === "review" && <p role="status" className={`text-[11px] ${D?"text-zinc-400":"text-zinc-500"}`}>{RUN_HELD_MESSAGE_AR}</p>}
              <AiThinkingStage run={ai} isDark={D} toolLabel={aiToolLabelAr("wargaming")} />
            </div>
            )}

            {simResult && (
              <div className="mt-4">
                <SimResultView result={simResult} isDark={D} chargedPoints={ai.chargedPoints} creditUsed={ai.creditUsed} onReset={ai.reset}/>
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
