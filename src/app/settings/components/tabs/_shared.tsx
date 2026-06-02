"use client";

import { CheckCircle, WarningCircle } from "@phosphor-icons/react";

export function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
        checked ? "bg-royal" : "bg-gray-300 dark:bg-gray-600"
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
      {children}
    </h3>
  );
}

export function BackendReadyNotice({
  children = "محلي وجاهز للباك إند: لا يوجد حفظ خادمي أو إرسال بريد أو RBAC إنتاجي في هذه المرحلة.",
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
      <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-300" />
      <p className="text-xs leading-6">{children}</p>
    </div>
  );
}

export function LocalActionStatus({
  show,
  message = "تم تنفيذ الإجراء محلياً فقط، والربط الحقيقي ينتظر الباك إند.",
}: {
  show: boolean;
  message?: string;
}) {
  if (!show) return null;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
      <CheckCircle size={15} weight="fill" />
      {message}
    </div>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</p>
        {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}
