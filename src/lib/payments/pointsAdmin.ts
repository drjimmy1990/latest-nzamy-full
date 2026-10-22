import type { SupabaseClient } from "@supabase/supabase-js";
/** The lots are the only balance after migration; no dual-write to old credits. */
export async function adjustPointsWith(admin: SupabaseClient, input: { userId: string; amount: number; ref: string; expiresAt: Date }) {
  if (!Number.isSafeInteger(input.amount) || input.amount === 0 || Math.abs(input.amount) > 2147483647) return { ok: false as const, error: "عدد النقاط غير صالح" };
  const result = await admin.rpc("adjust_admin_points", { p_user: input.userId, p_amount: input.amount, p_expires_at: input.expiresAt.toISOString(), p_ref: input.ref });
  if (result.error) return { ok: false as const, error: result.error.message === "insufficient_points" ? "رصيد النقاط غير كافٍ" : "تعذّر تعديل النقاط مؤقتاً" };
  return { ok: true as const, previous_balance: result.data.previous_balance as number, new_balance: result.data.new_balance as number };
}

const balanceLogged = new Set<string>();
function logBalanceOnce(step: string, code: string | undefined) {
  const key = `${step}:${code ?? "?"}`;
  if (balanceLogged.has(key)) return;
  balanceLogged.add(key);
  console.error("[admin] points balance unavailable:", key);
}
/** Directory balances; null when the read fails, so the page shows «—» instead of failing. */
export async function readAdminBalances(admin: SupabaseClient, userIds: string[]): Promise<Map<string, number> | null> {
  try {
    const result = await admin.rpc("admin_points_balances", { p_users: userIds });
    if (result.error || !Array.isArray(result.data)) { logBalanceOnce("directory", result.error?.code); return null; }
    return new Map((result.data as Array<{ user_id: string; balance: number }>).map(b => [b.user_id, b.balance]));
  } catch { logBalanceOnce("directory", "exception"); return null; }
}
/** One user's balance; null when the read fails or is not a whole number. */
export async function readAdminBalance(admin: SupabaseClient, userId: string): Promise<number | null> {
  try {
    const result = await admin.rpc("points_balance", { p_user: userId });
    if (result.error || !Number.isSafeInteger(result.data)) { logBalanceOnce("user", result.error?.code); return null; }
    return result.data as number;
  } catch { logBalanceOnce("user", "exception"); return null; }
}
