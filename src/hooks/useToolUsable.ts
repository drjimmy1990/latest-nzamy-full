"use client";

import { useEffect, useState } from "react";
import { readToolUsable } from "@/lib/ai/toolStatusClient";

/**
 * useToolUsable — may the signed-in user run this tool now? null until the server
 * answers, so a page shows no price and no form while it does not know.
 */
export function useToolUsable(tool: string): boolean | null {
  const [usable, setUsable] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    void readToolUsable(tool).then((answer) => {
      if (live) setUsable(answer);
    });
    return () => {
      live = false;
    };
  }, [tool]);

  return usable;
}
