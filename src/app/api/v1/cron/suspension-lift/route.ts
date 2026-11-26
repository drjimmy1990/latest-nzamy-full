import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronSecretMatches } from "@/lib/payments/fulfillDecision";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { suspensionLiftedEmailAr } from "@/lib/auth/suspensionTerms";
import {
  closeAppealsWith,
  liftSuspensionWith,
  readDueSuspensionsWith,
  thawEntitlementsWith,
} from "@/lib/accountSuspension/suspensionServer";
import { sendSuspensionMail } from "@/lib/accountSuspension/suspensionMail";

/**
 * POST /api/v1/cron/suspension-lift — owner س٢١٥: the automatic end of an
 * admin suspension. Reads the open suspensions whose `ends_at` has passed
 * (public.account_suspension_freezes, 20261206_20) and, one by one, runs the
 * SAME lift path as the admin's «رفع الإيقاف» (PATCH /api/v1/admin/users/[id]
 * { status: "active" }):
 *
 *   liftSuspensionWith    GoTrue ban "none" + app_metadata "active";
 *   thawEntitlementsWith  account_freeze_lift — the frozen subscriptions,
 *                         grants, seat, credits and points lots get the
 *                         suspended days back; the freeze row is closed, so
 *                         the next run does not see it again;
 *   closeAppealsWith      the waiting appeals become «ended»;
 *   the account is told by e-mail, and one audit row is written
 *   (user_unsuspended_auto, actor_type 'system').
 *
 * The account is already free at `ends_at` without this job: the GoTrue ban
 * lasts exactly until then and the gates ignore a copy whose `until` has
 * passed (isSuspendedUser). This job gives the days back and tidies up; a
 * late run gives back a little more (the minutes between ends_at and the run).
 *
 * A row whose ban could not be lifted is left open (retried next run). A row
 * whose thaw failed after the ban was lifted is logged and stays open too:
 * the next run lifts the (already lifted) ban again and retries the thaw.
 *
 * ── AUTH — fails CLOSED, as /api/v1/cron/account-purge ─────────────────────
 * Header `x-cron-secret` must equal CRON_SECRET (cronSecretMatches). An unset
 * or empty CRON_SECRET, or a wrong header, is 401.
 *
 * ── SCHEDULE ────────────────────────────────────────────────────────────────
 * Every 15 minutes:
 *   n8n: Schedule Trigger (every 15 minutes) → HTTP Request
 *        POST https://nezamy.sa/api/v1/cron/suspension-lift
 *        header x-cron-secret: <CRON_SECRET>
 *
 * Before 20261206_20 runs: 200 `{ skipped: "schema_missing" }`, never a 500.
 */

export const dynamic = "force-dynamic";

const LIFT_BATCH = 50;

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = await createServiceClient();
  const due = await readDueSuspensionsWith(admin, new Date().toISOString(), LIFT_BATCH);
  if (due.state === "migration_missing") {
    return NextResponse.json({ ok: true, skipped: "schema_missing" });
  }
  if (due.state === "failed") {
    console.error("[cron/suspension-lift] reading the due suspensions failed:", due.error);
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }

  const counts = { due: due.rows.length, lifted: 0, ban_failed: 0, thaw_failed: 0 };
  for (const row of due.rows) {
    try {
      const nowIso = new Date().toISOString();
      const lifted = await liftSuspensionWith(admin, { userId: row.userId, actorId: "schedule", nowIso });
      if (!lifted.ok) {
        counts.ban_failed += 1;
        console.error("[cron/suspension-lift] lifting the ban failed:", row.freezeId, lifted.error);
        continue;
      }
      const thaw = await thawEntitlementsWith(admin, { userId: row.userId, actorId: null });
      if (thaw.state === "failed" || thaw.state === "migration_missing") {
        counts.thaw_failed += 1;
        console.error("[cron/suspension-lift] giving the frozen days back failed:", row.freezeId, thaw.state);
        continue;
      }
      counts.lifted += 1;

      const closed = await closeAppealsWith(admin, { userId: row.userId, status: "ended", actorId: null, nowIso });
      const email = await sendSuspensionMail(admin, {
        userId: row.userId,
        mail: suspensionLiftedEmailAr({
          automatic: true,
          extended: thaw.state === "lifted" && Object.values(thaw.extended ?? {}).some((n) => n > 0),
        }),
        tag: "account_unsuspended",
        idempotencyKey: `account-unsuspended-auto-${row.freezeId}`,
        withAppealLink: false,
      });
      await logAdminAction({
        actorId: null,
        actorType: "system",
        action: "user_unsuspended_auto",
        targetType: "profile",
        targetId: row.userId,
        before: { banned: true, ends_at: row.endsAt },
        after: {
          banned: false,
          freeze: thaw.state,
          extended_days: thaw.state === "lifted" ? thaw.extendedDays : null,
          extended: thaw.state === "lifted" ? thaw.extended : null,
          appeals_closed: closed ?? "failed",
          email,
        },
        metadata: { freeze_id: row.freezeId, by: "schedule" },
      });
    } catch (err) {
      counts.ban_failed += 1;
      console.error("[cron/suspension-lift] lift threw:", row.freezeId, err);
    }
  }

  console.info("[cron/suspension-lift]", JSON.stringify(counts));
  return NextResponse.json({ ok: true, ...counts });
}
