import type { SupabaseClient } from "@supabase/supabase-js";
/** The lots are the only balance after migration; no dual-write to old credits. */
export async function adjustPointsWith(admin: SupabaseClient, input: { userId: string; amount: number; ref: string; expiresAt: Date }) {
  if (!Number.isSafeInteger(input.amount) || input.amount === 0 || Math.abs(input.amount) > 2147483647) return { ok: false as const, error: "عدد النقاط غير صالح" };
  const result = await admin.rpc("adjust_admin_points", { p_user: input.userId, p_amount: input.amount, p_expires_at: input.expiresAt.toISOString(), p_ref: input.ref });
  if (result.error) return { ok: false as const, error: result.error.message === "insufficient_points" ? "رصيد النقاط غير كافٍ" : "تعذّر تعديل النقاط مؤقتاً" };
  return { ok: true as const, previous_balance: result.data.previous_balance as number, new_balance: result.data.new_balance as number };
}
