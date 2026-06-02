import RequirementsChecklist, { ChecklistItem } from "../_components/RequirementsChecklist";

const ITEMS: ChecklistItem[] = [
  {
    id: "m1",
    title: "رخصة البلدية (رخصة النشاط)",
    detail: "رخصة ممارسة النشاط التجاري الصادرة من الأمانة أو البلدية",
    status: "done",
    deadline: "١٥ مارس ٢٠٢٥",
    fee: "١٬٢٠٠ ﷼ / سنة",
    portal: { label: "بوابة بلدي", url: "https://balady.gov.sa" },
  },
  {
    id: "m2",
    title: "شهادة السجل التجاري",
    detail: "تسجيل النشاط في وزارة التجارة",
    status: "pending",
    deadline: "٢٠ مايو ٢٠٢٤",
    fee: "٢٠٠ ﷼ / سنة",
    portal: { label: "بوابة وزارة التجارة", url: "https://mc.gov.sa" },
  },
  {
    id: "m3",
    title: "تصريح الإعلانات واللافتات",
    detail: "تصريح اللافتات والإعلانات الخارجية من البلدية",
    status: "overdue",
    deadline: "١ يناير ٢٠٢٤",
    fee: "٥٠٠ ﷼ / سنة",
    portal: { label: "بوابة بلدي", url: "https://balady.gov.sa" },
  },
  {
    id: "m4",
    title: "شهادة السلامة (الدفاع المدني)",
    detail: "شهادة اشتراطات الحماية من الحريق",
    status: "done",
    deadline: "١ أغسطس ٢٠٢٤",
    fee: "٤٠٠ ﷼ / سنة",
    portal: { label: "بوابة الدفاع المدني", url: "https://cd.gov.sa" },
  },
  {
    id: "m5",
    title: "شهادة بلدية للمخزن / المستودع",
    detail: "إن كان لديك مستودع منفصل عن موقع النشاط",
    status: "na",
    portal: { label: "بوابة بلدي", url: "https://balady.gov.sa" },
  },
];

export default function MicroMunicipalityPage() {
  return (
    <RequirementsChecklist
      title="اشتراطات البلدية"
      subtitle="تراخيص النشاط واللافتات والسلامة الصادرة من الأمانة والجهات البلدية"
      aiTip="تصريح الإعلانات منتهٍ منذ أكثر من 90 يوماً — تواصل مع بلديتك فوراً لتجنب الغرامة الإدارية التي قد تصل إلى ٥٠٠٠ ﷼."
      items={ITEMS}
    />
  );
}
