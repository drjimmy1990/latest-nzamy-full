"use client";

import { useEffect, useState } from "react";
import { readToolUsable } from "@/lib/ai/toolStatusClient";

/**
 * useLiveTools — which of these AI registry tools may the signed-in user run
 * now? For the sidebar's «قريباً» badges (BUG-12): a row whose tool is open for
 * this user drops the badge.
 *
 * The answer is the run path's own (GET /api/v1/ai/tool-status: the admin's
 * mode and the caller's role, one boolean per tool, for the caller only — a
 * visitor gets 401 and learns nothing). Only a confirmed `usable: true` counts;
 * loading, a refusal or a failed read keeps «قريباً».
 *
 * The endpoint is rate-limited per IP and a tool page reads it too, so the
 * sidebar asks at most once per tool every few minutes per tab (a module
 * cache shared by every mount), and only for the few rows that carry a
 * `liveToolId`.
 */

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; answer: Promise<boolean> }>();

function usableCached(tool: string): Promise<boolean> {
  const hit = cache.get(tool);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.answer;
  const answer = readToolUsable(tool);
  cache.set(tool, { at: Date.now(), answer });
  return answer;
}

const NONE: ReadonlySet<string> = new Set();

export function useLiveTools(toolIds: readonly string[], enabled: boolean): ReadonlySet<string> {
  const key = enabled ? toolIds.join(",") : "";
  const [live, setLive] = useState<{ key: string; tools: ReadonlySet<string> }>({ key: "", tools: NONE });

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const ids = key.split(",");
    void Promise.all(ids.map((id) => usableCached(id).then((ok) => (ok ? id : null)))).then((answers) => {
      if (!alive) return;
      setLive({ key, tools: new Set(answers.filter((id): id is string => id !== null)) });
    });
    return () => {
      alive = false;
    };
  }, [key]);

  // An answer for another set of tools (or another session state) is not this one's.
  return live.key === key ? live.tools : NONE;
}
