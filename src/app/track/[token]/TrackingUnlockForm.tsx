"use client";

/**
 * TrackingUnlockForm — the 4-digit check in front of the client's case
 * tracking page (D2, owner ٢٧٦). Posts to /api/v1/track/<token>/unlock; on
 * success the server sets an httpOnly cookie for this link only and the page
 * reloads into the case. The digits are compared on the server, inside the
 * database; nothing about the phone ever reaches this component.
 */

import { useState } from "react";
import { normalizeUnlockDigits } from "@/lib/tracking/trackingLinkState";

export default function TrackingUnlockForm({ token }: { token: string }) {
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = normalizeUnlockDigits(digits);
    if (!clean) {
      setError("أدخل أربعة أرقام.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/track/${encodeURIComponent(token)}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        credentials: "same-origin",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        body: JSON.stringify({ digits: clean }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "تعذّر التحقق الآن. حاول بعد قليل.");
      setDigits("");
    } catch {
      setError("تعذّر الاتصال. تحقق من الإنترنت وحاول مجدداً.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5" noValidate>
      <label htmlFor="track-digits" className="block text-sm font-bold text-slate-800 dark:text-white">
        آخر ٤ أرقام من رقم جوالك
      </label>
      <p className="mt-1 text-xs text-slate-600 dark:text-zinc-300">الرقم المسجّل في ملف قضيتك لدى محاميك.</p>
      <input
        id="track-digits"
        inputMode="numeric"
        autoComplete="off"
        maxLength={8}
        dir="ltr"
        value={digits}
        onChange={(e) => setDigits(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "track-digits-error" : undefined}
        className="mt-3 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762] dark:border-white/[0.12] dark:bg-zinc-950 dark:text-white"
        placeholder="••••"
      />
      {error && (
        <p id="track-digits-error" role="alert" className="mt-2 text-sm font-semibold text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="mt-4 block w-full rounded-2xl bg-[#0B3D2E] px-4 py-3 text-center text-sm font-bold text-white hover:bg-[#092e22] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762] dark:bg-[#C8A762] dark:text-[#0B3D2E] dark:hover:bg-[#d4b676]"
      >
        {busy ? "جارٍ التحقق…" : "عرض القضية"}
      </button>
    </form>
  );
}
