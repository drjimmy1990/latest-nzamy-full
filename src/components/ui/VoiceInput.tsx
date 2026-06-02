"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Microphone, StopCircle, Check } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type VoiceState = "idle" | "listening" | "processing" | "done";

interface VoiceInputProps {
  /** Called with the recognised transcript text */
  onTranscript: (text: string) => void;
  /** Language for recognition — defaults to Arabic */
  lang?: string;
  /** Small compact button (for inside textareas) vs standalone */
  compact?: boolean;
  className?: string;
}

// ─── VoiceInput button ────────────────────────────────────────────────────────

export function VoiceInput({
  onTranscript,
  lang = "ar-SA",
  compact = true,
  className = "",
}: VoiceInputProps) {
  const { isDark } = useTheme();
  const [state, setState] = useState<VoiceState>("idle");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  const start = useCallback(() => {
    // Browser API — safe cast since Next.js runs SSR but this is client-only
    const SpeechRecognitionCtor =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      alert("المتصفح لا يدعم التعرف على الكلام. جرب Chrome أو Edge.");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SpeechRecognitionCtor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;

    recognition.onstart  = () => setState("listening");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      setState("processing");
      const text = e.results[0][0].transcript as string;
      onTranscript(text);
      setTimeout(() => setState("done"), 600);
      setTimeout(() => setState("idle"), 2000);
    };
    recognition.onerror  = () => setState("idle");
    recognition.onend    = () => {
      if (state === "listening") setState("idle");
    };

    recognition.start();
  }, [lang, onTranscript, state]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setState("idle");
  }, []);

  const isListening = state === "listening";

  if (compact) {
    return (
      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        onClick={isListening ? stop : start}
        title={isListening ? "إيقاف التسجيل" : "تسجيل صوتي"}
        className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold border transition-colors ${
          isListening
            ? "bg-red-500/15 border-red-500/30 text-red-500"
            : isDark
            ? "bg-white/[0.06] text-zinc-400 border-white/[0.07] hover:text-zinc-300"
            : "bg-zinc-100 text-zinc-500 border-zinc-200 hover:text-zinc-700"
        } ${className}`}
      >
        <AnimatePresence mode="wait" initial={false}>
          {state === "done" ? (
            <motion.span key="done" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <Check size={10} weight="bold" className="text-emerald-500" />
            </motion.span>
          ) : isListening ? (
            <motion.span key="stop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <StopCircle size={10} weight="fill" />
            </motion.span>
          ) : (
            <motion.span key="mic" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Microphone size={10} />
            </motion.span>
          )}
        </AnimatePresence>
        {isListening ? "جارٍ..." : state === "done" ? "تم" : "صوت"}
        {isListening && (
          <motion.span
            className="h-1.5 w-1.5 rounded-full bg-red-500"
            animate={{ opacity: [1, 0.2, 1] }}
            transition={{ repeat: Infinity, duration: 0.9 }}
          />
        )}
      </motion.button>
    );
  }

  // Standalone
  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={isListening ? stop : start}
      className={`relative flex h-12 w-12 items-center justify-center rounded-2xl transition-colors ${
        isListening
          ? "bg-red-500 text-white shadow-lg shadow-red-500/30"
          : isDark
          ? "bg-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.12]"
          : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
      } ${className}`}
    >
      {isListening && (
        <motion.span
          className="absolute inset-0 rounded-2xl border-2 border-red-500"
          animate={{ scale: [1, 1.25, 1], opacity: [0.8, 0, 0.8] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
        />
      )}
      {isListening ? <StopCircle size={20} weight="fill" /> : <Microphone size={20} />}
    </motion.button>
  );
}

// ─── VoiceTextArea — drop-in replacement for textarea + voice ─────────────────

interface VoiceTextAreaProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
  label?: string;
  hint?: string;
  lang?: string;
  className?: string;
}

export function VoiceTextArea({
  value,
  onChange,
  placeholder = "اكتب أو تحدث...",
  rows = 4,
  lang = "ar-SA",
  className = "",
}: VoiceTextAreaProps) {
  const { isDark } = useTheme();

  const handleTranscript = useCallback(
    (text: string) => onChange(value ? `${value} ${text}` : text),
    [value, onChange]
  );

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`w-full resize-none rounded-xl border p-4 pe-14 text-[13px] outline-none leading-relaxed transition-colors ${
          isDark
            ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600 focus:border-[#C8A762]/40"
            : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 focus:border-[#0B3D2E]/40"
        } ${className}`}
      />
      <div className="absolute bottom-3 start-3">
        <VoiceInput onTranscript={handleTranscript} lang={lang} compact />
      </div>
    </div>
  );
}
