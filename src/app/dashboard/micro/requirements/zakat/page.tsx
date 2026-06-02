import RequirementsChecklist, { ChecklistItem } from "../_components/RequirementsChecklist";

const ITEMS: ChecklistItem[] = [
  {
    id: "z1",
    title: "شهادة تسجيل ZATCA (ضريبة القيمة المضافة)",
    detail: "التسجيل في هيئة الزكاة والضريبة والجمارك إذا تجاوز الإيراد ٣٧٥٬٠٠٠ ﷼",
    status: "done",
    deadline: "سارية",
    fee: "مجاني",
    portal: { label: "بوابة ZATCA", url: "https://zatca.gov.sa" },
  },
  {
    id: "z2",
    title: "الإقرار الضريبي الفصلي (VAT)",
    detail: "تقديم إقرار ضريبة القيمة المضافة كل 3 أشهر",
    status: "pending",
    deadline: "٣٠ يونيو ٢٠٢٤",
    fee: "لا توجد رسوم (غرامة التأخر ٥ - ٢٥٪)",
    portal: { label: "بوابة ZATCA", url: "https://zatca.gov.sa" },
  },
  {
    id: "z3",
    title: "فاتورة إلكترونية (e-invoicing) المرحلة الثانية",
    detail: "ربط منظومة الفوترة بنظام فاتورة ZATCA — المرحلة الثانية",
    status: "pending",
    deadline: "حسب موجة القطاع",
    fee: "تكلفة النظام",
    portal: { label: "متطلبات فاتورة", url: "https://zatca.gov.sa/ar/E-Invoicing" },
  },
  {
    id: "z4",
    title: "زكاة الأعمال السنوية",
    detail: "تقديم إقرار الزكاة السنوي للمنشآت المملوكة لسعوديين",
    status: "done",
    deadline: "٣١ مارس ٢٠٢٥",
    fee: "٢.٥٪ من الوعاء الزكوي",
    portal: { label: "بوابة ZATCA", url: "https://zatca.gov.sa" },
  },
  {
    id: "z5",
    title: "ضريبة الاستقطاع (إن وجدت)",
    detail: "على المدفوعات للأجانب غير المقيمين",
    status: "na",
  },
];

export default function MicroZakatPage() {
  return (
    <RequirementsChecklist
      title="الزكاة والضريبة (ZATCA)"
      subtitle="الالتزامات الضريبية والزكوية لمنشأتك أمام هيئة الزكاة والضريبة والجمارك"
      aiTip="الإقرار الفصلي لضريبة القيمة المضافة يستحق قبل ٣٠ يونيو — تأكد من مطابقة الفواتير قبل التقديم لتجنب غرامة التأخر."
      items={ITEMS}
    />
  );
}
