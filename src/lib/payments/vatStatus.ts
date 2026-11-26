/**
 * vatStatus.ts — whether VAT is added today (batch l16, A-01; owner 25 Nov
 * §1.1): platform_settings.billing_company holds a valid Saudi VAT number
 * (moyasarConfig.isVatRegistered). Read with the service client the caller
 * passes.
 *
 *   readVatRegistered → true / false; a missing row is false (no number
 *   saved); a read error is null — checkout then answers 503 rather than
 *   guess a price, and a display shows no VAT line.
 *
 * Relative imports only (type-only for Supabase), so `node --test` loads it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isVatRegistered } from "./moyasarConfig.ts";

export async function readVatRegistered(admin: SupabaseClient): Promise<boolean | null> {
  try {
    const { data, error } = await admin.from("platform_settings").select("value").eq("key", "billing_company").maybeSingle();
    if (error) {
      console.error("[payments/vat] reading billing_company failed:", error.code);
      return null;
    }
    return isVatRegistered((data as { value?: unknown } | null)?.value);
  } catch (err) {
    console.error("[payments/vat] reading billing_company threw:", err instanceof Error ? err.message : "unknown");
    return null;
  }
}

/**
 * The VAT state of a checkout: live mode always charges VAT (it cannot be
 * live without the number); otherwise the saved number decides; null = the
 * read failed.
 */
export async function checkoutVatRegistered(admin: SupabaseClient, mode: "test" | "live"): Promise<boolean | null> {
  if (mode === "live") return true;
  return readVatRegistered(admin);
}

/**
 * l16 review: what GET /api/v1/pricing/vat answers. Live mode always charges
 * VAT (checkoutVatRegistered), so it is true there whatever the read said; a
 * failed read outside live mode is null — the page shows no VAT line and
 * never claims «no VAT» on a guess.
 */
export function publicVatAnswer(read: boolean | null, mode: "test" | "live" | null): boolean | null {
  if (mode === "live") return true;
  return read;
}
