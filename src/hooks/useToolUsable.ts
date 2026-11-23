"use client";

import { useEffect, useState } from "react";
import { readToolUsable } from "@/lib/ai/toolStatusClient";
import { useAdminToolsView } from "@/hooks/useAdminToolsView";

/**
 * useToolUsable — may the signed-in user run this tool now? null until the server
 * answers, so a page shows no price and no form while it does not know.
 *
 * N2 (owner F02 §5 #63, batch l12): a platform admin sees every tool's screen
 * open, a switched-off one included, so for him the answer is always yes.
 * Owner ١٥٦ (أ), batch l13: the server agrees — the admin really runs every
 * tool, in any mode, exempt from the charge and logged
 * (aiToolsConfig.toolAvailability). The /ai layout tells him so (AdminToolsNotice).
 */
export function useToolUsable(tool: string): boolean | null {
  const [usable, setUsable] = useState<boolean | null>(null);
  // An admin previewing a role's limits, or in another account type's dashboard, gets the real answer.
  const admin = useAdminToolsView().showAll;

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
