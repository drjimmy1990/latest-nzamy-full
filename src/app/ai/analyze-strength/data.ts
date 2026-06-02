import { Shield, Books, Users, Clock, Warning, Scales, Gauge, Crosshair, TrendUp, Sword, ChartBar } from "@phosphor-icons/react";
import { TabKey } from "./types";

export const ANALYSIS = {
  overallScore: 68,
  verdict: "قضية متوسطة القوة — قابلة للفوز بتعزيز الأدلة",
  dimensions: [
    { key: "evidence", label: "قوة الأدلة",          score: 72, icon: Shield },
    { key: "legal",    label: "الأساس القانوني",     score: 85, icon: Books },
    { key: "witness",  label: "الشهود والإثبات",     score: 60, icon: Users },
    { key: "timing",   label: "التقادم والمواعيد",   score: 90, icon: Clock },
    { key: "risk",     label: "مخاطر المعارضة",      score: 45, icon: Warning },
    { key: "courts",   label: "توافق مع السوابق",    score: 78, icon: Scales },
  ],
  strengths: [
    "الأساس القانوني راسخ — المادة ٧٧ وثيقة الصلة",
    "لم تنقضِ مدة التقادم (١١ شهراً من نهاية العقد)",
    "وجود عقد موثق ومراسلات رسمية داعمة",
  ],
  weaknesses: [
    "الشاهد الرئيسي متردد في الإدلاء بشهادته",
    "احتمال الدفع بالبند ١٢ من العقد لصالح المدّعى عليه",
    "غياب تقرير طبي أو مستندات تثبت الضرر المادي",
  ],
  recommendations: [
    "تأمين شهادة خطية موثقة من الشاهد قبل الجلسة",
    "إعداد دفع احتياطي للبند ١٢ مسبقاً",
    "طلب تقرير خبير في التقييم المالي للأضرار",
  ],
};

export const OPPONENT_MOVES = [
  { type: "attack" as const, move: "الخصم سيستند إلى البند ١٢ لنفي المسؤولية", counter: "دفع مضاد: البند ١٢ باطل لمخالفته المادة ٦١ من نظام العمل" },
  { type: "attack" as const, move: "تقديم شاهد ينفي وجود اتفاق شفهي مسبق", counter: "تأهيل شاهد مضاد + طلب كشف عن سجل المكالمات والرسائل" },
  { type: "defense" as const, move: "التشكيك في مصداقية عقد العمل المقدَّم", counter: "تقديم نسخة موثقة من كاتب العدل + شهادة مراجع القوائم المالية" },
  { type: "attack" as const, move: "ادّعاء انقضاء مدة التقادم قبل رفع الدعوى", counter: "إثبات أن العلم بالضرر تأخر وفق المادة ٢١٥ من نظام الإجراءات المدنية" },
];

export const DEVIL_ADVOCATE = [
  { label: "الثغرة الأخطر في موقفك", text: "الشاهد الرئيسي متردد — إذا رفض الحضور أو تراجع، تسقط الركيزة الإثباتية الأقوى في القضية. الخصم يعرف هذا وسيضغط على هذه النقطة.", severity: "critical" as const },
  { label: "ما سيفعله الخصم الذكي", text: "سيطلب تأجيل الجلسة تكتيكياً لاستنزافك مالياً وإحباط موكلك، بينما يجمع معلومات عن الشاهد ويحاول التأثير عليه غير مباشر.", severity: "high" as const },
  { label: "الاستراتيجية المثلى للخصم", text: "تحويل النزاع من دعوى فصل تعسفي إلى نزاع تفسير عقد — البند ١٢ سيكون محوره، مما يجبرك على إثبات أن التوقيع كان تحت إكراه.", severity: "high" as const },
  { label: "الطعن الأكثر احتمالاً", text: "الطعن بعدم الاختصاص النوعي (محاولة تحويل للقضاء العام) أو الطعن الشكلي في مدى صحة التمثيل النظامي.", severity: "medium" as const },
];

export const RISKS_MATRIX = [
  { risk: "الشاهد يرفض الحضور", likelihood: 60, impact: 85, mitigation: "تأمين شهادة خطية مسبقاً + طلب إلزام قضائي" },
  { risk: "الخصم يقدم دليلاً جديداً", likelihood: 40, impact: 70, mitigation: "طلب مهلة للرد + إعداد دفوع احتياطية" },
  { risk: "رد القضية شكلاً (التقادم)", likelihood: 15, impact: 100, mitigation: "تقديم مستندات تثبت تأخر العلم بالضرر" },
  { risk: "تحويل القضية لـ circuit آخر", likelihood: 30, impact: 25, mitigation: "تجهيز طلب عدم اختصاص مقابل" },
];

export const TABS: { key: TabKey; label: string; icon: typeof ChartBar }[] = [
  { key: "strength", label: "قوة موقفك",      icon: Gauge as any },
  { key: "opponent",  label: "توقعات الخصم",   icon: Crosshair as any },
  { key: "risks",     label: "الفرص والمخاطر", icon: TrendUp as any },
  { key: "devil",     label: "محاكي الخصم",   icon: Sword as any },
];
