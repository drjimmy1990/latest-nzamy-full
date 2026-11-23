/**
 * listenVoice.ts — «استمع للإجابة» (owner Q182, batch l13): an answer read
 * aloud by the BROWSER's own speech synthesis, free (no points, no server
 * call beyond the one setting read). On the researcher's answers and on the
 * legal answers of «مساعد نظامي» (the floating window).
 *
 * The voice is an admin setting because the owner has not chosen among his
 * three yet: platform_settings 'listen_voice' = {"voice": "<voice name>"}.
 * "" (the default) = the browser's first ar-SA voice. A name the visitor's
 * browser does not have falls back the same way: the first ar-SA voice, then
 * any Arabic voice, then the browser's default voice told the text is ar-SA.
 *
 * The text read is the answer as a lawyer would say it
 * (arabicLegalTtsNormalizer: «م/77» → «المادة السابعة والسبعين», Hijri dates
 * in words, source markers and Markdown dropped), cut into short pieces
 * because some browsers stop a long utterance part-way.
 *
 * Pure (relative imports only), so `node --test` runs it.
 */
import { normalizeLegalTextForSpeech } from "./arabicLegalTtsNormalizer.ts";

export const LISTEN_VOICE_SETTING = "listen_voice";
/** The stored default: no name = the browser's first ar-SA voice. */
export const LISTEN_VOICE_DEFAULT = "";
export const LISTEN_VOICE_NAME_MAX = 120;
/** The longest piece handed to one utterance. */
export const SPEECH_CHUNK_MAX = 220;

export const LISTEN_COPY = {
  listen: "استمع للإجابة",
  stop: "إيقاف الاستماع",
  failed: "تعذّر تشغيل القراءة الصوتية في هذا المتصفح.",
} as const;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** The stored setting → the voice name ("" = the default rule). Anything malformed → "". */
export function parseListenVoice(value: unknown): string {
  const v = value && typeof value === "object" && !Array.isArray(value) ? (value as { voice?: unknown }).voice : undefined;
  if (typeof v !== "string") return LISTEN_VOICE_DEFAULT;
  const name = v.trim();
  return name.length <= LISTEN_VOICE_NAME_MAX && !CONTROL.test(name) ? name : LISTEN_VOICE_DEFAULT;
}

/** The admin settings validator: exactly {"voice": "<name, at most 120 characters>"} ("" allowed). */
export function listenVoiceSettingIssue(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 'قيمة listen_voice يجب أن تكون كائناً بالشكل {"voice":""}';
  }
  const keys = Object.keys(value as Record<string, unknown>);
  const v = (value as { voice?: unknown }).voice;
  if (keys.length !== 1 || keys[0] !== "voice" || typeof v !== "string") {
    return 'قيمة listen_voice يجب أن تكون {"voice": "اسم الصوت"} — والقيمة الفارغة تعني أول صوت عربي سعودي في المتصفح';
  }
  if (v.trim().length > LISTEN_VOICE_NAME_MAX || CONTROL.test(v)) {
    return `اسم الصوت أطول من ${LISTEN_VOICE_NAME_MAX} حرفاً أو فيه رموز غير مقبولة`;
  }
  return null;
}

export interface VoiceLike {
  readonly name: string;
  readonly lang: string;
}

const langOf = (v: VoiceLike) => String(v.lang ?? "").replace(/_/g, "-").toLowerCase();

/**
 * The voice to read with: the admin's named voice when this browser has it,
 * else the first ar-SA voice, else the first Arabic voice, else null (the
 * browser's default voice, with the utterance's lang set to ar-SA).
 */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], wanted: string): T | null {
  const list = Array.isArray(voices) ? voices : [];
  const name = typeof wanted === "string" ? wanted.trim() : "";
  if (name) {
    const exact = list.find((v) => v.name === name) ?? list.find((v) => v.name.toLowerCase() === name.toLowerCase());
    if (exact) return exact;
  }
  return list.find((v) => langOf(v) === "ar-sa") ?? list.find((v) => langOf(v) === "ar" || langOf(v).startsWith("ar-")) ?? null;
}

/** The Arabic voices of a voice list (the admin's choice list), ar-SA first, names unique. */
export function arabicVoices<T extends VoiceLike>(voices: readonly T[]): T[] {
  const seen = new Set<string>();
  const ar = (Array.isArray(voices) ? voices : []).filter((v) => {
    const l = langOf(v);
    if (!(l === "ar" || l.startsWith("ar-")) || seen.has(v.name)) return false;
    seen.add(v.name);
    return true;
  });
  return [...ar.filter((v) => langOf(v) === "ar-sa"), ...ar.filter((v) => langOf(v) !== "ar-sa")];
}

/** Splits a run of text longer than `max` at the last comma or space before it. */
function splitLong(sentence: string, max: number): string[] {
  const out: string[] = [];
  let rest = sentence.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = Math.max(window.lastIndexOf("،"), window.lastIndexOf(","), window.lastIndexOf("؛"));
    if (cut < max / 3) cut = window.lastIndexOf(" ");
    if (cut < 1) cut = max;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * The answer as the pieces to speak, in order: read as a lawyer reads it
 * (normalizeLegalTextForSpeech), split at sentence ends and line breaks,
 * joined back up to `max` characters a piece. Empty text → [].
 */
export function speechChunks(text: string, max: number = SPEECH_CHUNK_MAX): string[] {
  const spoken = normalizeLegalTextForSpeech(typeof text === "string" ? text : "");
  const sentences = spoken
    .split(/(?<=[.!?؟؛])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap((s) => splitLong(s, max));
  const chunks: string[] = [];
  for (const s of sentences) {
    const last = chunks[chunks.length - 1];
    if (last !== undefined && last.length + 1 + s.length <= max) chunks[chunks.length - 1] = `${last} ${s}`;
    else chunks.push(s);
  }
  return chunks;
}
