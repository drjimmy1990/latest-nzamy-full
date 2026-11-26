import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getMoyasarConfig } from "@/lib/access-control";
import { publicVatAnswer, readVatRegistered } from "@/lib/payments/vatStatus";

/**
 * GET /api/v1/pricing/vat → { vatRegistered: boolean } — public.
 *
 * Batch l16 (A-01, owner 25 Nov §1.1): price cards and notices show the
 * 15 % VAT line only once billing_company holds the platform's VAT number;
 * before that they say no VAT is added. Only the yes/no leaves the server —
 * never the number or any other company field. A failed read answers false
 * (no VAT line shown); checkout itself reads again and refuses (503) rather
 * than guess. `no-store`: the answer changes the moment the admin saves the
 * number, so no proxy or browser may keep it.
 * l16 review: in live mode the answer is always true (live always charges
 * VAT); a failed read outside live mode answers null — the page then shows
 * no VAT line at all rather than say «no VAT» (useVatRegistered keeps null).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let read: boolean | null = null;
  try {
    read = await readVatRegistered(await createServiceClient());
  } catch {
    read = null;
  }
  let mode: "test" | "live" | null = null;
  if (read !== true) {
    try {
      const cfg = await getMoyasarConfig();
      mode = cfg.enabled ? cfg.mode : null;
    } catch {
      mode = null;
    }
  }
  const vatRegistered = publicVatAnswer(read, mode);
  return NextResponse.json({ vatRegistered }, { status: 200, headers: { "Cache-Control": "private, no-store" } });
}
