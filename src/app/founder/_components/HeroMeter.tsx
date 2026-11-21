"use client";

import { splitRemaining, type FounderPhase } from "@/lib/founder/founderWindow";
import { toArabicDigits } from "@/lib/services/arabicCount";
import { useFounderWindow } from "./FounderWindowProvider";

/**
 * The hero's countdown and seat meter. Every number is the server's: the
 * clock is corrected by the route's serverNow, the seats come from
 * founder_seat_summary through the route. While the seats are unknown the
 * meter is hidden — never filled with a typed number.
 *
 * The ticking digits are not a live region (a screen reader would announce
 * every second); the phase line above them is, so a change of state is read.
 *
 * Owner 06 أ1 (batch l12): the countdown KEEPS ticking while online payment is
 * paused — the campaign's window does not stop with the gateway. The paused
 * line is said at the buy button only (founderCard.ts, FOUNDER_GATEWAY_PAUSED_TEXT),
 * not here in place of the timer (an l8 choice the owner did not make).
 */

const PHASE_LINE: Record<FounderPhase, string> = {
  loading: "",
  error: "",
  unconfigured: "",
  pre: "يفتح الاشتراك بعد",
  opening: "جارٍ فتح الاشتراك…",
  live: "يُغلق العرض بعد",
  ended: "انتهى العرض",
  sold_out: "اكتملت المقاعد",
  paused: "البيع متوقف مؤقتاً",
};

const grouped = (n: number) => toArabicDigits(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "٬"));

export function HeroMeter() {
  const { view } = useFounderWindow();
  const phaseLine = PHASE_LINE[view.phase];
  const parts = view.remainingMs === null ? null : splitRemaining(view.remainingMs);
  const units: Array<[number | undefined, string]> = [
    [parts?.days, "يوم"],
    [parts?.hours, "ساعة"],
    [parts?.minutes, "دقيقة"],
    [parts?.seconds, "ثانية"],
  ];
  const showSeats =
    view.seatsLeft !== null && view.seatsTotal !== null && view.seatsTotal > 0 && view.phase !== "pre";
  const usedPct = showSeats
    ? Math.max(2, Math.round(((view.seatsTotal! - view.seatsLeft!) / view.seatsTotal!) * 100))
    : 0;

  return (
    <div className="mt-8 max-w-[460px]">
      <p className="mb-1.5 min-h-[1.5em] text-sm text-[#E6CD8E]" aria-live="polite">
        {phaseLine}
      </p>
      {parts && (
        <div className="flex gap-2.5" role="timer" aria-label={PHASE_LINE[view.phase]}>
          {units.map(([n, label]) => (
            <div
              key={label}
              className="min-w-[64px] rounded-xl border border-white/15 bg-white/[0.08] px-3.5 py-2 text-center"
            >
              <b className="block font-brand text-2xl tabular-nums text-[#E6CD8E]">{toArabicDigits(n ?? 0)}</b>
              <span className="text-xs text-[#BFD3C9]">{label}</span>
            </div>
          ))}
        </div>
      )}
      {showSeats && (
        <div className="mt-4">
          <div className="mb-2 flex justify-between text-sm text-[#BFD3C9]">
            <span>
              {view.seatsLeft === 0 ? "اكتملت المقاعد" : `المتبقي من المقاعد: ${grouped(view.seatsLeft!)}`}
            </span>
            <span>من {grouped(view.seatsTotal!)}</span>
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-white/15"
            role="progressbar"
            aria-label="المقاعد المحجوزة"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={usedPct}
          >
            <i
              className="block h-full rounded-full bg-gradient-to-l from-[#E6CD8E] to-[#C8A762] motion-safe:transition-[width] motion-safe:duration-1000"
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
