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

// This notice renders in EVERY build, deliberately.
// It used to `return null` when NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND === "supabase",
// and src/instrumentation.ts refuses to boot production unless that flag is
// exactly "supabase" — so the disclosure was guaranteed to be absent in
// production while the local-only data and controls it disclaims stayed on
// screen. Stripping the label off a mock is what turns the mock into a lie.
// The guard also sat before the {children} return, so a tab's own wording died
// with it. If a tab's data becomes real, delete that tab's <BackendReadyNotice />
// call site — never re-add an environment guard here.
export function BackendReadyNotice({
  // Rewritten for the audience that now reads it. The previous default —
  // «محلي وجاهز للباك إند» — was written for a developer and became
  // user-visible the moment the production guard came off. A client reading
  // that learns nothing; they need to know their change will not survive, and
  // what to do instead.
  children = "هذه الإعدادات لم تُربط بالخادم بعد — ما تغيّره هنا لا يُحفظ بعد إغلاق الصفحة. لأي تعديل تحتاجه فعلياً تواصل مع فريق نظامي.",
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

// The honest alternative to a plausible-looking placeholder row. A section with
// no real data source renders this and states what is absent, so nobody has to
// guess whether an empty screen means "nothing yet" or "failed to load".
export function EmptyPanel({
  icon,
  title,
  description,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white/80 dark:bg-[#161b22]/80 backdrop-blur-xl rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] px-6 py-10 text-center shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)]">
      {icon && <div className="mb-3 flex justify-center text-zinc-400 dark:text-zinc-500">{icon}</div>}
      <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</p>
      <p className="mt-1.5 text-xs leading-6 text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">{description}</p>
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
        <p className="text-sm font-medium text-gray-800 dark:text-gray-300">{label}</p>
        {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}
