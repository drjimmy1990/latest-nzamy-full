"use client";

/**
 * DualDatePicker — the platform's one date field, Hijri (Umm al-Qura) and
 * Gregorian together. Owner decision ١٢٧: «المكوّن المزدوج الموحد الذي يحول
 * التاريخ تلقائياً بين التقويم الهجري والميلادي (أم القرى)».
 *
 * ── WHAT IT REPLACES, AND WHAT IT KEEPS ─────────────────────────────────────
 *
 * Every dashboard date field was a native `<input type="date">`, which renders
 * in the BROWSER's locale: on an en-US machine an Arabic RTL form showed
 * `mm/dd/yyyy`, left to right (the owner's shots 20 and 25). Each form then
 * echoed the day back in words under the field — describeDateAr — because a
 * day/month transposition on a hearing date is a missed hearing.
 *
 * This field keeps that safety by construction: its own text IS describeDateAr,
 * split over two lines — weekday + Gregorian, then Hijri. The weekday is what a
 * transposition cannot survive, so it never leaves the field.
 *
 * The VALUE is unchanged: "YYYY-MM-DD", a Gregorian wall-clock day, "" for
 * none — exactly what the native input sent, so no route or column changes.
 *
 * ── WHY A DIALOG ────────────────────────────────────────────────────────────
 *
 * Half the call sites sit in a two-column grid inside a modal that scrolls
 * (`max-h-[85dvh] overflow-y-auto`) at z-[60], one at z-[200]. A panel in the
 * flow of a ~190px column cannot hold a 7-day grid with two numbers per day,
 * and an absolutely placed one would be clipped by the scrolling modal. So the
 * calendar opens as its own small dialog, portalled to <body> above every
 * modal (z-[300]), and closing it returns focus to the field.
 *
 * ── ACCESSIBILITY (what the native picker gave for free) ───────────────────
 *
 *   - The field is a real button: Enter/Space opens, its name says the label
 *     and the chosen day in both calendars.
 *   - The dialog is `role="dialog"` + `aria-modal`, Tab is trapped inside it,
 *     Escape closes it, focus goes back to the field.
 *   - The month is an ARIA grid with one tab stop (roving tabindex):
 *     arrows move a day/week — RIGHT-TO-LEFT, so ArrowLeft is the next day —
 *     Home/End the week, PageUp/PageDown a month, with Shift a year.
 *   - Month and year are native <select>s, so a phone gets its own wheel for
 *     jumping to a contract signed years ago.
 *   - Every day button is named in full in both calendars, and the focused
 *     day is read out in a polite live region.
 *
 * ── THE CACHED-DATE TRAP ────────────────────────────────────────────────────
 *
 * Nothing here reads the clock while rendering. "Today" (Riyadh's calendar
 * day, saudiCalendarDate) is read in the click that opens the dialog, so no
 * server-rendered, Nginx-cached HTML can carry yesterday — the trap
 * HijriDateWidget's `now` comment documents. The dialog only exists after that
 * click, so it is never server-rendered either.
 *
 * When the runtime has no Umm al-Qura data the Hijri toggle is not offered and
 * the field shows the Gregorian line alone — hijri.ts's rule: a gap, never a
 * Gregorian day printed under «هـ».
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarBlank, CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { describeDateAr, hijriAvailable, toArabicDigits } from "@/lib/services/hijri";
import { saudiCalendarDate } from "@/lib/services/enactmentCountdown";
import {
  describeDateLinesAr,
  isoFromParts,
  isWithinRange,
  monthDays,
  monthLength,
  monthNamesAr,
  monthOf,
  monthTitleAr,
  moveByKey,
  partsOf,
  shiftMonth,
  weekStartOffset,
  yearRange,
  PICKER_MAX_ISO,
  PICKER_MIN_ISO,
  WEEKDAYS_AR,
  type CalendarKind,
  type DayCell,
  type MonthRef,
} from "@/lib/services/dualCalendar";

export interface DualDatePickerProps {
  /** "YYYY-MM-DD" (Gregorian wall-clock day) or "" for none. */
  value: string;
  onChange: (iso: string) => void;
  /** The field's name, for the button's accessible name and the dialog title. */
  label: string;
  /** Inclusive "YYYY-MM-DD" bounds. Days outside are shown but cannot be chosen. */
  min?: string;
  max?: string;
  disabled?: boolean;
  /** Optional fields: offer «مسح» so the value can go back to "". */
  clearable?: boolean;
  placeholder?: string;
  /** The host form's input classes, so the field looks like its neighbours. */
  className?: string;
  id?: string;
}

const WEEKDAY_SHORT_AR = ["أح", "اث", "ث", "أر", "خ", "ج", "س"] as const;

function clampIso(iso: string, lo: string, hi: string): string {
  if (iso < lo) return lo;
  if (iso > hi) return hi;
  return iso;
}

export default function DualDatePicker({
  value,
  onChange,
  label,
  min,
  max,
  disabled = false,
  clearable = false,
  placeholder = "اختر التاريخ",
  className = "",
  id,
}: DualDatePickerProps) {
  const { isDark, calendarType } = useTheme();
  const hijriOk = hijriAvailable();
  const titleId = useId();
  const monthLabelId = useId();

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLTableElement>(null);
  // Set when the grid itself moved focus (a key or a click), so the effect
  // below follows it with DOM focus — and does NOT when the month <select>
  // moved it, which would yank focus out of the select mid-choice.
  const focusGridRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [calendar, setCalendar] = useState<CalendarKind>("gregorian");
  const [focusIso, setFocusIso] = useState("");
  const [today, setToday] = useState("");

  // The selectable span: the field's own bounds, else the picker's default
  // band — widened to include a stored value outside it, so an old record
  // still opens on its own month.
  const lo = min || (value && value < PICKER_MIN_ISO ? value : PICKER_MIN_ISO);
  const hi = max || (value && value > PICKER_MAX_ISO ? value : PICKER_MAX_ISO);

  const lines = value ? describeDateLinesAr(value) : null;
  const view: MonthRef | null = focusIso ? monthOf(focusIso, calendar) : null;

  function openPicker() {
    if (disabled) return;
    const now = saudiCalendarDate();
    setToday(now);
    const start = clampIso(value && partsOf(value, "gregorian") ? value : now, lo, hi);
    setCalendar(hijriOk && calendarType !== "miladi" ? "hijri" : "gregorian");
    setFocusIso(start);
    focusGridRef.current = true;
    setOpen(true);
  }

  function closePicker() {
    setOpen(false);
    // The field is always mounted, so focus can go straight back to it — no
    // requestAnimationFrame, which never fires in a hidden tab.
    triggerRef.current?.focus();
  }

  function choose(iso: string) {
    if (!isWithinRange(iso, lo, hi)) return;
    onChange(iso);
    closePicker();
  }

  function moveFocus(iso: string | null) {
    if (!iso) return;
    focusGridRef.current = true;
    setFocusIso(clampIso(iso, lo, hi));
  }

  /** Jump the view to another month, keeping the day-of-month where it exists. */
  function showMonth(ref: MonthRef) {
    const day = (focusIso && partsOf(focusIso, ref.calendar)?.day) || 1;
    const len = monthLength(ref);
    const iso = len ? isoFromParts(ref.calendar, ref.year, ref.month, Math.min(day, len)) : null;
    if (iso) setFocusIso(clampIso(iso, lo, hi));
  }

  // Follow the roving tab stop with real focus when the grid moved it.
  useEffect(() => {
    if (!open || !focusGridRef.current) return;
    focusGridRef.current = false;
    const btn = gridRef.current?.querySelector<HTMLButtonElement>(`button[data-iso="${focusIso}"]`);
    btn?.focus();
  }, [open, focusIso, calendar]);

  function onGridKeyDown(e: ReactKeyboardEvent<HTMLTableElement>) {
    if (!focusIso) return;
    const next = moveByKey(focusIso, e.key, calendar, e.shiftKey);
    if (next === null) return;
    e.preventDefault();
    moveFocus(next);
  }

  function onDialogKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      // Ours alone: the host modal must not also close.
      e.stopPropagation();
      e.preventDefault();
      closePicker();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusables = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), [tabindex="0"]'),
    ).filter((el) => el.tabIndex >= 0);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // ── field ──────────────────────────────────────────────────────────────────
  const field = (
    <div className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${value ? describeDateAr(value) ?? value : "لم يُحدَّد"}`}
        className={`${className} flex items-center gap-1.5 text-right disabled:cursor-not-allowed disabled:opacity-50`}
        // Inline, not a class: the host's `px-3` and a `pl-9` would be decided
        // by stylesheet order, not by which one is written last.
        style={clearable && value && !disabled ? { paddingLeft: "2.25rem" } : undefined}
      >
        <CalendarBlank size={14} weight="duotone" aria-hidden className={`shrink-0 ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`} />
        {lines ? (
          // Sized for the half-width column most forms put a date in: each
          // calendar on one line at ~190px, wrapping (never clipping) below it.
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[12px]">{lines.gregorian}</span>
            {lines.hijri && (
              <span className={`mt-0.5 block text-[10.5px] font-semibold ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{lines.hijri}</span>
            )}
          </span>
        ) : (
          <span className={`flex-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{value || placeholder}</span>
        )}
      </button>
      {clearable && value && !disabled && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={`مسح ${label}`}
          title="مسح التاريخ"
          className={`absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-1 ${isDark ? "text-zinc-400 hover:bg-white/[0.06]" : "text-slate-400 hover:bg-slate-100"}`}
        >
          <X size={13} aria-hidden />
        </button>
      )}
    </div>
  );

  if (!open || !view) return field;

  // ── dialog ─────────────────────────────────────────────────────────────────
  const days: DayCell[] = monthDays(view) ?? [];
  const lead = weekStartOffset(view);
  const cells: (DayCell | null)[] = [...Array<null>(lead).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (DayCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const other: CalendarKind = calendar === "hijri" ? "gregorian" : "hijri";
  const spanFirst = days[0] ? monthOf(days[0].iso, other) : null;
  const spanLast = days.length ? monthOf(days[days.length - 1].iso, other) : null;
  const spanLabel = spanFirst && spanLast && hijriOk
    ? spanFirst.month === spanLast.month && spanFirst.year === spanLast.year
      ? monthTitleAr(spanFirst)
      : `${monthNamesAr(other)[spanFirst.month - 1]}${spanFirst.year !== spanLast.year ? ` ${toArabicDigits(spanFirst.year)}` : ""} – ${monthTitleAr(spanLast)}`
    : null;

  const years = yearRange(calendar, lo, hi);
  const prevRef = shiftMonth(view, -1);
  const nextRef = shiftMonth(view, 1);
  // A neighbouring month is worth showing only if some day of it is choosable.
  const prevAllowed = days.length > 0 && days[0].iso > lo;
  const nextAllowed = days.length > 0 && days[days.length - 1].iso < hi;
  const todayChoosable = today !== "" && isWithinRange(today, lo, hi);

  const panel = isDark ? "bg-zinc-900 border border-white/[0.08] text-zinc-100" : "bg-white border border-slate-200 text-zinc-800";
  const ctrl = isDark
    ? "border-white/[0.08] bg-zinc-800 text-zinc-200 focus:border-[#C8A762]"
    : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-[#0B3D2E]";
  const iconBtn = `flex h-9 w-9 items-center justify-center rounded-xl disabled:cursor-not-allowed disabled:opacity-50 ${isDark ? "text-zinc-300 hover:bg-white/[0.06]" : "text-slate-600 hover:bg-slate-100"}`;
  const focusLine = focusIso ? describeDateAr(focusIso) : null;

  // A portal moves the DOM, not the React tree: every event inside it still
  // bubbles into the host form's handlers. Stopped here, at the backdrop, so
  // the picker never depends on how a host modal decides to close — a day
  // click must not reach an overlay `onClick={onClose}` and drop the form.
  // Dismissal is on click, not mousedown, so the backdrop is still there to
  // receive the click instead of whatever sits under it.
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  const dialog = (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) closePicker(); }}
      onMouseDown={stop}
      onPointerDown={stop}
      onKeyDown={stop}
      onChange={stop}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        dir="rtl"
        onKeyDown={onDialogKeyDown}
        className={`w-full max-w-[22rem] rounded-3xl p-4 shadow-2xl ${panel}`}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p id={titleId} className="text-[14px] font-bold">{label}</p>
          <button type="button" onClick={closePicker} aria-label="إغلاق" className={iconBtn}>
            <X size={15} aria-hidden />
          </button>
        </div>

        {hijriOk && (
          <div role="group" aria-label="التقويم" className={`mb-3 grid grid-cols-2 gap-1 rounded-xl p-1 ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
            {([["hijri", "هجري (أم القرى)"], ["gregorian", "ميلادي"]] as const).map(([cal, text]) => (
              <button
                key={cal}
                type="button"
                aria-pressed={calendar === cal}
                onClick={() => setCalendar(cal)}
                className={`rounded-lg py-1.5 text-[12px] font-bold transition-colors ${
                  calendar === cal
                    ? isDark ? "bg-[#C8A762] text-zinc-900" : "bg-[#0B3D2E] text-white"
                    : isDark ? "text-zinc-400 hover:text-zinc-200" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {text}
              </button>
            ))}
          </div>
        )}

        <div className="mb-1 flex items-center gap-1.5">
          <button type="button" onClick={() => showMonth(prevRef)} disabled={!prevAllowed} aria-label="الشهر السابق" className={iconBtn}>
            <CaretRight size={15} aria-hidden />
          </button>
          <select
            aria-label="الشهر"
            value={view.month}
            onChange={(e) => showMonth({ ...view, month: Number(e.target.value) })}
            className={`min-w-0 flex-1 rounded-xl border px-2 py-2 text-[12.5px] font-semibold outline-none ${ctrl}`}
          >
            {monthNamesAr(calendar).map((name, i) => (
              <option key={name} value={i + 1}>{name}</option>
            ))}
          </select>
          <select
            aria-label="السنة"
            value={view.year}
            onChange={(e) => showMonth({ ...view, year: Number(e.target.value) })}
            className={`w-[5.5rem] rounded-xl border px-2 py-2 text-[12.5px] font-semibold outline-none ${ctrl}`}
          >
            {(years.includes(view.year) ? years : [...years, view.year].sort((a, b) => a - b)).map((y) => (
              <option key={y} value={y}>{toArabicDigits(y)}</option>
            ))}
          </select>
          <button type="button" onClick={() => showMonth(nextRef)} disabled={!nextAllowed} aria-label="الشهر التالي" className={iconBtn}>
            <CaretLeft size={15} aria-hidden />
          </button>
        </div>
        <p id={monthLabelId} className="mb-2 text-center text-[11px] font-semibold">
          <span>{monthTitleAr(view)}</span>
          {spanLabel && <span className={isDark ? "text-zinc-500" : "text-slate-400"}> · {spanLabel}</span>}
        </p>

        {days.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-red-500">تعذّر عرض هذا الشهر على هذا الجهاز.</p>
        ) : (
          <table ref={gridRef} role="grid" aria-labelledby={monthLabelId} onKeyDown={onGridKeyDown} className="w-full table-fixed border-separate border-spacing-0.5">
            <thead>
              <tr>
                {WEEKDAY_SHORT_AR.map((d, i) => (
                  <th key={d} scope="col" abbr={WEEKDAYS_AR[i]} className={`py-1 text-[10.5px] font-bold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, w) => (
                <tr key={w}>
                  {week.map((cell, i) => {
                    if (!cell) return <td key={`b${i}`} role="gridcell" />;
                    const selected = cell.iso === value;
                    const isToday = cell.iso === today;
                    const allowed = isWithinRange(cell.iso, lo, hi);
                    const primary = calendar === "hijri" ? cell.hijri?.day : cell.gregorian.day;
                    const secondary = calendar === "hijri" ? cell.gregorian.day : cell.hijri?.day;
                    return (
                      <td key={cell.iso} role="gridcell" aria-selected={selected}>
                        <button
                          type="button"
                          data-iso={cell.iso}
                          tabIndex={cell.iso === focusIso ? 0 : -1}
                          aria-label={describeDateAr(cell.iso) ?? cell.iso}
                          aria-current={isToday ? "date" : undefined}
                          aria-disabled={!allowed || undefined}
                          onClick={() => { if (allowed) choose(cell.iso); else moveFocus(cell.iso); }}
                          className={`flex h-11 w-full flex-col items-center justify-center rounded-xl text-center leading-none outline-none transition-colors focus-visible:ring-2 ${
                            isDark ? "focus-visible:ring-[#C8A762]" : "focus-visible:ring-[#0B3D2E]"
                          } ${
                            selected
                              ? isDark ? "bg-[#C8A762] text-zinc-900" : "bg-[#0B3D2E] text-white"
                              : !allowed
                                ? `cursor-not-allowed opacity-40 ${isDark ? "text-zinc-500" : "text-slate-400"}`
                                : isDark ? "hover:bg-white/[0.06]" : "hover:bg-slate-100"
                          } ${isToday && !selected ? (isDark ? "ring-1 ring-[#C8A762]/60" : "ring-1 ring-[#0B3D2E]/40") : ""}`}
                        >
                          <span className="text-[13px] font-bold">{primary !== undefined ? toArabicDigits(primary) : ""}</span>
                          {secondary !== undefined && (
                            <span className={`mt-0.5 text-[9.5px] ${selected ? "opacity-80" : isDark ? "text-zinc-500" : "text-slate-400"}`}>
                              {toArabicDigits(secondary)}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p aria-live="polite" className={`mt-2 min-h-[2.25rem] rounded-xl px-3 py-2 text-[11px] font-semibold leading-relaxed ${isDark ? "bg-emerald-900/10 text-emerald-300" : "bg-emerald-50 text-emerald-800"}`}>
          {focusLine}
        </p>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => choose(today)}
            disabled={!todayChoosable}
            title={todayChoosable ? undefined : "اليوم خارج المدى المسموح لهذا الحقل"}
            className={`rounded-xl border px-3 py-2 text-[12px] font-bold disabled:cursor-not-allowed disabled:opacity-50 ${isDark ? "border-white/[0.08] text-zinc-200 hover:bg-white/[0.04]" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
          >
            اليوم
          </button>
          {clearable && value && (
            <button
              type="button"
              onClick={() => { onChange(""); closePicker(); }}
              className={`rounded-xl border px-3 py-2 text-[12px] font-bold ${isDark ? "border-white/[0.08] text-zinc-300 hover:bg-white/[0.04]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              مسح التاريخ
            </button>
          )}
          <button
            type="button"
            onClick={closePicker}
            className={`ms-auto rounded-xl px-3 py-2 text-[12px] font-bold ${isDark ? "text-zinc-400 hover:text-zinc-200" : "text-slate-500 hover:text-slate-700"}`}
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {field}
      {createPortal(dialog, document.body)}
    </>
  );
}
