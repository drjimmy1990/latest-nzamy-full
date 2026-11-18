import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import { readTestAccountIds } from "@/lib/testAccounts/testAccountIds";
import {
  planTestSeatRelease,
  releaseMessageAr,
  summarizeRelease,
  TEST_SEAT_RELEASE_REASON,
  type RevokeOutcome,
  type SeatForRelease,
} from "@/lib/membership/testSeatRelease";

/**
 * /api/v1/admin/founder/test-seats — «تحرير المقاعد التجريبية» (batch l7,
 * decision 3; launch gap item 17).
 *
 *   GET  → the preview: the seats the action would free, and the ones it
 *          never touches (a test account's seat paid LIVE; a seat with no
 *          order). Nothing is written.
 *   POST { confirm: true } → each planned seat is revoked through the
 *          existing public.founder_revoke(order, 'test_account_release')
 *          (service role): seat 'revoked', credits 0, library grant closed,
 *          badge dropped when no other active seat is left. Audited
 *          (founder_test_seats_released) with every order id and outcome.
 *
 * Which seats: src/lib/membership/testSeatRelease.ts (planTestSeatRelease) —
 * TEST-mode paid seats, and test accounts' seats never paid live. NEVER a
 * live-paid seat: real money goes back through the refund path.
 * The public seat counter excluding test seats is the founder builder's
 * (founder_seat_summary); this only frees them.
 *
 * Gate: requireStaff("settings.write") — the same as «إعادة محاولة التفعيل».
 */

export const dynamic = "force-dynamic";

const READ_FAILED_AR = "تعذّر قراءة المقاعد — حاول مجددًا";
const MAX_SEATS = 1000;
const ID_CHUNK = 200;

type SeatRow = { id: string; user_id: string | null; order_id: string | null; status: string };

async function readPlan(service: Awaited<ReturnType<typeof createServiceClient>>) {
  const { data, error } = await service
    .from("founder_seats")
    .select("id, user_id, order_id, status")
    .eq("campaign_id", "founder-2026")
    .not("status", "in", "(released,revoked)")
    .limit(MAX_SEATS);
  if (error) return { error: error.code ?? "seats" } as const;
  const seats = (data ?? []) as SeatRow[];

  const orderIds = [...new Set(seats.map((s) => s.order_id).filter((v): v is string => !!v))];
  const live = new Map<string, boolean | null>();
  for (let i = 0; i < orderIds.length; i += ID_CHUNK) {
    const { data: orders, error: oErr } = await service
      .from("payment_orders")
      .select("id, live")
      .in("id", orderIds.slice(i, i + ID_CHUNK));
    if (oErr) return { error: oErr.code ?? "orders" } as const;
    for (const o of (orders ?? []) as { id: string; live: boolean | null }[]) live.set(o.id, o.live);
  }

  const testAccounts = await readTestAccountIds(service);
  const rows: SeatForRelease[] = seats.map((s) => ({
    seatId: s.id,
    userId: s.user_id,
    orderId: s.order_id,
    status: s.status,
    orderLive: s.order_id ? (live.get(s.order_id) ?? null) : null,
  }));
  return { plan: planTestSeatRelease(rows, testAccounts.ids), testAccountsComplete: testAccounts.complete } as const;
}

const view = (s: SeatForRelease) => ({ seatId: s.seatId, userId: s.userId, orderId: s.orderId, status: s.status });

export async function GET() {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;
    const service = await createServiceClient();
    const r = await readPlan(service);
    if ("error" in r) {
      console.error("[admin/founder/test-seats] read failed:", r.error);
      return NextResponse.json({ error: READ_FAILED_AR }, { status: 503 });
    }
    return NextResponse.json(
      {
        release: r.plan.release.map(view),
        skippedLive: r.plan.skippedLive.map(view),
        skippedNoOrder: r.plan.skippedNoOrder.map(view),
        testAccountsComplete: r.testAccountsComplete,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[admin/founder/test-seats] GET unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
    if (body?.confirm !== true) {
      return NextResponse.json({ error: "أكّد تحرير المقاعد التجريبية" }, { status: 400 });
    }

    const service = await createServiceClient();
    const r = await readPlan(service);
    if ("error" in r) {
      console.error("[admin/founder/test-seats] read failed:", r.error);
      return NextResponse.json({ error: READ_FAILED_AR }, { status: 503 });
    }

    const results: { orderId: string; outcome: RevokeOutcome }[] = [];
    for (const s of r.plan.release) {
      const orderId = s.orderId as string; // planTestSeatRelease releases only seats with an order
      const { data, error } = await service.rpc("founder_revoke", { p_order: orderId, p_reason: TEST_SEAT_RELEASE_REASON });
      if (error) console.error("[admin/founder/test-seats] founder_revoke failed:", orderId, error.code);
      results.push({ orderId, outcome: error ? "error" : data === "revoked" ? "revoked" : "none" });
    }
    const summary = summarizeRelease(results.map((x) => x.outcome));

    await logAdminAction({
      actorId: gate.userId,
      action: "founder_test_seats_released",
      targetType: "founder_campaign",
      targetId: "founder-2026",
      before: { planned: r.plan.release.length, skippedLive: r.plan.skippedLive.map((s) => s.orderId) },
      after: { ...summary, results },
    });

    return NextResponse.json({
      ...summary,
      skippedLive: r.plan.skippedLive.length,
      skippedNoOrder: r.plan.skippedNoOrder.length,
      message: releaseMessageAr(summary, r.plan.skippedLive.length),
    });
  } catch (err) {
    console.error("[admin/founder/test-seats] POST unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
