/**
 * entitlements.ts — Admin-controlled grant layer
 * ─────────────────────────────────────────────────────────
 * Single place that turns an admin decision into a real entitlement write.
 * There is NO new enforcement here — the app already enforces tiers/credits in
 * src/lib/access-control.ts. This only writes the rows those checks read:
 *   - plan    → supabase `subscriptions` (+ auth metadata tier)   [mirrors POST /api/v1/admin/subscriptions]
 *   - credits → `credit_transactions` ledger (+ lawyer_profiles.credit_balance) [mirrors POST /api/v1/admin/credits]
 *   - wallet  → `wallet_transactions` credit
 *
 * A `library`/`media` request is fulfilled by granting the PLAN tier that
 * unlocks it (pro+ already unlocks the full library via checkLibraryAccess) —
 * there is no per-user library-item grant, so `action` is only plan/credits/wallet.
 *
 * All writes go through the service-role client (RLS-bypassing); callers MUST
 * have already passed requireAdmin() before invoking grantEntitlement().
 */

import { createServiceClient } from "@/lib/supabase/server";
import type { ServerTier } from "@/lib/access-control";

export type GrantAction = "plan" | "credits" | "wallet";

export interface GrantInput {
  /** Target user (auth.users.id === profiles.id). */
  userId: string;
  action: GrantAction;
  /** Required for action==='plan'. */
  tier?: ServerTier;
  /** Required for action==='credits' (integer) or 'wallet' (positive number). */
  amount?: number;
  /** For action==='plan'. Defaults to 30. */
  durationDays?: number;
  /** Optional ledger description. */
  description?: string;
  /** Admin who granted (recorded in metadata). */
  actorId?: string;
}

export type GrantResult =
  | { ok: true; action: GrantAction; detail: Record<string, unknown> }
  | { ok: false; error: string };

const VALID_TIERS: ServerTier[] = [
  "free",
  "shield",
  "ai",
  "pro",
  "max",
  "corp",
  "enterprise",
];

export async function grantEntitlement(input: GrantInput): Promise<GrantResult> {
  const admin = await createServiceClient();
  const now = new Date();
  const actorMeta = {
    granted_by: input.actorId ?? null,
    granted_at: now.toISOString(),
    method: "admin_grant",
  };

  try {
    // ── PLAN ─────────────────────────────────────────────────────────────────
    if (input.action === "plan") {
      const tier = input.tier;
      if (!tier || !VALID_TIERS.includes(tier)) {
        return { ok: false, error: `فئة غير صالحة: ${tier ?? "—"}` };
      }

      // Resolve a real subscription_plans.id (FK). Prefer audience-matched plan.
      const { data: prof } = await admin
        .from("profiles")
        .select("user_type")
        .eq("id", input.userId)
        .maybeSingle();
      const audience = prof?.user_type as string | undefined;

      let planId: string | null = null;
      if (audience) {
        const { data: p } = await admin
          .from("subscription_plans")
          .select("id")
          .eq("tier", tier)
          .eq("audience", audience)
          .limit(1)
          .maybeSingle();
        planId = (p?.id as string | undefined) ?? null;
      }
      if (!planId) {
        const { data: p2 } = await admin
          .from("subscription_plans")
          .select("id")
          .eq("tier", tier)
          .limit(1)
          .maybeSingle();
        planId = (p2?.id as string | undefined) ?? null;
      }
      if (!planId) {
        return { ok: false, error: `لا توجد باقة اشتراك من الفئة ${tier} في النظام` };
      }

      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + (input.durationDays ?? 30));

      await admin
        .from("subscriptions")
        .update({
          status: "cancelled",
          cancelled_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("user_id", input.userId)
        .eq("status", "active");

      const { data: sub, error: subErr } = await admin
        .from("subscriptions")
        .insert({
          user_id: input.userId,
          plan_id: planId,
          tier,
          billing_cycle: "custom",
          status: "active",
          started_at: now.toISOString(),
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          auto_renew: false,
          metadata: actorMeta,
        })
        .select("id, tier, current_period_end")
        .single();

      if (subErr) return { ok: false, error: subErr.message };

      // Keep auth metadata tier in sync (used by client useSubscription hydration).
      try {
        await admin.auth.admin.updateUserById(input.userId, {
          user_metadata: { tier },
        });
      } catch {
        // non-fatal — subscription row is the source of truth
      }

      return { ok: true, action: "plan", detail: { subscription: sub } };
    }

    // ── CREDITS ──────────────────────────────────────────────────────────────
    if (input.action === "credits") {
      const amount = input.amount;
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount === 0) {
        return { ok: false, error: "المبلغ يجب أن يكون عددًا صحيحًا غير صفري" };
      }

      // Current balance: lawyer_profiles.credit_balance if present, else ledger.
      const { data: lp } = await admin
        .from("lawyer_profiles")
        .select("credit_balance")
        .eq("user_id", input.userId)
        .maybeSingle();

      let current = 0;
      if (lp && typeof lp.credit_balance === "number") {
        current = lp.credit_balance;
      } else {
        const { data: last } = await admin
          .from("credit_transactions")
          .select("balance_after")
          .eq("user_id", input.userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        current = (last?.balance_after as number | null) ?? 0;
      }

      const newBalance = current + amount;
      if (newBalance < 0) {
        return { ok: false, error: `الرصيد غير كافٍ (الحالي: ${current})` };
      }

      const { error: txErr } = await admin.from("credit_transactions").insert({
        user_id: input.userId,
        amount,
        kind: "admin_adjustment",
        balance_after: newBalance,
        description: input.description ?? "منحة إدارية للنقاط",
        metadata: { ...actorMeta, previous_balance: current },
      });
      if (txErr) return { ok: false, error: txErr.message };

      if (lp) {
        await admin
          .from("lawyer_profiles")
          .update({ credit_balance: newBalance, updated_at: now.toISOString() })
          .eq("user_id", input.userId);
      }

      return {
        ok: true,
        action: "credits",
        detail: { previous_balance: current, new_balance: newBalance },
      };
    }

    // ── WALLET ───────────────────────────────────────────────────────────────
    if (input.action === "wallet") {
      const amount = input.amount;
      if (typeof amount !== "number" || amount <= 0) {
        return { ok: false, error: "مبلغ المحفظة يجب أن يكون رقمًا موجبًا" };
      }

      const { data: wt, error: wErr } = await admin
        .from("wallet_transactions")
        .insert({
          user_id: input.userId,
          amount,
          kind: "credit",
          description: input.description ?? "إيداع إداري في المحفظة",
        })
        .select("id, amount")
        .single();
      if (wErr) return { ok: false, error: wErr.message };

      return { ok: true, action: "wallet", detail: { wallet_transaction: wt } };
    }

    return { ok: false, error: `إجراء غير معروف: ${input.action}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "فشل تنفيذ المنحة" };
  }
}
