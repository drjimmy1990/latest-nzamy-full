"use client";

import { useState } from "react";
import ModalShell from "@/components/ui/ModalShell";
import {
  CheckSquare, Square, ArrowCounterClockwise, Warning, Info,
  Gavel, CalendarCheck, Timer, Folder, Money, ChatDots, AddressBook, FileText,
  PencilSimple, FileMagnifyingGlass, MagnifyingGlass, Tray, Lightbulb, Sword,
  Handshake, Calculator,
} from "@phosphor-icons/react";
import { patchPreferences } from "@/lib/services/preferencesService";
import { toArabicDigits } from "@/lib/services/arabicCount";
import {
  LAWYER_QUICK_TOOLS,
  DEFAULT_QUICK_TOOLS,
  QUICK_TOOLS_MIN,
  QUICK_TOOLS_MAX,
  QUICK_TOOL_GROUP_LABELS,
  resolveQuickToolIds,
  quickToolsForPracticeKind,
  quickToolIdsForPracticeKind,
  type QuickToolGroup,
  type QuickToolIcon,
} from "@/lib/lawyerQuickTools";
import type { PracticeKind } from "@/lib/auth/practiceKind";

/** The registry stores icon NAMES (it is loaded by node tests); this maps them. */
export const QUICK_TOOL_ICONS: Record<QuickToolIcon, React.ElementType> = {
  Gavel, CalendarCheck, Timer, Folder, Money, ChatDots, AddressBook, CheckSquare, FileText,
  PencilSimple, FileMagnifyingGlass, MagnifyingGlass, Tray, Lightbulb, Sword, Handshake, Calculator,
};

const GROUP_ORDER: QuickToolGroup[] = ["operational", "ai"];

interface Props {
  isDark: boolean;
  /** what the dashboard shows now — already resolved, so it is always saveable */
  currentIds: readonly string[];
  /** false in demo mode: there is no account to save to */
  canSave: boolean;
  /** Art. 18: a consultant is offered no court tool, and his default has none. */
  practiceKind?: PracticeKind;
  onClose: () => void;
  onSaved: (ids: string[]) => void;
}

/** Arabic from the server when there is some; never `API error: 500`. */
function arabicSaveError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  if (raw) console.warn("[QuickToolsCustomizer] save failed:", raw);
  return /[؀-ۿ]/.test(raw) ? raw : "تعذّر حفظ الأدوات. تحقّق من الاتصال ثم أعد المحاولة.";
}

/**
 * «تخصيص» for «أدوات نظامي — وصول سريع» (T28-30): pick 3..8 tools from
 * LAWYER_QUICK_TOOLS in two groups. Saved with PATCH /api/v1/settings/
 * preferences `{ quickTools }` — into user_settings.preferences, never the
 * browser. The order on the dashboard is the order they were ticked.
 */
export default function QuickToolsCustomizer({ isDark, currentIds, canSave, practiceKind = "advocate", onClose, onSaved }: Props) {
  const [selected, setSelected] = useState<string[]>(() => [...currentIds]);
  const offeredTools = quickToolsForPracticeKind(LAWYER_QUICK_TOOLS, practiceKind);
  const defaultIds = quickToolIdsForPracticeKind(DEFAULT_QUICK_TOOLS, practiceKind);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = selected.length;
  const inRange = count >= QUICK_TOOLS_MIN && count <= QUICK_TOOLS_MAX;
  const rangeHint = count < QUICK_TOOLS_MIN
    ? `اختر ${toArabicDigits(QUICK_TOOLS_MIN)} أدوات على الأقل — المحدد الآن ${toArabicDigits(count)}.`
    : count > QUICK_TOOLS_MAX
      ? `الحد الأقصى ${toArabicDigits(QUICK_TOOLS_MAX)} أدوات — ألغِ تحديد ${toArabicDigits(count - QUICK_TOOLS_MAX)} قبل الحفظ.`
      : null;
  const isDefault = selected.length === defaultIds.length
    && selected.every((id, i) => id === defaultIds[i]);

  // CODE-F34: the order is what gets saved, so a reordered pick is a change too.
  // In demo mode nothing can be saved, so there is nothing to warn about losing.
  const dirty = canSave && (selected.length !== currentIds.length || selected.some((id, i) => id !== currentIds[i]));

  const toggle = (id: string) => {
    setError(null);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    if (!canSave || !inRange || saving) return;
    setSaving(true);
    setError(null);
    try {
      const prefs = await patchPreferences({ quickTools: selected });
      onSaved(resolveQuickToolIds(prefs.quickTools ?? selected));
      onClose();
    } catch (err) {
      setError(arabicSaveError(err));
    } finally {
      setSaving(false);
    }
  };

  // CODE-F34: the shared shell — no exit while the save is in flight (it used
  // to close mid-save), a changed pick asks before it is thrown away, and the
  // focus trap / Escape / focus return come with it.
  return (
    <ModalShell
      title="تخصيص الوصول السريع"
      subtitle={<>اختر من {toArabicDigits(QUICK_TOOLS_MIN)} إلى {toArabicDigits(QUICK_TOOLS_MAX)} أدوات تظهر في لوحة التحكم.</>}
      onClose={onClose}
      isDark={isDark}
      busy={saving}
      dirty={dirty}
      maxWidthClass="max-w-lg"
      headerExtra={
        <span
          aria-live="polite"
          className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
            inRange
              ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
              : isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700"
          }`}
        >
          المحدد {toArabicDigits(count)} / {toArabicDigits(QUICK_TOOLS_MAX)}
        </span>
      }
    >

        {!canSave && (
          <div className={`mb-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12px] ${isDark ? "border-amber-500/20 bg-amber-900/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            <Info size={14} weight="fill" className="mt-0.5 flex-shrink-0" />
            <span>أنت في الوضع التجريبي: تُعرض الأدوات الافتراضية، وحفظ اختيارك يتطلب الدخول بحساب حقيقي.</span>
          </div>
        )}

        <div className="space-y-4">
          {GROUP_ORDER.map((group) => (
            <fieldset key={group}>
              <legend className={`mb-2 text-[11px] font-black uppercase tracking-widest ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                {QUICK_TOOL_GROUP_LABELS[group]}
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {offeredTools.filter((tool) => tool.group === group).map((tool) => {
                  const checked = selected.includes(tool.id);
                  const Icon = QUICK_TOOL_ICONS[tool.icon];
                  return (
                    <label
                      key={tool.id}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors focus-within:ring-2 ${isDark ? "focus-within:ring-[#C8A762]/50" : "focus-within:ring-royal/40"} ${
                        checked
                          ? isDark ? "border-[#C8A762]/40 bg-[#C8A762]/[0.06]" : "border-royal/30 bg-royal/[0.04]"
                          : isDark ? "border-white/[0.06] hover:bg-white/[0.03]" : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => toggle(tool.id)}
                      />
                      {checked
                        ? <CheckSquare size={18} weight="fill" className={isDark ? "text-[#C8A762]" : "text-royal"} />
                        : <Square size={18} className={isDark ? "text-zinc-500" : "text-slate-400"} />}
                      <Icon size={16} weight="duotone" className={isDark ? "text-zinc-400" : "text-slate-500"} />
                      <span className="min-w-0">
                        <span className={`block text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{tool.label}</span>
                        <span className={`block text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{tool.desc}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>

        {rangeHint && (
          <p className={`mt-4 flex items-center gap-1.5 text-[12px] font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
            <Warning size={14} weight="fill" /> {rangeHint}
          </p>
        )}
        {error && (
          <div className={`mt-4 rounded-xl px-3 py-2 text-[12px] font-semibold ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setError(null); setSelected([...defaultIds]); }}
            disabled={isDefault || saving}
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-[12px] font-bold transition-colors ${
              isDefault || saving
                ? isDark ? "border-white/[0.06] text-zinc-600 cursor-not-allowed" : "border-slate-100 text-slate-300 cursor-not-allowed"
                : isDark ? "border-white/[0.1] text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <ArrowCounterClockwise size={14} /> استعادة الافتراضي
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || !inRange || saving}
            className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold transition ${
              !canSave || !inRange || saving
                ? isDark ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]"
            }`}
          >
            {saving ? "جارٍ الحفظ..." : "حفظ"}
          </button>
        </div>
    </ModalShell>
  );
}
