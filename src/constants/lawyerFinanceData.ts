import { CheckCircle, CurrencyCircleDollar, Clock, Warning } from "@phosphor-icons/react";

export type FinanceTab = "overview" | "invoices" | "expenses" | "pl";
export type InvoiceStatus = "paid" | "pending" | "overdue" | "partial";
export type FeeType = "full" | "partial";
export type Period = "monthly" | "quarterly" | "annual";
export type ExpenseCategory = "office" | "marketing" | "tech" | "travel" | "court" | "other";

export interface Invoice {
  id: string; client: string; clientType: "individual" | "company";
  caseTitle: string; desc: string; totalFee: number; paidAmount: number;
  feeType: FeeType; status: InvoiceStatus; date: string;
  month: number; quarter: 1 | 2 | 3 | 4; daysOver?: number;
}

export interface Expense {
  id: string; desc: string; amount: number;
  category: ExpenseCategory; date: string; month: number; vatIncluded: boolean;
}

export const INVOICES: Invoice[] = [
  { id: "INV-001", client: "شركة الأفق",     clientType: "company",    caseTitle: "نزاع تجاري",         desc: "أتعاب مرحلة ابتدائي",            totalFee: 25000, paidAmount: 25000, feeType: "full",    status: "paid",    date: "١ يناير ٢٠٢٤",   month: 1, quarter: 1 },
  { id: "INV-002", client: "خالد القحطاني", clientType: "individual", caseTitle: "قضية عمالية ٤٥٦٧", desc: "أتعاب اتفاق دوري",                totalFee: 12000, paidAmount: 12000, feeType: "full",    status: "paid",    date: "١٥ فبراير ٢٠٢٤", month: 2, quarter: 1 },
  { id: "INV-003", client: "شركة الأفق",     clientType: "company",    caseTitle: "نزاع تجاري",         desc: "أتعاب مرحلة استئناف",             totalFee: 18000, paidAmount: 9000,  feeType: "partial", status: "partial", date: "١ مارس ٢٠٢٤",    month: 3, quarter: 1, daysOver: 5 },
  { id: "INV-004", client: "أحمد الزاهد",   clientType: "individual", caseTitle: "إيجار — الزاهد",    desc: "استشارة + مراجعة عقد",            totalFee: 3500,  paidAmount: 3500,  feeType: "full",    status: "paid",    date: "١٠ مارس ٢٠٢٤",   month: 3, quarter: 1 },
  { id: "INV-005", client: "ريم المطيري",    clientType: "individual", caseTitle: "—",                 desc: "أتعاب مستحقة — شهر فبراير",      totalFee: 7000,  paidAmount: 0,     feeType: "full",    status: "overdue", date: "١ فبراير ٢٠٢٤",  month: 2, quarter: 1, daysOver: 65 },
  { id: "INV-006", client: "سارة الدوسري",  clientType: "individual", caseTitle: "استئناف العقار",     desc: "أتعاب بدء التقاضي",               totalFee: 9500,  paidAmount: 9500,  feeType: "full",    status: "paid",    date: "٢ أبريل ٢٠٢٤",   month: 4, quarter: 2 },
  { id: "INV-007", client: "شركة الأفق",     clientType: "company",    caseTitle: "نزاع تجاري",         desc: "أتعاب جلسة الخبير",               totalFee: 12000, paidAmount: 0,     feeType: "full",    status: "pending", date: "٥ أبريل ٢٠٢٤",   month: 4, quarter: 2 },
  { id: "INV-008", client: "مجموعة الرياض", clientType: "company",    caseTitle: "عقود تجارية",        desc: "خدمات مستشار قانوني — ربع سنوي", totalFee: 40000, paidAmount: 40000, feeType: "full",    status: "paid",    date: "١ أبريل ٢٠٢٤",   month: 4, quarter: 2 },
];

export const EXPENSES: Expense[] = [
  { id: "EXP-001", desc: "إيجار المكتب — يناير",         amount: 5000, category: "office",    date: "١ يناير ٢٠٢٤",   month: 1, vatIncluded: true  },
  { id: "EXP-002", desc: "رسوم قضائية — نزاع تجاري",    amount: 1250, category: "court",     date: "٥ يناير ٢٠٢٤",   month: 1, vatIncluded: false },
  { id: "EXP-003", desc: "اشتراك نظامي PRO",              amount: 499,  category: "tech",      date: "١ فبراير ٢٠٢٤",  month: 2, vatIncluded: true  },
  { id: "EXP-004", desc: "طباعة ومستلزمات",               amount: 320,  category: "office",    date: "١٤ فبراير ٢٠٢٤", month: 2, vatIncluded: true  },
  { id: "EXP-005", desc: "مصاريف سفر — جدة",             amount: 1800, category: "travel",    date: "٢٠ مارس ٢٠٢٤",   month: 3, vatIncluded: false },
  { id: "EXP-006", desc: "تسويق إلكتروني",                amount: 2000, category: "marketing", date: "١ مارس ٢٠٢٤",    month: 3, vatIncluded: true  },
  { id: "EXP-007", desc: "أتعاب خبير فني — نزاع تجاري", amount: 3500, category: "court",     date: "٨ أبريل ٢٠٢٤",   month: 4, vatIncluded: false },
  { id: "EXP-008", desc: "إيجار المكتب — أبريل",         amount: 5000, category: "office",    date: "١ أبريل ٢٠٢٤",   month: 4, vatIncluded: true  },
  { id: "EXP-009", desc: "مكتبة قانونية — اشتراك سنوي", amount: 1200, category: "tech",      date: "١٥ أبريل ٢٠٢٤",  month: 4, vatIncluded: true  },
  { id: "EXP-010", desc: "مصاريف أخرى متنوعة",           amount: 650,  category: "other",     date: "٢٢ أبريل ٢٠٢٤",  month: 4, vatIncluded: false },
];

export const STATUS_CFG: Record<InvoiceStatus, { label: string; color: string; icon: any }> = {
  paid:    { label: "مسدّدة كاملاً",  color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle },
  partial: { label: "مسدّدة جزئياً", color: "text-blue-500 bg-blue-500/10 border-blue-500/20",          icon: CurrencyCircleDollar },
  pending: { label: "معلقة",          color: "text-amber-500 bg-amber-500/10 border-amber-500/20",       icon: Clock },
  overdue: { label: "متأخرة",         color: "text-red-500 bg-red-500/10 border-red-500/20",             icon: Warning },
};

export const EXP_CFG: Record<ExpenseCategory, { label: string; color: string; bg: string }> = {
  office:    { label: "إيجار ومكتب",  color: "text-blue-500",   bg: "bg-blue-500/10"   },
  marketing: { label: "تسويق",        color: "text-violet-500", bg: "bg-violet-500/10" },
  tech:      { label: "تقنية",         color: "text-cyan-500",   bg: "bg-cyan-500/10"   },
  travel:    { label: "سفر وتنقل",    color: "text-orange-500", bg: "bg-orange-500/10" },
  court:     { label: "رسوم قضائية", color: "text-red-500",    bg: "bg-red-500/10"    },
  other:     { label: "أخرى",         color: "text-slate-500",  bg: "bg-slate-500/10"  },
};
