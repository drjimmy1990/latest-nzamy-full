"use client";

/**
 * LibraryPointsLowNotice — owner 06 ج6 + ٩٣ (batch l12): the warning BEFORE
 * the 50-point lock. Shown above the library assistant's box when GET
 * /api/v1/library/status says `pointsLow`: this subscriber is gated, still
 * open, and one question at the assistant's price would take his balance
 * below the minimum (src/lib/library/pointsGate.ts). Every number in the
 * sentence is the server's. It refuses nothing: the question still runs.
 *
 * `refreshKey`: the screen passes something that changes after each answer
 * (the number of turns), so the warning follows the balance. A failed read
 * shows nothing — never a guessed balance.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";

interface PointsLowView {
  message: string;
  topupHref: string;
}

/** The `pointsLow` field of the status answer, or null for anything else. */
export function parsePointsLow(body: unknown): PointsLowView | null {
  if (!body || typeof body !== "object") return null;
  const p = (body as { pointsLow?: unknown }).pointsLow;
  if (!p || typeof p !== "object") return null;
  const { message, topupHref, code } = p as { message?: unknown; topupHref?: unknown; code?: unknown };
  if (code !== "library_points_low" || typeof message !== "string" || !message) return null;
  const href = typeof topupHref === "string" && topupHref.startsWith("/") && !topupHref.startsWith("//") ? topupHref : "/pricing";
  return { message, topupHref: href };
}

export default function LibraryPointsLowNotice({ isDark, refreshKey = 0, className = "mb-3" }: { isDark: boolean; refreshKey?: number | string; className?: string }) {
  const [view, setView] = useState<PointsLowView | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/v1/library/status", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => { if (live) setView(parsePointsLow(j)); })
      .catch(() => { if (live) setView(null); });
    return () => { live = false; };
  }, [refreshKey]);

  if (!view) return null;
  return (
    <div
      role="status"
      dir="rtl"
      className={`${className} flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed ${
        isDark ? "border-amber-400/25 bg-amber-400/[0.06] text-amber-100" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
      <p>
        {view.message}{" "}
        <Link href={view.topupHref} className="font-bold underline underline-offset-2">
          اشحن نقاطك
        </Link>
      </p>
    </div>
  );
}
