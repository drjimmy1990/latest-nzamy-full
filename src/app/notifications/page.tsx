"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Scales,
  CreditCard,
  Calendar,
  CheckCircle,
  Trash,
  Eye,
  X,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";

type NotificationType = "system" | "cases" | "payments" | "appointments" | "completed";
type FilterType = "all" | "unread" | "cases" | "payments" | "system";

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  timestamp: string;
  dateGroup: "today" | "yesterday" | "week" | "older";
  isRead: boolean;
}

const initialNotifications: Notification[] = [
  {
    id: "n1",
    type: "appointments",
    title: "جلستك القادمة غداً الساعة ١١ص",
    description: "القضية ٢٠٢٥-٠٠١ — محكمة العمل بالرياض",
    timestamp: "منذ ٥ دقائق",
    dateGroup: "today",
    isRead: false,
  },
  {
    id: "n2",
    type: "cases",
    title: "تم تحديث حالة قضيتك",
    description: "المحامي أحمد الغامدي رفع مستنداً جديداً للمراجعة",
    timestamp: "منذ ٢ ساعة",
    dateGroup: "today",
    isRead: false,
  },
  {
    id: "n3",
    type: "payments",
    title: "تذكير بالدفع",
    description: "مبلغ Escrow ٢,٥٠٠ ر.س مستحق خلال ٤٨ ساعة",
    timestamp: "منذ ٣ ساعات",
    dateGroup: "today",
    isRead: false,
  },
  {
    id: "n4",
    type: "cases",
    title: "رد المحامي على طلبك",
    description: "المحامي سارة الزهراني قبلت قضية الميراث",
    timestamp: "منذ ٥ ساعات",
    dateGroup: "today",
    isRead: true,
  },
  {
    id: "n5",
    type: "completed",
    title: "اكتملت الاستشارة القانونية",
    description: "تقرير ملخص الاستشارة جاهز للتحميل",
    timestamp: "منذ ٨ ساعات",
    dateGroup: "today",
    isRead: true,
  },
  {
    id: "n6",
    type: "system",
    title: "تحديث المنصة الجديد",
    description: "نظامي V2.4 — ميزات جديدة في إدارة الملفات",
    timestamp: "أمس ١٠:٣٠م",
    dateGroup: "yesterday",
    isRead: true,
  },
  {
    id: "n7",
    type: "payments",
    title: "تم استلام دفعتك",
    description: "تأكيد دفع ١,٢٠٠ ر.س — رقم المرجع #TXN-8821",
    timestamp: "أمس ٤:٠٠م",
    dateGroup: "yesterday",
    isRead: true,
  },
  {
    id: "n8",
    type: "appointments",
    title: "تأكيد موعد الجلسة",
    description: "تمت الموافقة على موعد الجلسة القادمة مع المحكمة",
    timestamp: "أمس ١١:١٥ص",
    dateGroup: "yesterday",
    isRead: true,
  },
  {
    id: "n9",
    type: "cases",
    title: "تعليق جديد على قضيتك",
    description: "المحامي طلب توضيحاً إضافياً حول وثيقة العقد",
    timestamp: "منذ ٣ أيام",
    dateGroup: "week",
    isRead: true,
  },
  {
    id: "n10",
    type: "system",
    title: "تحقق من هويتك",
    description: "يرجى رفع صورة الهوية الوطنية لإكمال التحقق",
    timestamp: "منذ ٤ أيام",
    dateGroup: "week",
    isRead: true,
  },
  {
    id: "n11",
    type: "payments",
    title: "فاتورة Escrow محدثة",
    description: "تم تعديل مبلغ الضمان وفق اتفاق الأطراف",
    timestamp: "منذ ٥ أيام",
    dateGroup: "week",
    isRead: true,
  },
  {
    id: "n12",
    type: "cases",
    title: "انتهت مدة مراجعة القضية",
    description: "يجب الرد على عرض التسوية قبل انتهاء المهلة",
    timestamp: "منذ ٦ أيام",
    dateGroup: "week",
    isRead: true,
  },
  {
    id: "n13",
    type: "completed",
    title: "تم إغلاق القضية بنجاح",
    description: "القضية ٢٠٢٤-٠٨٩ أُغلقت وصدر الحكم لصالحك",
    timestamp: "منذ أسبوعين",
    dateGroup: "older",
    isRead: true,
  },
  {
    id: "n14",
    type: "system",
    title: "مرحباً بك في نظامي",
    description: "حسابك مفعّل — ابدأ بتقديم استشارتك القانونية الأولى",
    timestamp: "منذ شهر",
    dateGroup: "older",
    isRead: true,
  },
  {
    id: "n15",
    type: "appointments",
    title: "تذكير: جلسة تحكيم مقبلة",
    description: "جلسة التحكيم القضية ٢٠٢٤-٠٧٢ بعد أسبوع",
    timestamp: "منذ شهر",
    dateGroup: "older",
    isRead: true,
  },
];

const typeIcon: Record<NotificationType, React.ReactNode> = {
  system: <Bell size={20} weight="fill" />,
  cases: <Scales size={20} weight="fill" />,
  payments: <CreditCard size={20} weight="fill" />,
  appointments: <Calendar size={20} weight="fill" />,
  completed: <CheckCircle size={20} weight="fill" />,
};

const typeColor: Record<NotificationType, string> = {
  system: "text-blue-400 bg-blue-400/10",
  cases: "text-royal bg-royal/10 dark:text-emerald-400 dark:bg-emerald-400/10",
  payments: "text-gold bg-gold/10",
  appointments: "text-purple-400 bg-purple-400/10",
  completed: "text-green-400 bg-green-400/10",
};

const dotColor: Record<NotificationType, string> = {
  system: "bg-blue-400",
  cases: "bg-emerald-400",
  payments: "bg-gold",
  appointments: "bg-purple-400",
  completed: "bg-green-400",
};

const dateGroupLabel: Record<string, string> = {
  today: "اليوم",
  yesterday: "أمس",
  week: "هذا الأسبوع",
  older: "أقدم",
};

const filterTabs: { id: FilterType; label: string; count: number }[] = [
  { id: "all", label: "الكل", count: 15 },
  { id: "unread", label: "غير مقروء", count: 3 },
  { id: "cases", label: "القضايا", count: 5 },
  { id: "payments", label: "المدفوعات", count: 3 },
  { id: "system", label: "النظام", count: 4 },
];

export default function NotificationsPage() {
  const { isRTL, isDark } = useTheme();
  const [filter, setFilter] = useState<FilterType>("all");
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const filtered = notifications.filter((n) => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.isRead;
    if (filter === "cases") return n.type === "cases" || n.type === "completed" || n.type === "appointments";
    if (filter === "payments") return n.type === "payments";
    if (filter === "system") return n.type === "system";
    return true;
  });

  const groupedNotifications = (["today", "yesterday", "week", "older"] as const).map((group) => ({
    group,
    items: filtered.filter((n) => n.dateGroup === group),
  })).filter((g) => g.items.length > 0);

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className="min-h-screen bg-gray-50 dark:bg-dark-bg transition-colors duration-300"
    >
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 py-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              الإشعارات
            </h1>
            {unreadCount > 0 && (
              <motion.span
                key={unreadCount}
                initial={{ scale: 0.7 }}
                animate={{ scale: 1 }}
                className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-royal rounded-full"
              >
                {unreadCount}
              </motion.span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-sm text-royal dark:text-gold font-medium hover:underline transition-colors"
            >
              تعليم الكل كمقروء
            </button>
          )}
        </motion.div>

        {/* Filter Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide"
        >
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                filter === tab.id
                  ? "bg-royal text-white shadow-md"
                  : "bg-white dark:bg-dark-card text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-royal dark:hover:border-gold"
              }`}
            >
              {tab.label}
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  filter === tab.id
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                }`}
              >
                {tab.id === "unread" ? unreadCount : tab.count}
              </span>
            </button>
          ))}
        </motion.div>

        {/* Notifications List */}
        <AnimatePresence mode="wait">
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="w-20 h-20 mb-5 rounded-full bg-gray-100 dark:bg-dark-card flex items-center justify-center">
                <Bell size={36} className="text-gray-300 dark:text-gray-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                لا توجد إشعارات
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-500 max-w-xs">
                لم يتم العثور على إشعارات تطابق هذا الفلتر
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {groupedNotifications.map(({ group, items }) => (
                <div key={group}>
                  <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 px-1">
                    {dateGroupLabel[group]}
                  </h2>
                  <div className="space-y-2">
                    {items.map((notification, idx) => (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, x: isRTL ? 20 : -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: isRTL ? -20 : 20 }}
                        transition={{ duration: 0.25, delay: idx * 0.04 }}
                        onMouseEnter={() => setHoveredId(notification.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => markAsRead(notification.id)}
                        className={`relative flex items-start gap-4 p-4 rounded-xl cursor-pointer transition-all duration-200 border ${
                          !notification.isRead
                            ? "bg-royal/5 dark:bg-royal/10 border-royal/20 dark:border-royal/30"
                            : "bg-white dark:bg-dark-card border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700"
                        } hover:shadow-md`}
                      >
                        {/* Unread dot */}
                        {!notification.isRead && (
                          <span
                            className={`absolute top-4 ${isRTL ? "left-4" : "right-4"} w-2 h-2 rounded-full ${dotColor[notification.type]}`}
                          />
                        )}

                        {/* Icon */}
                        <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${typeColor[notification.type]}`}>
                          {typeIcon[notification.type]}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm font-semibold truncate ${!notification.isRead ? "text-gray-900 dark:text-white" : "text-gray-700 dark:text-gray-200"}`}>
                              {notification.title}
                            </p>
                            <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                              {notification.timestamp}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                            {notification.description}
                          </p>
                        </div>

                        {/* Hover actions */}
                        <AnimatePresence>
                          {hoveredId === notification.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              transition={{ duration: 0.15 }}
                              className={`absolute top-3 ${isRTL ? "left-12" : "right-12"} flex items-center gap-1`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {!notification.isRead && (
                                <button
                                  onClick={() => markAsRead(notification.id)}
                                  title="تعليم كمقروء"
                                  className="w-7 h-7 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-300 hover:text-royal dark:hover:text-gold hover:border-royal dark:hover:border-gold transition-colors shadow-sm"
                                >
                                  <Eye size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => deleteNotification(notification.id)}
                                title="حذف"
                                className="w-7 h-7 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-300 hover:text-red-500 hover:border-red-300 dark:hover:border-red-500 transition-colors shadow-sm"
                              >
                                <Trash size={14} />
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
