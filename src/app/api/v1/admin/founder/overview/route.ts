import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";
import { peopleFor } from "@/lib/library/monitorAdminServer";
import { staffMaySee } from "@/lib/auth/adminNavAccess";
import { isMissingPaymentsObject } from "@/lib/payments/fulfillDecision";
import { FOUNDER_MEMBERSHIP_ON_SALE } from "@/lib/pricing/campaigns";
import {
  FOUNDER_ORDER_STATUSES,
  FOUNDER_REFUND_REASONS,
  founderAdminSummaryFromRpc,
  founderMembers,
  founderRefundOrders,
  riyadhDayStartIso,
  type FounderCreditRow,
  type FounderOrderRow,
  type FounderSeatRow,
  type PersonRef,
} from "@/lib/membership/founderAdmin";
import {
  founderSaleStats,
  webhookProblems,
  WEBHOOK_PROBLEM_FILTER,
  type SaleOrderRow,
  type WebhookEventRow,
} from "@/lib/membership/founderSaleStats";

/**
 * GET /api/v1/admin/founder/overview — «حملة المؤسس» (P3 Task 10). Any staff
 * role (requireStaff("read")); the writes on the page are gated on their own
 * routes (settings.write), and `canManage` only hides their buttons.
 *
 * Answers founder_seat_summary(), FOUNDER_MEMBERSHIP_ON_SALE, membership
 * orders counted by status, activations today (Riyadh day) and in the last 7
 * days, the members (active seats; credits from those seats only; `live`
 * from each seat's payment_orders.live, R32) and the «بانتظار استرداد» orders
 * (paid, metadata.founder in R7's three reasons).
 *
 * Self-hosted PostgREST caps a reply at 1000 rows and `.in()` breaks past
 * ~396 UUIDs, so counts use head counts, lists are read in pages and names
 * are looked up in chunks.
 *
 * F14 (owner package 17 Nov) adds:
 *   - seatCounts: founder_seats released / revoked (head counts; the live
 *     holds and the active seats are the summary's reserved / active);
 *   - sale (staff with payments.read only — money and buyers' sources; null
 *     and saleHidden: true for the other roles): founderSaleStats over every
 *     membership order (live-only revenue with VAT apart, refunds / voids,
 *     conversion by utm_source / utm_campaign from metadata.attribution —
 *     only that key is selected, never the rest of metadata), and the latest
 *     payment_webhook_events whose outcome is a problem (WEBHOOK_PROBLEM_FILTER;
 *     platform-wide — deliveries refused before any write are not recorded).
 *     A failed read here leaves the rest of the page working: sale is null
 *     and saleError says why.
 */

export const dynamic = "force-dynamic";

const PAGE = 1000;
const MAX_ROWS = 10000;
const ID_CHUNK = 300;
const MIGRATION_MISSING_AR = "جداول عضوية المؤسس غير موجودة بعد — شغّل ملف 20261101_10_founder_membership.sql أولًا.";

type DbError = { code?: string; message?: string } | null;
type Page<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: DbError }>;

/** Every row of a query, PAGE at a time (stops at MAX_ROWS). */
async function allRows<T>(page: Page<T>): Promise<{ rows: T[]; error: DbError }> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) return { rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { rows, error: null };
}

/** Names and e-mails, ID_CHUNK ids per lookup. */
async function peopleOf(ids: string[]): Promise<Map<string, PersonRef>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, PersonRef>();
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = await peopleFor(unique.slice(i, i + ID_CHUNK));
    for (const [id, p] of chunk) out.set(id, { name: p.name, email: p.email });
  }
  return out;
}

/**
 * payment_orders.live of the members' orders (R32), ID_CHUNK ids per read —
 * a plain lookup, not an embed (self-hosted PostgREST, PGRST201).
 */
async function liveOfOrders(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  ids: string[],
): Promise<{ live: Map<string, boolean | null>; error: DbError }> {
  const unique = [...new Set(ids.filter(Boolean))];
  const live = new Map<string, boolean | null>();
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const { data, error } = await service
      .from("payment_orders")
      .select("id, live")
      .in("id", unique.slice(i, i + ID_CHUNK));
    if (error) return { live, error };
    for (const row of (data ?? []) as { id: string; live: boolean | null }[]) live.set(row.id, row.live);
  }
  return { live, error: null };
}

export async function GET() {
  try {
    const gate = await requireStaff("read");
    if (!gate.ok) return gate.response;
    const canManage = staffMaySee(gate.role, "settings.write");

    const service = await createServiceClient();
    const now = new Date();

    const summaryRes = await service.rpc("founder_seat_summary");
    if (summaryRes.error) {
      if (isMissingPaymentsObject(summaryRes.error.code)) {
        return NextResponse.json({ migrationMissing: true, message: MIGRATION_MISSING_AR, canManage });
      }
      console.error("[admin/founder/overview] founder_seat_summary failed:", summaryRes.error.code);
      return NextResponse.json({ error: "تعذّر تحميل أرقام الحملة." }, { status: 503 });
    }
    const summary = founderAdminSummaryFromRpc(summaryRes.data);

    const countOrders = (status: string) =>
      service
        .from("payment_orders")
        .select("id", { count: "exact", head: true })
        .eq("kind", "membership")
        .eq("status", status);
    const countActivations = (sinceIso: string) =>
      service
        .from("founder_seats")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", "founder-2026")
        .gte("activated_at", sinceIso);

    const [statusCounts, today, week, seats, refundRows] = await Promise.all([
      Promise.all(FOUNDER_ORDER_STATUSES.map((s) => countOrders(s))),
      countActivations(riyadhDayStartIso(now)),
      countActivations(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      allRows<FounderSeatRow>((from, to) =>
        service
          .from("founder_seats")
          .select("id, user_id, order_id, status, activated_at, ends_at")
          .eq("campaign_id", "founder-2026")
          .eq("status", "active")
          .order("activated_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      service
        .from("payment_orders")
        .select("id, user_id, kind, status, total_halalas, refunded_halalas, receipt_number, paid_at, fulfilled_at, live, metadata")
        .eq("kind", "membership")
        .eq("status", "paid")
        .in("metadata->>founder", [...FOUNDER_REFUND_REASONS])
        .order("paid_at", { ascending: false })
        .limit(500),
    ]);

    const firstError = [...statusCounts, today, week, seats, refundRows].find((r) => r.error)?.error ?? null;
    if (firstError) {
      if (isMissingPaymentsObject(firstError.code)) {
        return NextResponse.json({ migrationMissing: true, message: MIGRATION_MISSING_AR, canManage });
      }
      console.error("[admin/founder/overview] query failed:", firstError.code);
      return NextResponse.json({ error: "تعذّر تحميل بيانات الحملة." }, { status: 503 });
    }

    // Every credit row of the campaign's seats; founderMembers keeps only the
    // ACTIVE seats' rows (a revoked seat's row can read remaining 1).
    const credits = await allRows<FounderCreditRow>((from, to) =>
      service
        .from("membership_credits")
        .select("seat_id, kind, total, remaining")
        .order("id", { ascending: true })
        .range(from, to),
    );
    if (credits.error) {
      console.error("[admin/founder/overview] credits read failed:", credits.error.code);
      return NextResponse.json({ error: "تعذّر تحميل أرصدة الأعضاء." }, { status: 503 });
    }

    const orderLive = await liveOfOrders(service, seats.rows.map((s) => s.order_id ?? ""));
    if (orderLive.error) {
      console.error("[admin/founder/overview] order mode read failed:", orderLive.error.code);
      return NextResponse.json({ error: "تعذّر تحميل بيانات الأعضاء." }, { status: 503 });
    }

    const orders = (refundRows.data ?? []) as FounderOrderRow[];
    const people = await peopleOf([...seats.rows.map((s) => s.user_id), ...orders.map((o) => o.user_id ?? "")]);
    const members = founderMembers(seats.rows, credits.rows, people, orderLive.live);

    const ordersByStatus = Object.fromEntries(
      FOUNDER_ORDER_STATUSES.map((s, i) => [s, statusCounts[i].count ?? 0]),
    );

    // F14: released / revoked seats (head counts) — every staff role
    const countSeats = (status: string) =>
      service
        .from("founder_seats")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", "founder-2026")
        .eq("status", status);
    const [released, revoked] = await Promise.all([countSeats("released"), countSeats("revoked")]);
    const seatCounts =
      released.error || revoked.error
        ? null
        : { released: released.count ?? 0, revoked: revoked.count ?? 0 };
    if (!seatCounts) console.error("[admin/founder/overview] seat counts failed:", (released.error ?? revoked.error)?.code);

    // F14: money, sources and webhook problems — payments.read only
    const canSeeSales = staffMaySee(gate.role, "payments.read");
    let sale: (ReturnType<typeof founderSaleStats> & { webhookProblems: ReturnType<typeof webhookProblems> }) | null = null;
    let saleError: string | null = null;
    if (canSeeSales) {
      const [saleOrders, events] = await Promise.all([
        allRows<SaleOrderRow>((from, to) =>
          service
            .from("payment_orders")
            .select(
              "id, user_id, status, live, net_halalas, vat_halalas, total_halalas, refunded_halalas, paid_at, attribution:metadata->attribution",
            )
            .eq("kind", "membership")
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        ),
        service
          .from("payment_webhook_events")
          .select("event_id, type, payment_id, live, received_at, outcome")
          .or(WEBHOOK_PROBLEM_FILTER)
          .order("received_at", { ascending: false })
          .limit(20),
      ]);
      if (saleOrders.error || events.error) {
        console.error("[admin/founder/overview] sale figures failed:", (saleOrders.error ?? events.error)?.code);
        saleError = "تعذّر تحميل أرقام المبيعات ومصادرها.";
      } else {
        sale = {
          ...founderSaleStats(saleOrders.rows, saleOrders.rows.length >= MAX_ROWS),
          webhookProblems: webhookProblems((events.data ?? []) as WebhookEventRow[]),
        };
      }
    }

    return NextResponse.json(
      {
        migrationMissing: false,
        summary,
        codeSwitchOn: FOUNDER_MEMBERSHIP_ON_SALE,
        ordersByStatus,
        activations: { today: today.count ?? 0, last7Days: week.count ?? 0 },
        members,
        membersTruncated: seats.rows.length >= MAX_ROWS,
        refundOrders: founderRefundOrders(orders, people),
        canManage,
        seatCounts,
        sale,
        saleHidden: !canSeeSales,
        saleError,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[admin/founder/overview] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
