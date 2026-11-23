"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, EnvelopeSimple, Info } from "@phosphor-icons/react";
import type { FounderInvitesView } from "@/lib/founder/founderInvites";

/**
 * «دعواتي الشهرية» inside «عضويتي المؤسسة» (owner Q144 أ, batch l13).
 *
 * GET /api/v1/membership/founder/invites: a non-founder or a failed read
 * renders nothing; the migration not run yet → «قيد التفعيل»; payment off for
 * this account → the honest line «تعمل بعد تفعيل الدفع الإلكتروني» and no
 * button («لا تعمل الدعوات إلا بعد تفعيل الدفع»). Otherwise this month's
 * allowance, what the invitee gets, a «أنشئ دعوة» button and the invites
 * (link to copy, status, last day). Every number comes from the server.
 */

type Reply =
  | { founder: false }
  | { founder: true; ready: false; message: string; gift?: string }
  | { founder: true; ready: true; gatewayOn: boolean; message: string | null; view: FounderInvitesView };

export default function FounderInvitesCard({ isDark }: { isDark: boolean }) {
  const [reply, setReply] = useState<Reply | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/v1/membership/founder/invites", { cache: "no-store", signal });
      if (!res.ok) return setReply(null);
      setReply((await res.json()) as Reply);
    } catch {
      if (!signal?.aborted) setReply(null);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function create() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/v1/membership/founder/invites", { method: "POST" });
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      if (res.ok) setNote({ ok: true, text: "أُنشئت الدعوة. انسخ رابطها وأرسله لزميلك." });
      else setNote({ ok: false, text: typeof body?.error === "string" && body.error ? body.error : "تعذّر إنشاء الدعوة الآن." });
      await load();
    } catch {
      setNote({ ok: false, text: "تعذّر إنشاء الدعوة الآن." });
    } finally {
      setBusy(false);
    }
  }

  async function copy(path: string) {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(path);
    } catch {
      setCopied(null);
      window.prompt("انسخ رابط الدعوة:", url);
    }
  }

  if (!reply || reply.founder === false) return null;

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const body = isDark ? "text-zinc-300" : "text-slate-600";
  const notice = isDark ? "bg-amber-900/20 text-amber-300" : "bg-amber-50 text-amber-800";

  return (
    <div className={`mt-4 border-t pt-4 ${isDark ? "border-zinc-800" : "border-slate-100"}`}>
      <h3 className={`mb-2 flex items-center gap-2 text-[13px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
        <EnvelopeSimple size={15} weight="fill" className="text-[#C8A762]" aria-hidden />
        دعواتي الشهرية
      </h3>

      {!reply.ready || !reply.gatewayOn ? (
        <p className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-semibold leading-relaxed ${notice}`}>
          <Info size={15} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          {reply.message}
        </p>
      ) : (
        <>
          <p className={`text-[13px] leading-relaxed ${body}`}>
            يحصل زميلك الجديد على: {reply.view.gift}. {reply.view.remainingAr}
          </p>
          <button
            type="button"
            onClick={create}
            disabled={busy || reply.view.remaining === 0}
            className="mt-3 rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-bold text-white disabled:opacity-50 dark:bg-[#C8A762] dark:text-[#0B3D2E]"
          >
            {busy ? "جارٍ الإنشاء…" : "أنشئ دعوة"}
          </button>
          {note && (
            <p role="status" className={`mt-2 text-xs font-semibold ${note.ok ? (isDark ? "text-emerald-300" : "text-emerald-700") : isDark ? "text-amber-300" : "text-amber-800"}`}>
              {note.text}
            </p>
          )}
          {reply.view.items.length > 0 && (
            <ul className="mt-3 space-y-2">
              {reply.view.items.map((item) => (
                <li
                  key={item.code}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 text-xs ${isDark ? "border-zinc-800" : "border-slate-100"}`}
                >
                  <span dir="ltr" className={`font-mono font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                    {item.display}
                  </span>
                  <span className={muted}>{item.statusAr}</span>
                  {item.status === "open" && (
                    <>
                      <span className={muted}>صالحة حتى {item.expiresOn}</span>
                      <button
                        type="button"
                        onClick={() => copy(item.linkPath)}
                        className="ms-auto flex items-center gap-1 font-bold text-[#C8A762] hover:underline"
                      >
                        <Copy size={12} aria-hidden />
                        {copied === item.linkPath ? "نُسخ الرابط" : "انسخ الرابط"}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
