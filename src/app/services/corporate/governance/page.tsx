"use client";

import { motion } from "framer-motion";
import {
  ShieldCheck, ArrowLeft, Check, Buildings,
  ClipboardText, Scales, WhatsappLogo, Clock,
  Warning, Lock, Eye, Sparkle, Phone,
  ArrowsClockwise, Bell, UserCircle, Stamp,
  ListChecks, ChartBar, Fingerprint,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";

const FEATURES = [
  { icon: ListChecks, title: "مصفوفة موافقات مرنة", desc: "حدّد من يوافق حسب نوع العقد وقيمته — عقد بـ ٥٠٠ ألف يختلف عن عقد بـ ٥ ملايين" },
  { icon: Buildings, title: "مراجعة متعددة الإدارات", desc: "كل إدارة تراجع وتعتمد من رابط واحد — بدون بريد إلكتروني أو ضياع" },
  { icon: Warning, title: "تصعيد تلقائي", desc: "المراجعة المتأخرة تُصعَّد تلقائياً لصاحب القرار — لا يمرّ عقد بـ ٢ مليون بدونك" },
  { icon: Lock, title: "خصوصية كاملة", desc: "تحكّم بمن يرى ملاحظات من — كل إدارة ترى ملاحظاتها فقط أو الكل يرى الكل" },
  { icon: Fingerprint, title: "سجل اعتمادات رقمي", desc: "Audit Trail لكل مستند — من راجع، متى، ماذا قال، وماذا كان القرار" },
  { icon: WhatsappLogo, title: "إشعارات واتساب فورية", desc: "كل خطوة مُتتبعة بدون تأخير — رسالة واتساب لمن يحتاج أن يعمل الآن" },
];

const WORKFLOW_STEPS = [
  { num: "①", title: "ارفع المستند", desc: "عقد، سياسة، قرار — أي مستند يحتاج اعتماد. حدد النوع والقيمة.", color: "bg-[#0B3D2E] text-white" },
  { num: "②", title: "التطبيق التلقائي", desc: "نظامي يقرأ القواعد → يٌحدد: من يراجع؟ كم المدة؟ من يُصعّد إليه؟", color: "" },
  { num: "③", title: "رابط + رمز دخول", desc: "كل مراجع يتلقى رابطه الخاص ورمز ٦ أرقام — يقرأ المستند ويكتب ملاحظاته.", color: "" },
  { num: "④", title: "مراجعة واعتماد", desc: "كل إدارة تقرأ وتعلّق وتعتمد من جهازها — بدون تسجيل حساب.", color: "" },
  { num: "⑤", title: "التصعيد والمتابعة", desc: "لم يستجب خلال المدة المحددة؟ يتصعّد تلقائياً للـ CEO مع إشعار واتساب عاجل.", color: "bg-red-500/5 border-red-500/20" },
  { num: "⑥", title: "ختم رقمي", desc: "اعتماد مكتمل → يُختم المستند رقمياً + يُحفظ في سجل لا يُمسح.", color: "bg-emerald-500/5 border-emerald-500/20" },
];

const MATRIX_EXAMPLE = [
  { type: "عقد أقل من ٥٠٠ ألف", depts: ["القانونية"], approver: "مدير القانونية", days: 3 },
  { type: "عقد ٥٠٠ ألف — ٢ مليون", depts: ["القانونية", "المالية"], approver: "CFO", days: 5 },
  { type: "عقد أكثر من ٢ مليون", depts: ["القانونية", "المالية", "التشغيل"], approver: "CEO", days: 7 },
  { type: "عقد عمالي (أي قيمة)", depts: ["الموارد البشرية", "القانونية"], approver: "مدير HR", days: 3 },
  { type: "قرار إداري", depts: ["CEO", "القانونية"], approver: "CEO", days: 2 },
];

export default function GovernancePage() {
  const { isDark } = useTheme();
  const tp = isDark ? "text-white" : "text-slate-900";
  const ts = isDark ? "text-zinc-400" : "text-slate-500";
  const border = isDark ? "border-white/[0.07]" : "border-slate-200/70";
  const cardBg = isDark ? "bg-zinc-900" : "bg-white";

  return (
    <>
      <Navbar />
      <main className={`min-h-screen ${isDark ? "bg-[#080808]" : "bg-white"}`}>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden pt-32 pb-20">
          <div className="pointer-events-none absolute inset-0">
            <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.2, 0.1] }}
              transition={{ duration: 12, repeat: Infinity }}
              className="absolute -top-40 -right-40 w-[900px] h-[900px] rounded-full"
              style={{ background: "radial-gradient(circle, rgba(11,61,46,0.15) 0%, transparent 70%)" }} />
          </div>
          <div className="relative max-w-[1100px] mx-auto px-6 text-center">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-royal/30 bg-royal/5 mb-6">
              <ShieldCheck size={14} className="text-royal" weight="duotone" />
              <span className="text-[12px] font-semibold text-royal">حوكمة مؤسسية ذكية — لا يوجد مثيل في السوق السعودي</span>
            </motion.div>

            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className={`text-4xl md:text-5xl font-extrabold tracking-tight mb-5 ${tp}`}>
              من يوافق على ماذا
              <span className="block text-royal mt-2">تلقائياً.</span>
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className={`text-lg leading-relaxed max-w-2xl mx-auto mb-8 ${ts}`}>
              عقودك تُعتمد بأسرع وقت ممكن بدلاً من الضياع بين الإيميلات.
              حدّد القواعد مرة واحدة — والنظام يُطبّقها على كل مستند تلقائياً.
            </motion.p>

            <div className="flex flex-wrap justify-center gap-4">
              <motion.a href="/register" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl bg-[#0B3D2E] text-white font-bold shadow-[0_8px_24px_-8px_rgba(11,61,46,0.5)]">
                جرّب الحوكمة الآن <ArrowLeft size={16} weight="bold" />
              </motion.a>
              <a href="#how" className={`inline-flex items-center gap-2 px-6 py-4 rounded-2xl border font-medium text-sm ${border} ${ts}`}>
                كيف تعمل؟
              </a>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-14 max-w-3xl mx-auto">
              {[
                { v: "٠ ثانية", l: "وقت التطبيق" },
                { v: "٦ أرقام", l: "رمز دخول لكل مراجع" },
                { v: "واتساب", l: "إشعار فوري" },
                { v: "١٠٠٪", l: "audit trail كامل" },
              ].map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }}
                  className={`rounded-2xl border p-5 text-center ${border} ${cardBg}`}>
                  <p className="text-2xl font-extrabold text-royal">{s.v}</p>
                  <p className={`text-[11px] mt-1 ${ts}`}>{s.l}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="py-16">
          <div className="max-w-[1100px] mx-auto px-6">
            <div className="text-center mb-12">
              <span className="text-sm font-medium text-[#C8A762]">لماذا نظامي؟</span>
              <h2 className={`text-3xl font-bold mt-2 ${tp}`}>كل ما تحتاجه لحوكمة مستنداتك</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                    transition={{ delay: i * 0.07 }}
                    className={`rounded-[1.5rem] border p-6 ${border} ${cardBg}`}>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${isDark ? "bg-royal/15" : "bg-royal/8"}`}>
                      <Icon size={22} weight="duotone" className="text-royal" />
                    </div>
                    <h3 className={`font-bold text-[15px] mb-2 ${tp}`}>{f.title}</h3>
                    <p className={`text-[12px] leading-relaxed ${ts}`}>{f.desc}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="py-16 md:py-24">
          <div className="max-w-[1000px] mx-auto px-6">
            <div className="text-center mb-14">
              <span className="text-sm font-medium text-[#C8A762]">كيف تعمل؟</span>
              <h2 className={`text-3xl font-bold mt-2 ${tp}`}>٦ خطوات — من الرفع إلى الختم الرقمي</h2>
            </div>
            <div className="grid gap-5">
              {WORKFLOW_STEPS.map((step, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }} whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                  className={`flex items-start gap-5 p-6 rounded-[1.5rem] border ${step.color || ""} ${border} ${cardBg}`}>
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                    i === 0 ? "bg-royal text-white" : isDark ? "bg-white/[0.06]" : "bg-slate-100"
                  }`}>
                    <span className={`text-lg font-black ${i === 0 ? "text-white" : "text-royal"}`}>{step.num}</span>
                  </div>
                  <div>
                    <h3 className={`text-[16px] font-bold mb-1 ${tp}`}>{step.title}</h3>
                    <p className={`text-[13px] leading-relaxed ${ts}`}>{step.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Matrix Example ── */}
        <section className="py-16">
          <div className="max-w-[1000px] mx-auto px-6">
            <div className="text-center mb-10">
              <span className="text-sm font-medium text-[#C8A762]">مثال حي</span>
              <h2 className={`text-2xl font-bold mt-2 ${tp}`}>هكذا تبدو مصفوفة الموافقات</h2>
              <p className={`text-[14px] mt-2 ${ts}`}>مثال لشركة مقاولات — قابل للتخصيص الكامل حسب شركتك</p>
            </div>
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className={`rounded-[2rem] border-2 overflow-hidden ${isDark ? "border-royal/30 bg-zinc-900" : "border-royal/20 bg-white shadow-xl"}`}>
              <div className={`grid grid-cols-4 gap-0 text-[11px] font-bold p-4 border-b ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-100 text-slate-400"}`}>
                <span>نوع المستند</span>
                <span className="text-center">الإدارات المُراجِعة</span>
                <span className="text-center">المُعتمِد النهائي</span>
                <span className="text-center">المدة</span>
              </div>
              {MATRIX_EXAMPLE.map((row, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className={`grid grid-cols-4 gap-0 items-center p-4 border-b last:border-0 ${isDark ? "border-white/[0.04]" : "border-slate-50"}`}>
                  <span className={`text-[12px] font-semibold ${tp}`}>{row.type}</span>
                  <div className="flex flex-wrap gap-1 justify-center">
                    {row.depts.map((d, di) => (
                      <span key={di} className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-300" : "bg-slate-100 text-slate-600"}`}>{d}</span>
                    ))}
                  </div>
                  <span className={`text-center text-[12px] font-bold ${tp}`}>{row.approver}</span>
                  <span className={`text-center text-[12px] font-mono ${isDark ? "text-[#C8A762]" : "text-amber-600"}`}>{row.days} أيام</span>
                </motion.div>
              ))}
            </motion.div>
            <p className={`text-[11px] mt-3 text-center ${ts}`}>
              * يمكنك إضافة قواعد مخصصة: حسب نوع العقد، القيمة المالية، أو الإدارة المُنشِئة
            </p>
          </div>
        </section>

        {/* ── CEO Direct ── */}
        <section className="py-16">
          <div className="max-w-[1100px] mx-auto px-6">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className={`rounded-[2.5rem] p-10 md:p-16 ${isDark ? "bg-zinc-900 border border-white/[0.06]" : "bg-slate-50"}`}>
              <div className="flex flex-col md:flex-row items-center gap-10">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-4">
                    <UserCircle size={20} className="text-[#C8A762]" weight="duotone" />
                    <span className="text-[12px] font-bold text-[#C8A762]">رسالة لصاحب القرار</span>
                  </div>
                  <h2 className={`text-2xl md:text-3xl font-bold mb-4 ${tp}`}>
                    لا يمرّ عقد بـ ٢ مليون ريال
                    <span className="text-royal block mt-1">بدون موافقتك.</span>
                  </h2>
                  <p className={`text-[14px] leading-relaxed mb-6 ${ts}`}>
                    ٧٢٪ من الشركات السعودية تكتشف عقوداً وُقّعت بدون الموافقات اللازمة — فقط عند التفتيش.
                    مع نظامي، كل مستند يمر بالقنوات الصحيحة — تلقائياً وبدون تأخير.
                  </p>
                  <div className="space-y-3">
                    {[
                      "كل عقد يُطابق قواعد شركتك تلقائياً",
                      "لا يحتاج المراجع تسجيل حساب — رابط + رمز دخول فقط",
                      "إشعارات واتساب فورية لكل خطوة",
                      "تاريخ كامل لكل قرار — لا يُمحى أبداً",
                    ].map((point, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Check size={14} weight="bold" className="text-royal mt-0.5 shrink-0" />
                        <span className={`text-[13px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`w-full md:w-72 rounded-2xl border p-5 ${border} ${cardBg} shadow-lg`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Bell size={16} className="text-emerald-500" weight="fill" />
                    <span className={`text-[11px] font-bold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>إشعار واتساب</span>
                  </div>
                  <div className={`rounded-xl p-3 text-[12px] leading-relaxed ${isDark ? "bg-white/[0.03] text-zinc-300" : "bg-zinc-50 text-zinc-600"}`}>
                    <p className="font-bold mb-1">🏛️ نظامي — تصعيد تلقائي</p>
                    <p>عقد شراكة بقيمة ٣,٥٠٠,٠٠٠ ﷼ مع شركة الأفق — لم تتم المراجعة خلال ٥ أيام.</p>
                    <p className="text-[#C8A762] font-bold mt-2">📎 اضغط هنا للمراجعة والاعتماد</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-16 pb-24">
          <div className="max-w-[1200px] mx-auto px-6">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className="rounded-[2.5rem] bg-[#0B3D2E] p-10 md:p-16 text-center shadow-[0_20px_60px_-15px_rgba(11,61,46,0.5)]">
              <ShieldCheck size={36} weight="duotone" className="text-[#C8A762] mx-auto mb-4" />
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">ابدأ حوكمة مستنداتك الآن</h2>
              <p className="text-white/60 text-sm max-w-md mx-auto mb-8">
                ضمن باقة الشركات — بدون إعدادات معقدة. حدّد القواعد وابدأ العمل.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <motion.a href="/register" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-[#C8A762] text-[#0B3D2E] font-bold text-sm">
                  ابدأ مجاناً <ArrowLeft size={16} weight="bold" />
                </motion.a>
                <a href="/contact" className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl border border-white/30 text-white/80 font-medium text-sm">
                  <Phone size={15} /> تواصل مع مستشار
                </a>
              </div>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
