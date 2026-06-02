import RequirementsChecklist, { ChecklistItem } from "../_components/RequirementsChecklist";

const ITEMS: ChecklistItem[] = [
  {
    id: "g1",
    title: "تسجيل المنشأة في GOSI",
    detail: "تسجيل المنشأة لدى المؤسسة العامة للتأمينات الاجتماعية",
    status: "done",
    fee: "مجاني",
    portal: { label: "بوابة GOSI", url: "https://gosi.gov.sa" },
  },
  {
    id: "g2",
    title: "تسجيل الموظفين السعوديين",
    detail: "تسجيل كل موظف سعودي جديد خلال 30 يوماً من التعيين",
    status: "done",
    deadline: "جارٍ",
    fee: "٩٪ صاحب عمل + ١٪ موظف",
    portal: { label: "بوابة GOSI", url: "https://gosi.gov.sa" },
  },
  {
    id: "g3",
    title: "دفع اشتراكات GOSI الشهرية",
    detail: "سداد اشتراكات الشهر الحالي قبل نهايته",
    status: "pending",
    deadline: "آخر الشهر",
    fee: "١١٪ من الراتب الأساسي",
    portal: { label: "بوابة GOSI", url: "https://gosi.gov.sa" },
  },
  {
    id: "g4",
    title: "تحديث بيانات الموظفين المنتهية عقودهم",
    detail: "إشعار GOSI بإنهاء خدمة أي موظف خلال 30 يوماً",
    status: "done",
    portal: { label: "بوابة GOSI", url: "https://gosi.gov.sa" },
  },
  {
    id: "g5",
    title: "التأمين ضد مخاطر العمل (العمال الأجانب)",
    detail: "تأمين إصابات العمل للعمالة الوافدة — اختياري للسعوديين",
    status: "na",
  },
];

export default function MicroGosiPage() {
  return (
    <RequirementsChecklist
      title="التأمينات الاجتماعية (GOSI)"
      subtitle="اشتراكات وتسجيلات المؤسسة العامة للتأمينات الاجتماعية"
      aiTip="اشتراكات GOSI تستحق آخر كل شهر — التأخر يُفضي إلى غرامة ١٪ عن كل شهر تأخير وقد يُعيق إصدار تراخيصك."
      items={ITEMS}
    />
  );
}
