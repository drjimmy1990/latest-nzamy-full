import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronSecretMatches } from "@/lib/payments/fulfillDecision";
import { recordNotification } from "@/lib/notify";
import { renderEmailAr, sendEmail } from "@/lib/email/sendEmail";
import {
  FOUNDER_STORAGE_KEY,
  capBytes,
  founderStorageNoticeAr,
  foundersToAlert,
  parseFounderStorage,
  riyadhMonth,
  type FounderUsage,
} from "@/lib/membership/founderStorage";

/**
 * POST /api/v1/cron/founder-storage — N21 (batch l12, 20261202_80; owner RAW
 * [33], his assistant's default): a founder whose stored files reach
 * founder_storage_fair_use.alert_pct (80 %) of the internal fair-use line
 * (25 GB) gets ONE in-app notice and e-mail a Riyadh month. Nothing is ever
 * blocked here, and no gigabyte number appears on any marketing page.
 *
 *   1. The setting (a missing / malformed row reads as 25 GB / 80 %).
 *   2. public.founder_storage_usage() — bytes per active founder seat.
 *   3. Per founder over the line: INSERT the marker (user, month) into
 *      public.founder_storage_alerts with ON CONFLICT DO NOTHING; only when this
 *      run created it, the notice and the e-mail (sendEmail: a test account is
 *      sunk, a missing mail setup harms nothing).
 *
 * AUTH — fails CLOSED: header `x-cron-secret` must equal CRON_SECRET.
 * SCHEDULE: once a day (add it to the n8n daily-jobs workflow — not in the repo).
 * Before 20261202_80 runs: 200 {skipped: "schema_missing"}.
 */

export const dynamic = "force-dynamic";

const SCHEMA_MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204", "42883", "PGRST202"]);

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = await createServiceClient();
  const { data: row, error: settingErr } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", FOUNDER_STORAGE_KEY)
    .maybeSingle();
  if (settingErr) {
    console.error("[cron/founder-storage] setting:", settingErr.code);
    return NextResponse.json({ error: "setting_failed" }, { status: 500 });
  }
  const rule = parseFounderStorage((row as { value?: unknown } | null)?.value);

  const { data: usage, error: usageErr } = await admin.rpc("founder_storage_usage");
  if (usageErr) {
    if (SCHEMA_MISSING.has(usageErr.code ?? "")) return NextResponse.json({ ok: true, skipped: "schema_missing" });
    console.error("[cron/founder-storage] usage:", usageErr.code);
    return NextResponse.json({ error: "usage_failed" }, { status: 500 });
  }
  const rows: FounderUsage[] = (Array.isArray(usage) ? usage : []).flatMap((r: unknown) => {
    const o = (r ?? {}) as { user_id?: unknown; used_bytes?: unknown };
    const used = typeof o.used_bytes === "number" ? o.used_bytes : typeof o.used_bytes === "string" ? Number(o.used_bytes) : NaN;
    return typeof o.user_id === "string" && Number.isFinite(used) ? [{ userId: o.user_id, usedBytes: used }] : [];
  });

  const due = foundersToAlert(rows, rule);
  const period = riyadhMonth(new Date());
  const cap = capBytes(rule);
  let sent = 0;
  let already = 0;
  let errors = 0;
  for (const f of due) {
    const { data: inserted, error } = await admin
      .from("founder_storage_alerts")
      .upsert(
        { user_id: f.userId, period, used_bytes: Math.round(f.usedBytes), cap_bytes: cap },
        { onConflict: "user_id,period", ignoreDuplicates: true },
      )
      .select("user_id");
    if (error) {
      if (SCHEMA_MISSING.has(error.code ?? "")) return NextResponse.json({ ok: true, skipped: "schema_missing", sent });
      errors += 1;
      console.error("[cron/founder-storage] marker:", error.code);
      continue;
    }
    if (!inserted || inserted.length === 0) {
      already += 1;
      continue;
    }
    const notice = founderStorageNoticeAr(f.usedBytes, rule, f.pct);
    await recordNotification({ userId: f.userId, title: notice.title, body: notice.body });
    try {
      const { data: auth } = await admin.auth.admin.getUserById(f.userId);
      const to = auth?.user?.email ?? null;
      if (to) {
        const rendered = renderEmailAr({ heading: notice.title, paragraphs: [notice.body], action: null });
        await sendEmail({
          to,
          subject: notice.title,
          text: rendered.text,
          html: rendered.html,
          tag: "founder_storage_fair_use",
          idempotencyKey: `founder-storage-${f.userId}-${period}`,
          userIds: [f.userId],
        });
      }
    } catch (err) {
      console.error("[cron/founder-storage] e-mail threw:", err instanceof Error ? err.name : "error");
    }
    sent += 1;
  }

  return NextResponse.json({ ok: true, founders: rows.length, due: due.length, sent, already, errors });
}
