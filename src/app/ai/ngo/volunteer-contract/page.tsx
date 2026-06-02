"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HandHeart, UserCirclePlus, Warning, CheckCircle,
  ArrowLeft, ArrowRight, Sparkle, Copy, Download,
  Calendar, MapPin, Phone
} from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { createWorkflowId, saveWorkflowRequest } from "@/lib/workflowStore";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";

// ─── Types ────────────────────────────────────────────────────────────────────
type VolunteerRole =
  | "مشرف ميداني" | "منسق إداري" | "مقدم خدمة" | "سائق" | "معلم / مدرب"
  | "مترجم" | "موثق وإعلامي" | "دعم نفسي" | "طبي / صحي" | "تقني / رقمي";

const VOLUNTEER_ROLES: VolunteerRole[] = [
  "مشرف ميداني", "منسق إداري", "مقدم خدمة", "سائق", "معلم / مدرب",
  "مترجم", "موثق وإعلامي", "دعم نفسي", "طبي / صحي", "تقني / رقمي"
];

type ContractDuration = "يومي" | "أسبوعي" | "شهري" | "فصلي" | "لمدة محددة" | "مفتوح";
const DURATIONS: ContractDuration[] = ["يومي", "أسبوعي", "شهري", "فصلي", "لمدة محددة", "مفتوح"];

type Step = "volunteer" | "terms" | "result";

export default function VolunteerContractPage() {
  const user = useUser();
  const [step, setStep] = useState<Step>("volunteer");

  // Volunteer info
  const [volunteerName, setVolunteerName] = useState("");
  const [volunteerId, setVolunteerId] = useState("");
  const [volunteerPhone, setVolunteerPhone] = useState("");
  const [volunteerCity, setVolunteerCity] = useState("");
  const [volunteerRole, setVolunteerRole] = useState<VolunteerRole | "">("");

  // Contract terms
  const [orgName, setOrgName] = useState("");
  const [programName, setProgramName] = useState("");
  const [duration, setDuration] = useState<ContractDuration | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hoursPerWeek, setHoursPerWeek] = useState("");
  const [workLocation, setWorkLocation] = useState("");
  const [duties, setDuties] = useState("");
  const [benefits, setBenefits] = useState("شهادة تطوع معتمدة، تأمين صحي أثناء المهام");

  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedContractId, setSavedContractId] = useState<string | null>(null);

  const MOCK_CONTRACT = `عقد تطوع
══════════════════════════════════════════

بناءً على نظام العمل التطوعي الصادر بالمرسوم الملكي رقم م/19 وتاريخ 1441/03/19هـ،
وما نصت عليه اللائحة التنفيذية من إجراءات وضوابط،

يُبرَم هذا العقد بين:

الطرف الأول (الجمعية / المنظمة):
الاسم: ${orgName || "——"}
البرنامج: ${programName || "——"}

الطرف الثاني (المتطوع):
الاسم: ${volunteerName || "——"}
رقم الهوية: ${volunteerId || "——"}
الجوال: ${volunteerPhone || "——"}
المدينة: ${volunteerCity || "——"}

────────────────────────────────────────

أولاً: مهام المتطوع ودوره
الدور: ${volunteerRole || "——"}

المهام والمسؤوليات:
${duties || "تُحدَّد المهام التفصيلية في ملحق يُرفق بهذا العقد."}

────────────────────────────────────────

ثانياً: مدة العقد وساعات العمل
مدة العقد: ${duration || "——"}
تاريخ البداية: ${startDate || "——"}
${endDate ? `تاريخ النهاية: ${endDate}` : ""}
ساعات العمل الأسبوعية: ${hoursPerWeek || "——"} ساعة
مكان العمل: ${workLocation || "——"}

────────────────────────────────────────

ثالثاً: المزايا والحوافز
${benefits}

────────────────────────────────────────

رابعاً: التزامات الطرفين

التزامات المتطوع:
1. الحضور في المواعيد المحددة والإبلاغ المسبق عند التغيب.
2. الالتزام بقيم الجمعية وأخلاقياتها وسياساتها.
3. المحافظة على سرية البيانات والمعلومات.
4. إعادة أي معدات أو مواد تسلمها في نهاية التطوع.

التزامات الجمعية:
1. توفير بيئة عمل آمنة للمتطوع.
2. إصدار شهادة تطوع معتمدة عند الانتهاء.
3. تأمين المتطوع أثناء تأدية مهامه.

────────────────────────────────────────

خامساً: إنهاء العقد
يحق لأي من الطرفين إنهاء هذا العقد بإشعار خطي قبل (3) أيام عمل.

────────────────────────────────────────

توقيع المتطوع: _____________________    التاريخ: __________
توقيع ممثل الجمعية: _________________   التاريخ: __________
الختم الرسمي للجمعية: _______________`;

  function handleGenerate() {
    setLoading(true);
    setTimeout(() => {
      const id = createWorkflowId("NGO-CTR");
      saveWorkflowRequest({
        id,
        type: "ai_draft",
        title: `عقد تطوع - ${volunteerName}`,
        description: MOCK_CONTRACT.slice(0, 500),
        requester: {
          name: user.name,
          role: user.userType,
          tier: user.tier,
        },
        receiver: "ngo_admin",
        status: "completed",
        payment: {
          amount: 0,
          status: "not_required",
        },
        sourcePath: "/ai/ngo/volunteer-contract",
        metadata: {
          volunteerName,
          volunteerId,
          volunteerPhone,
          volunteerCity,
          volunteerRole,
          orgName,
          programName,
          duration,
        },
        auditEvent: "ngo_volunteer_contract_saved",
      });
      setSavedContractId(id);
      setLoading(false);
      setStep("result");
    }, 1400);
  }

  function handleCopy() {
    navigator.clipboard.writeText(MOCK_CONTRACT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const canVolunteer = volunteerName && volunteerId && volunteerRole;
  const canTerms = orgName && duration && startDate && hoursPerWeek;

  return (
    <div className="min-h-[100dvh] bg-[#0d1117] text-white p-5 md:p-7 max-w-4xl mx-auto" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-7">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-700 to-teal-500 flex items-center justify-center shadow-lg">
          <HandHeart size={20} weight="fill" className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">صائغ عقد التطوع</h1>
          <p className="text-[12px] text-zinc-500">بيانات المتطوع + الشروط + عقد متوافق مع نظام التطوع السعودي</p>
        </div>
        <span className="mr-auto rounded-full bg-emerald-500/10 border border-emerald-500/25 px-3 py-1 text-[10px] font-bold text-emerald-400">
          جمعية خيرية
        </span>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-7">
        {(["volunteer","terms","result"] as Step[]).map((s, i) => {
          const labels = ["بيانات المتطوع", "شروط العقد", "العقد المُسوَّد"];
          const idx = ["volunteer","terms","result"].indexOf(step);
          const done = i < idx;
          const active = s === step;
          return (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 transition-all ${
                done ? "bg-emerald-500 text-white" : active ? "bg-emerald-600 text-white" : "bg-white/[0.06] text-zinc-600"
              }`}>
                {done ? <CheckCircle size={14} weight="fill" /> : i+1}
              </div>
              <span className={`text-[10px] hidden sm:block ${active ? "text-white font-semibold" : done ? "text-emerald-500" : "text-zinc-600"}`}>
                {labels[i]}
              </span>
              {i < 2 && <div className={`flex-1 h-px ${done ? "bg-emerald-500/30" : "bg-white/[0.05]"}`} />}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">

        {/* ── Step 1: Volunteer ──────────────────────────────────────────── */}
        {step === "volunteer" && (
          <motion.div key="vol" initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-12 }} className="space-y-5">

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">اسم المتطوع الكامل</label>
                <input value={volunteerName} onChange={e => setVolunteerName(e.target.value)}
                  placeholder="الاسم الرباعي"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">رقم الهوية</label>
                <input value={volunteerId} onChange={e => setVolunteerId(e.target.value)}
                  placeholder="رقم الهوية الوطنية / الإقامة"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400 flex items-center gap-1"><Phone size={11}/> الجوال</label>
                <input value={volunteerPhone} onChange={e => setVolunteerPhone(e.target.value)}
                  placeholder="05xxxxxxxx"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400 flex items-center gap-1"><MapPin size={11}/> المدينة</label>
                <input value={volunteerCity} onChange={e => setVolunteerCity(e.target.value)}
                  placeholder="الرياض / جدة / ..."
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-zinc-400 flex items-center gap-1.5"><UserCirclePlus size={12}/> الدور التطوعي</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {VOLUNTEER_ROLES.map(r => (
                  <button key={r} onClick={() => setVolunteerRole(r)}
                    className={`rounded-xl border px-3 py-2 text-[11px] font-semibold transition-all ${
                      volunteerRole === r ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-white/[0.07] bg-white/[0.03] text-zinc-500 hover:border-white/20"
                    }`}>{r}</button>
                ))}
              </div>
            </div>

            <div className="flex justify-start pt-2">
              <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
                onClick={() => setStep("terms")} disabled={!canVolunteer}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-[12px] font-bold text-white shadow-md disabled:opacity-40"
              >
                التالي — شروط العقد <ArrowLeft size={13} />
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── Step 2: Terms ──────────────────────────────────────────────── */}
        {step === "terms" && (
          <motion.div key="terms" initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-12 }} className="space-y-5">

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">اسم الجمعية / المنظمة</label>
                <input value={orgName} onChange={e => setOrgName(e.target.value)}
                  placeholder="الاسم الرسمي للجمعية"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">اسم البرنامج / المبادرة</label>
                <input value={programName} onChange={e => setProgramName(e.target.value)}
                  placeholder="اسم البرنامج التطوعي"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-zinc-400 flex items-center gap-1.5"><Calendar size={12}/> مدة العقد</label>
              <div className="grid grid-cols-3 gap-2">
                {DURATIONS.map(d => (
                  <button key={d} onClick={() => setDuration(d)}
                    className={`rounded-xl border px-3 py-2 text-[11px] font-semibold transition-all ${
                      duration === d ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-white/[0.07] bg-white/[0.03] text-zinc-500 hover:border-white/20"
                    }`}>{d}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">تاريخ البداية</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[12px] text-white focus:outline-none focus:border-emerald-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">تاريخ النهاية (اختياري)</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[12px] text-white focus:outline-none focus:border-emerald-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">ساعات أسبوعية</label>
                <input type="number" value={hoursPerWeek} onChange={e => setHoursPerWeek(e.target.value)}
                  placeholder="مثال: 10"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[12px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400">مكان العمل</label>
              <input value={workLocation} onChange={e => setWorkLocation(e.target.value)}
                placeholder="عنوان مقر الجمعية / ميداني / عن بُعد"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400">المهام والمسؤوليات</label>
              <textarea value={duties} onChange={e => setDuties(e.target.value)} rows={3}
                placeholder="اذكر المهام الرئيسية للمتطوع في هذا الدور..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40 resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400">المزايا المقدمة للمتطوع</label>
              <input value={benefits} onChange={e => setBenefits(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white focus:outline-none focus:border-emerald-500/40"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep("volunteer")}
                className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-[12px] font-semibold text-zinc-400">
                <ArrowRight size={13} /> السابق
              </button>
              <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
                onClick={handleGenerate} disabled={!canTerms || loading}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-l from-emerald-700 to-teal-500 px-7 py-2.5 text-[12px] font-bold text-white shadow-lg shadow-emerald-500/20 disabled:opacity-60"
              >
                {loading ? (
                  <><motion.div animate={{ rotate:360 }} transition={{ duration:0.8, repeat:Infinity, ease:"linear" }}
                    className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white" />
                  جارٍ الصياغة...</>
                ) : (
                  <><Sparkle size={14} weight="fill" /> أنشئ عقد التطوع</>
                )}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── Step 3: Result ────────────────────────────────────────────── */}
        {step === "result" && (
          <motion.div key="result" initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }} className="space-y-5">
            <BetaReviewGate toolId="ngo.volunteer-contract" toolName="عقد التطوع" reviewScope="legal-data">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} weight="fill" className="text-emerald-500" />
                <span className="text-[13px] font-bold text-white">تم إنشاء عقد التطوع</span>
                {savedContractId && (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-400">{savedContractId}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:text-white transition-all">
                  {copied ? <CheckCircle size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  {copied ? "تم" : "نسخ"}
                </button>
                <button className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:text-white transition-all">
                  <Download size={12} /> تحميل PDF
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
              <pre className="text-[12px] text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">{MOCK_CONTRACT}</pre>
            </div>

            {/* Unified Result Actions */}
            <AiResultActions
              text={MOCK_CONTRACT}
              filename={`volunteer-contract-${volunteerName || "draft"}`}
              showVault
              showHumanReview
              className="justify-start"
            />

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-[11px] text-zinc-500 flex gap-2">
              <Warning size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>يجب توقيع العقد من الطرفين وختمه قبل الاعتماد — لا يُعدّ العقد نافذاً بدون توقيع.</span>
            </div>
            </BetaReviewGate>

            <button onClick={() => { setStep("volunteer"); setVolunteerName(""); setVolunteerId(""); setVolunteerRole(""); setSavedContractId(null); }}
              className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-[12px] font-semibold text-zinc-400 hover:text-white hover:border-white/20 transition-all">
              <HandHeart size={13} /> عقد متطوع جديد
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
