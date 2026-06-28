"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Video, Phone, ChatCircle, HouseSimple,
  Clock, User, Buildings, CheckCircle, XCircle, Sparkle,
  NotePencil, FilePdf, WhatsappLogo, EnvelopeSimple,
  CalendarCheck, Money, SealCheck, Warning, CaretDown,
  PencilSimple, FloppyDisk, ClipboardText, PlayCircle,
  ArrowFatRight, ChatDots, FileArrowUp,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types & mock ─────────────────────────────────────────────────────────────
type Status = "upcoming" | "inProgress" | "completed" | "cancelled";
type Mode   = "video" | "phone" | "chat" | "inPerson";

interface Consult {
  id: string; client: string; clientType: "individual" | "company";
  topic: string; date: string; time: string; mode: Mode; status: Status;
  notes?: string; isPaid: boolean; fee: number; duration: number;
  caseId?: string; aiSummary?: string; clientNotes?: string;
  phone?: string; email?: string;
}

const MOCK: Record<string, Consult> = {
  "1": { id:"1", client:"عبدالله الحارثي",  clientType:"individual", topic:"استشارة عمالية — فسخ عقد", date:"غداً",    time:"١٠:٠٠ ص", mode:"video",    status:"upcoming",    isPaid:true,  fee:800,  duration:60,  caseId:"C-1023", phone:"+966501234567", email:"aharthy@mail.com" },
  "2": { id:"2", client:"نورة العتيبي",     clientType:"individual", topic:"مراجعة عقد إيجار",         date:"٢٣ أبريل", time:"٢:٠٠ م",  mode:"phone",    status:"upcoming",    isPaid:true,  fee:400,  duration:30,  phone:"+966509876543" },
  "3": { id:"3", client:"شركة الأفق",       clientType:"company",    topic:"نزاع تجاري مع شريك",       date:"اليوم",   time:"٩:٣٠ ص",  mode:"inPerson", status:"completed",   isPaid:true,  fee:1500, duration:90,  notes:"اتُّفق على خطوات التسوية", aiSummary:"أوصى المحامي بمراسلة الشريك رسمياً بإنهاء الشراكة وفق المادة ٦٣ من نظام الشركات، مع إبقاء خيار التسوية الودية مفتوحاً.", clientNotes:"نريد تجنب القضاء إن أمكن", email:"alfuq@corp.sa" },
  "4": { id:"4", client:"هند الشمري",       clientType:"individual", topic:"قضية طلاق وحضانة",         date:"أمس",     time:"١١:٠٠ ص", mode:"chat",     status:"completed",   isPaid:true,  fee:600,  duration:45,  aiSummary:"ناقشنا حقوق حضانة الأطفال — يُوصى برفع دعوى حضانة مصحوبة بطلب نفقة مؤقتة.", phone:"+966500000001" },
  "5": { id:"5", client:"سعد المالكي",      clientType:"individual", topic:"استشارة تأسيس شركة",       date:"٢٢ أبريل",time:"٤:٠٠ م",  mode:"phone",    status:"cancelled",   isPaid:false, fee:400,  duration:30 },
  "6": { id:"6", client:"مجموعة الرياض",   clientType:"company",    topic:"مراجعة عقود توريد سنوية",  date:"اليوم",   time:"٣:٠٠ م",  mode:"inPerson", status:"inProgress",  isPaid:true,  fee:3000, duration:120, clientNotes:"نحتاج مراجعة بنود التأخير والغرامات" },
};

const MODE_META = {
  video:    { icon: Video,        label: "فيديو",       color: "text-blue-500",   bg: "bg-blue-500/10" },
  phone:    { icon: Phone,        label: "هاتفي",       color: "text-emerald-500", bg: "bg-emerald-500/10" },
  chat:     { icon: ChatCircle,   label: "محادثة",     color: "text-violet-500", bg: "bg-violet-500/10" },
  inPerson: { icon: HouseSimple,  label: "حضوري",      color: "text-[#C8A762]",  bg: "bg-[#C8A762]/10" },
};

const STATUS_META = {
  upcoming:   { label:"قادمة",     color:"text-blue-500",    bg:"bg-blue-500/10",    icon: CalendarCheck },
  inProgress: { label:"جارية",     color:"text-amber-500",   bg:"bg-amber-500/10",   icon: PlayCircle },
  completed:  { label:"مكتملة",    color:"text-emerald-500", bg:"bg-emerald-500/10", icon: CheckCircle },
  cancelled:  { label:"ملغاة",     color:"text-red-500",     bg:"bg-red-500/10",     icon: XCircle },
};

const LIFECYCLE: { key: Status; label: string }[] = [
  { key:"upcoming",   label:"مجدولة" },
  { key:"inProgress", label:"جارية" },
  { key:"completed",  label:"مكتملة" },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function ConsultationDetailPage({ params }: { params: { id: string } }) {
  const { isDark } = useTheme();
  const raw = MOCK[params.id] ?? null;

  const [status, setStatus]     = useState<Status>(raw?.status ?? "requested");
  const [notes, setNotes]       = useState(raw?.notes ?? "");
  const [editNotes, setEditNotes] = useState(false);
  const [saved, setSaved]       = useState(false);

  if (!raw) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center" dir="rtl">
        <div className={`inline-flex flex-col items-center gap-3 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
          <Warning size={40} className={isDark ? "text-zinc-700" : "text-slate-300"} />
          <p className="text-lg font-bold">الاستشارة غير موجودة</p>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لم يتم العثور على استشارة بهذا المعرف. قد تكون محذوفة أو أن الرابط غير صحيح.</p>
          <Link href="/dashboard/lawyer/consultations" className="mt-2 text-sm text-[#0B3D2E] hover:underline">← العودة للاستشارات</Link>
        </div>
      </div>
    );
  }

  const data = raw;

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const sm = isDark ? "text-zinc-400" : "text-slate-500";

  const modeM  = MODE_META[data.mode];
  const statM  = STATUS_META[status];
  const ModeIcon = modeM.icon;
  const StatIcon = statM.icon;

  function saveNotes() { setSaved(true); setEditNotes(false); setTimeout(() => setSaved(false), 2000); }

  const lifecycleIdx = LIFECYCLE.findIndex(l => l.key === status);

  return (
    <div className="max-w-3xl mx-auto space-y-4" dir="rtl">

      {/* Back */}
      <Link href="/dashboard/lawyer/consultations"
        className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${sm} hover:text-[#0B3D2E] transition-colors`}>
        <ArrowRight size={13} /> الاستشارات
      </Link>

      {/* Header card */}
      <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} className={`${card} overflow-hidden`}>
        {/* Top bar */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1">
              <h1 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}>
                {data.topic}
              </h1>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Client chip */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
                  {data.clientType === "company" ? <Buildings size={11}/> : <User size={11}/>}
                  {data.client}
                </div>
                {/* Mode chip */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${modeM.bg} ${modeM.color}`}>
                  <ModeIcon size={11}/> {modeM.label}
                </div>
                {/* Status chip */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${statM.bg} ${statM.color}`}>
                  <StatIcon size={11}/> {statM.label}
                </div>
              </div>
            </div>
            {/* Fee */}
            <div className="text-left">
              <p className={`text-[22px] font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>
                {data.fee.toLocaleString()} <span className={`text-[13px] font-semibold ${sm}`}>ريال</span>
              </p>
              {data.isPaid
                ? <p className="text-[10px] text-emerald-500 font-bold flex items-center gap-0.5"><SealCheck size={10}/> مدفوعة</p>
                : <p className="text-[10px] text-red-400 font-bold flex items-center gap-0.5"><Warning size={10}/> غير مدفوعة</p>
              }
            </div>
          </div>

          {/* Meta row */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label:"التاريخ",  val:`${data.date} — ${data.time}`, icon:CalendarCheck },
              { label:"المدة",    val:`${data.duration} دقيقة`,       icon:Clock },
              ...(data.caseId ? [{ label:"القضية", val:data.caseId, icon:ClipboardText }] : []),
            ].map((m, i) => {
              const Icon = m.icon;
              return (
                <div key={i} className={`${isDark ? "bg-white/[0.03]" : "bg-slate-50"} rounded-xl px-3 py-2 flex items-center gap-2`}>
                  <Icon size={13} className={sm}/>
                  <div>
                    <p className={`text-[9px] ${sm}`}>{m.label}</p>
                    <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{m.val}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Contact row */}
          <div className="flex gap-2">
            {data.phone && (
              <a href={`tel:${data.phone}`} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all ${isDark ? "border-white/[0.06] text-zinc-400 hover:border-white/10" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                <Phone size={12}/> {data.phone}
              </a>
            )}
            {data.email && (
              <a href={`mailto:${data.email}`} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
                <EnvelopeSimple size={12}/> {data.email}
              </a>
            )}
            {data.phone && (
              <a href={`https://wa.me/${data.phone?.replace(/\D/g,"")}`} target="_blank"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all">
                <WhatsappLogo size={12}/> واتساب
              </a>
            )}
          </div>
        </div>

        {/* Lifecycle progress */}
        {status !== "cancelled" && (
          <div className={`px-5 py-3 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${sm}`}>مسار الاستشارة</p>
            <div className="flex items-center gap-0">
              {LIFECYCLE.map((l, i) => {
                const done    = i <= lifecycleIdx;
                const current = i === lifecycleIdx;
                return (
                  <div key={l.key} className="flex items-center flex-1">
                    <button
                      onClick={() => setStatus(l.key as Status)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border ${
                        current
                          ? "bg-[#0B3D2E] text-white border-[#0B3D2E]"
                          : done
                            ? isDark ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border-emerald-200"
                            : isDark ? "border-white/[0.06] text-zinc-600" : "border-slate-200 text-slate-400"
                      }`}>
                      {done && !current && <CheckCircle size={11} weight="fill"/>}
                      {l.label}
                    </button>
                    {i < LIFECYCLE.length - 1 && (
                      <div className={`flex-1 h-px mx-1 ${done ? "bg-emerald-400/50" : isDark ? "bg-white/[0.06]" : "bg-slate-200"}`}/>
                    )}
                  </div>
                );
              })}
              {/* Cancel */}
              {(status === "upcoming" || status === "inProgress") && (
                <button onClick={() => setStatus("cancelled")}
                  className={`ms-2 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${isDark ? "border-white/[0.06] text-zinc-600 hover:text-red-400 hover:border-red-500/20" : "border-slate-200 text-slate-400 hover:text-red-500"}`}>
                  إلغاء
                </button>
              )}
            </div>
          </div>
        )}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Left col — notes + client notes */}
        <div className="lg:col-span-3 space-y-4">

          {/* Lawyer notes */}
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.05 }}
            className={`${card} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                ملاحظاتي (المحامي)
              </h2>
              <button onClick={() => editNotes ? saveNotes() : setEditNotes(true)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  saved
                    ? "bg-emerald-500/15 text-emerald-500"
                    : editNotes
                      ? "bg-[#0B3D2E] text-[#C8A762]"
                      : isDark ? "bg-white/[0.05] text-zinc-400 hover:text-zinc-200" : "bg-slate-100 text-slate-500"
                }`}>
                {saved ? <><CheckCircle size={12}/> حُفظ</> : editNotes ? <><FloppyDisk size={12}/> حفظ</> : <><PencilSimple size={12}/> تعديل</>}
              </button>
            </div>
            {editNotes ? (
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5}
                className={`w-full rounded-xl px-3 py-2.5 text-[12px] leading-relaxed resize-none focus:outline-none border transition-colors ${
                  isDark ? "bg-zinc-800 border-white/[0.08] text-zinc-200 focus:border-[#C8A762]/40" : "bg-slate-50 border-slate-200 text-slate-700 focus:border-[#0B3D2E]/30"
                }`} placeholder="اكتب ملاحظاتك على الاستشارة..." />
            ) : (
              <p className={`text-[12px] leading-relaxed ${notes ? (isDark ? "text-zinc-400" : "text-slate-600") : sm + " italic"}`}>
                {notes || "لا توجد ملاحظات بعد — اضغط تعديل للإضافة"}
              </p>
            )}
          </motion.div>

          {/* Client notes (read-only from client side) */}
          {data.clientNotes && (
            <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.08 }}
              className={`${card} p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <ChatDots size={13} className="text-violet-500"/>
                <h2 className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>ملاحظات العميل</h2>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${isDark ? "bg-violet-500/10 text-violet-400" : "bg-violet-50 text-violet-600"}`}>من العميل</span>
              </div>
              <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{data.clientNotes}</p>
            </motion.div>
          )}

          {/* AI Summary */}
          {(status === "completed" || data.aiSummary) && (
            <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}
              className={`p-4 rounded-2xl border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-center gap-2 mb-2">
                <Sparkle size={13} weight="fill" className="text-[#C8A762]"/>
                <p className={`text-[12px] font-bold ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>ملخص نظامي AI</p>
              </div>
              <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-amber-800"}`}>
                {data.aiSummary ?? "سيتوفر الملخص بعد اكتمال الاستشارة."}
              </p>
            </motion.div>
          )}
        </div>

        {/* Right col — actions */}
        <div className="lg:col-span-2 space-y-3">

          {/* Quick actions */}
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.06 }}
            className={`${card} p-4`}>
            <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${sm}`}>إجراءات سريعة</p>
            <div className="space-y-2">
              {[
                { label:"تصدير تقرير PDF",    icon:FilePdf,      color:"text-red-500",    action:()=>{} },
                { label:"ربط بقضية",           icon:ClipboardText,color:"text-blue-500",   action:()=>{} },
                { label:"إرسال ملخص للعميل",  icon:FileArrowUp,  color:"text-violet-500", action:()=>{} },
              ].map((a,i) => {
                const Icon = a.icon;
                return (
                  <button key={i} onClick={a.action}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px] font-semibold border transition-all ${isDark ? "border-white/[0.06] text-zinc-300 hover:bg-white/[0.04]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    <Icon size={14} className={a.color}/> {a.label}
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Start session button (if upcoming/inProgress) */}
          {(status === "upcoming" || status === "inProgress") && (
            <motion.div initial={{ opacity:0, scale:0.97 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.1 }}>
              <button
                onClick={() => setStatus("inProgress")}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-[13px] text-white transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background:"linear-gradient(135deg, #0B3D2E 0%, #125e47 100%)" }}>
                {status === "upcoming"
                  ? <><PlayCircle size={16}/> بدء الاستشارة</>
                  : <><CheckCircle size={16}/> إنهاء وتوثيق</>
                }
              </button>
            </motion.div>
          )}

          {/* Payment status card */}
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.12 }}
            className={`${card} p-4`}>
            <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${sm}`}>الدفع</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Money size={15} className={data.isPaid ? "text-emerald-500" : "text-red-400"}/>
                <span className={`text-[13px] font-bold ${data.isPaid ? "text-emerald-500" : "text-red-400"}`}>
                  {data.isPaid ? "تم الدفع" : "لم يُدفع بعد"}
                </span>
              </div>
              <span className={`text-[15px] font-black font-mono ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                {data.fee.toLocaleString()} ريال
              </span>
            </div>
            {!data.isPaid && (
              <button className="mt-3 w-full py-2 rounded-xl text-[11px] font-bold bg-[#0B3D2E]/10 text-[#0B3D2E] dark:text-emerald-400 dark:bg-emerald-500/10 border border-[#0B3D2E]/20 hover:bg-[#0B3D2E]/15 transition-colors">
                إرسال رابط دفع
              </button>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
