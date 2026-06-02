"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock,
  Desktop,
  DeviceMobile,
  Laptop,
  ShieldCheck,
  ShieldWarning,
  Trash,
  WarningCircle,
  CheckCircle,
  Eye,
  EyeSlash,
  MapPin,
  Clock,
} from "@phosphor-icons/react";
import { SectionTitle, Toggle, ToggleRow } from "./_shared";

// ── Mock sessions data ────────────────────────────────────────────────
const SESSIONS = [
  {
    id: "s1",
    device: "MacBook Pro 16\"",
    icon: Laptop,
    browser: "Chrome 124",
    location: "الرياض، المملكة العربية السعودية",
    ip: "185.220.X.X",
    time: "الآن",
    isCurrent: true,
  },
  {
    id: "s2",
    device: "iPhone 15 Pro",
    icon: DeviceMobile,
    browser: "Safari 17",
    location: "جدة، المملكة العربية السعودية",
    ip: "213.41.X.X",
    time: "منذ 3 ساعات",
    isCurrent: false,
  },
  {
    id: "s3",
    device: "Windows 11",
    icon: Desktop,
    browser: "Edge 124",
    location: "الرياض، المملكة العربية السعودية",
    ip: "185.220.X.X",
    time: "منذ يومين",
    isCurrent: false,
  },
];

const LOGIN_LOG = [
  { date: "2026/05/15 — 18:43", device: "MacBook Pro", location: "الرياض", status: "success" },
  { date: "2026/05/14 — 09:17", device: "iPhone 15 Pro", location: "جدة", status: "success" },
  { date: "2026/05/13 — 22:05", device: "Windows 11", location: "الرياض", status: "success" },
  { date: "2026/05/11 — 03:14", device: "جهاز غير معروف", location: "دبي، الإمارات", status: "blocked" },
  { date: "2026/05/09 — 11:30", device: "MacBook Pro", location: "الرياض", status: "success" },
];

// ── Component ─────────────────────────────────────────────────────────
export function SecurityTab() {
  const [twoFA, setTwoFA] = useState(true);
  const [biometric, setBiometric] = useState(false);
  const [loginAlerts, setLoginAlerts] = useState(true);
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [sessions, setSessions] = useState(SESSIONS);

  const revokeSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-8">
      {/* Password */}
      <div>
        <SectionTitle>تغيير كلمة المرور</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] p-5 space-y-4">
          {[
            { label: "كلمة المرور الحالية", show: showOldPwd, toggle: () => setShowOldPwd(!showOldPwd) },
            { label: "كلمة المرور الجديدة", show: showNewPwd, toggle: () => setShowNewPwd(!showNewPwd) },
            { label: "تأكيد كلمة المرور الجديدة", show: showNewPwd, toggle: () => {} },
          ].map((f, i) => (
            <div key={i} className="relative">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                {f.label}
              </label>
              <div className="relative">
                <input
                  type={f.show ? "text" : "password"}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 pe-10 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-dark-bg text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-royal/30 focus:border-royal transition-colors"
                />
                {i < 2 && (
                  <button
                    type="button"
                    onClick={f.toggle}
                    className="absolute inset-y-0 end-3 flex items-center text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    {f.show ? <EyeSlash size={16} /> : <Eye size={16} />}
                  </button>
                )}
              </div>
            </div>
          ))}
          <motion.button
            whileTap={{ scale: 0.98, y: 1 }}
            className="px-6 py-2.5 bg-royal text-white rounded-xl text-sm font-semibold hover:bg-royal/90 transition-colors shadow-[0_4px_14px_-4px_rgba(11,61,46,0.3)]"
          >
            تحديث كلمة المرور
          </motion.button>
        </div>
      </div>

      {/* 2FA & Biometric */}
      <div>
        <SectionTitle>التحقق والحماية</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] px-5 divide-y divide-gray-100 dark:divide-white/[0.04]">
          <ToggleRow
            label="التحقق بخطوتين (OTP)"
            description={twoFA ? "مفعّل — رمز OTP عبر الجوال عند كل دخول" : "غير مفعّل — ننصح بتفعيله لحماية حسابك"}
            checked={twoFA}
            onChange={() => setTwoFA(!twoFA)}
          />
          <ToggleRow
            label="تسجيل الدخول بالبصمة / Face ID"
            description="متاح على الأجهزة المدعومة"
            checked={biometric}
            onChange={() => setBiometric(!biometric)}
          />
          <ToggleRow
            label="إشعار عند تسجيل دخول من جهاز جديد"
            description="يصلك إشعار فوري عند أي دخول غير معتاد"
            checked={loginAlerts}
            onChange={() => setLoginAlerts(!loginAlerts)}
          />
        </div>
      </div>

      {/* Active sessions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>الجلسات النشطة</SectionTitle>
          <button
            onClick={() => setSessions(sessions.filter((s) => s.isCurrent))}
            className="text-xs text-red-500 font-semibold hover:text-red-600 transition-colors"
          >
            إنهاء جميع الجلسات الأخرى
          </button>
        </div>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] divide-y divide-gray-100 dark:divide-white/[0.04]">
          <AnimatePresence>
            {sessions.map((session) => {
              const Icon = session.icon;
              return (
                <motion.div
                  key={session.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 25 }}
                  className="flex items-center gap-4 px-5 py-4"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    session.isCurrent
                      ? "bg-gradient-to-br from-[#0B3D2E] to-emerald-700 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-zinc-500"
                  }`}>
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                        {session.device}
                      </p>
                      {session.isCurrent && (
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full font-bold">
                          الجهاز الحالي
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {session.browser} &bull; {session.location} &bull; {session.ip}
                    </p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1 mt-0.5">
                      <Clock size={11} /> {session.time}
                    </p>
                  </div>
                  {!session.isCurrent && (
                    <button
                      onClick={() => revokeSession(session.id)}
                      className="text-xs text-red-500 font-semibold border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      إنهاء
                    </button>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Login history */}
      <div>
        <SectionTitle>سجل تسجيلات الدخول</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-white/[0.02]">
                <th className="text-start px-5 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">التاريخ والوقت</th>
                <th className="text-start px-5 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">الجهاز</th>
                <th className="text-start px-5 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  <MapPin size={12} className="inline me-1" />الموقع
                </th>
                <th className="text-end px-5 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
              {LOGIN_LOG.map((entry, i) => (
                <tr key={i} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3 text-xs text-zinc-500 dark:text-zinc-400 font-mono">{entry.date}</td>
                  <td className="px-5 py-3 text-sm text-zinc-700 dark:text-zinc-300">{entry.device}</td>
                  <td className="px-5 py-3 text-sm text-zinc-700 dark:text-zinc-300">{entry.location}</td>
                  <td className="px-5 py-3 text-end">
                    {entry.status === "success" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle size={10} weight="fill" /> ناجح
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/20 text-red-500">
                        <ShieldWarning size={10} weight="fill" /> محظور
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Danger zone */}
      <div>
        <SectionTitle>منطقة الخطر</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border-2 border-red-200 dark:border-red-900/40 p-5">
          <div className="flex items-start gap-3 mb-4">
            <WarningCircle size={22} weight="fill" className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">حذف الحساب نهائياً</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                لا يمكن التراجع. اكتب <span className="font-mono font-bold text-red-500">حذف</span> للتأكيد.
              </p>
            </div>
          </div>
          <input
            type="text"
            placeholder='اكتب "حذف" للتأكيد'
            value={deleteInput}
            onChange={(e) => setDeleteInput(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 text-zinc-800 dark:text-zinc-200 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-red-400/30"
          />
          <motion.button
            whileTap={{ scale: 0.98 }}
            disabled={deleteInput !== "حذف"}
            className="px-6 py-2.5 bg-red-500 disabled:bg-red-300 dark:disabled:bg-red-900/50 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:cursor-not-allowed transition-colors"
          >
            حذف الحساب
          </motion.button>
        </div>
      </div>
    </div>
  );
}
