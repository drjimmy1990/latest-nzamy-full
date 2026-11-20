import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronSecretMatches } from "@/lib/payments/fulfillDecision";
import { recordNotification } from "@/lib/notify";
import { renderEmailAr, sendEmail } from "@/lib/email/sendEmail";
import { founderDiscountBps } from "@/lib/payments/founderDiscount";
import { FOUNDER_CAMPAIGN_ID } from "@/lib/membership/founderPlan";
import {
  FOUNDER_RENEWAL_KEY,
  founderRenewalOffered,
  parseFounderRenewal,
  renewalEmailAr,
  renewalNoticeAr,
  seatsDueForRenewalNotice,
  type RenewalSeat,
} from "@/lib/membership/founderRenewal";

/**
 * POST /api/v1/cron/founder-renewal-notice — batch l11 pay (owner register 14
 * item 55; /founder-terms clause ٤: the renewal price is announced 60 days
 * before the membership year ends).
 *
 *   1. The setting platform_settings.founder_renewal (20261201_20). OFF, or
 *      no price → 200 {skipped: "off"} and NOTHING is read or sent. No price
 *      is ever invented.
 *   2. The active founder seats whose membership year ends within 60 days
 *      (seatsDueForRenewalNotice).
 *   3. Per seat: INSERT the marker (seat, membership end) into
 *      public.founder_renewal_notices with ON CONFLICT DO NOTHING; only when
 *      this run created it, the in-app notice and the e-mail (sendEmail: a
 *      missing Resend key is 'unavailable' and harms nothing; a test account
 *      is sunk). Once per seat and year, whatever the schedule.
 *
 * AUTH — fails CLOSED: header `x-cron-secret` must equal CRON_SECRET.
 * SCHEDULE: once a day (n8n Schedule Trigger → HTTP POST with the header).
 * Before 20261201_20 runs: 200 {skipped: "schema_missing"}.
 */

export const dynamic = "force-dynamic";

const SCHEMA_MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"]);
/** The founder campaign has at most 1,096 seats. */
const SEAT_LIMIT = 2000;

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = await createServiceClient();
  const now = new Date();

  const { data: row, error: settingErr } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", FOUNDER_RENEWAL_KEY)
    .maybeSingle();
  if (settingErr) {
    console.error("[cron/founder-renewal-notice] setting:", settingErr.code);
    return NextResponse.json({ error: "setting_failed" }, { status: 500 });
  }
  const setting = parseFounderRenewal((row as { value?: unknown } | null)?.value);
  if (!founderRenewalOffered(setting)) return NextResponse.json({ ok: true, skipped: "off" });

  const { data: seats, error: seatsErr } = await admin
    .from("founder_seats")
    .select("id, user_id, activated_at, ends_at")
    .eq("campaign_id", FOUNDER_CAMPAIGN_ID)
    .eq("status", "active")
    .limit(SEAT_LIMIT);
  if (seatsErr) {
    if (SCHEMA_MISSING.has(seatsErr.code ?? "")) return NextResponse.json({ ok: true, skipped: "schema_missing" });
    console.error("[cron/founder-renewal-notice] seats:", seatsErr.code);
    return NextResponse.json({ error: "seats_failed" }, { status: 500 });
  }

  const due = seatsDueForRenewalNotice((seats ?? []) as RenewalSeat[], now);
  if (due.length === 0) return NextResponse.json({ ok: true, due: 0, sent: 0 });

  const bps = await founderDiscountBps(admin);
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? null;
  let sent = 0;
  let already = 0;
  let errors = 0;
  for (const { seat, endsAt } of due) {
    const { data: inserted, error } = await admin
      .from("founder_renewal_notices")
      .upsert(
        { seat_id: seat.id, cycle_end: endsAt.toISOString(), user_id: seat.user_id, price_net_halalas: setting.priceHalalas },
        { onConflict: "seat_id,cycle_end", ignoreDuplicates: true },
      )
      .select("seat_id");
    if (error) {
      if (SCHEMA_MISSING.has(error.code ?? "")) return NextResponse.json({ ok: true, skipped: "schema_missing", sent });
      errors += 1;
      console.error("[cron/founder-renewal-notice] marker:", error.code);
      continue;
    }
    if (!inserted || inserted.length === 0) {
      already += 1;
      continue;
    }

    const notice = { endsAt, priceHalalas: setting.priceHalalas, bps };
    await recordNotification({ userId: seat.user_id, ...renewalNoticeAr(notice) });

    let emailStatus: string = "no_address";
    try {
      const { data: auth } = await admin.auth.admin.getUserById(seat.user_id);
      const to = auth?.user?.email ?? null;
      if (to) {
        const mail = renewalEmailAr({ ...notice, siteOrigin });
        const rendered = renderEmailAr(mail);
        emailStatus = await sendEmail({
          to,
          subject: mail.subject,
          text: rendered.text,
          html: rendered.html,
          tag: "founder_renewal_notice",
          idempotencyKey: `founder-renewal-${seat.id}-${endsAt.toISOString().slice(0, 10)}`,
          userIds: [seat.user_id],
        });
      }
    } catch (err) {
      emailStatus = "failed";
      console.error("[cron/founder-renewal-notice] e-mail threw:", err instanceof Error ? err.name : "error");
    }
    await admin
      .from("founder_renewal_notices")
      .update({ email_status: emailStatus })
      .eq("seat_id", seat.id)
      .eq("cycle_end", endsAt.toISOString());
    sent += 1;
  }

  return NextResponse.json({ ok: true, due: due.length, sent, already, errors });
}
