import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { readVatRegistered } from "@/lib/payments/vatStatus";

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
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let vatRegistered = false;
  try {
    vatRegistered = (await readVatRegistered(await createServiceClient())) === true;
  } catch {
    vatRegistered = false;
  }
  return NextResponse.json({ vatRegistered }, { status: 200, headers: { "Cache-Control": "private, no-store" } });
}
