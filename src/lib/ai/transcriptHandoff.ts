/**
 * transcriptHandoff.ts — hands a transcript's text to the legal drafter
 * (/ai/draft) in one shot (owner-free plan 2026-10-25, N1.8 «إرسال النص
 * المفرغ للصائغ القانوني»).
 *
 * A tool that produces a real transcript (the smart transcriber, «عصارة
 * المرفقات») writes the text here and navigates, in the SAME tab, to
 * DRAFTER_TRANSCRIPT_URL. The drafter consumes it on mount and prefills its
 * facts field («الوقائع»). Both tools are «قريباً» today (owner answer ١١٥), so
 * SendToDrafterButton is ready but mounted nowhere yet.
 *
 * Privacy: a transcript is case material. It goes to sessionStorage (this tab
 * only, gone when the tab closes), never to localStorage, under one key; it is
 * removed the moment the drafter reads it — on EVERY read, valid or not — and
 * a value nobody reads is ignored after TRANSCRIPT_HANDOFF_TTL_MS.
 *
 * Everything is best-effort: storage can be missing or throw (private mode,
 * blocked site data, quota). Then the write reports failure (so the button can
 * say so instead of landing the user on an empty drafter) and the read yields
 * nothing.
 *
 * No `@/` imports and no runtime imports: `node --test` loads this file
 * directly (transcriptHandoff.test.ts).
 */

export const TRANSCRIPT_HANDOFF_KEY = "nzamy.transcriptHandoff";

/** The `?from=` value the drafter looks for. */
export const TRANSCRIPT_FROM_PARAM = "transcript";

/** Where the button navigates after writing the handoff. */
export const DRAFTER_TRANSCRIPT_URL = `/ai/draft?from=${TRANSCRIPT_FROM_PARAM}`;

/** A transcript longer than this is cut, and the cut is reported. */
export const TRANSCRIPT_HANDOFF_MAX_CHARS = 100_000;

/** The source label is a short tool name, never content. */
export const TRANSCRIPT_SOURCE_LABEL_MAX_CHARS = 80;

/** Long enough for the navigation; short enough that a stray value dies. */
export const TRANSCRIPT_HANDOFF_TTL_MS = 30 * 60 * 1000;

export interface TranscriptHandoff {
  text: string;
  sourceLabel: string;
  createdAt: number;
  /** True when the text was cut to TRANSCRIPT_HANDOFF_MAX_CHARS. */
  truncated: boolean;
}

/** The slice of the Web Storage API used here. */
export interface HandoffStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** This tab's sessionStorage, or null when there is none or it cannot be reached. */
export function sessionStorageOrNull(): HandoffStorage | null {
  try {
    const storage = (globalThis as { sessionStorage?: HandoffStorage }).sessionStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

/** Whether there is anything worth sending (the button is disabled otherwise). */
export function canSendToDrafter(text: string | null | undefined): boolean {
  return typeof text === "string" && text.trim().length > 0;
}

/** The handoff for `text`, or null when there is nothing to send. Pure. */
export function buildTranscriptHandoff(
  text: string | null | undefined,
  sourceLabel: string | null | undefined,
  now: number = Date.now(),
): TranscriptHandoff | null {
  if (!canSendToDrafter(text)) return null;
  const full = (text as string).trim();
  const truncated = full.length > TRANSCRIPT_HANDOFF_MAX_CHARS;
  return {
    text: truncated ? full.slice(0, TRANSCRIPT_HANDOFF_MAX_CHARS) : full,
    sourceLabel: (sourceLabel ?? "").trim().slice(0, TRANSCRIPT_SOURCE_LABEL_MAX_CHARS),
    createdAt: now,
    truncated,
  };
}

export type WriteHandoffResult =
  | { ok: true; truncated: boolean }
  | { ok: false; reason: "empty" | "storage" };

/** Saves the handoff, replacing any earlier one. */
export function writeTranscriptHandoff(
  storage: HandoffStorage | null | undefined,
  text: string | null | undefined,
  sourceLabel: string | null | undefined,
  now: number = Date.now(),
): WriteHandoffResult {
  const handoff = buildTranscriptHandoff(text, sourceLabel, now);
  if (!handoff) return { ok: false, reason: "empty" };
  if (!storage) return { ok: false, reason: "storage" };
  try {
    storage.setItem(TRANSCRIPT_HANDOFF_KEY, JSON.stringify(handoff));
    return { ok: true, truncated: handoff.truncated };
  } catch {
    return { ok: false, reason: "storage" };
  }
}

/** Validates a stored value. Pure. */
export function parseTranscriptHandoff(raw: string | null, now: number = Date.now()): TranscriptHandoff | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { text, sourceLabel, createdAt, truncated } = parsed as Record<string, unknown>;
  if (typeof text !== "string" || !canSendToDrafter(text)) return null;
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return null;
  if (now < createdAt || now - createdAt > TRANSCRIPT_HANDOFF_TTL_MS) return null;
  return {
    text: text.slice(0, TRANSCRIPT_HANDOFF_MAX_CHARS),
    sourceLabel: typeof sourceLabel === "string" ? sourceLabel.slice(0, TRANSCRIPT_SOURCE_LABEL_MAX_CHARS) : "",
    createdAt,
    truncated: truncated === true,
  };
}

/**
 * Removes any handoff without reading it. The drafter calls this when it is
 * opened WITHOUT ?from=transcript (e.g. after a login redirect, which keeps
 * only the path), so a transcript never outlives a visit to the drafter.
 */
export function discardTranscriptHandoff(storage: HandoffStorage | null | undefined): void {
  try {
    storage?.removeItem(TRANSCRIPT_HANDOFF_KEY);
  } catch {
    // A value we cannot remove could not be read either.
  }
}

/**
 * Reads the handoff and removes it, whatever it holds: a valid value is
 * consumed once, and an expired or malformed one is not left behind.
 */
export function consumeTranscriptHandoff(
  storage: HandoffStorage | null | undefined,
  now: number = Date.now(),
): TranscriptHandoff | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(TRANSCRIPT_HANDOFF_KEY);
  } catch {
    raw = null;
  }
  try {
    storage.removeItem(TRANSCRIPT_HANDOFF_KEY);
  } catch {
    // A value we cannot remove could not be read either.
  }
  return parseTranscriptHandoff(raw, now);
}
