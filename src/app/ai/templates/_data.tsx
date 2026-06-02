import {
  BookOpen, FileText, Seal, ChatCircleText, ShieldCheck, Buildings, Users, Brain, Scales
} from "@phosphor-icons/react";

export type TemplateCategory =
  | "contract" | "memo" | "study" | "consultation"
  | "compliance" | "governance" | "hr" | "dispute" | "ip" | "collaboration";

export type Complexity = "starter" | "standard" | "advanced" | "expert" | "enterprise";
export type LegalArea  = "commercial" | "labor" | "civil" | "admin" | "ip" | "compliance" | "real_estate" | "family";

export interface Template {
  id: string;
  title: string;
  desc: string;
  longDesc: string;
  category: TemplateCategory;
  legalArea: LegalArea;
  complexity: Complexity;
  fields: number;
  pages: string;
  uses: number;
  isAi: boolean;
  isPremium: boolean;
  isNew: boolean;
  legalRef?: string[];      // المراجع القانونية
  redirectTo?: string;      // redirect to contracts AI with pre-selection
}

export const TEMPLATES: Template[] = [
  // ══ العقود الأساسية ══
  {
    id: "t01", title: "عقد أتعاب محاماة", category: "contract", legalArea: "civil", complexity: "standard",
    desc: "عقد شامل لاتفاقية الأتعاب والخدمات القانونية بين المحامي والموكل",
    longDesc: "يشمل نطاق العمل، الأتعاب الثابتة والنجاح، مدة التمثيل، وآلية إنهاء العلاقة",
    fields: 12, pages: "٢–٣ صفحات", uses: 1247, isAi: true, isPremium: false, isNew: false,
    legalRef: ["نظام المحاماة م٣٦", "لوائح هيئة المحامين"],
    redirectTo: "/ai/contracts?mode=draft&type=services",
  },
  {
    id: "t02", title: "عقد عمل محدد المدة", category: "contract", legalArea: "labor", complexity: "standard",
    desc: "عقد عمل متوافق مع نظام العمل السعودي ولائحة حماية الأجور",
    longDesc: "يغطي المسمى الوظيفي، الراتب، فترة التجربة، الإجازات، مكافأة نهاية الخدمة، وبنود الإنهاء",
    fields: 15, pages: "٢–٤ صفحات", uses: 2891, isAi: true, isPremium: false, isNew: false,
    legalRef: ["نظام العمل م٥١", "نظام العمل م٥٣", "نظام العمل م٨٤", "لائحة حماية الأجور"],
    redirectTo: "/ai/contracts?mode=draft&type=labor",
  },
  {
    id: "t03", title: "عقد عمل غير محدد المدة + بند التجربة", category: "contract", legalArea: "labor", complexity: "standard",
    desc: "عقد عمل مفتوح مع جميع بنود الحماية القانونية للطرفين",
    longDesc: "مثالي للوظائف الدائمة — يتضمن معالجة شاملة لكل سيناريوهات الإنهاء",
    fields: 14, pages: "٣–٤ صفحات", uses: 1654, isAi: true, isPremium: false, isNew: false,
    legalRef: ["نظام العمل م٧٤", "نظام العمل م٧٧", "نظام العمل م٨٠"],
    redirectTo: "/ai/contracts?mode=draft&type=labor",
  },
  {
    id: "t04", title: "عقد إيجار تجاري", category: "contract", legalArea: "real_estate", complexity: "standard",
    desc: "إيجار مساحات تجارية مع بنود تشغيل وصيانة ومخرج آمن",
    longDesc: "يشمل التكاملات مع نظام الإيجار وأحكام منصة إيجار الإلكترونية",
    fields: 18, pages: "٤–٦ صفحات", uses: 987, isAi: true, isPremium: false, isNew: false,
    legalRef: ["نظام الإيجارات", "نظام الإيجار التمويلي"],
    redirectTo: "/ai/contracts?mode=draft&type=rent",
  },

  // ══ العمل والحوكمة (Gap Coverage) ══
  {
    id: "t05", title: "عقد تنفيذي / C-Suite", category: "contract", legalArea: "labor", complexity: "advanced",
    desc: "عقد إداري شامل لمديرين تنفيذيين مع حزمة مزايا كاملة",
    longDesc: "يتضمن: حوافز أسهم، Clawback، تعويض عند الإنهاء، صلاحيات محددة، تعارض المصالح",
    fields: 22, pages: "٥–٨ صفحات", uses: 312, isAi: true, isPremium: true, isNew: true,
    legalRef: ["نظام العمل م٨٠", "نظام الشركات م١٣٦", "لوائح الحوكمة"],
    redirectTo: "/ai/contracts?mode=draft&type=employment_exec",
  },
  {
    id: "t06", title: "خطة تحسين الأداء (PIP)", category: "hr", legalArea: "labor", complexity: "standard",
    desc: "نموذج خطة تحسين أداء محدد الأهداف والمدة والعواقب",
    longDesc: "التزام قانوني بمبدأ العدالة الإجرائية قبل أي قرار تأديبي أو فصل",
    fields: 10, pages: "٢–٣ صفحات", uses: 543, isAi: true, isPremium: false, isNew: true,
    legalRef: ["نظام العمل م٦٦", "اللائحة التأديبية"],
    redirectTo: "/ai/contracts?mode=draft&type=pip",
  },
  {
    id: "t07", title: "سياسة العمل عن بُعد", category: "hr", legalArea: "labor", complexity: "standard",
    desc: "لائحة شاملة لتنظيم العمل عن بُعد والهجين مع متطلبات الأمان",
    longDesc: "تغطي: ساعات العمل، المعدات، أمن البيانات (PDPL)، التواصل، التقييم",
    fields: 12, pages: "٣–٥ صفحات", uses: 678, isAi: true, isPremium: false, isNew: true,
    legalRef: ["نظام العمل", "PDPL م١٢", "لوائح الأمن الإلكتروني"],
    redirectTo: "/ai/contracts?mode=draft&type=employment_remote",
  },
  {
    id: "t08", title: "خطاب إنهاء الخدمة (فسخ)", category: "hr", legalArea: "labor", complexity: "standard",
    desc: "خطاب فسخ بجميع المستحقات والإجراءات القانونية المطلوبة",
    longDesc: "يشمل: حساب المكافأة + الإشعار + الإجازات المتبقية + وثيقة الإبراء",
    fields: 8, pages: "١–٢ صفحة", uses: 1103, isAi: true, isPremium: false, isNew: false,
    legalRef: ["نظام العمل م٧٤", "نظام العمل م٨٤"],
    redirectTo: "/ai/contracts?mode=draft&type=termination",
  },

  // ══ الملكية الفكرية ══
  {
    id: "t09", title: "اتفاقية سرية NDA أحادية", category: "ip", legalArea: "ip", complexity: "standard",
    desc: "حماية المعلومات السرية عند مشاركتها مع طرف واحد",
    longDesc: "تعريف دقيق للمعلومات السرية + مدة الحماية + حالات الاستثناء + العقوبات",
    fields: 9, pages: "٢ صفحة", uses: 2134, isAi: true, isPremium: false, isNew: false,
    legalRef: ["نظام الأسرار التجارية", "نظام الملكية الفكرية"],
    redirectTo: "/ai/contracts?mode=draft&type=ip_nda",
  },
  {
    id: "t10", title: "عقد ترخيص برمجيات / SaaS", category: "ip", legalArea: "ip", complexity: "advanced",
    desc: "ترخيص استخدام برمجيات مع SLA وبنود الملكية وحدود المسؤولية",
    longDesc: "يغطي: نطاق الترخيص، حدود المستخدمين، بيانات العميل (PDPL)، حق الإنهاء، التحديثات",
    fields: 16, pages: "٤–٦ صفحات", uses: 456, isAi: true, isPremium: true, isNew: true,
    legalRef: ["نظام التجارة الإلكترونية", "PDPL", "نظام الملكية الفكرية"],
    redirectTo: "/ai/contracts?mode=draft&type=ip_license",
  },
  {
    id: "t11", title: "اتفاقية نقل ملكية فكرية", category: "ip", legalArea: "ip", complexity: "advanced",
    desc: "نقل كامل لحقوق الملكية الفكرية (كود / محتوى / براءات)",
    longDesc: "يُستخدم عند شراء حقوق كاملة — يحدد ما يُنقل، الضمانات، والتزامات عدم الانتهاك",
    fields: 11, pages: "٢–٣ صفحات", uses: 267, isAi: true, isPremium: true, isNew: true,
    legalRef: ["نظام الملكية الفكرية", "نظام براءات الاختراع"],
    redirectTo: "/ai/contracts?mode=draft&type=ip_assignment",
  },

  // ══ التحكيم والنزاعات ══
  {
    id: "t12", title: "بند التحكيم SCCA", category: "dispute", legalArea: "commercial", complexity: "standard",
    desc: "بند تحكيم معتمد لمركز التحكيم التجاري السعودي",
    longDesc: "صيغة مُوصى بها لإدراجها في أي عقد تجاري — مع تحديد المقر واللغة والقانون",
    fields: 6, pages: "½ صفحة", uses: 879, isAi: false, isPremium: false, isNew: false,
    legalRef: ["نظام التحكيم السعودي ١٤٣٢هـ م٢", "قواعد SCCA"],
    redirectTo: "/ai/contracts?mode=draft&type=arbitration_clause",
  },
  {
    id: "t13", title: "اتفاقية تسوية ومصالحة", category: "dispute", legalArea: "commercial", complexity: "advanced",
    desc: "وثيقة تسوية نزاع كاملة مع إبراء ذمة وشروط الدفع",
    longDesc: "يشمل: نطاق الإبراء، مبلغ التسوية، جدول الدفع، سرية الشروط، عدم المطالبة مستقبلاً",
    fields: 12, pages: "٢–٣ صفحات", uses: 534, isAi: true, isPremium: false, isNew: false,
    legalRef: ["نظام المرافعات", "أحكام الصلح الفقهي"],
    redirectTo: "/ai/contracts?mode=draft&type=settlement",
  },
  {
    id: "t14", title: "خطاب مطالبة / إنذار قانوني", category: "dispute", legalArea: "commercial", complexity: "standard",
    desc: "خطاب إنذار رسمي قبل اللجوء للقضاء",
    longDesc: "يوثّق الحق المطالَب به، الأدلة، المبلغ أو الطلب، ومهلة الاستجابة",
    fields: 8, pages: "١–٢ صفحة", uses: 1567, isAi: true, isPremium: false, isNew: false,
    legalRef: ["نظام المرافعات م٢٣"],
    redirectTo: "/ai/contracts?mode=draft&type=demand_letter",
  },

  // ══ حوكمة الشركات ══
  {
    id: "t15", title: "قرار مجلس الإدارة", category: "governance", legalArea: "commercial", complexity: "standard",
    desc: "محضر/قرار رسمي لمجلس الإدارة يستوفي المتطلبات النظامية",
    longDesc: "يشمل النصاب، جدول الأعمال، طريقة التصويت، التوقيعات المطلوبة",
    fields: 10, pages: "١–٢ صفحة", uses: 723, isAi: true, isPremium: false, isNew: true,
    legalRef: ["نظام الشركات م٨٥", "نظام الشركات م٨٦"],
    redirectTo: "/ai/contracts?mode=draft&type=governance_board",
  },
  {
    id: "t16", title: "اتفاقية المساهمين (Shareholders' Agreement)", category: "governance", legalArea: "commercial", complexity: "expert",
    desc: "اتفاقية شاملة لحقوق المساهمين وآليات الخروج والحوكمة",
    longDesc: "حقوق التصاغ والجرّ، منع نقل الأسهم، حل النزاعات، حل بند الإنهاء الإجباري",
    fields: 25, pages: "٦–١٠ صفحات", uses: 198, isAi: true, isPremium: true, isNew: true,
    legalRef: ["نظام الشركات ٢٠٢٢", "نظام سوق رأس المال"],
    redirectTo: "/ai/contracts?mode=draft&type=shareholders",
  },
  {
    id: "t17", title: "سياسة تعارض المصالح", category: "governance", legalArea: "commercial", complexity: "advanced",
    desc: "سياسة إفصاح ومعالجة تعارض المصالح للموظفين والمديرين",
    longDesc: "تشمل: تعريف التعارض، آلية الإفصاح، اللجنة المختصة، العقوبات، توثيق القرارات",
    fields: 11, pages: "٢–٣ صفحات", uses: 267, isAi: true, isPremium: false, isNew: true,
    legalRef: ["نظام الشركات", "قواعد الحوكمة"],
    redirectTo: "/ai/contracts?mode=draft&type=governance_coi",
  },

  // ══ الامتثال والبيانات ══
  {
    id: "t18", title: "سياسة الخصوصية PDPL", category: "compliance", legalArea: "compliance", complexity: "advanced",
    desc: "سياسة خصوصية كاملة متوافقة مع نظام حماية البيانات السعودي",
    longDesc: "تغطي: البيانات المجموعة، الأسس القانونية، حقوق الأفراد، الإخطار بالخروقات، الاحتفاظ",
    fields: 18, pages: "٤–٦ صفحات", uses: 892, isAi: true, isPremium: false, isNew: false,
    legalRef: ["PDPL م٦", "PDPL م١٥-م٢٤", "PDPL م٢٧", "اللوائح التنفيذية"],
    redirectTo: "/ai/contracts?mode=draft&type=pdpl_privacy",
  },
  {
    id: "t19", title: "اتفاقية معالجة البيانات DPA", category: "compliance", legalArea: "compliance", complexity: "advanced",
    desc: "اتفاقية مُلزِمة لمعالجة بيانات العملاء من قِبل جهات خارجية",
    longDesc: "ضرورية عند مشاركة بيانات شخصية مع مزودي خدمات خارجيين (مثل شركات السحابة)",
    fields: 15, pages: "٣–٥ صفحات", uses: 344, isAi: true, isPremium: true, isNew: true,
    legalRef: ["PDPL م١٣", "PDPL م٢٩", "اللوائح التنفيذية"],
    redirectTo: "/ai/contracts?mode=draft&type=pdpl_dpa",
  },
  {
    id: "t20", title: "خطة الاستجابة لخروقات البيانات", category: "compliance", legalArea: "compliance", complexity: "expert",
    desc: "إجراءات استجابة فورية واضحة عند اكتشاف اختراق للبيانات",
    longDesc: "خطوات الاكتشاف، تقييم الخطر، الإخطار في ٧٢ ساعة، توثيق الحادثة، المراجعة اللاحقة",
    fields: 14, pages: "٣–٤ صفحات", uses: 156, isAi: true, isPremium: true, isNew: true,
    legalRef: ["PDPL م٢٧", "الاتصالات السعودية — أمن المعلومات"],
    redirectTo: "/ai/contracts?mode=draft&type=data_breach",
  },

  // ══ المذكرات والدراسات ══
  {
    id: "t21", title: "مذكرة افتتاحية — تجاري", category: "memo", legalArea: "commercial", complexity: "advanced",
    desc: "مذكرة المدعي في منازعات العقود التجارية",
    longDesc: "مبنية على نظام الشركات السعودي — تشمل الوقائع، الأسانيد القانونية، الطلبات",
    fields: 8, pages: "٤–٧ صفحات", uses: 812, isAi: true, isPremium: false, isNew: false,
    redirectTo: "/ai/draft",
  },
  {
    id: "t22", title: "استشارة قانونية — عقد عمل", category: "consultation", legalArea: "labor", complexity: "standard",
    desc: "رأي قانوني موجز حول إشكاليات عقود العمل",
    longDesc: "مناسب للأفراد والشركات — يُجيب على سؤال قانوني محدد بأسانيده",
    fields: 5, pages: "١–٢ صفحة", uses: 1489, isAi: true, isPremium: false, isNew: false,
    redirectTo: "/ai/legal-opinion",
  },
  {
    id: "t23", title: "دراسة قانونية — عقد إيجار", category: "study", legalArea: "real_estate", complexity: "advanced",
    desc: "تحليل قانوني معمّق لإشكاليات عقود الإيجار السكنية والتجارية",
    longDesc: "مواطن النزاع الشائعة + موقف القضاء + التوصيات الوقائية",
    fields: 6, pages: "٥–٨ صفحات", uses: 314, isAi: true, isPremium: true, isNew: false,
    redirectTo: "/ai/legal-opinion",
  },
  {
    id: "t24", title: "وكالة شاملة قضائية", category: "contract", legalArea: "civil", complexity: "starter",
    desc: "وكالة رسمية تُخوّل المحامي التمثيل أمام جميع الجهات القضائية",
    longDesc: "وكالة متوافقة مع متطلبات المحاكم السعودية ووزارة العدل",
    fields: 7, pages: "١ صفحة", uses: 2103, isAi: false, isPremium: false, isNew: false,
    legalRef: ["نظام المحاماة م٢١"],
    redirectTo: "/ai/contracts?mode=draft&type=services",
  },

  // ══ مذكرات الرد الجوابية ══
  {
    id: "t25", title: "مذكرة رد جوابية — مدني", category: "memo", legalArea: "civil", complexity: "advanced",
    desc: "مذكرة الرد على دعوى المدعي في المنازعات المدنية أمام المحاكم العامة",
    longDesc: "تتضمن: الدفع بعدم القبول الشكلي، الرد على الوقائع، الدفوع الموضوعية، الطلبات المقابلة",
    fields: 9, pages: "٣–٦ صفحات", uses: 1234, isAi: true, isPremium: false, isNew: true,
    legalRef: ["نظام المرافعات م٧٠", "نظام المرافعات م٧٣"],
    redirectTo: "/ai/draft",
  },
  {
    id: "t26", title: "مذكرة رد جوابية — تجاري", category: "memo", legalArea: "commercial", complexity: "advanced",
    desc: "مذكرة رد المدعى عليه في المنازعات التجارية والشركات",
    longDesc: "مُصمّمة للدفاع في دعاوى العقود التجارية والمطالبات المالية أمام المحاكم التجارية",
    fields: 10, pages: "٤–٨ صفحات", uses: 987, isAi: true, isPremium: false, isNew: true,
    legalRef: ["نظام المرافعات التجارية", "نظام الشركات"],
    redirectTo: "/ai/draft",
  },
  {
    id: "t27", title: "مذكرة رد جوابية — عمالي", category: "memo", legalArea: "labor", complexity: "standard",
    desc: "رد صاحب العمل على دعوى العامل أمام المحاكم العمالية",
    longDesc: "يتناول: الدفع بانقضاء حق الدعوى، إثبات الالتزام بنظام العمل، الطعن في المطالبات المالية",
    fields: 8, pages: "٢–٤ صفحات", uses: 1567, isAi: true, isPremium: false, isNew: true,
    legalRef: ["نظام العمل م١٦", "نظام العمل م٢٢٢"],
    redirectTo: "/ai/draft",
  },
  {
    id: "t28", title: "مذكرة رد جوابية — جزائي", category: "memo", legalArea: "civil", complexity: "expert",
    desc: "مذكرة دفاع المتهم في القضايا الجزائية ردّاً على لائحة الاتهام",
    longDesc: "تشمل: الدفوع الشكلية والموضوعية، الطعن في الأدلة، طلب البراءة أو تخفيف العقوبة",
    fields: 11, pages: "٤–٩ صفحات", uses: 743, isAi: true, isPremium: true, isNew: true,
    legalRef: ["نظام الإجراءات الجزائية م١٧٢", "نظام الإثبات"],
    redirectTo: "/ai/draft",
  },
  {
    id: "t29", title: "مذكرة رد جوابية — إداري (ديوان المظالم)", category: "memo", legalArea: "admin", complexity: "advanced",
    desc: "رد الجهة الحكومية على دعوى المواطن أمام ديوان المظالم",
    longDesc: "يتضمن الدفع بعدم الاختصاص، مشروعية القرار الإداري، رفض طلب التعويض",
    fields: 9, pages: "٣–٦ صفحات", uses: 456, isAi: true, isPremium: false, isNew: true,
    legalRef: ["نظام ديوان المظالم م١٣", "نظام الإجراءات أمام ديوان المظالم"],
    redirectTo: "/ai/draft",
  },

  // ══ لوائح الاستئناف ══
  {
    id: "t30", title: "لائحة استئناف — مدني / تجاري", category: "memo", legalArea: "commercial", complexity: "expert",
    desc: "الطعن في الحكم الابتدائي أمام محاكم الاستئناف",
    longDesc: "تُعدّ وفق متطلبات نظام المرافعات: أوجه الاستئناف، الطعن في التسبيب، الطلبات الاحتياطية",
    fields: 12, pages: "٥–١٠ صفحات", uses: 892, isAi: true, isPremium: false, isNew: true,
    legalRef: ["نظام المرافعات م١٧٩", "نظام المرافعات م١٨٠"],
    redirectTo: "/ai/draft",
  },
  {
    id: "t31", title: "لائحة استئناف — عمالي", category: "memo", legalArea: "labor", complexity: "advanced",
    desc: "الطعن في أحكام المحاكم العمالية الابتدائية",
    longDesc: "مُصمّمة لتغطية أوجه الطعن الخاصة بالمنازعات العمالية وأحكام التعويض",
    fields: 10, pages: "٤–٧ صفحات", uses: 678, isAi: true, isPremium: false, isNew: true,
    legalRef: ["نظام العمل م١٢٧", "نظام المرافعات م١٧٩"],
    redirectTo: "/ai/draft",
  },
  {
    id: "t32", title: "لائحة استئناف — جزائي", category: "memo", legalArea: "civil", complexity: "expert",
    desc: "استئناف الأحكام الجزائية الابتدائية",
    longDesc: "تشمل أوجه الطعن في العقوبة والتسبيب والإجراءات — مع طلب وقف التنفيذ",
    fields: 11, pages: "٥–١٠ صفحات", uses: 534, isAi: true, isPremium: true, isNew: true,
    legalRef: ["نظام الإجراءات الجزائية م٢١٢", "نظام الإجراءات الجزائية م٢١٣"],
    redirectTo: "/ai/draft",
  },

  // ══ طعون النقض والالتماس ══
  {
    id: "t33", title: "طعن بالنقض", category: "memo", legalArea: "commercial", complexity: "enterprise",
    desc: "الطعن أمام المحكمة العليا في أحكام الاستئناف",
    longDesc: "يُعدّ وفق الأسباب النظامية للنقض: مخالفة النص، الخطأ في التطبيق، الإخلال بالإجراءات",
    fields: 14, pages: "٦–١٢ صفحة", uses: 312, isAi: true, isPremium: true, isNew: true,
    legalRef: ["نظام المرافعات م١٩٥", "قواعد المحكمة العليا"],
    redirectTo: "/ai/draft",
  },
  {
    id: "t34", title: "التماس إعادة النظر", category: "memo", legalArea: "civil", complexity: "enterprise",
    desc: "طلب إعادة النظر في حكم نهائي بسبب ظروف جديدة",
    longDesc: "يُستخدم عند اكتشاف أدلة جديدة جوهرية أو وجود تزوير — مع استيفاء الشروط النظامية الصارمة",
    fields: 10, pages: "٤–٨ صفحات", uses: 178, isAi: true, isPremium: true, isNew: true,
    legalRef: ["نظام المرافعات م٢٠٠", "نظام المرافعات م٢٠١"],
    redirectTo: "/ai/draft",
  },

  // ══ صحائف الدعاوى ══
  {
    id: "t35", title: "صحيفة دعوى — مدني / تجاري", category: "memo", legalArea: "commercial", complexity: "advanced",
    desc: "صحيفة دعوى كاملة للمطالبة بحقوق مدنية أو تجارية",
    longDesc: "تشمل: بيانات الأطراف، الوقائع المؤسِّسة للدعوى، الأسانيد القانونية، الطلبات الختامية",
    fields: 11, pages: "٣–٦ صفحات", uses: 1789, isAi: true, isPremium: false, isNew: true,
    legalRef: ["نظام المرافعات م٣٧", "نظام المرافعات م٣٨"],
    redirectTo: "/ai/draft",
  },
  {
    id: "t36", title: "صحيفة دعوى — عمالي", category: "memo", legalArea: "labor", complexity: "standard",
    desc: "صحيفة مطالبة العامل بحقوقه العمالية أمام المحكمة العمالية",
    longDesc: "مذكورة وفق المتطلبات الخاصة بالمحاكم العمالية: المكافأة + الراتب + الإشعار + التعويض",
    fields: 9, pages: "٢–٤ صفحات", uses: 2134, isAi: true, isPremium: false, isNew: true,
    legalRef: ["نظام العمل م٢٢٢", "نظام المرافعات م٣٧"],
    redirectTo: "/ai/draft",
  },
  {
    id: "t37", title: "صحيفة دعوى — إداري (ديوان المظالم)", category: "memo", legalArea: "admin", complexity: "advanced",
    desc: "دعوى إلغاء قرار إداري أو التعويض عنه أمام ديوان المظالم",
    longDesc: "تتضمن: الطعن في القرار الإداري، طلب وقف التنفيذ، الطلبات التعويضية",
    fields: 10, pages: "٣–٦ صفحات", uses: 567, isAi: true, isPremium: false, isNew: true,
    legalRef: ["نظام ديوان المظالم م٨", "نظام الإجراءات أمام ديوان المظالم م٢٦"],
    redirectTo: "/ai/draft",
  },

  // ══ مذكرات ختامية وإلحاقية ══
  {
    id: "t38", title: "مذكرة إلحاقية", category: "memo", legalArea: "civil", complexity: "standard",
    desc: "مذكرة تُقدَّم لإضافة وقائع أو أدلة جديدة بعد المذكرة الجوابية",
    longDesc: "تتضمن توضيح سبب الإلحاق، الوقائع الجديدة، الأدلة التكميلية، والطلبات المحدّثة",
    fields: 6, pages: "١–٣ صفحات", uses: 834, isAi: true, isPremium: false, isNew: true,
    legalRef: ["نظام المرافعات م٧١"],
    redirectTo: "/ai/draft",
  },
  {
    id: "t39", title: "مذكرة ختامية", category: "memo", legalArea: "civil", complexity: "advanced",
    desc: "المذكرة الختامية قبيل صدور الحكم — تلخّص الموقف وتُقفل الحجج",
    longDesc: "تُقدَّم بعد اكتمال المذكرات المتبادلة: ملخص الوقائع + أقوى الدفوع + الطلبات الختامية",
    fields: 8, pages: "٢–٥ صفحات", uses: 645, isAi: true, isPremium: false, isNew: true,
    legalRef: ["نظام المرافعات"],
    redirectTo: "/ai/draft",
  },

  // ══ عقود التعاون المهني (S59 — Collaboration Economy) ══
  {
    id: "t40", title: "اتفاقية مستشار خارجي (Of-Counsel)",
    category: "collaboration", legalArea: "commercial", complexity: "advanced",
    desc: "عقد ينظّم علاقة مكتب المحاماة بمحامٍ خارجي بصفة مستشار مستقل وليس شريكاً",
    longDesc: "يحدد نطاق العمل، الأتعاب وآلية حسابها، سرية المعلومات، عدم التنافس، وآلية إنهاء العلاقة مع ضمان استقلالية المستشار وفق نظام المحاماة السعودي",
    fields: 14, pages: "٣–٤ صفحات", uses: 47, isAi: true, isPremium: true, isNew: true,
    legalRef: ["نظام المحاماة م٢٣", "لوائح هيئة المحامين السعوديين", "نظام الأتعاب"],
    redirectTo: "/ai/contracts?mode=draft&type=of_counsel",
  },
  {
    id: "t41", title: "عقد إحالة موكل بعمولة",
    category: "collaboration", legalArea: "commercial", complexity: "standard",
    desc: "اتفاقية إحالة منظّمة بين محاميين تحدد العمولة، الشروط، وآلية تحويل المستحقات",
    longDesc: "نسبة العمولة، شروط الاستحقاق (إيداع / إفراج / مرحلي)، عدم التواصل المباشر مع الموكل بعد الإحالة، وآلية الفوترة وتحصيل العمولة عبر نظامي",
    fields: 10, pages: "٢–٣ صفحات", uses: 83, isAi: true, isPremium: false, isNew: true,
    legalRef: ["نظام المحاماة م٢١", "نظام الأتعاب م١٥"],
    redirectTo: "/ai/contracts?mode=draft&type=referral_fee",
  },
  {
    id: "t42", title: "عقد إعارة محامٍ لشركة",
    category: "collaboration", legalArea: "labor", complexity: "advanced",
    desc: "عقد إعارة مؤقت بين مكتب محاماة وشركة تجارية لشغل وظيفة مستشار قانوني داخلي",
    longDesc: "يحدد: مدة الإعارة، المهام والصلاحيات، آلية الفوترة (ZATCA لكلا الطرفين)، سرية المعلومات، عدم التنافس، وإمكانية التمديد",
    fields: 16, pages: "٣–٥ صفحات", uses: 29, isAi: true, isPremium: true, isNew: true,
    legalRef: ["نظام العمل م١٠", "نظام المحاماة م٢٣", "لوائح هيئة المحامين", "ZATCA إصدار الفواتير"],
    redirectTo: "/ai/contracts?mode=draft&type=secondment",
  },
];

export const CAT_CONFIG: Record<TemplateCategory, { label: string; color: string; bg: string; icon: any; emoji: string }> = {
  contract:      { label: "عقد",           color: "text-royal",       bg: "bg-royal/10",       icon: Seal,           emoji: "📋" },
  memo:          { label: "مذكرة",         color: "text-blue-500",    bg: "bg-blue-500/10",    icon: FileText,       emoji: "⚖️" },
  study:         { label: "دراسة",         color: "text-purple-500",  bg: "bg-purple-500/10",  icon: BookOpen,       emoji: "📚" },
  consultation:  { label: "استشارة",       color: "text-emerald-500", bg: "bg-emerald-500/10", icon: ChatCircleText, emoji: "💬" },
  compliance:    { label: "امتثال",        color: "text-red-500",     bg: "bg-red-500/10",     icon: ShieldCheck,    emoji: "🛡️" },
  governance:    { label: "حوكمة",         color: "text-amber-500",   bg: "bg-amber-500/10",   icon: Buildings,      emoji: "🏢" },
  hr:            { label: "موارد بشرية",   color: "text-cyan-500",    bg: "bg-cyan-500/10",    icon: Users,          emoji: "👔" },
  dispute:       { label: "نزاع",          color: "text-orange-500",  bg: "bg-orange-500/10",  icon: Scales,         emoji: "🏛️" },
  ip:            { label: "ملكية فكرية",   color: "text-indigo-500",  bg: "bg-indigo-500/10",  icon: Brain,          emoji: "💡" },
  collaboration: { label: "تعاون مهني",    color: "text-teal-500",    bg: "bg-teal-500/10",    icon: Users,          emoji: "🤝" },
};

export const COMPLEXITY_CONFIG: Record<Complexity, { label: string; color: string }> = {
  starter:    { label: "مبتدئ",   color: "text-emerald-500" },
  standard:   { label: "عادي",    color: "text-blue-500" },
  advanced:   { label: "متقدم",   color: "text-amber-500" },
  expert:     { label: "خبير",    color: "text-orange-500" },
  enterprise: { label: "مؤسسي",   color: "text-red-500" },
};

export const AREA_LABELS: Record<LegalArea, string> = {
  commercial: "تجاري", labor: "عمالي", civil: "مدني",
  admin: "إداري", ip: "ملكية فكرية", compliance: "امتثال",
  real_estate: "عقاري", family: "أحوال شخصية",
};

export type GroupKey = "all" | "pleadings" | "contracts" | "governance" | "collaboration";

export const GROUPS: { key: GroupKey; label: string; labelEn: string; cats: (TemplateCategory | "all")[] }[] = [
  { key: "all",           label: "الكل",              labelEn: "All",          cats: ["all"] },
  { key: "pleadings",     label: "مذكرات وطعون",       labelEn: "Pleadings",    cats: ["memo", "dispute", "study", "consultation"] },
  { key: "contracts",     label: "عقود وخطابات",       labelEn: "Contracts",    cats: ["contract", "hr", "ip"] },
  { key: "governance",    label: "حوكمة وامتثال",      labelEn: "Governance",   cats: ["governance", "compliance"] },
  { key: "collaboration", label: "تعاون مهني",         labelEn: "Collaboration",cats: ["collaboration"] },
];
