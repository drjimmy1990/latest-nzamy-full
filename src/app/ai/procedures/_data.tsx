import {
  Gavel, Buildings, Shield, FileText, HouseSimple, Scales, ClipboardText
} from "@phosphor-icons/react";

export const CIRCUITS = [
  {
    court: "المحكمة التجارية — الرياض",
    circuits: [
      { num: "١", spec: "عقود التجارة والشركات", email: "c.court.r1@moj.gov.sa", phone: "0112175000", floor: "الدور الثاني", najizCode: "TC-R-01", avgDays: "٤٥-٩٠ يوم", notes: "تختص بالنزاعات فوق ٥٠٠ ألف ريال" },
      { num: "٢", spec: "الإفلاس والتصفية", email: "c.court.r2@moj.gov.sa", phone: "0112175001", floor: "الدور الثاني", najizCode: "TC-R-02", avgDays: "٩٠-١٨٠ يوم", notes: "إجراءات نظام الإفلاس الجديد" },
      { num: "٣", spec: "منازعات العقارات التجارية", email: "c.court.r3@moj.gov.sa", phone: "0112175002", floor: "الدور الثالث", najizCode: "TC-R-03", avgDays: "٦٠-١٢٠ يوم", notes: "" },
    ],
    icon: Buildings, color: "text-blue-500", bg: "bg-blue-500/10",
  },
  {
    court: "المحكمة العمالية — الرياض",
    circuits: [
      { num: "١", spec: "منازعات إنهاء العقد والفصل", email: "labor1.r@hrsd.gov.sa", phone: "19911", floor: "الدور الأول", najizCode: "LAB-R-01", avgDays: "٣٠-٦٠ يوم", notes: "يشترط التسوية الودية أولاً" },
      { num: "٢", spec: "الأجور ومكافآت نهاية الخدمة", email: "labor2.r@hrsd.gov.sa", phone: "19911", floor: "الدور الأول", najizCode: "LAB-R-02", avgDays: "٢١-٤٥ يوم", notes: "" },
      { num: "٣", spec: "إصابات العمل والتأمينات", email: "labor3.r@hrsd.gov.sa", phone: "19911", floor: "الدور الثاني", najizCode: "LAB-R-03", avgDays: "٤٥-٩٠ يوم", notes: "تُنسّق مع المؤسسة العامة للتأمينات" },
    ],
    icon: Shield, color: "text-emerald-500", bg: "bg-emerald-500/10",
  },
  {
    court: "محكمة الاستئناف — الرياض",
    circuits: [
      { num: "١", spec: "استئناف الأحكام التجارية", email: "appeal1@moj.gov.sa", phone: "0112175100", floor: "الدور الرابع", najizCode: "APP-R-01", avgDays: "٦٠-١٢٠ يوم", notes: "٣٠ يوم من تاريخ الحكم لرفع الاستئناف" },
      { num: "٢", spec: "استئناف الأحكام العمالية", email: "appeal2@moj.gov.sa", phone: "0112175100", floor: "الدور الرابع", najizCode: "APP-R-02", avgDays: "٤٥-٩٠ يوم", notes: "" },
    ],
    icon: Gavel, color: "text-amber-500", bg: "bg-amber-500/10",
  },
  {
    court: "المحكمة الإدارية — الرياض",
    circuits: [
      { num: "١", spec: "منازعات الموظفين وجهاتهم الحكومية", email: "admin1@diwan.gov.sa", phone: "0112083500", floor: "الدور الأول", najizCode: "ADM-R-01", avgDays: "٩٠-١٨٠ يوم", notes: "يشترط التظلم الإداري قبل رفع الدعوى" },
      { num: "٢", spec: "العقود الحكومية والمنافسات", email: "admin2@diwan.gov.sa", phone: "0112083500", floor: "الدور الأول", najizCode: "ADM-R-02", avgDays: "٦٠-١٢٠ يوم", notes: "" },
      { num: "٣", spec: "الضرائب والجمارك والزكاة", email: "admin3@diwan.gov.sa", phone: "0112083500", floor: "الدور الثاني", najizCode: "ADM-R-03", avgDays: "٦٠-١٨٠ يوم", notes: "تُنسّق مع هيئة الزكاة" },
    ],
    icon: FileText, color: "text-purple-500", bg: "bg-purple-500/10",
  },
  {
    court: "محاكم الأسرة — الرياض",
    circuits: [
      { num: "١", spec: "الطلاق والخلع", email: "family1.r@moj.gov.sa", phone: "0112175200", floor: "الدور الأول (نساء)", najizCode: "FAM-R-01", avgDays: "٣٠-٦٠ يوم", notes: "يتم الفصل في مسائل الطلاق أسرع نسبياً" },
      { num: "٢", spec: "الحضانة والنفقة", email: "family2.r@moj.gov.sa", phone: "0112175200", floor: "الدور الثاني", najizCode: "FAM-R-02", avgDays: "٤٥-٩٠ يوم", notes: "يمكن طلب نفقة مؤقتة أثناء النظر في الدعوى" },
      { num: "٣", spec: "الميراث وتصفية التركات", email: "family3.r@moj.gov.sa", phone: "0112175200", floor: "الدور الثالث", najizCode: "FAM-R-03", avgDays: "٦٠-١٨٠ يوم", notes: "" },
    ],
    icon: HouseSimple, color: "text-pink-500", bg: "bg-pink-500/10",
  },
];

export const PROCEDURE_STEPS: Record<string, { title: string; description: string; steps: { label: string; time: string; tip?: string; critical?: boolean }[] }> = {
  commercial: {
    title: "التقاضي في المحكمة التجارية",
    description: "تختص بالنزاعات التجارية بين الشركات والأفراد في المعاملات التجارية",
    steps: [
      { label: "تقديم صحيفة الدعوى عبر ناجز", time: "يوم واحد", tip: "يجب إرفاق: السجل التجاري + عقد التأسيس + المستندات المؤيدة للدعوى" },
      { label: "قيد الدعوى وسداد الرسوم القضائية", time: "١-٢ يوم عمل", tip: "الرسوم: ٥٪ من قيمة الدعوى (حد أقصى ٢٠٠ ألف ريال)" },
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
