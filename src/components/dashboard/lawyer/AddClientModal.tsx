import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Buildings, Star, Check, X
} from "@phosphor-icons/react";
import { type Client, type ClientFlag, FLAG_CONFIG } from "@/constants/lawyerClientsData";

export default function AddClientModal({ isDark, onClose, onAdd }: {
  isDark: boolean;
  onClose: () => void;
  onAdd: (c: Client) => void;
}) {
  const [step, setStep] = useState(0); // 0=basic 1=fees 2=flags
  const [name,     setName]     = useState("");
  const [type,     setType]     = useState<"individual" | "company">("individual");
  const [phone,    setPhone]    = useState("");
  const [total,    setTotal]    = useState("");
  const [paid,     setPaid]     = useState("");
  const [flags,    setFlags]    = useState<Set<ClientFlag>>(new Set());
  const [rating,   setRating]   = useState<1|2|3|4|5>(3);

  const toggleFlag = (f: ClientFlag) => setFlags(prev => {
    const s = new Set(prev); s.has(f) ? s.delete(f) : s.add(f); return s;
  });

  const canNext = step === 0 ? name.trim().length > 0 && phone.trim().length > 0 : true;

  const handleSubmit = () => {
    onAdd({
      id: Date.now().toString(),
      name: name.trim(),
      type,
      phone: phone.trim(),
      activeCases: 0,
      closedCases: 0,
      totalFees: Number(total) || 0,
      paidFees: Number(paid) || 0,
      since: new Date().toLocaleDateString("ar-SA", { month: "long", year: "numeric" }),
      lastContact: "اليوم",
      flags: [...flags],
      rating,
    });
    onClose();
  };

  const overlay = isDark
    ? "bg-zinc-900 border-white/[0.08]"
    : "bg-white border-slate-200";

  const STEP_LABELS = ["البيانات الأساسية", "الأتعاب", "التصنيفات"];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className={`w-full max-w-md rounded-3xl border shadow-2xl ${overlay} overflow-hidden`}
          onClick={e => e.stopPropagation()}
        >
          {/* Modal header */}
          <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
            <div>
              <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
                إضافة موكّل جديد
              </h2>
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                الخطوة {step + 1} من 3 — {STEP_LABELS[step]}
              </p>
            </div>
            <button onClick={onClose}
              className={`p-2 rounded-xl transition-colors ${isDark ? "hover:bg-white/[0.07] text-zinc-500" : "hover:bg-slate-100 text-slate-400"}`}>
              <X size={16} />
            </button>
          </div>

          {/* Step progress */}
          <div className={`flex gap-1 px-5 pt-4`}>
            {[0, 1, 2].map(i => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= step ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-800" : "bg-slate-100"}`} />
            ))}
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 min-h-[240px]">
            {/* Step 0: Basic info */}
            {step === 0 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${isDark ? "text-zinc-500" : "text-slate-400"}`}>الاسم الكامل *</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: أحمد محمد العتيبي"
                    className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${isDark ? "border-white/[0.06] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400"}`} />
                </div>
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${isDark ? "text-zinc-500" : "text-slate-400"}`}>نوع الموكّل</label>
                  <div className="flex gap-2">
                    {(["individual", "company"] as const).map(t => (
                      <button key={t} onClick={() => setType(t)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold border transition-all ${type === t ? "bg-[#0B3D2E] text-white border-[#0B3D2E]" : isDark ? "border-white/[0.06] text-zinc-400 hover:border-white/[0.12]" : "border-slate-200 text-slate-500 hover:border-[#0B3D2E]/30"}`}>
                        {t === "company" ? <Buildings size={14} /> : <User size={14} />}
                        {t === "individual" ? "فرد" : "شركة"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${isDark ? "text-zinc-500" : "text-slate-400"}`}>رقم الهاتف *</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+966 5X XXX XXXX" dir="ltr"
                    className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${isDark ? "border-white/[0.06] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400"}`} />
                </div>
              </motion.div>
            )}
            {/* Step 1: Fees */}
            {step === 1 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${isDark ? "text-zinc-500" : "text-slate-400"}`}>إجمالي الأتعاب (ريال)</label>
                  <input type="number" value={total} onChange={e => setTotal(e.target.value)} placeholder="0"
                    className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${isDark ? "border-white/[0.06] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400"}`} />
                </div>
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${isDark ? "text-zinc-500" : "text-slate-400"}`}>المدفوع مقدمًا (ريال)</label>
                  <input type="number" value={paid} onChange={e => setPaid(e.target.value)} placeholder="0"
                    className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${isDark ? "border-white/[0.06] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400"}`} />
                </div>
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-wider mb-2 block ${isDark ? "text-zinc-500" : "text-slate-400"}`}>التقييم</label>
                  <div className="flex gap-1">
                    {([1,2,3,4,5] as const).map(s => (
                      <button key={s} onClick={() => setRating(s)}>
                        <Star size={22} weight={s <= rating ? "fill" : "regular"}
                          className={s <= rating ? "text-amber-400" : isDark ? "text-zinc-700" : "text-slate-300"} />
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
            {/* Step 2: Flags */}
            {step === 2 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>اختر التصنيفات المناسبة للموكّل:</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(FLAG_CONFIG) as [ClientFlag, typeof FLAG_CONFIG[ClientFlag]][]).map(([flag, conf]) => (
                    <button key={flag} onClick={() => toggleFlag(flag)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                        flags.has(flag) ? conf.bg + " " + conf.color + " border-current/30" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500"
                      }`}>
                      {conf.emoji} {conf.label}
                      {flags.has(flag) && <Check size={10} weight="bold" />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {/* Footer */}
          <div className={`flex items-center justify-between px-5 py-4 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
            <button onClick={() => step > 0 ? setStep(s => s - 1) : onClose()}
              className={`px-4 py-2 rounded-xl text-[12px] font-bold border transition-colors ${isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:text-slate-700"}`}>
              {step === 0 ? "إلغاء" : "السابق"}
            </button>
            {step < 2 ? (
              <button onClick={() => canNext && setStep(s => s + 1)} disabled={!canNext}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] disabled:opacity-40 transition-opacity">
                التالي
              </button>
            ) : (
              <button onClick={handleSubmit}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-[12px] font-bold bg-emerald-600 text-white">
                <Check size={13} weight="bold" /> إضافة الموكّل
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
