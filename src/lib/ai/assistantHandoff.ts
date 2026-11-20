/**
 * assistantHandoff.ts — T17a (batch l11): «إرسال مع السياق إلى ▾ المساعد
 * المتقدم» on an AI result (/ai/analyze). The result goes to the assistant's
 * message box as a one-shot sessionStorage value (this tab only, removed when
 * read, 30 minutes at most), the same rules as transcriptHandoff.ts. The
 * assistant page only PREFILLS its box with it: nothing is sent, and nothing
 * is charged, until the lawyer presses send himself.
 *
 * Pure: `node --test` runs assistantHandoff.test.ts with a fake storage.
 */
import type { HandoffStorage } from "./transcriptHandoff.ts";

export const ASSISTANT_HANDOFF_KEY = "nzamy.assistantHandoff";
export const ASSISTANT_HANDOFF_TTL_MS = 30 * 60 * 1000;
/** Room left in the 4,000-character message for the lawyer's own question. */
export const ASSISTANT_HANDOFF_MAX_CHARS = 3200;

export interface AssistantHandoff {
  text: string;
  sourceLabel: string;
  truncated: boolean;
}

export function writeAssistantHandoff(
  storage: HandoffStorage | null | undefined,
  text: string | null | undefined,
  sourceLabel: string,
  now: number = Date.now(),
): boolean {
  const full = typeof text === "string" ? text.trim() : "";
  if (!full || !storage) return false;
  const truncated = full.length > ASSISTANT_HANDOFF_MAX_CHARS;
  try {
    storage.setItem(
      ASSISTANT_HANDOFF_KEY,
      JSON.stringify({ text: truncated ? full.slice(0, ASSISTANT_HANDOFF_MAX_CHARS) : full, sourceLabel: sourceLabel.slice(0, 80), truncated, createdAt: now }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Reads the handoff and removes it, whatever it holds. */
export function consumeAssistantHandoff(storage: HandoffStorage | null | undefined, now: number = Date.now()): AssistantHandoff | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(ASSISTANT_HANDOFF_KEY);
    storage.removeItem(ASSISTANT_HANDOFF_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (typeof v.text !== "string" || !v.text.trim()) return null;
    if (typeof v.createdAt !== "number" || now < v.createdAt || now - v.createdAt > ASSISTANT_HANDOFF_TTL_MS) return null;
    return {
      text: v.text.slice(0, ASSISTANT_HANDOFF_MAX_CHARS),
      sourceLabel: typeof v.sourceLabel === "string" ? v.sourceLabel.slice(0, 80) : "",
      truncated: v.truncated === true,
    };
  } catch {
    return null;
  }
}

/** The message box text: the result as quoted context, then room for the question. */
export function assistantPrefill(h: AssistantHandoff): string {
  return `السياق (من ${h.sourceLabel || "أداة أخرى"}):\n${h.text}\n\nسؤالي: `;
}
