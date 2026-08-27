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
 * ── A PARTIAL LEDGER IS NOT A LEDGER ───────────────────────────────────────
 *
 * The old docblock called swallowing per-table failures "resilient by design"
 * and justified it with "the tables may not yet exist on the remote DB". Both
 * halves were wrong. All three tables are created by applied migrations
 * (payments and wallet_transactions in 20260518_client_workflow_backend_ready.sql,
 * credit_transactions in 20260603_phase1_003_subscriptions_billing.sql), so a
 * read failure is a real failure and not an expected deploy state. And the
 * result of swallowing it is a screen that presents two thirds of the money
 * that moved as all of the money that moved — an admin reconciling a client's
 * balance sees no wallet transactions and concludes there were none.
 *
 * So: `degraded: true` whenever ANY source failed, which listFromApi() in
 * src/lib/services/listRead.ts maps to a failed read — the safe default, since
 * the page then says «تعذّرت القراءة» rather than showing an incomplete ledger
 * as a complete one.
 *
 * What that costs, stated plainly: if one table is genuinely unavailable, the
 * rows from the other two stop being shown even though they were read fine.
 * `failedSources` is returned alongside so a caller can make the better,
 * costlier choice — render what loaded UNDER an explicit «تعذّر تحميل معاملات
 * المحفظة» banner naming the missing source. That is a per-source UI this route
 * cannot build for it; what it can do is refuse to hide which third is missing.
 *
 * Kept at 200 rather than a 500 (the answer for the other admin routes in this
 * pass) precisely because `data` is still worth handing over: a 500 has nowhere
 * to put the rows that did load.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
  }

  try {
    const supabase = await createServiceClient();
    const entries: LedgerEntry[] = [];
    // Which of the three reads did not answer. Empty === a complete ledger.
    const failedSources: string[] = [];
    // Sum of the three exact counts. `null` once any source is unreadable: a
    // total that silently omits a whole table is worse than no total, because
    // the truncation notice built from it would read as authoritative.
    let ledgerTotal: number | null = 0;
    const addToTotal = (count: number | null) => {
      if (ledgerTotal === null) return;
      ledgerTotal = count === null ? null : ledgerTotal + count;
    };

    // 1. payments — service-request payments (provider/gateway)
    try {
      const { data, count, error } = await supabase
        .from("payments")
        .select(
          "id, request_id, provider, amount, currency, status, metadata, created_at",
          // Each of the three `.limit(LEDGER_LIMIT)` calls below is a silent cap
          // without a count: the merged list is then capped a second time by
          // `.slice(LEDGER_LIMIT)`, so an admin can be looking at 100 rows out
          // of thousands with nothing on the page saying so.
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .limit(LEDGER_LIMIT);
      if (error) {
        console.error("[admin/payments GET] payments read error:", error.message);
        failedSources.push("payments");
        addToTotal(null);
      } else {
        addToTotal(count ?? null);
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
      failedSources.push("payments");
      addToTotal(null);
    }

    // 2. wallet_transactions — client wallet credits/debits
    try {
      const { data, count, error } = await supabase
        .from("wallet_transactions")
        .select("id, user_id, amount, kind, description, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(LEDGER_LIMIT);
      if (error) {
        console.error("[admin/payments GET] wallet_transactions read error:", error.message);
        failedSources.push("wallet_transactions");
        addToTotal(null);
      } else {
        addToTotal(count ?? null);
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
      failedSources.push("wallet_transactions");
      addToTotal(null);
    }

    // 3. credit_transactions — lawyer credit purchases/usage
    try {
      const { data, count, error } = await supabase
        .from("credit_transactions")
        .select(
          "id, user_id, amount, kind, balance_after, description, created_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .limit(LEDGER_LIMIT);
      if (error) {
        console.error("[admin/payments GET] credit_transactions read error:", error.message);
        failedSources.push("credit_transactions");
        addToTotal(null);
      } else {
        addToTotal(count ?? null);
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
      failedSources.push("credit_transactions");
      addToTotal(null);
    }

    // Merge, sort by created_at desc, cap at the ledger limit.
    entries.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    if (failedSources.length > 0) {
      console.error(
        `[admin/payments GET] ledger incomplete — unreadable sources: ${failedSources.join(", ")}`,
      );
    }

    return NextResponse.json({
      data: entries.slice(0, LEDGER_LIMIT),
      total: ledgerTotal,
      degraded: failedSources.length > 0,
      failedSources,
    });
  } catch (err) {
    console.error("[admin/payments GET] Unexpected error:", err);
    // Nothing was gathered, so there is no partial ledger worth a 200 here —
    // unlike the per-source branches above, this is the whole route failing.
    return NextResponse.json({ error: "تعذّر تحميل سجل المدفوعات." }, { status: 500 });
  }
}
