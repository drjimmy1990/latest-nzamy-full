"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { apiGet, isSupabaseMode } from "@/lib/services/api";

/** Where a lawyer who was never asked «محامٍ مترافع أم مستشار قانوني؟» goes. */
export const PRACTICE_KIND_PAGE = "/onboarding/practice-kind";

/**
 * R9 (owner TODO 17 Nov 2026): a lawyer who reached `lawyer` through the
 * Google claim before R9 has never said whether he is an advocate or a
 * consultant (Art. 18). Before the lawyer dashboard is usable he is sent to
 * /onboarding/practice-kind once; after answering, GET says needsChoice:false
 * and this renders nothing. Fails open: a failed read never blocks the
 * dashboard (the route answers needsChoice:false when it cannot tell).
 */
export default function PracticeKindGate() {
  const router = useRouter();
  const { userType, loading } = useUser();

  useEffect(() => {
    if (!isSupabaseMode || loading || userType !== "lawyer") return;
    let cancelled = false;
    apiGet<{ needsChoice?: boolean }>("/api/v1/onboarding/practice-kind")
      .then((r) => {
        if (!cancelled && r?.needsChoice === true) router.replace(PRACTICE_KIND_PAGE);
      })
      .catch(() => {
        /* fail open */
      });
    return () => {
      cancelled = true;
    };
  }, [loading, userType, router]);

  return null;
}
