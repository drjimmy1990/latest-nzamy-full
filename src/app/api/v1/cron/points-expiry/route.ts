import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronSecretMatches } from "@/lib/payments/fulfillDecision";
import { recordNotification } from "@/lib/notify";
import { EXPIRY_WARNING_DAYS, expiryNotice, lotsToWarn, type ExpiringLot } from "@/lib/points/pointsExpiryNotice";
import { GATED_LIBRARY_PLAN_REFS, isFounderInviteTrialCandidate } from "@/lib/library/pointsGate";
import { readLibraryMinPoints } from "@/lib/library/pointsGateServer";

/**
 * POST /api/v1/cron/points-expiry — owner 18 Nov 2026 (G9, G16; batch l7):
 *
 *   1. EXPIRY: public.points_expire_lots(EXPIRE_BATCH) (20261127_40) empties
 *      the lots past their end that still hold points, each through
 *      revoke_lot(id, 'expiry') — one «انتهاء» ledger row per lot. The balance
 *      already ignored them; this writes the trace. Safe to repeat.
 *   2. WARNING: the lots that still hold points and end within 7 days (a
 *      bounded read): per lot, INSERT the marker into
 *      public.points_lot_expiry_notices with ON CONFLICT DO NOTHING, and send
 *      the in-app notice ONLY when this run created the row — once per lot,
 *      whatever the schedule.
 *
 * ── AUTH — fails CLOSED ─────────────────────────────────────────────────────
 * Header `x-cron-secret` must equal CRON_SECRET (cronSecretMatches: SHA-256
 * digests compared with timingSafeEqual). Unset secret or a wrong header → 401.
 *
 * ── SCHEDULE ────────────────────────────────────────────────────────────────
 * Once a day is enough; hourly is harmless:
 *   n8n: Schedule Trigger → HTTP Request POST https://nezamy.sa/api/v1/cron/points-expiry
 *        header x-cron-secret: <CRON_SECRET>
 *
 * Deploy order: before 20261127_40 runs, the route answers 200
 * {skipped: "schema_missing"} and changes and sends NOTHING.
 */

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
/** Lots emptied per run (the function's own cap is 5,000); the rest wait for the next run. */
const EXPIRE_BATCH = 500;
/** At most this many lots warned per run; the rest wait for the next run. */
const WARNING_LIMIT = 500;
/** l11 O7: users per library-grants read (keeps the request URL short). */
const GRANTS_CHUNK = 100;

const SCHEMA_MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204", "42883", "PGRST202"]);

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = await createServiceClient();
  const now = new Date();

  // 1. the «انتهاء» rows
  const { data: expired, error: expireErr } = await admin.rpc("points_expire_lots", { p_limit: EXPIRE_BATCH });
  if (expireErr) {
    if (SCHEMA_MISSING.has(expireErr.code ?? "")) {
      return NextResponse.json({ ok: true, skipped: "schema_missing" });
    }
    console.error("[cron/points-expiry] expire:", expireErr.code, expireErr.message);
    return NextResponse.json({ error: "expire_failed" }, { status: 500 });
  }
  const expiry = (expired ?? { lots: 0, points: 0 }) as { lots?: number; points?: number };

  // 2. the 7-day warnings
  const { data: rows, error: readErr } = await admin
    .from("points_lots")
    .select("id, user_id, points_left, expires_at, wallet_scope")
    .gt("points_left", 0)
    .gt("expires_at", now.toISOString())
    .lte("expires_at", new Date(now.getTime() + EXPIRY_WARNING_DAYS * DAY_MS).toISOString())
    .order("expires_at", { ascending: true })
    .limit(WARNING_LIMIT);
  if (readErr) {
    if (SCHEMA_MISSING.has(readErr.code ?? "")) {
      return NextResponse.json({ ok: true, expired: expiry, skipped: "schema_missing" });
    }
    console.error("[cron/points-expiry] candidates:", readErr.code, readErr.message);
    return NextResponse.json({ error: "candidates_failed", expired: expiry }, { status: 500 });
  }

  const due = lotsToWarn((rows ?? []) as ExpiringLot[], now);

  // l11 O7 (register 49): the holders of a gated library plan (paid library
  // plan or the founder) are told the expiry may lock the library — read in
  // chunks of GRANTS_CHUNK users (a short URL); a failed chunk only drops
  // that sentence for its users
  const gated = new Set<string>();
  // Owner ٢٠١ (أ), batch l14: a founder-invite library trial is outside the
  // 50-point gate, so its holder is not told an expiry may lock the library.
  const inviteTrial = new Set<string>();
  let libraryMinPoints: number | null = null;
  const dueUsers = [...new Set(due.map((l) => l.user_id))];
  for (let i = 0; i < dueUsers.length; i += GRANTS_CHUNK) {
    const { data: grants, error: grantsErr } = await admin
      .from("library_access_grants")
      .select("user_id, plan_ref, source")
      .in("user_id", dueUsers.slice(i, i + GRANTS_CHUNK))
      .in("plan_ref", [...GATED_LIBRARY_PLAN_REFS])
      .lte("starts_at", now.toISOString())
      .gt("ends_at", now.toISOString());
    if (grantsErr) console.warn("[cron/points-expiry] library grants:", grantsErr.code);
    for (const g of (grants ?? []) as Array<{ user_id?: unknown; plan_ref?: unknown; source?: unknown }>) {
      if (typeof g.user_id !== "string") continue;
      gated.add(g.user_id);
      if (isFounderInviteTrialCandidate(g)) inviteTrial.add(g.user_id);
    }
  }
  for (const id of inviteTrial) gated.delete(id);
  if (gated.size > 0) libraryMinPoints = await readLibraryMinPoints();

  let sent = 0;
  let already = 0;
  let errors = 0;
  for (const lot of due) {
    const { data: inserted, error } = await admin
      .from("points_lot_expiry_notices")
      .upsert(
        { lot_id: lot.id, user_id: lot.user_id, expires_at: lot.expires_at },
        { onConflict: "lot_id", ignoreDuplicates: true },
      )
      .select("lot_id");
    if (error) {
      if (SCHEMA_MISSING.has(error.code ?? "")) {
        return NextResponse.json({ ok: true, expired: expiry, skipped: "schema_missing", sent });
      }
      errors += 1;
      console.error("[cron/points-expiry] marker:", error.code, error.message);
      continue;
    }
    if (!inserted || inserted.length === 0) {
      already += 1;
      continue;
    }
    await recordNotification({
      userId: lot.user_id,
      ...expiryNotice(lot, { libraryMinPoints: gated.has(lot.user_id) ? libraryMinPoints : null }),
    });
    sent += 1;
  }

  return NextResponse.json({ ok: true, expired: expiry, due: due.length, sent, already, errors });
}
