/**
 * founderWindow.ts — the /founder page's clock: which phase the campaign is
 * in and how long until the next boundary, from the SERVER's time.
 *
 * GET /api/v1/campaigns/active carries
 *   founderWindow: { state, startsAt, endsAtExclusive, serverNow,
 *                    seatsTotal, seatsLeft, planId } | null
 * (null = no founder campaign configured). Older deployments answer without
 * the key at all; then the manifest's dates (landingCopy.ts) stand in, the
 * server's time is read from the response's `Date` header, and buying is
 * enabled only when the legacy `campaign.onSale` is true.
 *
 * The device clock is never trusted alone: the offset between the server's
 * time and the device's is measured once per read (`clockOffsetMs`), and every
 * tick adds it to Date.now(). The route answers with a public cache, so a
 * cached `serverNow` is aged by the `Age` header the cache adds.
 *
 * Phases (`founderPhase`):
 *   pre       — server says pre and the start is still ahead: count to startsAt;
 *   opening   — server said pre but the start has passed on the corrected
 *               clock: buying stays locked until a re-read says live;
 *   live      — count to endsAtExclusive, buying open;
 *   ended / sold_out / paused — locked; crossing endsAtExclusive locally ends
 *               the offer at once, without waiting for the server;
 *   unconfigured — the route answered `founderWindow: null`;
 *   error     — the read failed or the body is unusable.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */

import { FOUNDER_PLAN_ID } from "../membership/founderPlan.ts";
import { countPhraseAr } from "../services/arabicCount.ts";
import { founderOfferFromApi } from "../pricing/founderCard.ts";
import { FOUNDER_FALLBACK_ENDS_AT_EXCLUSIVE, FOUNDER_FALLBACK_STARTS_AT } from "./landingCopy.ts";

export type WindowState = "pre" | "live" | "sold_out" | "paused" | "ended";

export interface FounderWindow {
  state: WindowState;
  startsAt: string;
  endsAtExclusive: string;
  serverNow: string;
  seatsTotal: number | null;
  seatsLeft: number | null;
  planId: string;
}

/** One read of the route, ready for the clock. */
export type WindowRead =
  | {
      kind: "window";
      state: WindowState;
      startsAtMs: number;
      endsAtMs: number;
      /** The server's time when it answered (aged by the cache's `Age`). */
      serverNowMs: number;
      seatsTotal: number | null;
      seatsLeft: number | null;
      /** "api" = founderWindow; "fallback" = manifest dates + Date header (pre-merge route). */
      source: "api" | "fallback";
    }
  | { kind: "unconfigured" }
  | { kind: "error" };

const STATES = new Set<string>(["pre", "live", "sold_out", "paused", "ended"]);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isSeatCount = (v: unknown): v is number | null =>
  v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0);
const parseMs = (v: unknown): number | null => {
  if (typeof v !== "string" || v.length === 0) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};

/** `founderWindow` as the type above, or null for anything malformed. */
export function parseFounderWindow(value: unknown): FounderWindow | null {
  if (!isObject(value)) return null;
  const { state, startsAt, endsAtExclusive, serverNow, seatsTotal, seatsLeft, planId } = value;
  if (typeof state !== "string" || !STATES.has(state)) return null;
  if (parseMs(startsAt) === null || parseMs(endsAtExclusive) === null || parseMs(serverNow) === null) return null;
  if (!isSeatCount(seatsTotal) || !isSeatCount(seatsLeft)) return null;
  if (typeof planId !== "string") return null;
  return {
    state: state as WindowState,
    startsAt: startsAt as string,
    endsAtExclusive: endsAtExclusive as string,
    serverNow: serverNow as string,
    seatsTotal,
    seatsLeft,
    planId,
  };
}

/** The `Age` header in ms (0 when absent or malformed; capped at one day). */
export function ageMs(age: string | null | undefined): number {
  if (typeof age !== "string" || !/^\s*\d+\s*$/.test(age)) return 0;
  return Math.min(Number(age.trim()), 86_400) * 1000;
}

export interface ReadHeaders {
  date: string | null;
  age: string | null;
}

/**
 * The route's body (and two response headers) as a WindowRead.
 * `body` null = the fetch failed or the status was not OK.
 */
export function readFounderWindow(body: unknown, headers: ReadHeaders): WindowRead {
  if (!isObject(body)) return { kind: "error" };
  const aged = ageMs(headers.age);

  if ("founderWindow" in body) {
    if (body.founderWindow === null) return { kind: "unconfigured" };
    const w = parseFounderWindow(body.founderWindow);
    if (!w || w.planId !== FOUNDER_PLAN_ID) return { kind: "error" };
    const startsAtMs = parseMs(w.startsAt) as number;
    const endsAtMs = parseMs(w.endsAtExclusive) as number;
    if (endsAtMs <= startsAtMs) return { kind: "error" };
    return {
      kind: "window",
      state: w.state,
      startsAtMs,
      endsAtMs,
      serverNowMs: (parseMs(w.serverNow) as number) + aged,
      seatsTotal: w.seatsTotal,
      seatsLeft: w.seatsLeft,
      source: "api",
    };
  }

  // Pre-merge route: no founderWindow key. The server's time from `Date`.
  const dateMs = parseMs(headers.date);
  if (dateMs === null) return { kind: "error" };
  const serverNowMs = dateMs + aged;
  const startsAtMs = Date.parse(FOUNDER_FALLBACK_STARTS_AT);
  const endsAtMs = Date.parse(FOUNDER_FALLBACK_ENDS_AT_EXCLUSIVE);
  const base = { kind: "window" as const, startsAtMs, endsAtMs, serverNowMs, source: "fallback" as const };

  if (serverNowMs < startsAtMs) return { ...base, state: "pre", seatsTotal: null, seatsLeft: null };
  if (serverNowMs >= endsAtMs) return { ...base, state: "ended", seatsTotal: null, seatsLeft: null };
  const offer = founderOfferFromApi(body);
  if (offer.state === "open") {
    return { ...base, state: "live", seatsTotal: offer.capacity, seatsLeft: offer.seatsLeft };
  }
  if (offer.state === "unavailable") return { kind: "error" };
  const c = isObject(body.campaign) ? body.campaign : null;
  if (c && c.seatsLeft === 0) return { ...base, state: "sold_out", seatsTotal: null, seatsLeft: 0 };
  // Inside the dates but not on sale, and not known to be full: paused.
  return { ...base, state: "paused", seatsTotal: null, seatsLeft: null };
}

/**
 * serverTime − deviceTime, measured at the midpoint of the request
 * (`sentAtMs`…`receivedAtMs`, both Date.now()).
 */
export function clockOffsetMs(serverNowMs: number, sentAtMs: number, receivedAtMs: number): number {
  return serverNowMs - (sentAtMs + receivedAtMs) / 2;
}

export type FounderPhase =
  | "loading"
  | "error"
  | "unconfigured"
  | "pre"
  | "opening"
  | "live"
  | "sold_out"
  | "paused"
  | "ended";

export interface PhaseView {
  phase: FounderPhase;
  /** The boundary the countdown counts to (server time, ms), or null. */
  targetMs: number | null;
  /** ms left until `targetMs` on the corrected clock (≥ 0), or null. */
  remainingMs: number | null;
  seatsLeft: number | null;
  seatsTotal: number | null;
}

/**
 * The phase at `serverNowMs` (= Date.now() + offset). `read` undefined =
 * still loading.
 */
export function founderPhase(read: WindowRead | undefined, serverNowMs: number): PhaseView {
  const none = { targetMs: null, remainingMs: null, seatsLeft: null, seatsTotal: null };
  if (read === undefined) return { phase: "loading", ...none };
  if (read.kind === "error") return { phase: "error", ...none };
  if (read.kind === "unconfigured") return { phase: "unconfigured", ...none };

  const seats = { seatsLeft: read.seatsLeft, seatsTotal: read.seatsTotal };
  const left = (target: number) => Math.max(0, target - serverNowMs);

  if (read.state === "sold_out") return { phase: "sold_out", targetMs: null, remainingMs: null, ...seats };
  if (read.state === "paused") return { phase: "paused", targetMs: null, remainingMs: null, ...seats };
  if (read.state === "ended" || serverNowMs >= read.endsAtMs) {
    return { phase: "ended", targetMs: null, remainingMs: null, ...seats };
  }
  if (read.state === "pre") {
    if (serverNowMs < read.startsAtMs) {
      return { phase: "pre", targetMs: read.startsAtMs, remainingMs: left(read.startsAtMs), ...seats };
    }
    return { phase: "opening", targetMs: null, remainingMs: null, ...seats };
  }
  // live
  if (read.seatsLeft === 0) return { phase: "sold_out", targetMs: null, remainingMs: null, ...seats };
  return { phase: "live", targetMs: read.endsAtMs, remainingMs: left(read.endsAtMs), ...seats };
}

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function splitRemaining(ms: number): Countdown {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(s / 86_400),
    hours: Math.floor((s % 86_400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

const DAYS = { zero: null, one: "يوم", two: "يومين", few: "أيام", many: "يومًا", hundreds: "يوم" };
const HOURS = { zero: null, one: "ساعة", two: "ساعتين", few: "ساعات", many: "ساعة" };
const MINUTES = { zero: null, one: "دقيقة", two: "دقيقتين", few: "دقائق", many: "دقيقة" };

/**
 * «٣ أيام و٤ ساعات», «ساعتين و٥ دقائق», «٤٥ دقيقة», «أقل من دقيقة» — at most
 * the two largest non-zero units, for the locked button's «يفتح التسجيل بعد…».
 */
export function durationAr(ms: number): string {
  const { days, hours, minutes } = splitRemaining(ms);
  const parts = (
    days > 0
      ? [countPhraseAr(days, DAYS), countPhraseAr(hours, HOURS)]
      : hours > 0
        ? [countPhraseAr(hours, HOURS), countPhraseAr(minutes, MINUTES)]
        : [countPhraseAr(minutes, MINUTES)]
  ).filter((p): p is string => typeof p === "string");
  if (parts.length === 0) return "أقل من دقيقة";
  return parts.join(" و");
}

/** «١٨ نوفمبر ٢٠٢٦» — a Riyadh calendar day in Arabic, or null. */
export function riyadhDateAr(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("ar-SA", {
    calendar: "gregory",
    numberingSystem: "arab",
    timeZone: "Asia/Riyadh",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(ms));
}

/**
 * «النافذة: من ١٨ نوفمبر ٢٠٢٦ حتى ١٧ ديسمبر ٢٠٢٦ (شهر واحد فقط) أو اكتمال
 * المقاعد.» — the last day is the one before the exclusive end.
 */
export function windowLineAr(startsAtMs: number, endsAtExclusiveMs: number): string | null {
  const from = riyadhDateAr(startsAtMs);
  const to = riyadhDateAr(endsAtExclusiveMs - 1);
  if (!from || !to) return null;
  return `النافذة: من ${from} حتى ${to} (شهر واحد فقط) أو اكتمال المقاعد.`;
}

/** How long to wait before the next read, in ms; null = no scheduled re-read beyond the periodic one. */
export function nextReadDelayMs(phase: FounderPhase): number | null {
  // Waiting for the server to flip pre → live (or to confirm an end): poll
  // briefly. The route's cache is ≤ 60 s, so a few reads cover it.
  if (phase === "opening") return 10_000;
  if (phase === "error") return 30_000;
  return null;
}
