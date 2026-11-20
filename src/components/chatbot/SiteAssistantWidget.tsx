"use client";

/**
 * SiteAssistantWidget — «مساعد نظامي», the site help window (O20 / A21, batch
 * l11-misc; owner register 14 items 21 + 26).
 *
 * A button at the bottom corner opposite the WhatsApp button opens a small
 * chat window. Answers come from POST /api/v1/chatbot (a deterministic
 * answerer over the price book, the visitor's offers and the payment switch —
 * src/lib/siteAssistant/answer.ts); nothing is stored. The button is drawn
 * only when the admin switch is on (GET /api/v1/chatbot) and never on the
 * pages siteAssistantHiddenOn() lists (sign-up, payment, dashboards, readers).
 *
 * Replies are rendered as TEXT (never HTML); links are same-site paths only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChatCircleText, PaperPlaneRight, X } from "@phosphor-icons/react";
import { siteAssistantHiddenOn } from "@/lib/siteAssistant/visibility";

const NAME_AR = "مساعد نظامي";
const MAX_LEN = 400;
const ENABLED_CACHE_KEY = "nzamy:site-assistant:enabled";
const ENABLED_CACHE_MS = 5 * 60_000;
const FIRST_SUGGESTIONS = ["ما هي باقات نظامي وأسعارها؟", "كم سعر اشتراك المكتبة القانونية؟", "كيف أنشئ حساباً؟"];

interface Link_ {
  label: string;
  href: string;
}

type Msg =
  | { id: number; from: "user"; text: string }
  | { id: number; from: "bot"; text: string; links: Link_[]; suggestions: string[] };

const isSafeHref = (href: unknown): href is string => typeof href === "string" && /^\/(?![/\\])[^\s<>"']*$/.test(href);

function readEnabledCache(): boolean | null {
  try {
    const raw = window.sessionStorage.getItem(ENABLED_CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { enabled?: unknown; at?: unknown };
    if (typeof v.enabled !== "boolean" || typeof v.at !== "number" || Date.now() - v.at > ENABLED_CACHE_MS) return null;
    return v.enabled;
  } catch {
    return null;
  }
}

function writeEnabledCache(enabled: boolean): void {
  try {
    window.sessionStorage.setItem(ENABLED_CACHE_KEY, JSON.stringify({ enabled, at: Date.now() }));
  } catch {
    /* storage unavailable: ask again next page */
  }
}

export default function SiteAssistantWidget() {
  const pathname = usePathname();
  const hidden = siteAssistantHiddenOn(pathname);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ask once per page view (cached for five minutes in this tab) whether the admin switch is on.
  useEffect(() => {
    if (hidden) return;
    const cached = readEnabledCache();
    if (cached !== null) {
      setEnabled(cached);
      return;
    }
    let cancelled = false;
    fetch("/api/v1/chatbot")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { enabled?: unknown } | null) => {
        const on = body?.enabled === true;
        writeEnabledCache(on);
        if (!cancelled) setEnabled(on);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hidden]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, sending]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim().slice(0, MAX_LEN);
      if (!message || sending) return;
      setError(null);
      setDraft("");
      setMessages((m) => [...m, { id: nextId.current++, from: "user", text: message }]);
      setSending(true);
      try {
        const res = await fetch("/api/v1/chatbot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        const body = (await res.json().catch(() => null)) as {
          reply?: { text?: unknown; links?: unknown; suggestions?: unknown };
          error?: string;
          disabled?: boolean;
        } | null;
        if (!res.ok || !body?.reply || typeof body.reply.text !== "string") {
          if (body?.disabled) {
            writeEnabledCache(false);
            setEnabled(false);
          }
          setError(body?.error ?? "تعذّر الرد الآن — حاول بعد قليل.");
          return;
        }
        const links = Array.isArray(body.reply.links)
          ? (body.reply.links as unknown[]).filter(
              (l): l is Link_ => !!l && typeof (l as Link_).label === "string" && isSafeHref((l as Link_).href),
            )
          : [];
        const suggestions = Array.isArray(body.reply.suggestions)
          ? (body.reply.suggestions as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 5)
          : [];
        setMessages((m) => [...m, { id: nextId.current++, from: "bot", text: body.reply!.text as string, links, suggestions }]);
      } catch {
        setError("تعذّر الاتصال الآن — تحقّق من الاتصال وحاول مجدداً.");
      } finally {
        setSending(false);
      }
    },
    [sending],
  );

  if (hidden || !enabled) return null;

  const lastBot = [...messages].reverse().find((m): m is Extract<Msg, { from: "bot" }> => m.from === "bot");
  const chips = messages.length === 0 ? FIRST_SUGGESTIONS : lastBot?.suggestions ?? [];

  return (
    // No dir here: the button's `start` side follows the page direction, so it
    // always sits opposite the WhatsApp button (FloatingButtons: left in Arabic).
    <div data-site-assistant className="print:hidden">
      {open && (
        <div
          dir="rtl"
          role="dialog"
          aria-label={NAME_AR}
          className="fixed z-40 start-4 sm:start-6 w-[min(92vw,370px)] max-h-[min(70dvh,560px)] flex flex-col rounded-2xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100"
          style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-white/10">
            <div className="min-w-0">
              <p className="font-bold text-[15px]">{NAME_AR}</p>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">أسئلة عن المنصة وباقاتها وأسعارها. لا يقدّم استشارات قانونية.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="إغلاق"
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5"
            >
              <X size={16} weight="bold" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-[13px] leading-relaxed" aria-live="polite">
            {messages.length === 0 && (
              <p className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-white/5">
                أهلاً بك، أنا {NAME_AR}. اسألني عن خدمات المنصة وباقاتها وأسعارها وعروضها وطريقة التسجيل والمكتبة القانونية.
              </p>
            )}
            {messages.map((m) =>
              m.from === "user" ? (
                <p key={m.id} className="ms-8 rounded-xl bg-[#0B3D2E] px-3 py-2 text-white whitespace-pre-line break-words">
                  {m.text}
                </p>
              ) : (
                <div key={m.id} className="me-4 rounded-xl bg-zinc-100 px-3 py-2 dark:bg-white/5">
                  <p className="whitespace-pre-line break-words">{m.text}</p>
                  {m.links.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.links.map((l) => (
                        <Link
                          key={l.href}
                          href={l.href}
                          onClick={() => setOpen(false)}
                          className="rounded-lg border border-[#C8A762]/50 px-2.5 py-1 text-[12px] font-bold text-[#0B3D2E] hover:bg-[#C8A762]/10 dark:text-[#C8A762]"
                        >
                          {l.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
            {sending && <p className="text-[12px] text-zinc-500 dark:text-zinc-400">يكتب الرد…</p>}
            {error && (
              <p role="alert" className="text-[12px] text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-zinc-200 px-3 pt-2 dark:border-white/10">
              {chips.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={sending}
                  onClick={() => void send(s)}
                  className="rounded-full border border-zinc-300 px-2.5 py-1 text-[11.5px] text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            className="flex items-center gap-2 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
              maxLength={MAX_LEN}
              placeholder="اكتب سؤالك عن المنصة…"
              aria-label="سؤالك"
              className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[13px] outline-none focus:border-[#0B3D2E] dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <button
              type="submit"
              disabled={sending || draft.trim().length === 0}
              aria-label="إرسال"
              className="rounded-xl bg-[#0B3D2E] p-2.5 text-white disabled:opacity-50"
            >
              <PaperPlaneRight size={16} weight="fill" className="rtl:-scale-x-100" />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? `إغلاق ${NAME_AR}` : NAME_AR}
        title={NAME_AR}
        className="fixed z-40 start-4 sm:start-6 flex h-12 items-center gap-2 rounded-full bg-[#0B3D2E] px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(11,61,46,0.3)] transition hover:bg-[#0a3328] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762] focus-visible:ring-offset-2"
        style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {open ? <X size={20} weight="bold" /> : <ChatCircleText size={22} weight="fill" />}
        <span className="hidden sm:inline">{NAME_AR}</span>
      </button>
    </div>
  );
}
