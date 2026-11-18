/**
 * refundEvidence.ts — reads the usage behind a refund verdict (batch l7,
 * decision 10) with the service client, for refundCore and nothing else.
 *
 *   - the founder credits of THIS order's seat that were spent and not
 *     restored: founder_seats.order_id → membership_credits →
 *     membership_credit_uses with restored_at null (one row per run paid
 *     with a credit; a failed run stamps restored_at and gets it back);
 *   - the buyer's AI runs since paid_at that did not fail;
 *   - the buyer's points debited since paid_at, net of the refunds of failed
 *     runs (points_ledger usage − usage_refund);
 *   - the order's own points lot(s), passed in (refundCore already read them).
 *
 * Library browsing writes none of these rows, so it never counts.
 * Every read is independent; an error marks `readFailed` (the verdict is then
 * «تعذّر التحقق», never «مؤهل») and the other reads still run.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { LIBRARY_AI_TOOLS, type RefundEvidence } from "./refundEligibility.ts";

export const AI_RUN_EVIDENCE_LIMIT = 200;

export async function readRefundEvidence(
  admin: SupabaseClient,
  order: { id: string; user_id: string | null; kind: string; paid_at: string | null },
  orderLots: { total: number; used: number; readFailed: boolean },
): Promise<RefundEvidence> {
  const evidence: RefundEvidence = { creditsUsed: {}, aiRuns: [], pointsDebited: 0, orderLotTotal: orderLots.total, orderLotUsed: orderLots.used, readFailed: orderLots.readFailed };
  const paidAt = order.paid_at ? Date.parse(order.paid_at) : NaN;
  if (!Number.isFinite(paidAt)) { evidence.readFailed = true; return evidence; }
  // gt one millisecond earlier = "at or after paid_at"
  const since = new Date(paidAt - 1).toISOString();
  const fail = (what: string, code?: string) => { evidence.readFailed = true; console.error("[refund] evidence read failed:", what, code ?? "exception", order.id); };
  try {
    if (order.kind === "membership") {
      const seats = await admin.from("founder_seats").select("id").eq("order_id", order.id);
      if (seats.error) fail("founder_seats", seats.error.code);
      const seatIds = ((seats.data ?? []) as Array<{ id: string }>).map((s) => s.id);
      if (seatIds.length) {
        const credits = await admin.from("membership_credits").select("id,kind").in("seat_id", seatIds);
        if (credits.error) fail("membership_credits", credits.error.code);
        const kindOf = new Map(((credits.data ?? []) as Array<{ id: string; kind: string }>).map((c) => [c.id, c.kind]));
        if (kindOf.size) {
          const uses = await admin.from("membership_credit_uses").select("credit_id").in("credit_id", [...kindOf.keys()]).is("restored_at", null);
          if (uses.error) fail("membership_credit_uses", uses.error.code);
          for (const u of (uses.data ?? []) as Array<{ credit_id: string }>) {
            const kind = kindOf.get(u.credit_id) ?? "other";
            evidence.creditsUsed[kind] = (evidence.creditsUsed[kind] ?? 0) + 1;
          }
        }
      }
    }
    if (order.user_id) {
      // l8: a library order is judged on its own assistant — filtered in the query, so the row limit never hides one
      let runQuery = admin.from("ai_runs").select("tool,created_at").eq("user_id", order.user_id)
        .gt("created_at", since).in("status", ["running", "review", "succeeded"]);
      if (order.kind === "library") runQuery = runQuery.in("tool", [...LIBRARY_AI_TOOLS]);
      const runs = await runQuery.order("created_at", { ascending: true }).limit(AI_RUN_EVIDENCE_LIMIT);
      if (runs.error) fail("ai_runs", runs.error.code);
      evidence.aiRuns = ((runs.data ?? []) as Array<{ tool: unknown; created_at: unknown }>)
        .filter((r) => typeof r.tool === "string" && typeof r.created_at === "string")
        .map((r) => ({ tool: r.tool as string, created_at: r.created_at as string }));
      const ledger = await admin.from("points_ledger").select("delta,reason").eq("user_id", order.user_id)
        .in("reason", ["usage", "usage_refund"]).gt("created_at", since).limit(10000);
      if (ledger.error) fail("points_ledger", ledger.error.code);
      let net = 0;
      for (const row of (ledger.data ?? []) as Array<{ delta: unknown }>) if (Number.isSafeInteger(row.delta)) net -= row.delta as number;
      evidence.pointsDebited = Math.max(0, net);
    }
  } catch (err) {
    fail("exception", err instanceof Error ? err.message : undefined);
  }
  return evidence;
}
