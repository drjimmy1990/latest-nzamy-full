import { useState } from "react";
import { motion } from "framer-motion";
import { XCircle, CheckCircle } from "@phosphor-icons/react";

export function AddCaseModal({ onClose, isDark }: { onClose: () => void; isDark: boolean }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [done, setDone] = useState(false);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}>
        
        <div className="flex items-center justify-between mb-5">
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>إضافة قضية جديدة</h3>
          <button onClick={onClose} className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
            <XCircle size={16} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} weight="fill" className="text-emerald-500" />
            </div>
            <p className={`font-bold text-[16px] ${isDark ? "text-white" : "text-zinc-900"}`}>تم إضافة القضية بنجاح!</p>
            <p className={`text-[12px] mt-1 mb-4 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>تم إدراجها في القائمة النشطة مع تعيين فريق العمل.</p>
            <button onClick={onClose} className="rounded-xl px-5 py-2 text-[13px] font-bold bg-[#0B3D2E] text-white">إغلاق</button>
          </div>
        ) : (
          <div className="space-y-4">
            {step === 1 && (
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                <div>
                  <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>اسم الموكل</label>
                  <input type="text" placeholder="اختر الموكل أو أضف موكلاً جديداً..." className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`} />
                </div>
                <div>
                  <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>عنوان القضية</label>
                  <input type="text" placeholder="مثال: مطالبة مالية - مؤسسة العليان" className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`} />
                </div>
                <div>
                  <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>المحكمة المختصة</label>
                  <select className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`}>
                    <option>المحكمة التجارية</option>
                    <option>المحكمة العامة</option>
                    <option>المحكمة العمالية</option>
                  </select>
                </div>
                <button onClick={() => setStep(2)} className="w-full rounded-xl bg-[#0B3D2E] py-2.5 text-[13px] font-bold text-white mt-2">التالي</button>
              </motion.div>
            )}
            {step === 2 && (
              <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                <div>
                  <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>إسناد إلى المحامي</label>
                  <select className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`}>
                    <option>أ. سارة المنصور</option>
                    <option>أ. نورة الشمري</option>
                    <option>أ. تركي العمر</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>مستوى الأهمية / الاستعجال</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button className="rounded-xl border border-red-500/30 bg-red-500/10 py-2 text-[12px] font-bold text-red-500">حرجة</button>
                    <button className="rounded-xl border border-slate-200 bg-slate-50 py-2 text-[12px] font-bold text-slate-500">عاجلة</button>
                    <button className="rounded-xl border border-slate-200 bg-slate-50 py-2 text-[12px] font-bold text-slate-500">طبيعية</button>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setStep(1)} className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold ${isDark ? "bg-white/[0.08] text-zinc-300" : "bg-slate-100 text-slate-600"}`}>رجوع</button>
                  <button onClick={() => setDone(true)} className="flex-1 rounded-xl bg-[#0B3D2E] text-[#C8A762] py-2.5 text-[13px] font-bold">حفظ واعتماد</button>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
