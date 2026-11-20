"use client";

/**
 * LibraryScopeChips — T14-Q485 (batch l11): «الكل / أنظمة / مبادئ / أوامر /
 * فقه» above the library assistant's box. The chosen value goes in the run's
 * input as `scope` (tools.ts libraryAssistantInput; «الكل» sends none), and the
 * server searches only that kind (libraryScopeLimits) and tells the model so
 * (n8n LIBRARY_ASSISTANT_BUILD).
 *
 * The chat itself lives in the law reader (src/app/laws/**, another builder's
 * files): it mounts this component and passes `scope` to askLibrary — see the
 * l11-ai report for the exact lines.
 */
import { LIBRARY_SCOPES, LIBRARY_SCOPES_LIVE, type LibraryScope } from "@/lib/ai/tools";

export type LibraryScopeChoice = LibraryScope | "all";

export const LIBRARY_SCOPE_LABELS_AR: Readonly<Record<LibraryScopeChoice, string>> = {
  all: "الكل",
  laws: "أنظمة",
  principles: "مبادئ",
  orders: "أوامر",
  fiqh: "فقه",
};

const CHOICES: readonly LibraryScopeChoice[] = ["all", ...LIBRARY_SCOPES];

/** The run input's field for a choice: nothing for «الكل». */
export function scopeField(choice: LibraryScopeChoice): { scope?: LibraryScope } {
  return choice === "all" ? {} : { scope: choice };
}

export default function LibraryScopeChips({
  value,
  onChange,
  isDark,
  disabled = false,
}: {
  value: LibraryScopeChoice;
  onChange: (next: LibraryScopeChoice) => void;
  isDark: boolean;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="ابحث في" className="flex flex-wrap items-center gap-1.5" dir="rtl">
      {CHOICES.map((c) => {
        const on = c === value;
        // «أوامر» / «فقه»: not served by the AI search yet (tools.ts LIBRARY_SCOPES_LIVE).
        const soon = c !== "all" && !LIBRARY_SCOPES_LIVE.includes(c);
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled || soon}
            title={soon ? "قريباً" : undefined}
            onClick={() => onChange(c)}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors disabled:opacity-50 ${
              on
                ? isDark ? "border-[#C8A762]/50 bg-[#C8A762]/15 text-[#C8A762]" : "border-[#0B3D2E]/30 bg-[#0B3D2E]/10 text-[#0B3D2E]"
                : isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200" : "border-zinc-200 text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {LIBRARY_SCOPE_LABELS_AR[c]}{soon ? " (قريباً)" : ""}
          </button>
        );
      })}
    </div>
  );
}
