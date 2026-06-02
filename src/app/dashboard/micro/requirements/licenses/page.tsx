import RequirementsChecklist, { ChecklistItem } from "../_components/RequirementsChecklist";

const ITEMS: ChecklistItem[] = [
  {
    id: "li1",
    title: "ترخيص الجهة الرقابية المتخصصة",
    detail: "تحقق مما إذا كان نشاطك يستلزم ترخيصاً من جهة متخصصة (صحة، تجارة، اتصالات…)",
    status: "done",
  },
  {
    id: "li2",
    title: "ترخيص وزارة الصحة (إن انطبق)",
    detail: "للأنشطة الصحية والطبية والصيدلانية",
    status: "na",
    portal: { label: "بوابة وزارة الصحة", url: "https://moh.gov.sa" },
  },
  {
    id: "li3",
    title: "ترخيص هيئة الاتصالات والفضاء (إن انطبق)",
    detail: "للأنشطة التقنية والاتصالات والمحتوى الرقمي",
    status: "na",
    portal: { label: "بوابة CITC", url: "https://citc.gov.sa" },
  },
  {
    id: "li4",
    title: "ترخيص هيئة الغذاء والدواء (إن انطبق)",
    detail: "للأنشطة الغذائية والتجميلية والدوائية",
    status: "na",
    portal: { label: "بوابة SFDA", url: "https://sfda.gov.sa" },
  },
  {
    id: "li5",
    title: "تجديد الترخيص المتخصص سنوياً",
    detail: "تواريخ انتهاء التراخيص المتخصصة تختلف عن البلدية — تأكد من التقويم",
    status: "pending",
    deadline: "حسب جهة الترخيص",
  },
  {
    id: "li6",
    title: "شهادة المطابقة (SASO) للمنتجات (إن انطبق)",
    detail: "للمنتجات المستوردة أو المصنّعة محلياً الخاضعة لاشتراطات الجودة",
    status: "na",
    portal: { label: "بوابة SASO", url: "https://saso.gov.sa" },
  },
];

export default function MicroLicensesPage() {
  return (
    <RequirementsChecklist
      title="التراخيص التخصصية"
      subtitle="تراخيص الجهات الرقابية المتخصصة حسب طبيعة نشاط منشأتك"
      aiTip="تجديد الترخيص المتخصص قد يستغرق ٣٠-٦٠ يوماً — ابدأ الإجراءات قبل ٩٠ يوماً من تاريخ الانتهاء."
      items={ITEMS}
    />
  );
}
