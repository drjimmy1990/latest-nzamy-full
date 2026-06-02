"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle, DownloadSimple, ShareNetwork, Lock,
  WhatsappLogo, EnvelopeSimple,
  Microphone, PencilSimple, Sparkle, X, Stop, Play,
  Plus, Trash, User, Broom, ArrowRight, Star,
} from "@phosphor-icons/react";
import Link from "next/link";
import { NajizOptimizerModal } from "@/components/draft/NajizOptimizerModal";
import { MOCK_DRAFT } from "@/components/draft/draftConstants";

interface StepApprovalProps {
  isDark: boolean;
  shareLink: string | null;
  sharePasscode: string | null;
  linkCopied: boolean;
  setLinkCopied: (v: boolean) => void;
  clientEmail: string;
  setClientEmail: (v: string) => void;
  clientPhone: string;
  setClientPhone: (v: string) => void;
  setShareLink: (v: string | null) => void;
  setSharePasscode: (v: string | null) => void;
  generateShareLink: () => void;
}

// ─── AI memo summary ──────────────────────────────────────────────────────────
const AI_MEMO_SUMMARY = [
  "هذه المذكرة تُثير دفوعاً قانونية رئيسية — اقرأها بعناية.",
  "الدفع الأول يستند لنصوص نظامية مباشرة وهو الأقوى قانونياً.",
  "تضمنت المذكرة طلباً احتياطياً في حال رفض الطلب الرئيسي.",
  "جميع المعلومات سرية ولا تُشارَك مع أي طرف ثالث.",
  "ستُبلَّغ فور صدور أي قرار أو جلسة جديدة.",
];

type ExplainMode = "none" | "voice" | "text" | "ai";

// ─── Client entry type ────────────────────────────────────────────────────────
interface ClientEntry {
  id: number;
  name: string;
  email: string;
  phone: string;
  note: string;
  noteMode: "none" | "text" | "voice";
  link: string | null;
  passcode: string | null;
  linkCopied: boolean;
}

function makeClient(id: number): ClientEntry {
  return { id, name: "", email: "", phone: "", note: "", noteMode: "none", link: null, passcode: null, linkCopied: false };
}

// ─── Single client row ────────────────────────────────────────────────────────
function ClientRow({
  client, isDark, onChange, onRemove, onGenerate,
}: {
  client: ClientEntry; isDark: boolean;
  onChange: (fields: Partial<ClientEntry>) => void;
  onRemove: () => void;
  onGenerate: () => void;
}) {
  const [recording, setRecording]   = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [recorded, setRecorded]     = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  function startRec() { setRecording(true); setRecSeconds(0); timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000); }
  function stopRec()  { setRecording(false); setRecorded(true); if (timerRef.current) clearInterval(timerRef.current); }
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className={`rounded-2xl border overflow-hidden ${isDark ? "border-white/[0.07] bg-zinc-900/60" : "border-slate-200 bg-white shadow-sm"}`}>
      {/* Header */}
      <div className={`flex items-center gap-2 px-4 py-3 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
        <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
          <User size={13} weight="duotone" className="text-[#C8A762]" />
        </div>
        <input
          value={client.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="اسم العميل (اختياري)"
          className={`flex-1 bg-transparent text-[12px] font-semibold outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-zinc-800 placeholder:text-slate-400"}`}
        />
        <button onClick={onRemove} className={`w-6 h-6 flex items-center justify-center rounded-lg ${isDark ? "text-zinc-600 hover:text-red-400" : "text-slate-400 hover:text-red-500"}`}>
          <Trash size={12} />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Email + Phone */}
        <div className="grid grid-cols-2 gap-2">
          <input type="email" value={client.email} onChange={e => onChange({ email: e.target.value })}
            placeholder="بريد العميل"
            className={`rounded-xl border px-3 py-2 text-[11px] outline-none ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-zinc-50 text-zinc-800 placeholder:text-slate-400"}`} />
          <input type="tel" value={client.phone} onChange={e => onChange({ phone: e.target.value })}
            placeholder="+966 5X XXX XXXX"
            className={`rounded-xl border px-3 py-2 text-[11px] outline-none ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-zinc-50 text-zinc-800 placeholder:text-slate-400"}`} />
        </div>

        {/* Note mode */}
        <div>
          <p className={`text-[10px] font-bold mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>ملاحظة للعميل (تظهر جانبياً على المذكرة)</p>
          <div className={`flex gap-1 p-0.5 rounded-xl mb-2 ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
            {(["none", "text", "voice"] as const).map(m => (
              <button key={m} onClick={() => onChange({ noteMode: m })}
                className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold transition-all ${client.noteMode === m ? isDark ? "bg-zinc-700 text-white" : "bg-white text-slate-800 shadow-sm" : isDark ? "text-zinc-600" : "text-slate-400"}`}>
                {m === "none" ? "بدون" : m === "text" ? "✏️ كتابة" : "🎙 صوت"}
              </button>
            ))}
          </div>

          <AnimatePresence>
            {client.noteMode === "text" && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <textarea value={client.note} onChange={e => onChange({ note: e.target.value })} rows={2}
                  placeholder="اكتب الملاحظة هنا — ستظهر للعميل جانبياً على المذكرة..."
                  className={`w-full resize-none rounded-xl border px-3 py-2 text-[11px] outline-none ${isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-slate-400"}`} />
              </motion.div>
            )}
            {client.noteMode === "voice" && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className={`rounded-xl border p-3 text-center space-y-2 ${isDark ? "border-white/[0.06] bg-zinc-800/40" : "border-slate-100 bg-slate-50"}`}>
                  {recorded ? (
                    <div className="flex items-center gap-2 justify-center">
                      <Play size={12} className="text-[#C8A762]" weight="fill" />
                      <div className={`flex-1 max-w-[140px] h-1.5 rounded-full ${isDark ? "bg-zinc-700" : "bg-slate-200"}`}>
                        <div className="h-full w-2/3 rounded-full bg-[#C8A762]" />
                      </div>
                      <span className={`text-[10px] font-mono ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{fmt(recSeconds)}</span>
                      <button onClick={() => { setRecorded(false); setRecSeconds(0); }}
                        className={`text-[9px] underline ${isDark ? "text-zinc-600" : "text-slate-400"}`}>إعادة</button>
                    </div>
                  ) : recording ? (
                    <div className="flex items-center justify-center gap-2">
                      <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }}
                        className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      <span className={`text-[11px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{fmt(recSeconds)}</span>
                      <button onClick={stopRec} className="text-[10px] px-2 py-1 rounded-lg bg-red-500/10 text-red-500 font-bold">
                        <Stop size={10} weight="fill" className="inline mr-1" />إيقاف
                      </button>
                    </div>
                  ) : (
                    <button onClick={startRec} className="flex items-center gap-1.5 mx-auto px-4 py-1.5 rounded-xl bg-red-500 text-white text-[11px] font-bold">
                      <Microphone size={11} weight="fill" />بدء التسجيل
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Generate link */}
        {!client.link ? (
          <motion.button whileTap={{ scale: 0.97 }} onClick={onGenerate}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#C8A762] px-4 py-2 text-[11px] font-bold text-white">
            <Lock size={11} weight="fill" />إنشاء رابط + باسكود
          </motion.button>
        ) : (
          <div className="space-y-2">
            <div className={`rounded-xl p-2.5 border flex items-center gap-2 ${isDark ? "border-emerald-700/25 bg-emerald-900/8" : "border-emerald-200 bg-emerald-50"}`}>
              <CheckCircle size={11} weight="fill" className="text-emerald-500 flex-shrink-0" />
              <code className={`flex-1 text-[10px] font-mono truncate ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{client.link}</code>
              <button onClick={() => { navigator.clipboard.writeText(client.link!); onChange({ linkCopied: true }); setTimeout(() => onChange({ linkCopied: false }), 2000); }}
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${client.linkCopied ? "border-emerald-500/30 text-emerald-500" : isDark ? "border-white/[0.08] text-zinc-500" : "border-slate-200 text-slate-400"}`}>
                {client.linkCopied ? "✓" : "نسخ"}
              </button>
            </div>
            <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-center gap-1.5">
                <Lock size={10} className="text-[#C8A762]" weight="fill" />
                <span className={`text-[10px] font-semibold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>الباسكود:</span>
              </div>
              <code className="text-[15px] font-mono font-bold tracking-[0.25em] text-[#C8A762]">{client.passcode}</code>
            </div>
            <div className="flex gap-2">
              {client.phone && (
                <a href={`https://wa.me/${client.phone.replace(/\s|\+/g, "")}?text=${encodeURIComponent(`مرفق رابط اعتماد المذكرة: ${client.link}\nالباسكود: ${client.passcode}`)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white">
                  <WhatsappLogo size={11} weight="fill" />واتسآب
                </a>
              )}
              {client.email && (
                <a href={`mailto:${client.email}?subject=مذكرتك للاعتماد&body=الرابط: ${client.link}%0Aالباسكود: ${client.passcode}`}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold ${isDark ? "border-white/[0.08] text-zinc-300" : "border-slate-200 text-zinc-600"}`}>
                  <EnvelopeSimple size={11} />بريد
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main StepApproval ─────────────────────────────────────────────────────────
export function StepApproval({
  isDark, shareLink, sharePasscode, linkCopied, setLinkCopied,
  clientEmail, setClientEmail, clientPhone, setClientPhone,
  setShareLink, setSharePasscode, generateShareLink,
}: StepApprovalProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  const [explainMode, setExplainMode] = useState<ExplainMode>("none");
  const [textNote,    setTextNote]    = useState("");
  const [aiGenerated, setAiGenerated] = useState(false);
  const [aiLoading,   setAiLoading]   = useState(false);
  const [recording,   setRecording]   = useState(false);
  const [recorded,    setRecorded]    = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [recSeconds, setRecSeconds]   = useState(0);

  const [showNajizModal, setShowNajizModal] = useState(false);

  // Multi-client
  const [clients, setClients] = useState<ClientEntry[]>([makeClient(Date.now())]);

  function addClient() { setClients(prev => [...prev, makeClient(Date.now())]); }
  function removeClient(id: number) { setClients(prev => prev.filter(c => c.id !== id)); }
  function updateClient(id: number, fields: Partial<ClientEntry>) {
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...fields } : c));
  }
  function generateForClient(id: number) {
    const token = Math.random().toString(36).substring(2, 10).toUpperCase();
    const code  = String(Math.floor(100000 + Math.random() * 900000));
    updateClient(id, { link: `https://nzamy.sa/share/${token}`, passcode: code });
  }

  function startRec() { setRecording(true); setRecSeconds(0); timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000); }
  function stopRec()  { setRecording(false); setRecorded(true); if (timerRef.current) clearInterval(timerRef.current); }
  function genAI()    { setAiLoading(true); setTimeout(() => { setAiLoading(false); setAiGenerated(true); }, 1800); }
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

      {/* ── Ready banner ── */}
      <div className={`${card} p-4 shadow-sm`}>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 flex-shrink-0">
            <CheckCircle size={18} weight="fill" className="text-emerald-500" />
          </div>
          <div>
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>
              المذكرة اجتازت المراجعة — جاهزة للاعتماد والمشاركة
            </p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              تم فحص البنية القانونية والجودة
            </p>
          </div>
        </div>
      </div>

      {/* ── Download ── */}
      <div className="flex gap-3">
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-3 text-[13px] font-bold text-white shadow-md">
          <DownloadSimple size={15} /> تنزيل Word
        </motion.button>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-[13px] font-semibold ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-zinc-200 bg-white text-zinc-600"}`}>
          <DownloadSimple size={15} /> تنزيل PDF
        </motion.button>
      </div>

      {/* ── Client sharing (multi-client) ── */}
      <div className={`${card} p-5 shadow-sm border-2 ${isDark ? "border-[#C8A762]/20" : "border-amber-200/80"} space-y-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShareNetwork size={15} className="text-[#C8A762]" weight="duotone" />
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>مشاركة المذكرة مع العميل</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-400"}`}>اختياري</span>
          </div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={addClient}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${isDark ? "border-[#C8A762]/30 text-[#C8A762] hover:bg-[#C8A762]/10" : "border-amber-300 text-amber-700 hover:bg-amber-50"}`}>
            <Plus size={12} />إضافة عميل
          </motion.button>
        </div>

        {/* Client rows */}
        <div className="space-y-3">
          {clients.map((client, idx) => (
            <ClientRow
              key={client.id}
              client={client}
              isDark={isDark}
              onChange={f => updateClient(client.id, f)}
              onRemove={() => clients.length > 1 ? removeClient(client.id) : undefined}
              onGenerate={() => generateForClient(client.id)}
            />
          ))}
        </div>

        {/* ── Explain to client (directly below sharing) ── */}
        <div className={`rounded-2xl border p-4 space-y-3 ${isDark ? "border-white/[0.05] bg-zinc-800/30" : "border-slate-100 bg-slate-50"}`}>
          <div>
            <p className={`text-[12px] font-bold mb-0.5 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
              💬 شرح للعميل
              <span className={`mr-2 text-[9px] font-normal px-1.5 py-0.5 rounded-full ${isDark ? "bg-zinc-700 text-zinc-500" : "bg-slate-200 text-slate-400"}`}>اختياري</span>
            </p>
            <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              يُرفق مع رابط المشاركة — يظهر للعميل جانبياً على المذكرة عند فتح الرابط
            </p>
          </div>

          {/* Mode selector */}
          <div className="grid grid-cols-4 gap-1.5">
            {([
              { key: "none",  label: "لا شيء",       icon: X },
              { key: "voice", label: "تسجيل صوتي",   icon: Microphone },
              { key: "text",  label: "ملاحظة",        icon: PencilSimple },
              { key: "ai",    label: "ملخص AI",       icon: Sparkle },
            ] as const).map(opt => {
              const Icon = opt.icon;
              const active = explainMode === opt.key;
              return (
                <button key={opt.key} onClick={() => setExplainMode(opt.key)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[10px] font-bold transition-all ${active ? isDark ? "border-[#C8A762]/40 bg-[#C8A762]/10 text-[#C8A762]" : "border-[#C8A762]/30 bg-amber-50 text-amber-700" : isDark ? "border-white/[0.06] text-zinc-600" : "border-slate-200 text-slate-400"}`}>
                  <Icon size={13} weight={active ? "fill" : "regular"} />
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Voice */}
          <AnimatePresence>
            {explainMode === "voice" && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className={`rounded-xl border p-3 text-center space-y-2 ${isDark ? "border-white/[0.06] bg-zinc-800/50" : "border-slate-100 bg-white"}`}>
                  {recorded ? (
                    <div className="flex items-center gap-3 justify-center">
                      <Play size={13} className="text-[#C8A762]" weight="fill" />
                      <div className={`flex-1 max-w-[140px] h-1.5 rounded-full ${isDark ? "bg-zinc-700" : "bg-slate-200"}`}><div className="h-full w-2/3 rounded-full bg-[#C8A762]" /></div>
                      <span className={`text-[11px] font-mono ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{fmt(recSeconds)}</span>
                      <button onClick={() => { setRecorded(false); setRecSeconds(0); }} className={`text-[10px] underline ${isDark ? "text-zinc-500" : "text-slate-400"}`}>إعادة</button>
                    </div>
                  ) : recording ? (
                    <div className="flex items-center justify-center gap-3">
                      <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1, repeat: Infinity }} className="w-3 h-3 rounded-full bg-red-500" />
                      <span className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>جارٍ التسجيل... {fmt(recSeconds)}</span>
                      <button onClick={stopRec} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 text-[11px] font-bold">
                        <span>إيقاف</span>
                      </button>
                    </div>
                  ) : (
                    <button onClick={startRec} className="flex items-center gap-2 mx-auto px-4 py-2 rounded-xl bg-red-500 text-white text-[12px] font-bold">
                      <Microphone size={13} weight="fill" /> بدء التسجيل
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Text note */}
          <AnimatePresence>
            {explainMode === "text" && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <textarea value={textNote} onChange={e => setTextNote(e.target.value)} rows={3}
                  placeholder="اكتب ملاحظتك للعميل — مثلاً: المذكرة ترتكز على... يرجى الانتباه إلى..."
                  className={`w-full rounded-xl border px-3 py-2.5 text-[12px] outline-none resize-none leading-relaxed ${isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600" : "border-zinc-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* AI summary */}
          <AnimatePresence>
            {explainMode === "ai" && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                {!aiGenerated ? (
                  <div className={`rounded-xl border p-3 text-center space-y-2 ${isDark ? "border-[#C8A762]/15 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50/50"}`}>
                    <Sparkle size={20} weight="duotone" className="mx-auto text-[#C8A762]" />
                    <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>ملخص مبسّط للعميل — بدون مصطلحات قانونية</p>
                    <motion.button whileTap={{ scale: 0.96 }} onClick={genAI} disabled={aiLoading}
                      className="flex items-center gap-2 mx-auto px-4 py-2 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[11px] font-bold disabled:opacity-60">
                      {aiLoading
                        ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-3 h-3 rounded-full border-2 border-[#C8A762]/30 border-t-[#C8A762]" />يولّد...</>
                        : <><Sparkle size={11} weight="fill" />توليد الملخص</>}
                    </motion.button>
                  </div>
                ) : (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    className={`rounded-xl border p-3 space-y-2 ${isDark ? "border-[#C8A762]/15 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50/50"}`}>
                    <div className="flex items-center gap-2">
                      <Sparkle size={12} weight="fill" className="text-[#C8A762]" />
                      <p className="text-[11px] font-bold text-[#C8A762]">ملخص مبسّط</p>
                    </div>
                    <ul className="space-y-1.5">
                      {AI_MEMO_SUMMARY.map((pt, i) => (
                        <motion.li key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                          className={`flex items-start gap-2 text-[11px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                          <span className="text-[#C8A762] font-bold flex-shrink-0">{i + 1}.</span>{pt}
                        </motion.li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── ما بعد المذكرة (ناجز فقط — شيل المحاكاة والتقرير) ── */}
      <div className={`rounded-2xl border-2 p-5 space-y-4 ${isDark ? "border-[#C8A762]/15 bg-[#C8A762]/[0.04]" : "border-amber-100 bg-amber-50/60"}`}>
        <div className="flex items-center gap-2">
          <Star size={15} className="text-[#C8A762]" weight="duotone" />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>ماذا بعد؟</p>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-white text-slate-400 border border-slate-200"}`}>اختياري</span>
        </div>

        {/* Only Najiz card */}
        <button onClick={() => setShowNajizModal(true)}
          className={`group w-full text-start flex items-start gap-4 p-4 rounded-2xl border transition-all hover:scale-[1.01] ${isDark ? "border-white/[0.07] bg-zinc-900 hover:border-[#C8A762]/30" : "border-slate-200 bg-white shadow-sm hover:border-amber-300 hover:shadow-md"}`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
            <Broom size={19} weight="duotone" className="text-[#C8A762]" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>منقح ناجز</p>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-100 text-emerald-700"}`}>مُوصى به</span>
            </div>
            <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
              هيّئ المذكرة للرفع على منصة ناجز — إزالة رموز وحقول فارغة + ضبط الحروف + التحقق من متطلبات الرفع
            </p>
          </div>
          <div className={`flex items-center gap-1 text-[11px] font-bold mt-1 ${isDark ? "text-[#C8A762]" : "text-amber-600"}`}>
            تنقيح ورفع <ArrowRight size={11} className="rotate-180" />
          </div>
        </button>
      </div>

      <AnimatePresence>
        {showNajizModal && (
          <NajizOptimizerModal
            isDark={isDark}
            initialText={MOCK_DRAFT}
            onClose={() => setShowNajizModal(false)}
          />
        )}
      </AnimatePresence>

    </motion.div>
  );
}
