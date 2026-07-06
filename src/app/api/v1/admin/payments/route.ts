import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";

/**
 * Unified admin ledger entry — normalized across the three money-movement
 * tables (payments, wallet_transactions, credit_transactions).
 */
interface LedgerEntry {
  id: string;
  source: "payment" | "wallet" | "credit";
  user_id?: string | null;
  amount: number;
  currency?: string | null;
  status?: string | null;
  description: string;
  created_at: string;
}

const LEDGER_LIMIT = 100;

/**
 * GET /api/v1/admin/payments — Read-only unified payments ledger (admin).
 *
 * Merges recent rows from `payments`, `wallet_transactions`, and
 * `credit_transactions`, normalizes each to a common LedgerEntry shape, then
 * returns them sorted by created_at desc (most recent first), capped at ~100.
 *
 * Resilient by design: the underlying tables may not yet exist on the remote
 * DB, so per-table read failures are swallowed (logged) and the route always
 * returns 200 with whatever it could gather.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
  }

  try {
    const supabase = await createServiceClient();
    const entries: LedgerEntry[] = [];

    // 1. payments — service-request payments (provider/gateway)
    try {
      const { data, error } = await supabase
        .from("payments")
        .select("id, request_id, provider, amount, currency, status, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(LEDGER_LIMIT);
      if (error) {
        console.error("[admin/payments GET] payments read error:", error.message);
      } else {
        for (const row of (data ?? []) as Record<string, unknown>[]) {
          const metadata = (row.metadata as Record<string, unknown> | null) ?? {};
          const payerUserId =
            typeof metadata.payer_user_id === "string" ? metadata.payer_user_id : null;
          entries.push({
            id: String(row.id),
            source: "payment",
            user_id: payerUserId,
            amount: Number(row.amount ?? 0),
            currency: (row.currency as string | null) ?? "SAR",
            status: (row.status as string | null) ?? null,
            description:
              `دفعة عبر ${row.provider ?? "—"}` +
              (row.request_id ? ` — طلب ${row.request_id}` : ""),
            created_at: String(row.created_at ?? new Date().toISOString()),
          });
        }
      }
    } catch (e) {
      console.error("[admin/payments GET] payments read exception:", (e as Error).message);
    }

    // 2. wallet_transactions — client wallet credits/debits
    try {
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("id, user_id, amount, kind, description, created_at")
        .order("created_at", { ascending: false })
        .limit(LEDGER_LIMIT);
      if (error) {
        console.error("[admin/payments GET] wallet_transactions read error:", error.message);
      } else {
        for (const row of (data ?? []) as Record<string, unknown>[]) {
          entries.push({
            id: `wallet-${row.id}`,
            source: "wallet",
            user_id: (row.user_id as string | null) ?? null,
            amount: Number(row.amount ?? 0),
            currency: "SAR",
            status: (row.kind as string | null) ?? null,
            description:
              (row.description as string | null) ||
              `معاملة محفظة (${row.kind ?? "—"})`,
            created_at: String(row.created_at ?? new Date().toISOString()),
          });
        }
      }
    } catch (e) {
      console.error(
        "[admin/payments GET] wallet_transactions read exception:",
        (e as Error).message,
      );
    }

    // 3. credit_transactions — lawyer credit purchases/usage
    try {
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("id, user_id, amount, kind, balance_after, description, created_at")
        .order("created_at", { ascending: false })
        .limit(LEDGER_LIMIT);
      if (error) {
        console.error("[admin/payments GET] credit_transactions read error:", error.message);
      } else {
        for (const row of (data ?? []) as Record<string, unknown>[]) {
          entries.push({
            id: `credit-${row.id}`,
            source: "credit",
            user_id: (row.user_id as string | null) ?? null,
            amount: Number(row.amount ?? 0),
            currency: "نقطة",
            status: (row.kind as string | null) ?? null,
            description:
              (row.description as string | null) ||
              `معاملة نقاط (${row.kind ?? "—"})` +
                (row.balance_after != null ? ` — الرصيد ${row.balance_after}` : ""),
            created_at: String(row.created_at ?? new Date().toISOString()),
          });
        }
      }
    } catch (e) {
      console.error(
        "[admin/payments GET] credit_transactions read exception:",
        (e as Error).message,
      );
    }

    // Merge, sort by created_at desc, cap at the ledger limit.
    entries.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return NextResponse.json({ data: entries.slice(0, LEDGER_LIMIT) });
  } catch (err) {
    console.error("[admin/payments GET] Unexpected error:", err);
    return NextResponse.json({ data: [] });
  }
}
