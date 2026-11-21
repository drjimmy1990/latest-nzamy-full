/**
 * summaryReviewServer.ts — the read behind Q96 (./summaryReview.ts):
 * platform_settings 'library_summaries_reviewed_only'. Memoised 30 seconds
 * per process (the /laws list and search are hot paths); a missing row, a
 * failed read or a missing env reads the default (ON). Never throws.
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { parseSummariesReviewedOnly, SUMMARIES_REVIEWED_ONLY_DEFAULT, SUMMARIES_REVIEWED_ONLY_KEY } from "./summaryReview";

const TTL_MS = 30 * 1000;
let cached: { value: boolean; expiresAt: number } | null = null;

export async function readSummariesReviewedOnly(): Promise<boolean> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  let value = SUMMARIES_REVIEWED_ONLY_DEFAULT;
  try {
    const service = await createServiceClient();
    const { data, error } = await service
      .from("platform_settings")
      .select("value")
      .eq("key", SUMMARIES_REVIEWED_ONLY_KEY)
      .maybeSingle();
    if (error) console.error("[library summaries] setting read failed:", error.code);
    else value = parseSummariesReviewedOnly((data as { value?: unknown } | null)?.value);
  } catch (err) {
    console.error("[library summaries] setting read threw:", err instanceof Error ? err.name : "error");
  }
  cached = { value, expiresAt: now + TTL_MS };
  return value;
}
