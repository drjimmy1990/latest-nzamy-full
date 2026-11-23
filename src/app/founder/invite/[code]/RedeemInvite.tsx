"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * «فعّل الدعوة» on /founder/invite/[code] (owner Q144 أ, batch l13): one POST
 * to /api/v1/membership/founder/invites/redeem; the server's Arabic answer is
 * shown as it comes (success, or why not). No result is made up here.
 */
export default function RedeemInvite({ code }: { code: string }) {
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ ok: boolean; text: string } | null>(null);

  async function redeem() {
    setBusy(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/v1/membership/founder/invites/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await res.json().catch(() => null)) as { message?: unknown; error?: unknown } | null;
      if (res.ok && typeof body?.message === "string") setAnswer({ ok: true, text: body.message });
      else setAnswer({ ok: false, text: typeof body?.error === "string" && body.error ? body.error : "تعذّر تفعيل الدعوة الآن — حاول بعد قليل." });
    } catch {
      setAnswer({ ok: false, text: "تعذّر تفعيل الدعوة الآن — حاول بعد قليل." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {!answer?.ok && (
        <button
          type="button"
          onClick={redeem}
          disabled={busy}
          className="rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 dark:bg-[#C8A762] dark:text-[#0B3D2E]"
        >
          {busy ? "جارٍ التفعيل…" : "فعّل الدعوة"}
        </button>
      )}
      {answer && (
        <p
          role="status"
          className={`rounded-xl px-3 py-2 text-sm font-semibold leading-relaxed ${
            answer.ok
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
              : "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
          }`}
        >
          {answer.text}
        </p>
      )}
      {answer?.ok && (
        <Link href="/laws/my" className="inline-block text-sm font-bold text-[#0B3D2E] underline dark:text-[#E6CD8E]">
          افتح «مكتبتي»
        </Link>
      )}
    </div>
  );
}
