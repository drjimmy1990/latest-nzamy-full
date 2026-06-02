export type ClientFlag =
  | "vip"          // عميل مميز / VIP
  | "late_pay"     // متأخر في السداد
  | "bad"          // عميل مشكل / ابن وسخة 😅
  | "new"          // عميل جديد
  | "loyal"        // عميل أمين / متكرر
  | "urgent"       // قضية حرجة الآن
  | "corporate"    // شركة / مؤسسة
  | "inactive";    // غير نشط / انتهت قضيته

export interface Client {
  id:          string;
  name:        string;
  type:        "individual" | "company";
  phone:       string;
  activeCases: number;
  closedCases: number;
  totalFees:   number;
  paidFees:    number;
  since:       string;
  lastContact: string;
  flags:       ClientFlag[];
  rating:      1 | 2 | 3 | 4 | 5;
  notes?:      string;
}

export const MOCK_CLIENTS: Client[] = [
  {
    id: "1", name: "شركة الأفق للتجارة", type: "company",
    phone: "+٩٦٦ ١١ ٥١٢ ٠٠١٢",
    activeCases: 2, closedCases: 1,
    totalFees: 85000, paidFees: 60000,
    since: "يناير ٢٠٢٤", lastContact: "منذ يومين",
    flags: ["vip", "corporate", "urgent"],
    rating: 5,
    notes: "العميل الأكبر — يتطلب اهتماماً دورياً أسبوعياً",
  },
  {
    id: "2", name: "أحمد الزاهد", type: "individual",
    phone: "+٩٦٦ ٥٠ ١٢٣ ٤٥٦٧",
    activeCases: 1, closedCases: 0,
    totalFees: 12000, paidFees: 12000,
    since: "مارس ٢٠٢٤", lastContact: "منذ أسبوع",
    flags: ["loyal", "new"],
    rating: 4,
  },
  {
    id: "3", name: "خالد محمد القحطاني", type: "individual",
    phone: "+٩٦٦ ٥٥ ٦٧٨ ٩٠١٢",
    activeCases: 1, closedCases: 2,
    totalFees: 28000, paidFees: 14000,
    since: "فبراير ٢٠٢٤", lastContact: "اليوم",
    flags: ["late_pay", "urgent"],
    rating: 3,
    notes: "متأخر ١٤،٠٠٠ ريال — أُرسلت له تذكيران بدون رد",
  },
  {
    id: "4", name: "سارة الدوسري", type: "individual",
    phone: "+٩٦٦ ٥٠ ٢٣٤ ٥٦٧٨",
    activeCases: 1, closedCases: 0,
    totalFees: 9500, paidFees: 9500,
    since: "أبريل ٢٠٢٤", lastContact: "منذ ٣ أيام",
    flags: ["new"],
    rating: 4,
  },
  {
    id: "5", name: "ريم المطيري", type: "individual",
    phone: "+٩٦٦ ٥٥ ٣٤٥ ٦٧٨٩",
    activeCases: 1, closedCases: 0,
    totalFees: 14000, paidFees: 0,
    since: "نوفمبر ٢٠٢٣", lastContact: "منذ شهر",
    flags: ["bad", "late_pay", "inactive"],
    rating: 1,
    notes: "لا يرد على الهاتف — متأخر بكامل الأتعاب — تحذير: لا يُقبَل بلا دفعة مقدمة",
  },
  {
    id: "6", name: "علي السبيعي", type: "individual",
    phone: "+٩٦٦ ٥٠ ٤٥٦ ٧٨٩٠",
    activeCases: 0, closedCases: 1,
    totalFees: 6000, paidFees: 6000,
    since: "يوليو ٢٠٢٣", lastContact: "منذ شهرين",
    flags: ["inactive", "loyal"],
    rating: 4,
  },
  {
    id: "7", name: "مجموعة الرياض العقارية", type: "company",
    phone: "+٩٦٦ ١١ ٥٦٧ ٨٩٠١",
    activeCases: 0, closedCases: 3,
    totalFees: 120000, paidFees: 120000,
    since: "مارس ٢٠٢٣", lastContact: "منذ شهر",
    flags: ["vip", "corporate", "loyal", "inactive"],
    rating: 5,
    notes: "صفقات كبيرة — والتواصل يكون مع إدارة الشركة مباشرة",
  },
];

export const FLAG_CONFIG: Record<ClientFlag, { label: string; color: string; bg: string; emoji: string; desc: string }> = {
  vip:       { label: "VIP", color: "text-amber-600",  bg: "bg-amber-500/10",  emoji: "👑", desc: "عميل مميز — يحظى باولولية عالية" },
  late_pay:  { label: "متأخر بالسداد", color: "text-red-500",    bg: "bg-red-500/10",    emoji: "💸", desc: "لديه رسوم غير مسددة" },
  bad:       { label: "تعامل صعب", color: "text-orange-600", bg: "bg-orange-500/10", emoji: "⚠️", desc: "يتطلب حذراً في التعامل" },
  new:       { label: "جديد", color: "text-blue-500",   bg: "bg-blue-500/10",   emoji: "🆕", desc: "عميل جديد انضم مؤخراً" },
  loyal:     { label: "دائم", color: "text-emerald-500",bg: "bg-emerald-500/10",emoji: "🤝", desc: "عميل متكرر وموثوق" },
  urgent:    { label: "قضية حرجة", color: "text-red-600",    bg: "bg-red-600/10",    emoji: "🔴", desc: "لديه موعد أو طعن حرج قريب" },
  corporate: { label: "شركة", color: "text-indigo-500", bg: "bg-indigo-500/10", emoji: "🏢", desc: "كيان قانوني / شركة" },
  inactive:  { label: "غير نشط",  color: "text-slate-400",  bg: "bg-slate-100",     emoji: "💤", desc: "لا قضايا نشطة حالياً" },
};

export type SortKey = "name" | "activeCases" | "unpaid" | "lastContact" | "rating";
