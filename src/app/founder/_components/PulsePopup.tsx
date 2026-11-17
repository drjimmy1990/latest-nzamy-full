"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { X } from "@phosphor-icons/react";
import { countPhraseAr } from "@/lib/services/arabicCount";
import { riyadhDateAr } from "@/lib/founder/founderWindow";
import { PULSE_NARROW_MAX_PX, pulseDecision } from "@/lib/founder/pulseRules";
import { useFounderWindow } from "./FounderWindowProvider";
import styles from "./pulse.module.css";

/**
 * The pulse popup (owner F4). Every timing rule lives in pulseRules.ts; this
 * component only feeds it events (scroll, ×, the join card's visibility,
 * the viewport width) and schedules one timeout at the instant the rules
 * name. Reduced motion: no pulse, no slide (motion-safe: classes only).
 */

const NARROW_QUERY = `(max-width: ${PULSE_NARROW_MAX_PX}px)`;
const subscribeWidth = (cb: () => void) => {
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const narrowNow = () => window.matchMedia(NARROW_QUERY).matches;

const SEATS = { zero: null, one: "مقعد واحد", two: "مقعدان", few: "مقاعد", many: "مقعدًا", hundreds: "مقعد" };

export function PulsePopup({ joinId }: { joinId: string }) {
  const { view, read } = useFounderWindow();
  // performance.now() of this mount (state is not carried over from the server render).
  const [mountedAt] = useState(() => performance.now());
  const [now, setNow] = useState(mountedAt);
  const [lastScrollAt, setLastScrollAt] = useState<number | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [joinInView, setJoinInView] = useState(false);
  // Server snapshot: narrow (nothing shows before the client measures).
  const narrow = useSyncExternalStore(subscribeWidth, narrowNow, () => true);

  // Scroll and the join card's visibility.
  useEffect(() => {
    const onScroll = () => {
      const t = performance.now();
      setLastScrollAt(t);
      setNow(t);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const join = document.getElementById(joinId);
    const io = join
      ? new IntersectionObserver((entries) => setJoinInView(entries[0]?.isIntersecting ?? false), { threshold: 0.2 })
      : null;
    if (join && io) io.observe(join);

    return () => {
      window.removeEventListener("scroll", onScroll);
      io?.disconnect();
    };
  }, [joinId]);

  const offerActive =
    (view.phase === "pre" || view.phase === "opening" || view.phase === "live") && view.seatsLeft !== 0;
  const decision = pulseDecision({ now, mountedAt, lastScrollAt, dismissedAt, joinInView, offerActive, narrow });

  // One timeout at the instant the rules name.
  useEffect(() => {
    if (decision.recheckAt === null) return;
    const wait = Math.max(0, decision.recheckAt - performance.now()) + 20;
    const t = window.setTimeout(() => setNow(performance.now()), wait);
    return () => window.clearTimeout(t);
  }, [decision.recheckAt, now]);

  const seats = view.seatsLeft === null ? null : countPhraseAr(view.seatsLeft, SEATS);
  const opensOn = read?.kind === "window" ? riyadhDateAr(read.startsAtMs) : null;
  const text =
    view.phase === "pre" || view.phase === "opening"
      ? `تفتح النافذة ${opensOn ? `${opensOn} ` : ""}لمدة شهر فقط، والمقاعد محدودة.`
      : seats
        ? `المتبقي ${seats}، والعرض لمدة شهر فقط.`
        : "المقاعد محدودة، والعرض لمدة شهر فقط.";

  const visible = decision.visible;
  return (
    <aside
      aria-label="تنبيه العرض"
      aria-hidden={!visible}
      inert={!visible}
      className={`fixed bottom-3.5 right-3.5 z-[60] w-[300px] rounded-[18px] border-[1.5px] border-[#C8A762] bg-gradient-to-br from-[#0B3D2E] to-[#06201A] px-4 py-3.5 text-white shadow-[0_14px_40px_rgba(6,32,26,.45)] motion-safe:transition-[transform,opacity] motion-safe:duration-500 ${
        visible ? `translate-y-0 opacity-100 ${styles.pulse}` : "pointer-events-none translate-y-[130%] opacity-0"
      }`}
    >
      <button
        type="button"
        aria-label="إغلاق"
        onClick={() => {
          const t = performance.now();
          setDismissedAt(t);
          setNow(t);
        }}
        className="absolute left-2 top-1.5 min-h-[32px] min-w-[32px] text-xl text-[#BFD3C9]"
      >
        <X size={18} aria-hidden className="mx-auto" />
      </button>
      <strong className="mb-1 block font-brand text-lg text-[#E6CD8E]">
        الحق قبل فوات الأوان
        <span
          aria-hidden
          className="ms-1.5 inline-block h-[9px] w-[9px] rounded-full bg-[#E6CD8E] motion-safe:animate-pulse"
        />
      </strong>
      <p className="mb-2.5 text-sm text-[#D5E5DC]">{text}</p>
      <a
        href={`#${joinId}`}
        className="flex min-h-[42px] w-full items-center justify-center rounded-full bg-gradient-to-l from-[#E6CD8E] to-[#C8A762] px-4 font-bold text-[#2A1F07]"
      >
        احجز مقعدك الآن
      </a>
    </aside>
  );
}
