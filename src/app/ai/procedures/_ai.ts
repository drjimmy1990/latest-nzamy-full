export interface SmartAnswer {
  question: string;
  type: "direct" | "community" | "circuit";
  confidence: number;
  answer: string;
  source?: string;
  circuitData?: {
    name: string; email: string; phone: string; floor: string; najizCode: string;
  };
  communityVotes?: {
    answer: string; votes: number; verified: boolean;
  }[];
}

export function getSmartAnswer(q: string): SmartAnswer {
  const lower = q.toLowerCase();

  // Circuit/Email queries
  if (lower.includes("دائر") || lower.includes("بريد") || lower.includes("إيميل") || lower.includes("email") || lower.includes("استئناف") || lower.includes("محكم") || lower.includes("تجار") || lower.includes("عمال")) {
    return {
      question: q, type: "circuit", confidence: 97,
      answer: "وجدتُ بيانات الدوائر القضائية المطلوبة:",
      circuitData: {
        name: "الدائرة التجارية الأولى — الرياض",
        email: "c.court.r1@moj.gov.sa",
        phone: "0112175000",
        floor: "الدور الثاني",
        najizCode: "TC-R-01",
      },
    };
  }

  // Community/procedure queries
  if (lower.includes("كيف") || lower.includes("خطوات") || lower.includes("إجراء")) {
    return {
      question: q, type: "community", confidence: 89,
      answer: "بناءً على تصويت المحامين في منصة نظامي:",
      communityVotes: [
        { answer: "التسوية الودية أولاً عبر وزارة الموارد البشرية، ثم رفع الدعوى للمحكمة العمالية مع إرفاق قرار الفشل.", votes: 14, verified: true },
        { answer: "مباشرة للمحكمة العمالية بعد التأكد من فشل التسوية أو مرور ٢١ يوم.", votes: 6, verified: true },
        { answer: "التقدم لهيئة الفصل في المنازعات العمالية مباشرة.", votes: 3, verified: false },
      ],
    };
  }

  // Direct answer
  return {
    question: q, type: "direct", confidence: 95,
    answer: "مدة التقادم في دعاوى نهاية الخدمة هي **١٢ شهراً** من تاريخ انتهاء العلاقة العمالية وفق المادة ٢٢٢ من نظام العمل.",
    source: "نظام العمل السعودي م/٥١ — المادة ٢٢٢",
  };
}

export function formatSmartAnswer(answer: SmartAnswer) {
  const lines = [
    "نتيجة المرشد القضائي",
    "====================",
    `السؤال: ${answer.question}`,
    `نوع النتيجة: ${answer.type}`,
    `الثقة: ${answer.confidence}%`,
    "",
    answer.answer,
  ];

  if (answer.source) {
    lines.push("", `المصدر: ${answer.source}`);
  }

  if (answer.circuitData) {
    lines.push(
      "",
      "بيانات الدائرة:",
      `- الاسم: ${answer.circuitData.name}`,
      `- البريد: ${answer.circuitData.email}`,
      `- الهاتف: ${answer.circuitData.phone}`,
      `- الموقع: ${answer.circuitData.floor}`,
      `- كود ناجز: ${answer.circuitData.najizCode}`,
    );
  }

  if (answer.communityVotes) {
    lines.push("", "تصويت المحامين:");
    answer.communityVotes.forEach((vote, index) => {
      lines.push(`${index + 1}. ${vote.answer} — ${vote.votes} صوت${vote.verified ? " — موثّق" : ""}`);
    });
  }

  return lines.join("\n");
}
