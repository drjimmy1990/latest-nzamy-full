"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gavel, Briefcase, Check } from "@phosphor-icons/react";
import { apiMutate } from "@/lib/services/api";
import {
  PRACTICE_KIND_OPTIONS_AR,
  PRACTICE_KIND_QUESTION_AR,
  type PracticeKind,
} from "@/lib/auth/claimKinds";

/**
 * /onboarding/practice-kind — R9 (owner TODO 17 Nov 2026).
 *
 * The one question a lawyer who signed up with Google before R9 was never
 * asked: «محامٍ مترافع أم مستشار قانوني؟» (Art. 18). The lawyer dashboard
 * (PracticeKindGate) sends him here until he answers. Asked once: changing
 * the answer afterwards is an admin action, and the page says so.
 */
const OPTIONS: Array<{ id: PracticeKind; icon: typeof Gavel }> = [
  { id: "advocate", icon: Gavel },
  { id: "consultant", icon: Briefcase },
];

export default function PracticeKindPage() {
  const router = useRouter();
  const [choice, setChoice] = useState<PracticeKind | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!choice || saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiMutate("/api/v1/onboarding/practice-kind", "POST", { practiceKind: choice });
      router.replace("/dashboard/lawyer");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(/[؀-ۿ]/.test(msg) ? msg : "تعذّر حفظ صفتك المهنية. حاول مرة أخرى.");
      setSaving(false);
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-surface dark:bg-dark-bg flex items-center justify-center p-4 font-body">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-dark-card">
        <h1 className="font-brand text-2xl font-bold text-ink">{PRACTICE_KIND_QUESTION_AR}</h1>
        <p className="mt-1 text-sm text-ink-muted dark:text-gray-400">
          نحتاج إلى صفتك المهنية قبل فتح لوحة المحامي: المستشار القانوني لا يترافع أمام المحاكم (المادة ١٨)،
          فتُخفى عنه أدوات الجلسات والمرافعة.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {OPTIONS.map(({ id, icon: Icon }) => {
            const active = choice === id;
            const o = PRACTICE_KIND_OPTIONS_AR[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => setChoice(id)}
                aria-pressed={active}
                className={`relative flex flex-col items-start gap-2 rounded-2xl border p-4 text-start transition-all ${
                  active
                    ? "border-royal/30 bg-royal/5 dark:border-gold/30 dark:bg-royal/15"
                    : "border-slate-200/70 bg-white dark:border-white/10 dark:bg-dark-card hover:border-slate-300"
                }`}
              >
                {active && (
                  <span className="absolute top-2.5 end-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-royal dark:bg-gold">
                    <Check size={11} weight="bold" className="text-white dark:text-royal" />
                  </span>
                )}
                <Icon size={20} weight="duotone" className={active ? "text-royal dark:text-gold" : "text-ink-faint dark:text-gray-400"} />
                <span className="text-sm font-semibold text-ink">{o.label}</span>
                <span className="text-xs text-ink-muted dark:text-gray-400">{o.desc}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-ink-faint dark:text-gray-500">
          تُحدَّد الصفة المهنية مرة واحدة. لتغييرها لاحقاً تحتاج إلى مراجعة إدارة المنصّة.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!choice || saving}
          className="mt-5 w-full rounded-xl bg-royal py-3 text-sm font-bold text-white disabled:opacity-50 dark:bg-gold dark:text-royal"
        >
          {saving ? "جارٍ الحفظ…" : "متابعة"}
        </button>
      </div>
    </div>
  );
}
