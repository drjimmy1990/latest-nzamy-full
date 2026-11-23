"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { parseToolPointsAnswer, toolPointsView, type ToolPointsAnswer } from "@/lib/points/toolPointsView";
import type { PointsAvailableTool } from "@/lib/ai/pointsStanding";

/**
 * ToolPointsAvailable — «المتاح لهذه العملية: X نقطة» beside a paid AI tool's
 * price, before the run (owner ١٦٥, batch l13). X is the server's figure for
 * THIS tool (GET /api/v1/ai/points-standing → available): the points it may
 * spend now, after the wallet rule (library-assistant points count only for
 * the library assistant). Below the price it says «لا يكفي» and links to the
 * top-up. A visitor, a failed read or a malformed answer renders nothing.
 *
 * `leading` is printed before the line only when there is a line (e.g. " · "
 * inside an existing price sentence). `recheck` asks again when it changes
 * (e.g. the run's phase, so the figure follows a charge or a refund).
 */
export default function ToolPointsAvailable({ tool, price, leading = "", recheck = null, className = "" }: {
  tool: PointsAvailableTool;
  /** The price the screen shows beside it; null when the screen does not know it. */
  price: number | null;
  leading?: string;
  recheck?: unknown;
  className?: string;
}) {
  const answer = useToolPointsAnswer(tool, recheck);
  const view = toolPointsView(answer, price);
  if (!view) return null;
  const tone =
    view.tone === "short"
      ? "font-bold text-amber-700 dark:text-amber-400"
      : view.tone === "free"
        ? "text-zinc-500 dark:text-zinc-400"
        : "font-bold text-emerald-700 dark:text-emerald-400";
  return (
    <span className={className} data-testid="tool-points-available">
      {leading}
      <span className={tone}>{view.text}</span>
      {view.short && (
        <>
          {" "}
          <Link href="/pricing" className="font-bold text-[#0B3D2E] underline dark:text-[#C8A762]">
            اشحن رصيدك
          </Link>
        </>
      )}
    </span>
  );
}

function useToolPointsAnswer(tool: PointsAvailableTool, recheck: unknown): ToolPointsAnswer | null {
  const [answer, setAnswer] = useState<ToolPointsAnswer | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/ai/points-standing?tool=${encodeURIComponent(tool)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (live) setAnswer(parseToolPointsAnswer(j));
      })
      .catch(() => {
        if (live) setAnswer(null);
      });
    return () => {
      live = false;
    };
  }, [tool, recheck]);
  return answer;
}
