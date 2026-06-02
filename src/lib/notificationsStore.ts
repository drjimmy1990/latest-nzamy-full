/**
 * notificationsStore.ts
 * ─────────────────────────────────────────────
 * Mock in-memory notifications store (LocalStorage backed).
 * Each notification has a type, severity, read state, and deep link.
 * Used by NotificationsDropdown and /notifications page.
 */

export type NotifType =
  | "case_update"
  | "consultation_reply"
  | "payment"
  | "deadline"
  | "document"
  | "system"
  | "collaboration"
  | "marketplace";

export type NotifSeverity = "info" | "warning" | "success" | "error";

export interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  href: string;
  time: string; // ISO or relative string
  read: boolean;
  severity: NotifSeverity;
  avatar?: string; // initials for sender
}

const STORAGE_KEY = "nzamy_notifications";

// ─── Mock seed data ───────────────────────────────────────────────────────────

const SEED: Notification[] = [
  {
    id: "n1",
    type: "case_update",
    title: "تحديث على قضية العمالة",
    body: "أضاف المحامي أحمد مستنداً جديداً في ملف قضية الفصل التعسفي",
    href: "/dashboard/lawyer/cases",
    time: "منذ 5 دقائق",
    read: false,
    severity: "info",
    avatar: "أ",
  },
  {
    id: "n2",
    type: "deadline",
    title: "موعد جلسة غداً",
    body: "جلسة محكمة العمل — الساعة 10:00 صباحاً — الدائرة الثالثة",
    href: "/dashboard/lawyer/hearings",
    time: "منذ 23 دقيقة",
    read: false,
    severity: "warning",
    avatar: "م",
  },
  {
    id: "n3",
    type: "payment",
    title: "تم استلام الدفعة",
    body: "تم إيداع ١٢٬٠٠٠ ﷼ في محفظتك من طلب الاستشارة #C-2048",
    href: "/dashboard/lawyer/finance",
    time: "منذ ساعة",
    read: false,
    severity: "success",
    avatar: "ن",
  },
  {
    id: "n4",
    type: "consultation_reply",
    title: "رد جديد على استشارتك",
    body: "المستشار القانوني رد على استشارتك بخصوص عقد الإيجار التجاري",
    href: "/dashboard/client/consultation",
    time: "منذ 3 ساعات",
    read: true,
    severity: "info",
    avatar: "ق",
  },
  {
    id: "n5",
    type: "collaboration",
    title: "طلب تعاون جديد",
    body: "المحامية سارة المطيري تدعوك للمشاركة في قضية تجارية",
    href: "/dashboard/lawyer/network",
    time: "منذ يوم",
    read: true,
    severity: "info",
    avatar: "س",
  },
  {
    id: "n6",
    type: "document",
    title: "مستند بحاجة لتوقيعك",
    body: "اتفاقية مشاركة أتعاب بانتظار توقيعك الإلكتروني",
    href: "/dashboard/lawyer/documents",
    time: "منذ يومين",
    read: true,
    severity: "warning",
    avatar: "م",
  },
  {
    id: "n7",
    type: "marketplace",
    title: "طلب خدمة جديد",
    body: "شركة التقنية العربية طلبت خدمة مراجعة عقد من سوق الخدمات",
    href: "/dashboard/lawyer/marketplace",
    time: "منذ 3 أيام",
    read: true,
    severity: "info",
    avatar: "ش",
  },
  {
    id: "n8",
    type: "system",
    title: "تحديث المنصة",
    body: "تم إطلاق المستشار الذكي الجديد — جرّب نظامي AI الآن",
    href: "/ai/consult",
    time: "منذ أسبوع",
    read: true,
    severity: "info",
  },
];

// ─── Store functions ──────────────────────────────────────────────────────────

function load(): Notification[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED;
    return JSON.parse(raw) as Notification[];
  } catch {
    return SEED;
  }
}

function save(items: Notification[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

export function getNotifications(): Notification[] {
  return load();
}

export function getUnreadCount(): number {
  return load().filter(n => !n.read).length;
}

export function markAsRead(id: string): void {
  const items = load().map(n => n.id === id ? { ...n, read: true } : n);
  save(items);
}

export function markAllAsRead(): void {
  const items = load().map(n => ({ ...n, read: true }));
  save(items);
}

export function deleteNotification(id: string): void {
  const items = load().filter(n => n.id !== id);
  save(items);
}

export const TYPE_ICONS: Record<NotifType, string> = {
  case_update:      "Gavel",
  consultation_reply: "ChatCircle",
  payment:          "Wallet",
  deadline:         "ClockCountdown",
  document:         "FileText",
  system:           "Sparkle",
  collaboration:    "UsersThree",
  marketplace:      "Storefront",
};

export const SEVERITY_COLOR: Record<NotifSeverity, { dot: string; bg: string }> = {
  info:    { dot: "bg-sky-400",     bg: "bg-sky-400/10" },
  warning: { dot: "bg-amber-400",   bg: "bg-amber-400/10" },
  success: { dot: "bg-emerald-400", bg: "bg-emerald-400/10" },
  error:   { dot: "bg-red-400",     bg: "bg-red-400/10" },
};
