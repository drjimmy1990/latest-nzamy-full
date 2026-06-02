import {
  FileText,
  UserCircle,
  Buildings,
  HouseLine,
  Handshake,
  Briefcase,
} from "@phosphor-icons/react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Step = 1 | 2 | 3 | 4 | 5;
export type Mode = "draft" | "review" | null;

export interface ContractField {
  id: string;
  labelAr: string;
  labelEn: string;
  type: "text" | "textarea" | "select" | "date" | "number";
  placeholder?: string;
  options?: { ar: string; en: string }[];
  required?: boolean;
}

export interface ContractType {
  id: string;
  icon: React.ElementType;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
  fields: ContractField[];
}

export interface ReviewResult {
  score: number;
  risks: string[];
  suggestions: string[];
  verdict: string;
}

// ─── Contract Types Config ────────────────────────────────────────────────────

export const contractTypes: ContractType[] = [
  {
    id: "rent",
    icon: HouseLine,
    labelAr: "عقد إيجار",
    labelEn: "Rental Agreement",
    descAr: "لتأجير شقة أو محل تجاري أو مكتب",
    descEn: "For renting an apartment, shop, or office",
    fields: [
      { id: "landlord", labelAr: "اسم المؤجر", labelEn: "Landlord Name", type: "text", required: true },
      { id: "tenant", labelAr: "اسم المستأجر", labelEn: "Tenant Name", type: "text", required: true },
      { id: "property_desc", labelAr: "وصف العقار", labelEn: "Property Description", type: "text", placeholder: "مثال: شقة في حي السليمانية بالرياض", required: true },
      { id: "rent_amount", labelAr: "قيمة الإيجار (ريال/سنة)", labelEn: "Annual Rent (SAR)", type: "number", required: true },
      { id: "start_date", labelAr: "تاريخ البدء", labelEn: "Start Date", type: "date", required: true },
      { id: "duration", labelAr: "مدة العقد", labelEn: "Duration", type: "select", options: [{ ar: "سنة واحدة", en: "1 Year" }, { ar: "سنتان", en: "2 Years" }, { ar: "ثلاث سنوات", en: "3 Years" }], required: true },
      { id: "notes", labelAr: "ملاحظات إضافية", labelEn: "Additional Notes", type: "textarea" },
    ],
  },
  {
    id: "service",
    icon: Briefcase,
    labelAr: "عقد خدمات",
    labelEn: "Service Agreement",
    descAr: "لتوثيق اتفاقية بين مقدّم خدمة وعميل",
    descEn: "Document an agreement between a service provider and client",
    fields: [
      { id: "provider", labelAr: "اسم مقدّم الخدمة", labelEn: "Service Provider", type: "text", required: true },
      { id: "client", labelAr: "اسم العميل", labelEn: "Client Name", type: "text", required: true },
      { id: "service_desc", labelAr: "وصف الخدمة المطلوبة", labelEn: "Service Description", type: "textarea", required: true },
      { id: "price", labelAr: "قيمة الخدمة (ريال)", labelEn: "Service Value (SAR)", type: "number", required: true },
      { id: "start_date", labelAr: "تاريخ البدء", labelEn: "Start Date", type: "date", required: true },
      { id: "delivery", labelAr: "مدة تسليم العمل", labelEn: "Delivery Timeline", type: "select", options: [{ ar: "أسبوع", en: "1 Week" }, { ar: "أسبوعان", en: "2 Weeks" }, { ar: "شهر", en: "1 Month" }, { ar: "أكثر من شهر", en: "More than 1 month" }], required: true },
    ],
  },
  {
    id: "employment",
    icon: UserCircle,
    labelAr: "عقد عمل",
    labelEn: "Employment Contract",
    descAr: "لتوظيف موظف في شركة أو مؤسسة صغيرة",
    descEn: "Hire an employee for a company or small business",
    fields: [
      { id: "employer", labelAr: "اسم صاحب العمل / الشركة", labelEn: "Employer / Company", type: "text", required: true },
      { id: "employee", labelAr: "اسم الموظف", labelEn: "Employee Name", type: "text", required: true },
      { id: "position", labelAr: "المسمى الوظيفي", labelEn: "Job Title", type: "text", required: true },
      { id: "salary", labelAr: "الراتب الشهري (ريال)", labelEn: "Monthly Salary (SAR)", type: "number", required: true },
      { id: "start_date", labelAr: "تاريخ بدء العمل", labelEn: "Start Date", type: "date", required: true },
      { id: "probation", labelAr: "فترة التجربة", labelEn: "Probation Period", type: "select", options: [{ ar: "لا يوجد", en: "None" }, { ar: "٣ أشهر", en: "3 Months" }, { ar: "٦ أشهر", en: "6 Months" }] },
    ],
  },
  {
    id: "partnership",
    icon: Handshake,
    labelAr: "اتفاقية شراكة",
    labelEn: "Partnership Agreement",
    descAr: "لتنظيم العلاقة بين شريكين في مشروع",
    descEn: "Organize the relationship between two partners in a project",
    fields: [
      { id: "partner1", labelAr: "اسم الشريك الأول", labelEn: "Partner 1 Name", type: "text", required: true },
      { id: "partner2", labelAr: "اسم الشريك الثاني", labelEn: "Partner 2 Name", type: "text", required: true },
      { id: "project", labelAr: "اسم المشروع / النشاط", labelEn: "Project / Business Name", type: "text", required: true },
      { id: "share1", labelAr: "نسبة الشريك الأول (%)", labelEn: "Partner 1 Share (%)", type: "number", required: true },
      { id: "share2", labelAr: "نسبة الشريك الثاني (%)", labelEn: "Partner 2 Share (%)", type: "number", required: true },
      { id: "duration", labelAr: "مدة الشراكة", labelEn: "Partnership Duration", type: "select", options: [{ ar: "سنة واحدة قابلة للتجديد", en: "1 Year (Renewable)" }, { ar: "٣ سنوات", en: "3 Years" }, { ar: "غير محددة", en: "Indefinite" }] },
      { id: "notes", labelAr: "التزامات وبنود إضافية", labelEn: "Additional Terms", type: "textarea" },
    ],
  },
  {
    id: "sale",
    icon: Buildings,
    labelAr: "عقد بيع",
    labelEn: "Sale Agreement",
    descAr: "لنقل ملكية منقول أو عقار أو بضاعة",
    descEn: "Transfer ownership of goods, property, or assets",
    fields: [
      { id: "seller", labelAr: "اسم البائع", labelEn: "Seller Name", type: "text", required: true },
      { id: "buyer", labelAr: "اسم المشتري", labelEn: "Buyer Name", type: "text", required: true },
      { id: "item", labelAr: "وصف المبيع", labelEn: "Item Description", type: "textarea", required: true },
      { id: "price", labelAr: "قيمة البيع (ريال)", labelEn: "Sale Price (SAR)", type: "number", required: true },
      { id: "payment", labelAr: "طريقة السداد", labelEn: "Payment Method", type: "select", options: [{ ar: "نقداً عند الاستلام", en: "Cash on Delivery" }, { ar: "تحويل بنكي", en: "Bank Transfer" }, { ar: "بالتقسيط", en: "Installments" }], required: true },
      { id: "date", labelAr: "تاريخ البيع", labelEn: "Sale Date", type: "date", required: true },
    ],
  },
  {
    id: "other",
    icon: FileText,
    labelAr: "عقد مخصص",
    labelEn: "Custom Contract",
    descAr: "حدد الأطراف والموضوع وسنقوم بالصياغة المبدئية",
    descEn: "Define parties and subject, we'll draft the rest",
    fields: [
      { id: "party1", labelAr: "الطرف الأول", labelEn: "First Party", type: "text", required: true },
      { id: "party2", labelAr: "الطرف الثاني", labelEn: "Second Party", type: "text", required: true },
      { id: "subject", labelAr: "موضوع العقد", labelEn: "Contract Subject", type: "textarea", placeholder: "مثال: اتفاقية توريد بضائع...", required: true },
      { id: "duration", labelAr: "مدة العقد (إن وجد)", labelEn: "Duration (if any)", type: "text" },
      { id: "amount", labelAr: "المقابل المالي (إن وجد)", labelEn: "Financial Value (if any)", type: "number" },
      { id: "notes", labelAr: "بنود وشروط إضافية", labelEn: "Additional Terms", type: "textarea" },
    ],
  },
];
