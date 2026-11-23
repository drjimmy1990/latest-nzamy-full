"use client";

/**
 * ListenButton — «استمع للإجابة» (owner Q182, batch l13): reads an answer
 * aloud with the browser's own speech synthesis. FREE: no run, no points, no
 * server call but the voice setting (GET /api/v1/ai/listen-voice, read once
 * per page). Drawn only where the browser can speak.
 *
 * The voice: the admin's choice (platform_settings listen_voice) when this
 * browser has it, else the first ar-SA voice, else any Arabic voice
 * (src/lib/ai/listenVoice.ts). The text is read as a lawyer reads it
 * (arabicLegalTtsNormalizer) in short pieces. One answer speaks at a time:
 * starting another stops the first; leaving the page stops it too.
 */
import { useEffect, useRef, useState } from "react";
import { SpeakerHigh, StopCircle } from "@phosphor-icons/react";
import { LISTEN_COPY, parseListenVoice, pickVoice, speechChunks } from "@/lib/ai/listenVoice";

let voiceSetting: Promise<string> | null = null;
/** The admin's voice name, read once per page; any failure → "" (the default rule). */
function readVoiceSetting(): Promise<string> {
  voiceSetting ??= fetch("/api/v1/ai/listen-voice")
    .then((r) => (r.ok ? r.json() : null))
    .then((j: unknown) => parseListenVoice(j))
    .catch(() => "");
  return voiceSetting;
}

/** The browser's voices; the list is often empty until `voiceschanged` fires (at most 1.5 s). */
function loadVoices(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const now = synth.getVoices();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener("voiceschanged", done);
      window.clearTimeout(timer);
      resolve(synth.getVoices());
    };
    const timer = window.setTimeout(done, 1500);
    synth.addEventListener("voiceschanged", done);
  });
}

/** The button now speaking: another one that starts stops it first. */
let owner: { reset: () => void } | null = null;

export default function ListenButton({ text, isDark = false, className = "" }: { text: string; isDark?: boolean; className?: string }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [failed, setFailed] = useState(false);
  const me = useRef<{ reset: () => void }>({ reset: () => setSpeaking(false) });
  const gen = useRef(0);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function");
  }, []);

  // Leaving the page (or the answer going away) stops this button's reading.
  useEffect(() => {
    const stopOwned = () => {
      if (owner === me.current) {
        owner = null;
        try {
          window.speechSynthesis.cancel();
        } catch {
          /* nothing to stop */
        }
      }
    };
    return () => { gen.current += 1; stopOwned(); };
  }, []);

  function stop() {
    gen.current += 1;
    if (owner === me.current) owner = null;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* nothing to stop */
    }
    setSpeaking(false);
  }

  async function start() {
    const synth = window.speechSynthesis;
    const chunks = speechChunks(text);
    if (chunks.length === 0) return;
    owner?.reset();
    synth.cancel();
    owner = me.current;
    const mine = ++gen.current;
    setFailed(false);
    setSpeaking(true);
    try {
      const [voices, wanted] = await Promise.all([loadVoices(synth), readVoiceSetting()]);
      if (gen.current !== mine) return;
      const voice = pickVoice(voices, wanted);
      chunks.forEach((piece, i) => {
        const u = new SpeechSynthesisUtterance(piece);
        u.lang = voice?.lang ?? "ar-SA";
        if (voice) u.voice = voice;
        if (i === chunks.length - 1) {
          u.onend = () => {
            if (gen.current === mine) {
              if (owner === me.current) owner = null;
              setSpeaking(false);
            }
          };
        }
        u.onerror = (e) => {
          // "interrupted" / "canceled": stopped on purpose (stop, another answer).
          if (gen.current !== mine || e.error === "interrupted" || e.error === "canceled") return;
          if (owner === me.current) owner = null;
          setSpeaking(false);
          setFailed(true);
        };
        synth.speak(u);
      });
    } catch {
      if (gen.current === mine) {
        setSpeaking(false);
        setFailed(true);
      }
    }
  }

  if (!supported || !text.trim()) return null;

  const btn = `inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition-transform motion-safe:active:scale-[0.96] ${
    isDark ? "border-white/10 text-zinc-300 hover:text-white hover:border-[#C8A762]/40" : "border-slate-200 text-slate-600 hover:text-[#0B3D2E] hover:border-[#0B3D2E]/40"
  } ${className}`;

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={() => (speaking ? stop() : void start())} className={btn} aria-pressed={speaking}>
        {speaking ? <StopCircle size={13} weight="bold" /> : <SpeakerHigh size={13} />}
        {speaking ? LISTEN_COPY.stop : LISTEN_COPY.listen}
      </button>
      {failed && (
        <span role="status" className="text-[11px] text-red-600 dark:text-red-400">
          {LISTEN_COPY.failed}
        </span>
      )}
    </span>
  );
}
