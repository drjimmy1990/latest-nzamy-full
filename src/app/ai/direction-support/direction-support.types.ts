export type Stage      = "input" | "processing" | "result";
export type SearchModes = { texts: boolean; precedents: boolean; cases: boolean };
export type ResultTab  = "texts" | "precedents" | "cases";

export interface GlobalCase {
  id:       string;
  scope:    "محلية" | "دولية";  // local first
  name:     string;            // e.g. "Hulton v Jones [1910]"
  court:    string;            // e.g. "مجلس اللوردات البريطاني"
  year:     string;
  domain:   string;            // e.g. "تشهير" "تعويض معنوي"
  facts:    string;            // ملخص الوقائع
  ruling:   string;            // المبدأ/الحكم
  impact:   string;            // مفاد ذلك في نزاعنا الراهن
  source?:  string;
  binding:  boolean;           // false = استئناس فقط
}

export interface LegalText {
  id: string;
  source: "نظام" | "لائحة" | "مبدأ قضائي" | "قرار";
  ref: string;
  fullText: string;
  relevance: "عالية" | "متوسطة";
  tags: string[];
}

export interface Precedent {
  id: string;
  court: string;       // e.g. "المحكمة العمالية بالرياض"
  caseNo: string;      // e.g. "٢٠٢٣/١٤٤٤"
  year: string;        // هجري
  similarity: number;  // 0-100
  factsMatch: string;  // لماذا تشابه ٩٠%
  verdict: string;     // منطوق الحكم
  reasoning: string;   // أبرز أسباب التسبيب
  outcome: "مع" | "ضد"; // هل الحكم في نفس اتجاهك؟
  tags: string[];
}
