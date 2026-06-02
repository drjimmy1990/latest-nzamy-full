"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Handshake,
  Plus,
  Calendar,
  Clock,
  CheckCircle,
} from "@phosphor-icons/react";
import { BackendReadyNotice, LocalActionStatus, SectionTitle, Toggle } from "./_shared";

// ── Mock delegations ──────────────────────────────────────────────────
interface Delegation {
  id: string;
  delegateName: string;
  delegateAvatar: string;
  scope: string;
  startDate: string;
  endDate: string;
  status: "active" | "expired" | "scheduled";
}

const MOCK_DELEGATIONS: Delegation[] = [
  {
    id: "1",
    delegateName: "أ. نورة العتيبي",
    delegateAvatar: "ن",
    scope: "جميع الصلاحيات",
    startDate: "2026/05/10",
    endDate: "2026/05/20",
    status: "active",
  },
  {
    id: "2",
    delegateName: "أ. عبدالعزيز الحربي",
    delegateAvatar: "ع",
    scope: "الموافقات المالية فقط",
    startDate: "2026/04/01",
    endDate: "2026/04/15",
    status: "expired",
  },
];

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active:    { label: "نشط",       color: "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/20", icon: CheckCircle },
  expired:   { label: "منتهي",     color: "text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800",                icon: Clock },
  scheduled: { label: "مجدول",     color: "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20",             icon: Calendar },
};

// ── Component ─────────────────────────────────────────────────────────
export function DelegationTab() {
  const [delegations] = useState(MOCK_DELEGATIONS);
  const [showForm, setShowForm] = useState(false);
  const [notifyOnUse, setNotifyOnUse] = useState(true);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <BackendReadyNotice />

      {/* Explainer */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-[#C8A762]/20 bg-[#C8A762]/[0.04]">
        <Handshake size={22} weight="fill" className="text-[#C8A762] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            تفويض الصلاحيات
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed max-w-[65ch]">
            فوّض صلاحياتك لزميل مؤقتا (إجازة، سفر عمل). المُفوَّض يرى بانر واضح بأنه يعمل نيابة عنك، وكل إجراء يُسجّل باسمك وباسمه في السجل.
          </p>
        </div>
      </div>

      {/* Active / past delegations */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>التفويضات</SectionTitle>
          <motion.button
            whileTap={{ scale: 0.97, y: 1 }}
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-royal text-white rounded-xl text-sm font-semibold hover:bg-royal/90 transition-colors shadow-[0_4px_14px_-4px_rgba(11,61,46,0.4)]"
          >
            <Plus size={14} weight="bold" />
            تفويض جديد
          </motion.button>
        </div>

        {/* New delegation form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
              className="overflow-hidden mb-4"
            >
              <div className="bg-white dark:bg-dark-card rounded-2xl border border-royal/20 dark:border-[#C8A762]/20 p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                      المُفوَّض إليه
                    </label>
                    <input
                      type="text"
                      placeholder="اسم الزميل أو البريد الإلكتروني"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-dark-bg text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-royal/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                      نطاق التفويض
                    </label>
                    <select className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-dark-bg text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-royal/30">
                      <option>جميع الصلاحيات</option>
                      <option>الموافقات المالية فقط</option>
                      <option>إدارة القضايا فقط</option>
                      <option>الاطلاع فقط (للقراءة)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                      تاريخ البداية
                    </label>
                    <input
                      type="date"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-dark-bg text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-royal/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                      تاريخ الانتهاء
                    </label>
                    <input
                      type="date"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-dark-bg text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-royal/30"
                    />
                  </div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setLocalMessage("تم إنشاء التفويض كحالة واجهة فقط؛ التفعيل الحقيقي يحتاج RBAC/Audit API.")}
                  className="px-6 py-2.5 bg-royal text-white rounded-xl text-sm font-semibold hover:bg-royal/90 transition-colors"
                >
                  تأكيد التفويض
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* List */}
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] divide-y divide-gray-100 dark:divide-white/[0.04]">
          {delegations.length === 0 ? (
            <div className="py-12 text-center">
              <Handshake size={32} className="mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">لا توجد تفويضات حالية</p>
            </div>
          ) : (
            delegations.map((d) => {
              const st = STATUS_MAP[d.status];
              const StatusIcon = st.icon;
              return (
                <div key={d.id} className="flex items-center gap-4 px-5 py-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    d.status === "active"
                      ? "bg-gradient-to-br from-[#0B3D2E] to-emerald-700 text-white"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                  }`}>
                    {d.delegateAvatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                        {d.delegateName}
                      </p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${st.color}`}>
                        <StatusIcon size={10} weight="fill" />
                        {st.label}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {d.scope} — من {d.startDate} إلى {d.endDate}
                    </p>
                  </div>
                  {d.status === "active" && (
                    <button
                      onClick={() => setLocalMessage(`إلغاء تفويض ${d.delegateName} محلي فقط؛ لا يوجد إبطال خادمي الآن.`)}
                      className="text-xs text-red-500 hover:text-red-600 font-medium border border-red-200 dark:border-red-800 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      إلغاء
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Notification preference */}
      <div>
        <SectionTitle>إعدادات التفويض</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] px-5">
          <div className="flex items-center justify-between py-3.5">
            <div>
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                إشعاري عند استخدام التفويض
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                تصلك رسالة كلما نفّذ المُفوَّض إجراءً باسمك
              </p>
            </div>
            <Toggle
              checked={notifyOnUse}
              onChange={() => {
                setNotifyOnUse(!notifyOnUse);
                setLocalMessage("تفضيل إشعارات التفويض تغيّر محلياً فقط.");
              }}
            />
          </div>
        </div>
      </div>

      <LocalActionStatus show={Boolean(localMessage)} message={localMessage ?? undefined} />
    </div>
  );
}
