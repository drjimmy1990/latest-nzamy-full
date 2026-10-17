import { useEffect, useRef, useState } from "react";
import {
  Gavel, Buildings, Shield, Scales, ClipboardText,
  Copy, Check, Envelope,
} from "@phosphor-icons/react";
import { copyToClipboard } from "@/lib/services/publicProfileLink";

// ─── Circuits directory: one-tap copy ─────────────────────────────────────────
//
// The circuits tab renders the Ministry of Justice directory
// (_CircuitsDirectory.tsx over src/data/circuits-directory.json). The 14-entry
// sample that lived here — placeholder addresses such as
// «c.court.r1@moj.gov.sa», sequential phone numbers, najiz codes and durations
// nobody sourced, every row tagged «غير مُتحقَّق» (owner test 28-9, T28-33) —
// was deleted with owner answer ١٩٢ (2026-10-16).

/**
 * One circuit e-mail: the FULL address (the directory used to show only the
 * part before «@»), left-to-right, monospace, selectable in one tap and
 * wrapping on a phone instead of overflowing; a copy button with a small
 * toast; and the mailto link kept as its own button, so selecting the text
 * never opens the mail app.
 *
 * The toast says «نُسخ البريد» only when copyToClipboard() reports the text
 * actually landed on the clipboard (plain-http office LANs and denied
 * permissions fall back to execCommand, which can still fail) — otherwise it
 * tells the user to select the address by hand.
 *
 * `verified` gates the copy and mailto buttons: an entry the directory still
 * flags for verification shows its address as text only, so a litigant is
 * never one click away from mailing an unconfirmed address (none is flagged
 * since owner answer ١٩٢).
 */
export function CircuitEmail({ email, isDark, verified = false }: { email: string; isDark: boolean; verified?: boolean }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    const ok = await copyToClipboard(email);
    setStatus(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 2200);
  }

  const btn = `flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
    isDark ? "border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.06]" : "border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50"
  }`;

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${isDark ? "border-white/[0.06] bg-zinc-950/40" : "border-slate-100 bg-slate-50"}`}>
      <span dir="ltr" className={`flex-1 min-w-0 text-left font-mono text-[12px] select-all break-all ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
        {email}
      </span>
      {verified && (<>
      <button type="button" onClick={copy} className={btn} aria-label={`نسخ البريد ${email}`} title="نسخ البريد">
        {status === "copied" ? <Check size={14} weight="bold" className="text-emerald-500" /> : <Copy size={14} />}
      </button>
      <a href={`mailto:${email}`} className={btn} aria-label={`مراسلة ${email}`} title="مراسلة">
        <Envelope size={14} className="text-blue-500" />
      </a>
      </>)}
      {status !== "idle" && (
        <div role="status" aria-live="polite"
          className={`fixed bottom-6 inset-x-0 mx-auto w-fit max-w-[90vw] z-50 rounded-xl px-4 py-2 text-[12px] font-bold shadow-lg ${
            status === "copied" ? "bg-[#0B3D2E] text-white" : "bg-red-600 text-white"
          }`}>
          {status === "copied" ? "نُسخ البريد" : "تعذّر النسخ — حدّد البريد يدوياً"}
        </div>
      )}
    </div>
  );
}

export const PROCEDURE_STEPS: Record<string, { title: string; description: string; steps: { label: string; time: string; tip?: string; critical?: boolean }[] }> = {
  commercial: {
    title: "التقاضي في المحكمة التجارية",
    description: "تختص بالنزاعات التجارية بين الشركات والأفراد في المعاملات التجارية",
    steps: [
      { label: "تقديم صحيفة الدعوى عبر ناجز", time: "يوم واحد", tip: "يجب إرفاق: السجل التجاري + عقد التأسيس + المستندات المؤيدة للدعوى" },
      { label: "قيد الدعوى وسداد الرسوم القضائية", time: "١-٢ يوم عمل", tip: "التكاليف القضائية: لا تزيد على ٥٪ من قيمة المطالبة، بحد أعلى مليون ريال (المادة الثالثة من نظام التكاليف القضائية)" },
      { label: "إحالة القضية للدائرة المختصة", time: "٢-٣ أيام عمل" },
      { label: "تبليغ المدعى عليه وطلب الرد", time: "٥-١٠ أيام" },
      { label: "الجلسة التمهيدية — إدارة الدعوى", time: "بعد ١٤ يوم من التبليغ", tip: "فرصة للتسوية الودية قبل الخوض في الموضوع" },
      { label: "تبادل المذكرات والمستندات", time: "٣٠-٦٠ يوم" },
      { label: "الجلسات الموضوعية والمرافعة", time: "يختلف حسب تعقيد القضية" },
      { label: "صدور الحكم الابتدائي", time: "بعد انقضاء المرافعة" },
      { label: "استئناف الحكم (اختياري)", time: "٣٠ يوم من تاريخ الحكم", critical: true, tip: "انتبه: يسقط حق الاستئناف بانتهاء المدة" },
    ],
  },
  labor: {
    title: "التقاضي في المحكمة العمالية",
    description: "تختص بالنزاعات بين أصحاب العمل والعمال",
    steps: [
      { label: "تقديم بلاغ للتسوية الودية — وزارة الموارد البشرية", time: "إلزامي", critical: true, tip: "خطوة إلزامية قانوناً قبل رفع الدعوى للمحكمة — لا يمكن تجاوزها" },
      { label: "مدة التسوية الودية", time: "٢١ يوم (قابلة للتمديد)" },
      { label: "رفع الدعوى للمحكمة العمالية عند الفشل", time: "خلال ١٢ شهر من نشأة النزاع", critical: true },
      { label: "قيد الدعوى وتعيين الدائرة المختصة", time: "٢-٣ أيام عمل" },
      { label: "تبليغ صاحب العمل وطلب الرد", time: "١٥ يوم" },
      { label: "جلسات النظر في الدعوى", time: "٣٠-٩٠ يوم" },
      { label: "صدور الحكم", time: "" },
      { label: "تنفيذ الحكم (عند الإخلال)", time: "عبر محاكم التنفيذ" },
    ],
  },
  civil: {
    title: "التقاضي في المحكمة العامة",
    description: "تختص بالقضايا المدنية العامة غير التجارية",
    steps: [
      { label: "إعداد صحيفة الدعوى مع المستندات", time: "" },
      { label: "تقديم الدعوى عبر ناجز وسداد الرسوم", time: "يوم واحد" },
      { label: "قيد الدعوى وإحالتها للدائرة", time: "٢-٤ أيام" },
      { label: "تبليغ الأطراف المدعى عليهم", time: "٧-١٤ يوم" },
      { label: "جلسات المرافعة والإثبات", time: "١-٣ أشهر" },
      { label: "صدور الحكم الابتدائي", time: "" },
      { label: "الاستئناف خلال المدة النظامية", time: "٣٠ يوم من الإبلاغ", critical: true },
    ],
  },
  appeal: {
    title: "إجراءات محكمة الاستئناف",
    description: "لمن يرغب في الطعن في حكم ابتدائي صادر ضده",
    steps: [
      { label: "التحقق من أحقية الطعن ومدته", time: "فوراً بعد الحكم", critical: true, tip: "القاعدة: ٣٠ يوماً من تاريخ الإبلاغ بالحكم — يسقط الحق بانتهائها" },
      { label: "تجهيز صحيفة الاستئناف مع أسباب الطعن", time: "٧-١٥ يوم" },
      { label: "تقديم صحيفة الاستئناف وسداد الرسوم", time: "" },
      { label: "تبليغ المستأنف ضده وطلب الرد", time: "١٠-١٥ يوم" },
      { label: "تقديم مذكرة الاستئناف التفصيلية", time: "٣٠ يوم" },
      { label: "رد المستأنف ضده على المذكرة", time: "٣٠ يوم" },
      { label: "المداولة وإصدار الحكم الاستئنافي", time: "٣٠-٦٠ يوم" },
      { label: "الطعن بالنقض أمام المحكمة العليا", time: "٣٠ يوم من حكم الاستئناف", tip: "النقض استثنائي — يختص بمخالفة النظام وليس الوقائع" },
    ],
  },
  admin: {
    title: "التقاضي في المحكمة الإدارية",
    description: "للطعن في القرارات الإدارية للجهات الحكومية",
    steps: [
      { label: "التظلم الإداري للجهة المعنية — شرط أساسي", time: "خلال ٦٠ يوم من القرار الإداري", critical: true, tip: "لا تُقبل الدعوى بدون تظلم مسبق إلا في حالات استثنائية محددة نظاماً" },
      { label: "انتظار رد الجهة أو مضي ٦٠ يوم", time: "٦٠ يوم" },
      { label: "رفع الدعوى للمحكمة الإدارية", time: "خلال ٦٠ يوم من الرفض أو السكوت", critical: true },
      { label: "فحص شروط قبول الدعوى", time: "١٤-٢١ يوم" },
      { label: "إرسال الدعوى للجهة الإدارية للرد", time: "٢١ يوم" },
      { label: "جلسات الفصل في الدعوى", time: "٦٠-١٨٠ يوم" },
      { label: "صدور الحكم الابتدائي", time: "" },
      { label: "الاستئناف أمام المحكمة الإدارية العليا", time: "٣٠ يوم", critical: true },
    ],
  },
};

export const COURTS_LIST = [
  { id: "commercial", name: "المحكمة التجارية", icon: Buildings, color: "text-blue-500", bg: "bg-blue-500/10" },
  { id: "labor", name: "المحكمة العمالية", icon: Shield, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { id: "civil", name: "المحكمة العامة", icon: Scales, color: "text-violet-500", bg: "bg-violet-500/10" },
  { id: "appeal", name: "محكمة الاستئناف", icon: Gavel, color: "text-amber-500", bg: "bg-amber-500/10" },
  { id: "admin", name: "المحكمة الإدارية", icon: ClipboardText, color: "text-purple-500", bg: "bg-purple-500/10" },
];
