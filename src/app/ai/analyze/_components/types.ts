import {
  Briefcase,
  HouseLine,
  Heart,
  Car,
  ShoppingBag,
  Gavel,
} from "@phosphor-icons/react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Mode = "landing" | "eval" | "doc";
export type EvalStep = 1 | 2 | 3;
export type DocStep = 1 | 2 | 3;

export interface LegalDomain {
  id: string;
  icon: React.ElementType;
  labelAr: string;
  labelEn: string;
  questionsAr: string[];
  questionsEn: string[];
}

export interface DocResult {
  type: string;
  parties: string[];
  keyClauses: string[];
  warnings: string[];
  riskLevel: "low" | "medium" | "high";
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export const domains: LegalDomain[] = [
  {
    id: "labor",
    icon: Briefcase,
    labelAr: "نزاع عمالي",
    labelEn: "Labor Dispute",
    questionsAr: [
      "ما هي طبيعة نزاعك مع صاحب العمل؟",
      "هل لديك عقد عمل موثق؟",
      "ما الإجراء الذي قام به صاحب العمل؟",
    ],
    questionsEn: [
      "What is the nature of your labor dispute?",
      "Do you have a documented employment contract?",
      "What action did your employer take?",
    ],
  },
  {
    id: "rent",
    icon: HouseLine,
    labelAr: "نزاع إيجار",
    labelEn: "Rental Dispute",
    questionsAr: [
      "ما نوع العقار المتنازع عليه؟",
      "ما المشكلة التي تواجهها مع المالك أو المستأجر؟",
      "هل عقد الإيجار مسجّل في إيجار؟",
    ],
    questionsEn: [
      "What type of property is in dispute?",
      "What issue are you facing with the landlord/tenant?",
      "Is the lease registered with Ejar?",
    ],
  },
  {
    id: "family",
    icon: Heart,
    labelAr: "شؤون أسرية",
    labelEn: "Family Matters",
    questionsAr: [
      "ما القضية الأسرية التي تواجهها؟",
      "هل صدر أي قرار قضائي سابق في القضية؟",
      "هل ثمة أطفال تتأثر مصالحهم؟",
    ],
    questionsEn: [
      "What family issue are you facing?",
      "Has there been any previous court ruling?",
      "Are there children whose interests are affected?",
    ],
  },
  {
    id: "traffic",
    icon: Car,
    labelAr: "حوادث مرورية",
    labelEn: "Traffic Accidents",
    questionsAr: [
      "متى وأين وقع الحادث؟",
      "هل صدر تقرير مروري رسمي؟",
      "ما هي الأضرار التي تطالب بتعويضها؟",
    ],
    questionsEn: [
      "When and where did the accident occur?",
      "Is there an official traffic report?",
      "What damages are you seeking compensation for?",
    ],
  },
  {
    id: "consumer",
    icon: ShoppingBag,
    labelAr: "حقوق المستهلك",
    labelEn: "Consumer Rights",
    questionsAr: [
      "ما المنتج أو الخدمة التي يتعلق بها النزاع؟",
      "هل تواصلت مع البائع/مقدم الخدمة لحل المشكلة؟",
      "ما الضرر الذي تكبدته؟",
    ],
    questionsEn: [
      "What product or service is the dispute about?",
      "Did you contact the seller/provider for resolution?",
      "What damages have you suffered?",
    ],
  },
  {
    id: "other",
    icon: Gavel,
    labelAr: "أخرى",
    labelEn: "Other",
    questionsAr: [
      "اشرح وضعك القانوني باختصار:",
      "ما النتيجة التي تأمل تحقيقها؟",
      "هل هناك مستندات أو وثائق ذات صلة؟",
    ],
    questionsEn: [
      "Briefly describe your legal situation:",
      "What outcome are you hoping to achieve?",
      "Are there any relevant documents or evidence?",
    ],
  },
];
