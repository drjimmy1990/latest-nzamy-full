"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Warning, CheckCircle, ArrowLeft, ArrowRight,
  Sparkle, Copy, Download, Plus, Trash, Clock, MapPin
} from "@phosphor-icons/react";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";

// ─── Types ────────────────────────────────────────────────────────────────────
type IncidentType =
  | "حادث مروري" | "جريمة ضد النفس" | "جريمة ضد المال"
  | "ضبط مواد مخدرة" | "انتهاك أمني" | "حريق / كارثة" | "غير ذلك";

const INCIDENT_TYPES: IncidentType[] = [
  "حادث مروري", "جريمة ضد النفس", "جريمة ضد المال",
  "ضبط مواد مخدرة", "انتهاك أمني", "حريق / كارثة", "غير ذلك"
];

interface Witness {
  id: string;
  name: string;
  id_number: string;
  statement: string;
}

interface Accused {
  id: string;
  name: string;
  id_number: string;
  nationality: string;
}

export default function IncidentReportPage() {
  // Step state
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 — Incident info
  const [incidentType, setIncidentType] = useState<IncidentType | "">("");
  const [incidentDate, setIncidentDate] = useState("");
  const [incidentTime, setIncidentTime] = useState("");
  const [incidentPlace, setIncidentPlace] = useState("");
  const [incidentDesc, setIncidentDesc] = useState("");

  // Step 2 — Parties
  const [accused, setAccused] = useState<Accused[]>([
    { id: "1", name: "", id_number: "", nationality: "سعودي" }
  ]);
  const [victims, setVictims] = useState<string>("");
  const [witnesses, setWitnesses] = useState<Witness[]>([
    { id: "1", name: "", id_number: "", statement: "" }
  ]);

  // Step 3 — Evidence
  const [evidenceDesc, setEvidenceDesc] = useState("");
  const [seized, setSeized] = useState("");
  const [officerNotes, setOfficerNotes] = useState("");

  // Result
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  function addAccused() {
    setAccused(p => [...p, { id: Date.now().toString(), name: "", id_number: "", nationality: "سعودي" }]);
  }
  function removeAccused(id: string) {
    setAccused(p => p.filter(a => a.id !== id));
  }
  function updateAccused(id: string, field: keyof Accused, value: string) {
    setAccused(p => p.map(a => a.id === id ? { ...a, [field]: value } : a));
  }

  function addWitness() {
    setWitnesses(p => [...p, { id: Date.now().toString(), name: "", id_number: "", statement: "" }]);
  }
  function removeWitness(id: string) {
    setWitnesses(p => p.filter(w => w.id !== id));
  }
  function updateWitness(id: string, field: keyof Witness, value: string) {
    setWitnesses(p => p.map(w => w.id === id ? { ...w, [field]: value } : w));
  }

  const MOCK_REPORT = `تقرير حادثة رسمي
══════════════════════════════════════════

الجهة: وزارة الداخلية — ${incidentType || "نوع الحادثة"}
التاريخ: ${incidentDate || "——"}  الوقت: ${incidentTime || "——"}
المكان: ${incidentPlace || "——"}

────────────────────────────────────────

أولاً: وصف الحادثة
${incidentDesc || "وصف الحادثة..."}

────────────────────────────────────────

ثانياً: أطراف الحادثة

المتهمون:
${accused.filter(a => a.name).map((a, i) =>
  `${i+1}. ${a.name} | هوية: ${a.id_number} | الجنسية: ${a.nationality}`
).join("\n") || "لم يُدرَج متهم"}

المجني عليهم / الضحايا:
${victims || "——"}

الشهود:
${witnesses.filter(w => w.name).map((w, i) =>
  `${i+1}. ${w.name} (${w.id_number})\n   أقوال الشاهد: ${w.statement}`
).join("\n") || "لا شهود"}

────────────────────────────────────────

ثالثاً: المضبوطات والأدلة
${evidenceDesc || "——"}

${seized ? `المضبوطات: ${seized}` : ""}

────────────────────────────────────────

رابعاً: ملاحظات الضابط المحرر
${officerNotes || "——"}

────────────────────────────────────────

صدر هذا التقرير بتاريخ ${incidentDate || "——"}
محرر التقرير: __________________
الرقم الوظيفي: __________________
التوقيع والختم: __________________`;

  function handleGenerate() {
    setLoading(true);
    setTimeout(() => { setLoading(false); setStep(4); }, 1400);
  }

  function handleCopy() {
    navigator.clipboard.writeText(MOCK_REPORT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const STEPS = ["بيانات الحادثة", "الأطراف", "الأدلة", "التقرير"];

  return (
    <div className="min-h-[100dvh] bg-[#0d1117] text-white p-5 md:p-7 max-w-4xl mx-auto" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-7">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-400 flex items-center justify-center shadow-lg">
          <FileText size={20} weight="fill" className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">مُحرِّر تقارير الحوادث</h1>
          <p className="text-[12px] text-zinc-500">بيانات الحادثة + أطراف + أدلة + تقرير رسمي</p>
        </div>
        <span className="mr-auto rounded-full bg-slate-500/10 border border-slate-500/25 px-3 py-1 text-[10px] font-bold text-slate-400">
          حكومي · ضابط
        </span>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-7">
        {STEPS.map((label, i) => {
          const done = i < step - 1;
          const active = i === step - 1;
          return (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 transition-all ${
                done ? "bg-emerald-500 text-white" :
                active ? "bg-slate-400 text-black" :
                "bg-white/[0.06] text-zinc-600"
              }`}>
                {done ? <CheckCircle size={14} weight="fill" /> : i + 1}
              </div>
              <span className={`text-[10px] hidden sm:block ${active ? "text-white font-semibold" : done ? "text-emerald-500" : "text-zinc-600"}`}>
                {label}
              </span>
              {i < 3 && <div className={`flex-1 h-px ${done ? "bg-emerald-500/30" : "bg-white/[0.05]"}`} />}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">

        {/* ── Step 1 ─────────────────────────────────────────────────────── */}
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-12 }} className="space-y-5">

            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-zinc-400">نوع الحادثة</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {INCIDENT_TYPES.map(t => (
                  <button key={t} onClick={() => setIncidentType(t)}
                    className={`rounded-xl border px-3 py-2 text-[11px] font-semibold transition-all ${
                      incidentType === t ? "border-slate-400/50 bg-slate-400/10 text-slate-300" : "border-white/[0.07] bg-white/[0.03] text-zinc-500 hover:border-white/20"
                    }`}>{t}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400 flex items-center gap-1.5"><MapPin size={11}/> مكان الحادثة</label>
                <input value={incidentPlace} onChange={e => setIncidentPlace(e.target.value)}
                  placeholder="المدينة / الحي / الشارع..."
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-slate-400/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400 flex items-center gap-1.5"><Clock size={11}/> الوقت</label>
                <input type="time" value={incidentTime} onChange={e => setIncidentTime(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white focus:outline-none focus:border-slate-400/40"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400">التاريخ</label>
              <input type="date" value={incidentDate} onChange={e => setIncidentDate(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white focus:outline-none focus:border-slate-400/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400">وصف مختصر للحادثة</label>
              <textarea value={incidentDesc} onChange={e => setIncidentDesc(e.target.value)} rows={4}
                placeholder="اصف الحادثة بشكل موجز وواضح..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-slate-400/40 resize-none leading-relaxed"
              />
            </div>

            <div className="flex justify-start pt-2">
              <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
                onClick={() => setStep(2)} disabled={!incidentType || !incidentDesc}
                className="flex items-center gap-2 rounded-xl bg-slate-500 px-6 py-2.5 text-[12px] font-bold text-white shadow-md disabled:opacity-40"
              >
                التالي — الأطراف <ArrowLeft size={13} />
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── Step 2 ─────────────────────────────────────────────────────── */}
        {step === 2 && (
          <motion.div key="s2" initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-12 }} className="space-y-5">

            {/* Accused */}
            <div className="space-y-3">
              <label className="text-[12px] font-semibold text-zinc-400">المتهمون / الموقوفون</label>
              {accused.map((a, i) => (
                <div key={a.id} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-zinc-500">متهم #{i+1}</span>
                    {accused.length > 1 && (
                      <button onClick={() => removeAccused(a.id)} className="rounded-lg border border-red-500/20 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 transition-all">
                        <Trash size={11} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <input value={a.name} onChange={e => updateAccused(a.id, "name", e.target.value)}
                        placeholder="الاسم الكامل"
                        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-slate-400/40"
                      />
                    </div>
                    <div>
                      <input value={a.id_number} onChange={e => updateAccused(a.id, "id_number", e.target.value)}
                        placeholder="رقم الهوية"
                        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-slate-400/40"
                      />
                    </div>
                    <div>
                      <select value={a.nationality} onChange={e => updateAccused(a.id, "nationality", e.target.value)}
                        className="w-full rounded-xl border border-white/[0.08] bg-zinc-900 px-3 py-2 text-[12px] text-white focus:outline-none focus:border-slate-400/40">
                        {["سعودي","مصري","يمني","سوداني","باكستاني","هندي","بنغلاديشي","أثيوبي","غير محدد"].map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={addAccused}
                className="flex items-center gap-2 rounded-xl border border-dashed border-white/[0.10] bg-white/[0.02] px-4 py-2.5 text-[12px] font-semibold text-zinc-500 hover:border-white/20 hover:text-zinc-400 w-full justify-center transition-all">
                <Plus size={12} /> إضافة متهم آخر
              </button>
            </div>

            {/* Victims */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400">المجني عليهم / الضحايا</label>
              <textarea value={victims} onChange={e => setVictims(e.target.value)} rows={2}
                placeholder="اذكر أسماء الضحايا وبياناتهم..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-slate-400/40 resize-none"
              />
            </div>

            {/* Witnesses */}
            <div className="space-y-3">
              <label className="text-[12px] font-semibold text-zinc-400">الشهود</label>
              {witnesses.map((w, i) => (
                <div key={w.id} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-zinc-500">شاهد #{i+1}</span>
                    {witnesses.length > 1 && (
                      <button onClick={() => removeWitness(w.id)} className="rounded-lg border border-red-500/20 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 transition-all">
                        <Trash size={11} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={w.name} onChange={e => updateWitness(w.id, "name", e.target.value)}
                      placeholder="اسم الشاهد"
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-slate-400/40"
                    />
                    <input value={w.id_number} onChange={e => updateWitness(w.id, "id_number", e.target.value)}
                      placeholder="رقم الهوية"
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-slate-400/40"
                    />
                  </div>
                  <textarea value={w.statement} onChange={e => updateWitness(w.id, "statement", e.target.value)} rows={2}
                    placeholder="ملخص أقوال الشاهد..."
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-slate-400/40 resize-none"
                  />
                </div>
              ))}
              <button onClick={addWitness}
                className="flex items-center gap-2 rounded-xl border border-dashed border-white/[0.10] bg-white/[0.02] px-4 py-2.5 text-[12px] font-semibold text-zinc-500 hover:border-white/20 hover:text-zinc-400 w-full justify-center transition-all">
                <Plus size={12} /> إضافة شاهد آخر
              </button>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep(1)}
                className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-[12px] font-semibold text-zinc-400">
                <ArrowRight size={13} /> السابق
              </button>
              <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
                onClick={() => setStep(3)}
                className="flex items-center gap-2 rounded-xl bg-slate-500 px-6 py-2.5 text-[12px] font-bold text-white shadow-md">
                التالي — الأدلة <ArrowLeft size={13} />
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── Step 3 ─────────────────────────────────────────────────────── */}
        {step === 3 && (
          <motion.div key="s3" initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-12 }} className="space-y-5">

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400">الأدلة والمشاهدات الميدانية</label>
              <textarea value={evidenceDesc} onChange={e => setEvidenceDesc(e.target.value)} rows={4}
                placeholder="اذكر الأدلة الموجودة في مسرح الجريمة، الصور، التسجيلات..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-slate-400/40 resize-none leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400">المضبوطات (اختياري)</label>
              <textarea value={seized} onChange={e => setSeized(e.target.value)} rows={2}
                placeholder="أدوات الجريمة، مواد مضبوطة، أسلحة..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-slate-400/40 resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400">ملاحظات الضابط المحرر</label>
              <textarea value={officerNotes} onChange={e => setOfficerNotes(e.target.value)} rows={3}
                placeholder="أي ملاحظات إضافية من الضابط المحرر..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-slate-400/40 resize-none"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep(2)}
                className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-[12px] font-semibold text-zinc-400">
                <ArrowRight size={13} /> السابق
              </button>
              <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
                onClick={handleGenerate} disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-l from-slate-600 to-slate-400 px-7 py-2.5 text-[12px] font-bold text-white shadow-lg disabled:opacity-60">
                {loading ? (
                  <><motion.div animate={{ rotate:360 }} transition={{ duration:0.8, repeat:Infinity, ease:"linear" }}
                    className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white" />
                  جارٍ إنشاء التقرير...</>
                ) : (
                  <><Sparkle size={14} weight="fill" /> أنشئ التقرير</>
                )}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── Step 4 — Result ──────────────────────────────────────────────── */}
        {step === 4 && (
          <motion.div key="s4" initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }} className="space-y-5">
            <BetaReviewGate toolId="gov.incident-report" toolName="تقرير الحادثة الرسمي" reviewScope="legal-data">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} weight="fill" className="text-emerald-500" />
                <span className="text-[13px] font-bold text-white">تم إنشاء التقرير</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:text-white transition-all">
                  {copied ? <CheckCircle size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  {copied ? "تم" : "نسخ"}
                </button>
                <button className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:text-white transition-all">
                  <Download size={12} /> تحميل
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
              <pre className="text-[12px] text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">{MOCK_REPORT}</pre>
            </div>

            <AiResultActions text={MOCK_REPORT} filename="gov-incident-report" showShare />

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-[11px] text-zinc-500 flex gap-2">
              <Warning size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <span>مسودة مساعدة — يجب مراجعتها وتوقيعها من الضابط المختص قبل الإيداع الرسمي.</span>
            </div>
            </BetaReviewGate>

            <button onClick={() => { setStep(1); setIncidentType(""); setIncidentDesc(""); setAccused([{ id:"1", name:"", id_number:"", nationality:"سعودي" }]); }}
              className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-[12px] font-semibold text-zinc-400 hover:text-white hover:border-white/20 transition-all">
              <FileText size={13} /> تقرير جديد
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
