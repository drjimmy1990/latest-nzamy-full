"use client";

import { useEffect, useState } from "react";
import { readToolUsable } from "@/lib/ai/toolStatusClient";
import { useUser } from "@/hooks/useUser";
import { adminSeesTool } from "@/lib/ai/adminAiTools";

/**
 * useToolUsable — may the signed-in user run this tool now? null until the server
 * answers, so a page shows no price and no form while it does not know.
 *
 * N2 (owner F02 §5 #63, batch l12): a platform admin sees every tool's screen
 * open, a switched-off one included, so for him the answer is the SCREEN's
 * (always yes) while the server's own answer still decides every run — a tool
 * in mode "off" refuses him with 423 before any charge, and only a tool
 * switched on for staff (or live) spends AI cost (aiToolsConfig.toolAvailability).
 * The /ai layout tells him so (AdminToolsNotice).
 */
export function useToolUsable(tool: string): boolean | null {
  const [usable, setUsable] = useState<boolean | null>(null);
  const user = useUser();
  const admin = adminSeesTool(user.loading, user.userType);

  useEffect(() => {
    if (admin) return;
    let live = true;
    void readToolUsable(tool).then((answer) => {
      if (live) setUsable(answer);
    });
    return () => {
      live = false;
    };
  }, [tool, admin]);

  return admin ? true : usable;
}
