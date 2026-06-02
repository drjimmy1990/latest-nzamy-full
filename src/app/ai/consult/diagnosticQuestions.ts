export interface DiagnosticQuestion {
  id: string;
  question: string;
  options: string[];
  allowCustomInput?: boolean;
}

export const LABOUR_QUESTIONS: DiagnosticQuestion[] = [
  {
    id: "q_labor_contract",
    question: "1. ما هو نوع عقد العمل المبرم بينك وبين المنشأة؟",
    options: ["عقد محدد المدة (له تاريخ انتهاء)", "عقد غير مدة محددة", "لا يوجد عقد مكتوب"]
  },
  {
    id: "q_labor_salary",
    question: "2. ما هو متوسط راتبك الأساسي الأخير المسجل في التأمينات؟",
    options: ["أقل من 5,000 ريال", "بين 5,000 و 15,000 ريال", "أكثر من 15,000 ريال"],
    allowCustomInput: true
  },
  {
    id: "q_labor_notice",
    question: "3. هل تم إبلاغك كتابياً بالفصل وما هو السبب الرسمي؟",
    options: ["نعم، كتابي (بسبب تصفية أو هيكلة)", "نعم، كتابي (غياب أو إهمال)", "شفهي فقط (بلا سبب مكتوب)"]
  }
];

export const REALESTATE_QUESTIONS: DiagnosticQuestion[] = [
  {
    id: "q_re_ejar",
    question: "1. هل عقد الإيجار مسجل رسمياً في منصة (إيجار) الإلكترونية؟",
    options: ["نعم، عقد إلكتروني موحد وسارٍ", "لا، عقد ورقي خارجي", "لا يوجد عقد مكتوب"]
  },
  {
    id: "q_re_value",
    question: "2. ما هي القيمة الإيجارية السنوية الإجمالية المنصوص عليها؟",
    options: ["أقل من 20,000 ريال", "بين 20,000 و 50,000 ريال", "أكثر من 50,000 ريال"],
    allowCustomInput: true
  },
  {
    id: "q_re_notice",
    question: "3. هل قمت بإخطار المالك رسمياً بالمشكلة والصيانة المطلوبة؟",
    options: ["نعم، إخطار مكتوب (واتساب/بريد)", "تواصلنا شفهياً وهاتفياً فقط", "لا، لم يتم الإخطار بعد"]
  }
];

export const COMMERCIAL_QUESTIONS: DiagnosticQuestion[] = [
  {
    id: "q_comm_penalty",
    question: "1. هل يتضمن الاتفاق شرطاً جزائياً أو غرامات تأخير واضحة؟",
    options: ["نعم، شرط جزائي صريح وغرامات", "لا، العقد لا يتضمن غرامات تأخير", "لا أعلم بالتأكيد"]
  },
  {
    id: "q_comm_value",
    question: "2. ما هي القيمة المالية الإجمالية للنزاع أو التوريدات المتبقية؟",
    options: ["أقل من 50,000 ريال", "بين 50,000 و 200,000 ريال", "أكثر من 200,000 ريال"],
    allowCustomInput: true
  },
  {
    id: "q_comm_arbitration",
    question: "3. هل يتضمن العقد شرطاً صريحاً يوجب اللجوء للتحكيم لفض النزاع؟",
    options: ["نعم، يلزم باللجوء للتحكيم", "لا، يخضع للمحاكم العامة", "لا أعلم"]
  }
];
