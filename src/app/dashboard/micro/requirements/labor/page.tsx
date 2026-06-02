import RequirementsChecklist, { ChecklistItem } from "../_components/RequirementsChecklist";

const ITEMS: ChecklistItem[] = [
  {
    id: "l1",
    title: "نسبة السعودة (نطاقات)",
    detail: "الالتزام بنسبة التوطين المطلوبة حسب حجم المنشأة ونشاطها",
    status: "done",
    portal: { label: "بوابة مساند / نطاقات", url: "https://nitaqat.hadaf.gov.sa" },
  },
  {
    id: "l2",
    title: "عقود العمل الموثقة",
    detail: "يجب أن يكون لكل موظف عقد عمل مكتوب موثق في منصة قوى",
    status: "done",
    portal: { label: "منصة قوى", url: "https://qiwa.com.sa" },
  },
  {
    id: "l3",
    title: "حماية الأجور (WPS)",
    detail: "صرف الرواتب عبر البنوك ورفع بيانات الأجور لنظام حماية الأجور شهرياً",
    status: "done",
    deadline: "أول كل شهر",
    portal: { label: "منصة مدد", url: "https://mudad.com.sa" },
  },
  {
    id: "l4",
    title: "تصاريح العمالة الوافدة",
    detail: "تصاريح العمل (إقامات) لكل موظف أجنبي سارية",
    status: "pending",
    deadline: "تتفاوت حسب الإقامة",
    fee: "٢٤٠٠ ﷼ / عامل / سنة",
    portal: { label: "منصة قوى", url: "https://qiwa.com.sa" },
  },
  {
    id: "l5",
    title: "نظام حماية الأجور — رفع الكشوفات",
    detail: "رفع كشوف الرواتب شهرياً عبر مزود WPS المعتمد",
    status: "done",
    deadline: "قبل اليوم ٧ من كل شهر",
    portal: { label: "منصة مدد", url: "https://mudad.com.sa" },
  },
];

export default function MicroLaborPage() {
  return (
    <RequirementsChecklist
      title="اشتراطات العمل والتوظيف"
      subtitle="الالتزامات المتعلقة بنظام العمل وحماية الأجور والتوطين"
      aiTip="تصاريح العمل للعمالة الوافدة تقترب من انتهاء صلاحيتها — التجديد يبدأ قبل 3 أشهر من تاريخ الانتهاء عبر منصة قوى."
      items={ITEMS}
    />
  );
}
