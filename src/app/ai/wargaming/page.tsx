"use client";
import { motion, AnimatePresence } from "framer-motion";
import React, { useState, useRef } from "react";
import {
  Sword, Scales, Brain, SpeakerHigh, MagnifyingGlass,
  CheckCircle, FileArrowUp, X, FileText, HandFist, Gavel,
  Buildings, User, UserFocus, Briefcase, Notebook, ArrowLeft, Pencil,
  Plus, PencilSimple, Trash, Check, Copy, CaretDown, Lightbulb,
  Eye, CheckFat, DownloadSimple, Warning, ArrowsCounterClockwise,
  Robot, Microphone, Spinner, PaperPlaneTilt,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { VoiceInput } from "@/components/ui/VoiceInput";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
import { useOrderAttachments } from "@/hooks/useOrderAttachments";
import { createServiceOrder } from "@/lib/services/serviceOrders";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import {
  validateWargamingIntake, WARGAMING_CRITIQUE_TARGET,
} from "@/lib/services/orderIntake.wargaming";
import type { OrderAttachment } from "@/lib/services/orderIntake";

// ─── Types ─────────────────────────────────────────────────────────────────────
type SimTarget  = "opponent" | "court" | "critique" | "plea";
type CaseRole   = "plaintiff" | "defendant" | "advisor";
type CaseArea   = "labor" | "commercial" | "civil" | "criminal" | "family" | "real-estate" | "arbitration" | "admin";
type ItemAction = "add" | "edit" | "delete" | null;

interface CaseContext {
  role: CaseRole | "";
  area: CaseArea | "";
  summary: string;
}

interface SimPoint {
  id: string;
  source: SimTarget;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  counter: string;
  probability?: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const SEV = {
  high:   { dot:"bg-red-500",   badgeD:"border-red-700/20 bg-red-900/10 text-red-400",     badgeL:"border-red-200 bg-red-50 text-red-600",   label:"خطر عالٍ"   },
  medium: { dot:"bg-amber-400", badgeD:"border-amber-700/20 bg-amber-900/10 text-amber-400",badgeL:"border-amber-200 bg-amber-50 text-amber-700",label:"خطر متوسط" },
  low:    { dot:"bg-blue-400",  badgeD:"border-blue-700/20 bg-blue-900/10 text-blue-400",   badgeL:"border-blue-200 bg-blue-50 text-blue-700", label:"تحسين"      },
};

const SIM_TARGETS: { id: SimTarget; label: string; sub: string; icon: typeof Sword; color: string; grad: string }[] = [
  { id:"opponent", label:"محاكاة الخصم",    sub:"هجماته ودفوعه المتوقعة",     icon:HandFist,        color:"text-red-400",    grad:"from-red-700 to-red-500"     },
  { id:"court",    label:"اتجاه المحكمة",  sub:"احتمالية الحكم والسوابق",     icon:Scales,          color:"text-amber-400",  grad:"from-amber-600 to-amber-400" },
  { id:"critique", label:"نقض المذكرة",    sub:"ثغرات كاشف الصياغة",           icon:MagnifyingGlass, color:"text-purple-400", grad:"from-purple-700 to-purple-500"},
  { id:"plea",     label:"تدريب المرافعة", sub:"سكريبت وأداء الجلسة",          icon:SpeakerHigh,     color:"text-blue-400",   grad:"from-blue-700 to-blue-500"   },
];

const CASE_ROLES: { id: CaseRole; label: string; icon: typeof Gavel }[] = [
  { id:"plaintiff", label:"مدّعٍ / موكلي مدّعٍ",  icon:HandFist  },
  { id:"defendant", label:"مدّعى عليه / دفاع",     icon:Gavel     },
  { id:"advisor",   label:"مستشار / محكّم / مراجع", icon:Brain     },
];

const CASE_AREAS: { id: CaseArea; label: string }[] = [
  { id:"labor",       label:"نظام العمل"    },
  { id:"commercial",  label:"تجاري وشركات" },
  { id:"civil",       label:"مدني"           },
  { id:"criminal",    label:"جنائي"          },
  { id:"family",      label:"أحوال شخصية"  },
  { id:"real-estate", label:"عقاري"          },
  { id:"arbitration", label:"تحكيم / وساطة" },
  { id:"admin",       label:"إداري"          },
];

// Kept for when real AI simulation lands — currently unreachable, no live
// caller substitutes this into an order (Task C1).
const MOCK_MEMO_BASE = `بسم الله الرحمن الرحيم\n\nأصحاب الفضيلة / قضاة الدائرة المختصة حفظهم الله\n\nالموضوع: صحيفة دعوى\n\nأولاً: الوقائع\nالتحق موكلنا بالعمل لدى المدعى عليها، وقد فوجئ بإنهاء خدماته دون مسوّغ نظامي.\n\nثانياً: الأسانيد\nالدفع الأول: بطلان الإنهاء\nالدفع الثاني: مكافأة نهاية الخدمة\n\nثالثاً: الطلبات\n١. أجر الإشعار  ٢. المكافأة كاملة  ٣. التعويض`;

// ─── Mock data generator ────────────────────────────────────────────────────────
// Kept for when real AI simulation lands — unreachable since runSim() is no
// longer called (Task C1: this page submits a real order instead).
function buildPoints(targets: Set<SimTarget>, area: CaseArea | ""): SimPoint[] {
  const pts: SimPoint[] = [];

  if (targets.has("opponent")) {
    const base = [
      { id:"o1", severity:"high"   as const, title:"الدفع بانقضاء مدة التقادم",    detail:"الخصم سيثير دفعاً شكلياً بانتهاء مدة التقادم.", counter:"أثبت أن العلم بالضرر تأخر لأسباب موضوعية — المادة ٢١٥.", probability:85 },
      { id:"o2", severity:"high"   as const, title:"التشكيك في أصالة المستند",      detail:"الخصم سيطعن في مصداقية العقد المقدَّم.", counter:"قدّم نسخة موثقة من كاتب العدل وأرفق سجل المراسلات.", probability:72 },
      { id:"o3", severity:"medium" as const, title:"شاهد نفي الاتفاق الشفهي",      detail:"الخصم سيُقدِّم شاهد نفي.", counter:"اطلب كشف سجل المكالمات والرسائل النصية عبر المحكمة.", probability:58 },
      { id:"o4", severity:"low"    as const, title:"نفي العلاقة السببية للضرر",     detail:"إسناد الضرر لعوامل خارجية.", counter:"قدّم تقرير خبير فني يثبت السلسلة السببية المباشرة.", probability:40 },
    ];
    const laborExtra = { id:"o0", severity:"high" as const, title:"ادعاء الاستقالة الطوعية", detail:"الخصم سيدعي أن الإنهاء باستقالة طوعية.", counter:"أبرز خطاب الإنهاء الرسمي الصادر من صاحب العمل.", probability:88 };
    const items = area === "labor" ? [laborExtra, ...base.slice(1)] : base;
    pts.push(...items.map(p => ({ ...p, source: "opponent" as SimTarget })));
  }

  if (targets.has("court")) {
    pts.push(
      { id:"c1", source:"court", severity:"high",   title:"مناطق خطر أمام المحكمة — ضعف الشهود",      detail:"ضعف شهادة الشهود قد يؤثر سلباً على الحكم.", counter:"أرفق مستنداً رسمياً بديلاً يُغني عن شهادة الشهود.", probability:70 },
      { id:"c2", source:"court", severity:"medium",  title:"توافق السوابق القضائية مع موقفك — جيد",    detail:"السوابق تدعم الحكم لصالحك بنسبة ٦٨٪.", counter:"أشر لقرار المحكمة العليا رقم ٣٤١/ق في مذكرتك.", probability:60 },
      { id:"c3", source:"court", severity:"low",     title:"الاتجاه التاريخي للمحكمة داعم للتعويض",   detail:"المحاكم تميل للحكم بالتعويض عند ثبوت الانتهاك الصريح.", counter:"أكّد النص الصريح على الانتهاك في مقدمة المذكرة.", probability:50 },
    );
  }

  if (targets.has("critique")) {
    pts.push(
      { id:"cr1", source:"critique", severity:"high",   title:"غياب السند النظامي الصريح", detail:"لا يستشهد بنص المادة ٧٧ صراحةً.", counter:"أضف: «استناداً للمادة (٧٧) من نظام العمل»." },
      { id:"cr2", source:"critique", severity:"high",   title:"غياب مبادئ قضائية داعمة",  detail:"لا توجد إشارة لأي مبدأ قضائي.",   counter:"أضف مبدأ المحكمة العليا رقم ٣٤١/ق لعام ١٤٤٢هـ." },
      { id:"cr3", source:"critique", severity:"medium", title:"الطلبات مجملة",             detail:"الطلبات ذُكرت بصورة عامة.",        counter:"حدد كل طلب بمبلغ صريح." },
    );
  }

  if (targets.has("plea")) {
    pts.push(
      { id:"p1", source:"plea", severity:"medium", title:"الافتتاحية — تحسين التأثير", detail:"ابدأ بـ«السلام عليكم» وانظر للقاضي مباشرة.", counter:"أصحاب الفضيلة، موكلي عمل بإخلاص سنوات ثم فوجئ بالفصل دون إشعار." },
      { id:"p2", source:"plea", severity:"low",    title:"سكريبت الدفوع القانونية",    detail:"رتّب دفوعك من الأقوى للأضعف.", counter:"أولاً: بطلان الإنهاء (المادة ٧٧). ثانياً: أحقية مكافأة نهاية الخدمة." },
      { id:"p3", source:"plea", severity:"low",    title:"خاتمة المرافعة",             detail:"اختم بهدوء وثقة.", counter:"نلتمس الحكم بإلزام المدعى عليها بأجر الإشعار والمكافأة والتعويض." },
    );
  }

  // Sort: high → medium → low
  const order = { high:0, medium:1, low:2 };
  return pts.sort((a,b) => (order[a.severity] ?? 0) - (order[b.severity] ?? 0));
}

// ─── Small helpers ─────────────────────────────────────────────────────────────
function Bar({ v, c="red" }: { v:number; c?:string }) {
  const cl = c==="red"?"bg-red-500":c==="amber"?"bg-amber-500":"bg-blue-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <motion.div initial={{width:0}} animate={{width:`${v}%`}} transition={{duration:0.8}} className={`h-full rounded-full ${cl}`}/>
      </div>
      <span className={`text-[10px] font-bold ${c==="red"?"text-red-400":c==="amber"?"text-amber-400":"text-blue-400"}`}>{v}%</span>
    </div>
  );
}

function CopyTextBtn({ text, isDark }: { text:string; isDark:boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <motion.button whileTap={{ scale:0.93 }}
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false),1800); }}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${ copied?"border-emerald-500/40 bg-emerald-500/10 text-emerald-500":isDark?"border-white/[0.07] bg-zinc-800 text-zinc-400 hover:text-zinc-200":"border-slate-200 bg-white text-slate-500 hover:text-slate-700"}`}>
      {copied ? <><Check size={11} weight="bold"/>نُسخ</> : <><Copy size={11}/>نسخ كنص</>}
    </motion.button>
  );
}

function DownloadBar({ isDark, text }: { isDark:boolean; text?:string }) {
  return (
    <div className="flex gap-2 flex-wrap">
      <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.97}}
        className="flex items-center justify-center gap-2 flex-1 min-w-[110px] rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-[12px] font-bold text-white">
        <DownloadSimple size={14}/>تنزيل Word
      </motion.button>
      <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.97}}
        className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[12px] font-bold ${isDark?"border-white/[0.07] bg-zinc-800 text-zinc-300":"border-slate-200 bg-white text-zinc-600"}`}>
        <DownloadSimple size={14}/>PDF
      </motion.button>
      <CopyTextBtn text={text ?? MOCK_MEMO_BASE} isDark={isDark}/>
    </div>
  );
}

// ─── Source label chip ─────────────────────────────────────────────────────────
function SourceChip({ src, isDark }: { src: SimTarget; isDark: boolean }) {
  const cfg = SIM_TARGETS.find(t => t.id === src)!;
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${isDark?"border-white/[0.08]":"border-slate-200"} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ─── Unified ActionCard ────────────────────────────────────────────────────────
// Kept for when real AI simulation lands — unreachable (only rendered from
// Results, itself unreachable). Its edit textarea was a dead end even when
// this was live (editText was never read outside this component) — do not
// resurrect that pattern anywhere reachable (Task C1).
function ActionCard({
  point, isDark, action, onAction,
}: {
  point: SimPoint; isDark: boolean;
  action: ItemAction; onAction: (a: ItemAction) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editText, setEditText] = useState(point.counter);
  const s = SEV[point.severity];

  const borderCls =
    action === "add"    ? isDark?"border-emerald-700/30":"border-emerald-200"
    : action === "delete" ? "border-red-500/20 opacity-50"
    : action === "edit"   ? isDark?"border-[#C8A762]/30":"border-amber-200"
    : isDark?"border-white/[0.06]":"border-slate-200";

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${isDark?"bg-zinc-900/70":"bg-white shadow-sm"} ${borderCls}`}>
      <button onClick={()=>setExpanded(v=>!v)} className="w-full flex items-start gap-3 px-4 py-3.5 text-right">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${s.dot}`}/>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${isDark?s.badgeD:s.badgeL}`}>{s.label}</span>
            <SourceChip src={point.source} isDark={isDark}/>
          </div>
          <p className={`text-[12px] font-semibold leading-snug ${isDark?"text-zinc-200":"text-zinc-800"}`}>{point.title}</p>
          <p className={`text-[10px] mt-0.5 leading-snug ${isDark?"text-zinc-500":"text-slate-500"}`}>{point.detail}</p>
          {point.probability !== undefined && (
            <div className="mt-1.5">
              <Bar v={point.probability} c={point.severity==="high"?"red":point.severity==="medium"?"amber":"blue"}/>
            </div>
          )}
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={e=>e.stopPropagation()}>
          <button onClick={()=>onAction(action==="add"?null:"add")} title="إضافة للمذكرة"
            className={`w-7 h-7 rounded-xl border flex items-center justify-center transition-all ${action==="add"?"border-emerald-500 bg-emerald-500 text-white":isDark?"border-white/[0.08] text-zinc-500 hover:border-emerald-500/40 hover:text-emerald-400":"border-slate-200 text-slate-400 hover:border-emerald-400 hover:text-emerald-500"}`}>
            {action==="add"?<Check size={11} weight="bold"/>:<Plus size={11}/>}
          </button>
          <button onClick={()=>onAction(action==="edit"?null:"edit")} title="تعديل وإضافة"
            className={`w-7 h-7 rounded-xl border flex items-center justify-center transition-all ${action==="edit"?"border-[#C8A762] bg-[#C8A762]/10 text-[#C8A762]":isDark?"border-white/[0.08] text-zinc-500 hover:border-[#C8A762]/40 hover:text-[#C8A762]":"border-slate-200 text-slate-400 hover:border-amber-400 hover:text-amber-500"}`}>
            <PencilSimple size={11}/>
          </button>
          <button onClick={()=>onAction(action==="delete"?null:"delete")} title="تجاهل"
            className={`w-7 h-7 rounded-xl border flex items-center justify-center transition-all ${action==="delete"?"border-red-500/40 bg-red-500/10 text-red-400":isDark?"border-white/[0.08] text-zinc-500 hover:border-red-500/30 hover:text-red-400":"border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-400"}`}>
            <Trash size={11}/>
          </button>
          <motion.span animate={{rotate:expanded?180:0}} transition={{duration:0.18}}>
            <CaretDown size={10} className={isDark?"text-zinc-600":"text-slate-400"}/>
          </motion.span>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.18}} className="overflow-hidden">
            <div className={`border-t px-4 pb-4 pt-3 space-y-2.5 ${isDark?"border-white/[0.04]":"border-slate-100"}`}>
              <div className={`p-2.5 rounded-xl border flex items-start gap-2 ${isDark?"border-[#C8A762]/20 bg-[#C8A762]/5":"border-amber-200 bg-amber-50"}`}>
                <Lightbulb size={11} weight="duotone" className="text-[#C8A762] flex-shrink-0 mt-0.5"/>
                <div>
                  <p className="text-[9px] font-bold text-[#C8A762] mb-0.5">الرد / الإصلاح المقترح</p>
                  <p className={`text-[11px] leading-relaxed ${isDark?"text-zinc-300":"text-zinc-700"}`}>{point.counter}</p>
                </div>
              </div>
              {action==="edit" && (
                <textarea rows={2} value={editText} onChange={e=>setEditText(e.target.value)}
                  placeholder="عدّل الرد قبل إضافته..."
                  className={`w-full resize-none rounded-xl border px-3 py-2 text-[11px] outline-none ${isDark?"border-white/[0.07] bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600":"border-amber-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`}/>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Polish panel (memo preview after apply) ───────────────────────────────────
// Kept for when real AI simulation lands — unreachable (only rendered from
// Results, itself unreachable) (Task C1).
function PolishPanel({ isDark, points, actions }: { isDark:boolean; points:SimPoint[]; actions:Record<string,ItemAction> }) {
  const applied = points.filter(p => actions[p.id]==="add" || actions[p.id]==="edit");
  const fullText = MOCK_MEMO_BASE + "\n\n" + applied.map(p=>p.counter).join("\n");
  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="space-y-3">
      {/* Header */}
      <div className={`rounded-2xl border-2 p-4 ${isDark?"border-emerald-700/30 bg-emerald-900/8":"border-emerald-200 bg-emerald-50/80"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark?"bg-emerald-900/50":"bg-emerald-100"}`}>
            <CheckFat size={17} weight="fill" className="text-emerald-500"/>
          </div>
          <div>
            <p className={`text-[13px] font-bold ${isDark?"text-emerald-300":"text-emerald-800"}`}>نقّح المذكرة بناءً على المحاكاة</p>
            <p className={`text-[11px] ${isDark?"text-emerald-600":"text-emerald-600"}`}>تم اختيار {applied.length} بند — راجع المسودة أدناه ثم نزّل</p>
          </div>
        </div>
      </div>

      <BetaReviewGate toolId="wargaming.result" toolName="محاكاة القضية والمذكرة المنقحة" reviewScope="legal-data">
      {/* Memo preview */}
      <div className={`rounded-2xl border overflow-hidden ${isDark?"border-white/[0.06]":"border-slate-200"}`}>
        <div className={`flex items-center gap-2.5 px-4 py-3 border-b ${isDark?"border-white/[0.05] bg-zinc-900/60":"border-slate-100 bg-slate-50"}`}>
          <Eye size={13} weight="duotone" className="text-[#C8A762]"/>
          <p className={`text-[12px] font-bold flex-1 ${isDark?"text-zinc-200":"text-zinc-700"}`}>المذكرة المنقّحة</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1"><div className={`w-2 h-2 rounded ${isDark?"bg-zinc-600":"bg-slate-300"}`}/><span className={`text-[9px] ${isDark?"text-zinc-600":"text-slate-400"}`}>أصلي</span></div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-red-400"/><span className="text-[9px] text-red-400">إضافة</span></div>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className={`rounded-xl p-3 text-[11px] leading-[2] whitespace-pre-line ${isDark?"bg-zinc-950/40 text-zinc-400":"bg-slate-50 text-slate-600"}`}>{MOCK_MEMO_BASE}</div>
          <div className="space-y-2">
            <p className={`text-[11px] font-bold ${isDark?"text-red-400":"text-red-600"}`}>الإضافات المُطبَّقة ({applied.length})</p>
            {applied.map(p=>(
              <div key={p.id} className={`border-r-4 border-red-500 rounded-xl px-3 py-2.5 ${isDark?"bg-red-900/8 border-red-700/20":"bg-red-50 border-red-200"}`}>
                <p className="text-[9px] font-bold text-red-500 mb-1">{p.title} — {SIM_TARGETS.find(t=>t.id===p.source)?.label}</p>
                <p className={`text-[11px] leading-relaxed ${isDark?"text-red-300/80":"text-red-800"}`}>{p.counter}</p>
              </div>
            ))}
          </div>
          <DownloadBar isDark={isDark} text={fullText}/>
          <AiResultActions
            text={fullText}
            filename="wargaming-memo"
            showVault
            showHumanReview
            className="justify-start"
          />
        </div>
      </div>
      </BetaReviewGate>

      {/* CTA to drafter */}
      <div className={`rounded-2xl border p-4 flex flex-col sm:flex-row items-center justify-between gap-4 ${isDark?"border-[#C8A762]/15 bg-[#C8A762]/5":"border-amber-100 bg-amber-50/60"}`}>
        <div>
          <p className={`font-bold text-[13px] ${isDark?"text-zinc-100":"text-slate-800"}`}>أرسل هذه التحسينات للصائغ القانوني؟</p>
          <p className={`text-[11px] mt-0.5 ${isDark?"text-zinc-400":"text-slate-500"}`}>سيتولى الصائغ تضمين الردود في مذكرتك الاحترافية تلقائياً.</p>
        </div>
        <Link href="/ai/draft" className="flex-shrink-0 flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-[12px] font-bold text-[#C8A762] shadow-md">
          <Pencil size={13}/>متابعة مع الصائغ
        </Link>
      </div>
    </motion.div>
  );
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
  const canNext = ctx.role!==""&&ctx.area!==""&&ctx.summary.trim().length>=20&&!uploading;

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
        <p className={`text-[12px] font-bold mb-3 ${D?"text-zinc-400":"text-zinc-500"}`}>تخصص القضية</p>
        <div className="flex flex-wrap gap-2">
          {CASE_AREAS.map(a=>(
            <button key={a.id} onClick={()=>setCtx({...ctx,area:a.id})}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all ${ctx.area===a.id?"bg-[#C8A762] border-[#C8A762] text-[#0B3D2E]":D?"border-white/[0.07] text-zinc-400 hover:border-white/20":"border-zinc-200 text-zinc-500 hover:border-zinc-300"}`}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className={`${card} p-5 space-y-3`}>
        <p className={`text-[12px] font-bold ${D?"text-zinc-400":"text-zinc-500"}`}>ملخص القضية والوقائع</p>
        {attachments.length>0?(
          <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 border ${D?"border-emerald-700/30 bg-emerald-900/10":"border-emerald-200 bg-emerald-50"}`}>
            <FileText size={14} className="text-emerald-500"/>
            <span className={`flex-1 truncate text-[12px] ${D?"text-emerald-300":"text-emerald-700"}`}>{attachments[0].name}</span>
            <button onClick={()=>removeAttachment(attachments[0].documentId)}><X size={13} className="text-emerald-500"/></button>
          </div>
        ):(
          <div onClick={()=>{if(!uploading)fRef.current?.click();}}
            className={`rounded-xl border-2 border-dashed p-3 flex items-center gap-3 ${uploading?"opacity-60":"cursor-pointer"} ${D?"border-white/[0.08] hover:border-[#C8A762]/30":"border-zinc-200 hover:border-[#C8A762]/40"}`}>
            <input ref={fRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.png" disabled={uploading}
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
  attachments, memoText, setMemoText,
  uploading, attachError, attachFile, removeAttachment,
}: {
  D:boolean; ctx:CaseContext;
  targets:Set<SimTarget>; setTargets:(t:Set<SimTarget>)=>void;
  onRun:()=>void; onBack:()=>void;
  attachments: OrderAttachment[];
  memoText: string; setMemoText: (v:string)=>void;
  uploading: boolean; attachError: string;
  attachFile: (file: File) => Promise<OrderAttachment>;
  removeAttachment: (documentId: string) => void;
}) {
  const areaLabel = CASE_AREAS.find(a=>a.id===ctx.area)?.label??"";
  const roleLabel  = CASE_ROLES.find(r=>r.id===ctx.role)?.label??"";
  const hasCritique = targets.has(WARGAMING_CRITIQUE_TARGET);
  const memoFileRef = useRef<HTMLInputElement>(null);
  const memoSatisfied = memoText.trim().length>0 || attachments.length>0;

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
          <span className="font-bold text-[#C8A762]">{areaLabel}</span> · {roleLabel}
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

            {attachments.length>0 && (
              <div className="space-y-1.5">
                {attachments.map(a=>(
                  <div key={a.documentId} className={`flex items-center gap-2 rounded-xl px-3 py-2 border ${D?"border-emerald-700/30 bg-emerald-900/10":"border-emerald-200 bg-emerald-50"}`}>
                    <FileText size={13} className="text-emerald-500"/>
                    <span className={`flex-1 truncate text-[11px] ${D?"text-emerald-300":"text-emerald-700"}`}>{a.name}</span>
                    <button onClick={()=>removeAttachment(a.documentId)}><X size={12} className="text-emerald-500"/></button>
                  </div>
                ))}
              </div>
            )}

            <div onClick={()=>{if(!uploading)memoFileRef.current?.click();}}
              className={`rounded-xl border-2 border-dashed p-2.5 flex items-center gap-2.5 ${uploading?"opacity-60":"cursor-pointer"} ${D?"border-white/[0.08] hover:border-[#C8A762]/30":"border-zinc-200 hover:border-[#C8A762]/40"}`}>
              <input ref={memoFileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.png" disabled={uploading}
                onChange={async e=>{
                  const f=e.target.files?.[0];
                  if(!f)return;
                  try { await attachFile(f); } catch { /* attachError is set inside the hook and rendered below */ }
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
                <Warning size={12}/>نص المذكرة أو ملفها مطلوب عند اختيار «نقض المذكرة»
              </p>
            )}
          </div>
        </motion.div>
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
  D, ctx, areaLabel, roleLabel, targets, memoText, attachments,
  submitting, submitErrors, onBack, onSubmit,
}: {
  D:boolean; ctx:CaseContext; areaLabel:string; roleLabel:string;
  targets:Set<SimTarget>; memoText:string; attachments:OrderAttachment[];
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
              <dd className={(memoText.trim() || attachments.length>0) ? (D?"text-zinc-200":"text-zinc-800") : "text-amber-500"}>
                {memoText.trim()
                  ? `${memoText.trim().slice(0,150)}${memoText.trim().length>150?"…":""}`
                  : attachments.length>0
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

// ─── Results (Step 3) ──────────────────────────────────────────────────────────
// Kept for when real AI simulation lands — unreachable, step "results" is no
// longer set from anywhere (Task C1: this page submits a real order instead
// of simulating one).
function Results({ D, ctx, targets, points, onReset }: {
  D:boolean; ctx:CaseContext; targets:Set<SimTarget>;
  points:SimPoint[]; onReset:()=>void;
}) {
  const [actions, setActions] = useState<Record<string,ItemAction>>({});
  const [applied, setApplied] = useState(false);

  const selectedItems = points.filter(p => actions[p.id]==="add" || actions[p.id]==="edit");
  const hasSelected = selectedItems.length > 0;

  const critCount  = points.filter(p=>p.severity==="high").length;
  const medCount   = points.filter(p=>p.severity==="medium").length;
  const lowCount   = points.filter(p=>p.severity==="low").length;

  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="space-y-3">

      {/* Summary bar */}
      <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${D?"border-amber-700/20 bg-amber-900/8":"border-amber-200 bg-amber-50"}`}>
        <div className="flex items-center gap-2">
          <CheckCircle size={16} weight="fill" className="text-amber-500"/>
          <p className={`text-[12px] font-bold ${D?"text-amber-400":"text-amber-700"}`}>
            {points.length} نقطة · {critCount} حرجة · {medCount} متوسطة · {lowCount} تحسين
          </p>
        </div>
        <button onClick={onReset} className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-xl border ${D?"border-white/[0.08] text-zinc-500 hover:text-zinc-300":"border-slate-200 text-slate-400 hover:text-slate-600"}`}>
          <ArrowsCounterClockwise size={10}/>إعادة
        </button>
      </div>

      {/* Active targets tags */}
      <div className="flex flex-wrap gap-1.5">
        {SIM_TARGETS.filter(t=>targets.has(t.id)).map(t=>(
          <span key={t.id} className={`text-[10px] font-bold px-2 py-1 rounded-full border ${D?"border-white/[0.08]":"border-slate-200"} ${t.color}`}>
            {t.label}
          </span>
        ))}
      </div>

      <div className={`flex items-center gap-4 px-0.5 text-[10px] font-bold ${D?"text-zinc-600":"text-slate-400"}`}>
        <span className="text-emerald-500 flex items-center gap-1"><CheckCircle size={12} weight="fill" /> إضافة للمذكرة</span>
        <span className="text-[#C8A762] flex items-center gap-1"><PencilSimple size={12} /> تعديل وإضافة</span>
        <span className="text-red-400 flex items-center gap-1"><Trash size={12} /> تجاهل</span>
      </div>

      {/* Cards */}
      <div className="space-y-2.5">
        {points.map(p => (
          <ActionCard key={p.id} point={p} isDark={D}
            action={actions[p.id]??null}
            onAction={a=>setActions(prev=>({...prev,[p.id]:a}))}/>
        ))}
      </div>

      {/* Apply bar */}
      {hasSelected && !applied && (
        <motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}}
          className={`rounded-2xl border-2 p-3.5 ${D?"border-emerald-700/30 bg-emerald-900/8":"border-emerald-200 bg-emerald-50"}`}>
          <div className="flex items-center gap-3">
            <CheckFat size={15} weight="fill" className="text-emerald-500 flex-shrink-0"/>
            <p className={`flex-1 text-[12px] font-bold ${D?"text-emerald-400":"text-emerald-700"}`}>مختار للإضافة: {selectedItems.length} بند</p>
            <motion.button whileTap={{scale:0.96}} onClick={()=>setApplied(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[11px] font-bold">
              <CheckFat size={11} weight="fill"/>طبّق على المذكرة
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Polish panel */}
      {applied && <PolishPanel isDark={D} points={points} actions={actions}/>}
    </motion.div>
  );
}

// ─── Simulating animation ──────────────────────────────────────────────────────
// Kept for when real AI simulation lands — unreachable, step "simulating" is
// no longer set from anywhere (Task C1).
function SimulatingLoader({ D, targets }: { D:boolean; targets:Set<SimTarget> }) {
  const steps = [
    ...(targets.has("opponent") ? ["محاكاة دفوع الخصم وهجماته"] : []),
    ...(targets.has("court")    ? ["تحليل اتجاه المحكمة والسوابق"] : []),
    ...(targets.has("critique") ? ["كشف ثغرات المذكرة"] : []),
    ...(targets.has("plea")     ? ["بناء سكريبت المرافعة"] : []),
    "ترتيب النتائج حسب الأهمية",
  ];
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center gap-4 py-12">
      <div className="relative w-16 h-16">
        <motion.div animate={{rotate:360}} transition={{duration:3,repeat:Infinity,ease:"linear"}}
          className={`absolute inset-0 rounded-full border-2 border-dashed ${D?"border-amber-700/40":"border-amber-300"}`}/>
        <div className={`absolute inset-3 rounded-full flex items-center justify-center ${D?"bg-zinc-800":"bg-amber-50"}`}>
          <Sword size={18} weight="duotone" className="text-amber-500"/>
        </div>
      </div>
      <p className={`text-[13px] font-bold ${D?"text-zinc-300":"text-zinc-700"}`}>جارٍ تشغيل المحاكاة الشاملة...</p>
      <div className="space-y-2 text-center">
        {steps.map((s,i)=>(
          <motion.div key={s} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.5}}
            className="flex items-center gap-2">
            <motion.div animate={{rotate:360}} transition={{duration:1,repeat:Infinity,ease:"linear"}}>
              <Spinner size={11} className="text-[#C8A762]"/>
            </motion.div>
            <p className={`text-[11px] ${D?"text-zinc-500":"text-slate-400"}`}>{s}</p>
          </motion.div>
        ))}
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
export default function AIWargamingPage() {
  const { isDark:D } = useTheme();
  const user = useUser();

  // "simulating" and "results" are kept in the union (and in stepLabels /
  // stepNums below) only because SimulatingLoader / Results stay in the file
  // unreachable, per "hide, do not delete" — nothing ever calls setStep with
  // either value any more. "submit" is the real replacement.
  type PageStep = "setup" | "targets" | "simulating" | "submit" | "results";
  const [step,    setStep]    = useState<PageStep>("setup");
  const [ctx,     setCtx]     = useState<CaseContext>({ role:"", area:"", summary:"" });
  const [targets, setTargets] = useState<Set<SimTarget>>(new Set(["opponent","court"]));
  const [points,  setPoints]  = useState<SimPoint[]>([]);
  const [memoText, setMemoText] = useState("");
  const [submitting,    setSubmitting]    = useState(false);
  const [submitErrors,  setSubmitErrors]  = useState<string[]>([]);

  const {
    attachments, uploading, attachError, attachFile, removeAttachment, clearAttachError,
  } = useOrderAttachments();

  // Kept defined but uncalled — the button that used to fire this now goes
  // to "submit" instead (Task C1). Left in place along with buildPoints() so
  // real AI simulation can be wired back in later without re-deriving this.
  async function runSim() {
    setStep("simulating");
    await new Promise(r => setTimeout(r, 2000 + targets.size * 400));
    setPoints(buildPoints(targets, ctx.area));
    setStep("results");
  }

  // Only reachable from the (now-hidden) Results component's "إعادة" button
  // — kept pointed at a still-reachable step regardless.
  function reset() { setStep("targets"); setPoints([]); }

  function fullReset() {
    setStep("setup");
    setCtx({role:"",area:"",summary:""});
    setTargets(new Set(["opponent","court"]));
    setPoints([]);
    setMemoText("");
    setSubmitErrors([]);
    clearAttachError();
    attachments.forEach(a => removeAttachment(a.documentId));
  }

  const areaLabel = CASE_AREAS.find(a=>a.id===ctx.area)?.label??"";
  const roleLabel  = CASE_ROLES.find(r=>r.id===ctx.role)?.label??"";

  function buildIntake(): Record<string, unknown> {
    return {
      schemaVersion: 1,
      service: "wargaming",
      role: ctx.role,
      area: ctx.area,
      caseSummary: ctx.summary,
      targets: Array.from(targets),
      // Only send memoText when critique is actually selected — otherwise a
      // memo typed while critique was toggled on, then left behind after
      // deselecting it, would ship silently in an order that never asked
      // for a memo critique, and the submit-step recap (which only shows
      // this row when critique is selected) would disagree with the payload.
      ...(targets.has(WARGAMING_CRITIQUE_TARGET) && memoText.trim()
        ? { memoText: memoText.trim() } : {}),
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
    setup:"بيانات القضية", targets:"أهداف المحاكاة", simulating:"جارٍ المحاكاة", submit:"مراجعة وإرسال", results:"النتائج والتطبيق"
  };
  const stepNums: Record<PageStep,number> = { setup:1, targets:2, simulating:3, submit:3, results:3 };

  return (
    <div className={`p-5 md:p-7 max-w-3xl mx-auto space-y-5 ${D?"text-zinc-100":"text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className={`text-xl font-bold ${D?"text-white":"text-zinc-900"}`}>المحاكي الشامل</h1>
          <span className="rounded-full bg-purple-500/15 border border-purple-500/30 px-2.5 py-0.5 text-[10px] font-bold text-purple-400">MAX فقط</span>
        </div>
        <p className={`text-[12px] ${D?"text-zinc-500":"text-zinc-400"}`}>حدد القضية → اختر الأهداف → راجع الطلب وأرسله</p>
      </div>

      {/* Progress steps */}
      <div className={`flex items-center gap-1 p-3 rounded-2xl border ${D?"border-white/[0.05] bg-white/[0.02]":"border-slate-100 bg-slate-50/60"}`}>
        {(["setup","targets","submit"] as const).map((s,i,arr)=>{
          const num = i+1;
          const active = stepNums[step]===num||step==="simulating"&&num===3;
          const done   = stepNums[step]>num;
          return (
            <React.Fragment key={s}>
              <div className="flex items-center gap-1.5 flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 transition-all ${ done?"bg-emerald-500 text-white":active?`bg-gradient-to-br ${s==="setup"?"from-[#0B3D2E] to-[#1a6b50]":s==="targets"?"from-amber-600 to-amber-400":"from-purple-700 to-purple-500"} text-white`:D?"bg-zinc-800 text-zinc-500":"bg-slate-200 text-slate-400"}`}>
                  {done?<Check size={10} weight="bold"/>:num}
                </div>
                <p className={`text-[10px] font-semibold hidden sm:block ${active||done?D?"text-zinc-200":"text-zinc-700":D?"text-zinc-600":"text-slate-400"}`}>{stepLabels[s]}</p>
              </div>
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
              onRun={()=>setStep("submit")} onBack={()=>setStep("setup")}
              attachments={attachments} memoText={memoText} setMemoText={setMemoText}
              uploading={uploading} attachError={attachError}
              attachFile={attachFile} removeAttachment={removeAttachment}/>
          </motion.div>
        )}

        {step==="simulating" && (
          <motion.div key="sim" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <SimulatingLoader D={D} targets={targets}/>
          </motion.div>
        )}

        {step==="submit" && (
          <motion.div key="submit" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <SubmitReview D={D} ctx={ctx} areaLabel={areaLabel} roleLabel={roleLabel}
              targets={targets} memoText={memoText} attachments={attachments}
              submitting={submitting} submitErrors={submitErrors}
              onBack={()=>{setSubmitErrors([]);setStep("targets");}} onSubmit={submitOrder}/>
          </motion.div>
        )}

        {step==="results" && (
          <motion.div key="results" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <Results D={D} ctx={ctx} targets={targets} points={points} onReset={reset}/>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
