import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { recordNotification } from "@/lib/notify";
import { daysUntil, parseIsoDate } from "@/lib/services/deadlineEngine";
import { toArabicDigits, countPhraseAr } from "@/lib/services/arabicCount";
import { purgeCutoffIso } from "@/lib/services/attachmentPurge";

/**
 * POST /api/v1/cron/deadlines — the رادار المهل scheduler (Phase 5,
 * خطة_البناء_الكاملة §9). One endpoint two jobs run every time it fires:
 *
 *   (a) MISSED  — any `deadlines` row still `open` whose `due_date` is
 *       before today (Riyadh date) becomes `missed`, and a `deadline_missed`
 *       in-app reminder is queued for its owner.
 *   (b) DELIVER — up to 200 `notification_outbox` rows that are `pending`
 *       and due (`scheduled_for <= now`) are sent: `in_app` writes straight
 *       to the `notifications` table via `recordNotification`; `email` /
 *       `whatsapp` POST to `N8N_WEBHOOK_DEADLINE` (n8n owns the actual send)
 *       and are `failed` with `last_error: 'channel not configured'` when
 *       that env var is unset — this never pretends to have sent something
 *       it didn't.
 *   (c) PURGE   — `attachments` rows soft-deleted more than
 *       PURGE_AFTER_DAYS (30) ago, carrying no legal_hold, are purged for
 *       real: the storage object is removed, then the row is deleted.
 *       Phase 6, DECISION 3 (20260906_phase6_settings_out_of_browser.sql).
 *       Per-row try/catch, same shape as MISSED/DELIVER — one bad row never
 *       stops the rest of the run.
 *
 * ── AUTH — fails CLOSED, same contract as src/app/api/v1/n8n/callback ──────
 * Header `x-cron-secret` must equal `process.env.CRON_SECRET`. An unset or
 * empty `CRON_SECRET`, or a header that doesn't match, is 401 — there is no
 * "open by default" mode.
 *
 * ── SERVICE ROLE, ON PURPOSE ─────────────────────────────────────────────
 * This is the one legitimate place `createServiceClient()` belongs (see the
 * migration's own note on `notification_outbox` RLS): the scheduler has no
 * user session, and it must be able to mark ANY user's deadline missed and
 * deliver ANY user's reminder, not just one caller's own rows.
 *
 * ── HOW TO SCHEDULE THIS ─────────────────────────────────────────────────
 * Set `CRON_SECRET` in the deploy environment (see .env.example), then point
 * a scheduler at this endpoint hourly:
 *
 *   n8n:  Schedule Trigger (hourly) → HTTP Request
 *           POST https://nezamy.sa/api/v1/cron/deadlines
 *           header  x-cron-secret: <CRON_SECRET>
 *
 *   pm2:  a small cron job (or `pm2` ecosystem `cron_restart`-style task)
 *         running `curl -X POST -H "x-cron-secret: $CRON_SECRET"
 *         https://nezamy.sa/api/v1/cron/deadlines` on the hour.
 *
 * Hourly is enough — reminders are scheduled at 06:00 Riyadh and this only
 * needs to notice that time has passed, not hit it exactly.
 */

const MAX_DELIVER_PER_RUN = 200;

interface MissedDeadlineRow {
  id: string;
  owner_user_id: string;
}

interface OutboxDeliveryRow {
  id: string;
  deadline_id: string | null;
  recipient_user_id: string;
  channel: "in_app" | "email" | "whatsapp";
  kind: string;
  attempts: number | null;
  deadlines: {
    id: string;
    title: string;
    due_date: string;
    case_request_id: string | null;
  } | null;
}

/** The YYYY-MM-DD "today" is in Riyadh (UTC+3, no DST) right now. */
function riyadhTodayIso(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Arabic in-app copy for one reminder. Kind drives the phrasing; the days-left count (when relevant) is agreement-correct via countPhraseAr. */
function buildDeadlineCopy(
  kind: string,
  deadline: { title: string; due_date: string },
  caseTitle: string | null,
  riyadhToday: string,
): { title: string; body: string } {
  const dueAr = toArabicDigits(deadline.due_date);
  const caseSuffix = caseTitle ? ` — ${caseTitle}` : "";

  if (kind === "deadline_missed") {
    return {
      title: `فاتت مهلة: ${deadline.title}${caseSuffix}`,
      body: `تجاوز تاريخ استحقاق هذه المهلة (${dueAr}) دون تسجيل إنجاز.`,
    };
  }
  if (kind === "deadline_due") {
    return {
      title: `تُستحق اليوم: ${deadline.title}${caseSuffix}`,
      body: `موعد استحقاق هذه المهلة اليوم (${dueAr}).`,
    };
  }

  const daysLeft = daysUntil(deadline.due_date, parseIsoDate(riyadhToday) ?? new Date());
  const daysPhrase = daysLeft === null ? null : countPhraseAr(Math.max(daysLeft, 0), {
    zero: "خلال اليوم",
    one: "يوم واحد",
    two: "يومان",
    few: "أيام",
    many: "يوماً",
  });
  return {
    title: `تذكير بمهلة: ${deadline.title}${caseSuffix}`,
    body: `متبقٍ ${daysPhrase ?? "وقت قصير"} على استحقاق هذه المهلة (${dueAr}).`,
  };
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = await createServiceClient();
  const nowIso = new Date().toISOString();
  const riyadhToday = riyadhTodayIso();

  let enqueued = 0;
  let sent = 0;
  let failed = 0;
  let missed = 0;
  let skipped = 0;

  // ── (a) MISSED ─────────────────────────────────────────────────────────
  try {
    const { data: missedRows, error: missedError } = await admin
      .from("deadlines")
      .update({ status: "missed" })
      .eq("status", "open")
      .lt("due_date", riyadhToday)
      .select("id, owner_user_id");

    if (missedError) {
      console.error("[cron/deadlines] marking missed failed:", missedError.message, missedError.code);
    } else {
      const rows = (missedRows ?? []) as MissedDeadlineRow[];
      missed = rows.length;
      for (const row of rows) {
        try {
          const { error: insErr } = await admin.from("notification_outbox").insert({
            deadline_id: row.id,
            recipient_user_id: row.owner_user_id,
            channel: "in_app",
            kind: "deadline_missed",
            scheduled_for: nowIso,
          });
          if (insErr) {
            if (insErr.code !== "23505") {
              console.error("[cron/deadlines] missed outbox insert failed:", row.id, insErr.message, insErr.code);
            }
          } else {
            enqueued++;
          }
        } catch (err) {
          console.error("[cron/deadlines] missed outbox insert threw:", row.id, err);
        }
      }
    }
  } catch (err) {
    console.error("[cron/deadlines] MISSED step threw:", err);
  }

  // ── (b) DELIVER ────────────────────────────────────────────────────────
  try {
    const { data: pendingRows, error: pendingError } = await admin
      .from("notification_outbox")
      .select("id, deadline_id, recipient_user_id, channel, kind, attempts, deadlines(id, title, due_date, case_request_id)")
      .eq("status", "pending")
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(MAX_DELIVER_PER_RUN);

    if (pendingError) {
      console.error("[cron/deadlines] pending outbox query failed:", pendingError.message, pendingError.code);
    } else {
      const rows = (pendingRows ?? []) as unknown as OutboxDeliveryRow[];

      const caseIds = Array.from(new Set(
        rows.map((r) => r.deadlines?.case_request_id).filter((v): v is string => typeof v === "string"),
      ));
      const caseTitles = new Map<string, string>();
      if (caseIds.length > 0) {
        const { data: caseRows, error: caseErr } = await admin
          .from("service_requests")
          .select("id, title")
          .in("id", caseIds);
        if (caseErr) {
          console.error("[cron/deadlines] case titles lookup failed:", caseErr.message, caseErr.code);
        } else {
          for (const c of caseRows ?? []) {
            if (c.title) caseTitles.set(c.id as string, c.title as string);
          }
        }
      }

      for (const row of rows) {
        try {
          const deadline = row.deadlines;
          if (!deadline) { skipped++; continue; }

          const caseTitle = deadline.case_request_id ? caseTitles.get(deadline.case_request_id) ?? null : null;
          const attempts = (row.attempts ?? 0) + 1;

          if (row.channel === "in_app") {
            const { title, body } = buildDeadlineCopy(row.kind, deadline, caseTitle, riyadhToday);
            await recordNotification({
              userId: row.recipient_user_id,
              title,
              body,
              href: "/dashboard/lawyer/deadlines",
            });
            const { error: updErr } = await admin
              .from("notification_outbox")
              .update({ status: "sent", sent_at: nowIso, attempts })
              .eq("id", row.id);
            if (updErr) {
              console.error("[cron/deadlines] outbox update (sent) failed:", row.id, updErr.message);
              skipped++;
              continue;
            }
            sent++;
            continue;
          }

          // channel === "email" | "whatsapp"
          const webhook = process.env.N8N_WEBHOOK_DEADLINE;
          if (!webhook) {
            await admin.from("notification_outbox")
              .update({ status: "failed", last_error: "channel not configured", attempts })
              .eq("id", row.id);
            failed++;
            continue;
          }
          try {
            const res = await fetch(webhook, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(process.env.N8N_WEBHOOK_SECRET ? { "X-Webhook-Secret": process.env.N8N_WEBHOOK_SECRET } : {}),
              },
              body: JSON.stringify({
                recipientUserId: row.recipient_user_id,
                channel: row.channel,
                kind: row.kind,
                deadlineId: deadline.id,
                title: deadline.title,
                dueDate: deadline.due_date,
                caseTitle,
              }),
              signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
              await admin.from("notification_outbox")
                .update({ status: "sent", sent_at: nowIso, attempts })
                .eq("id", row.id);
              sent++;
            } else {
              await admin.from("notification_outbox")
                .update({ status: "failed", last_error: `n8n responded ${res.status}`, attempts })
                .eq("id", row.id);
              failed++;
            }
          } catch (err) {
            await admin.from("notification_outbox")
              .update({ status: "failed", last_error: String((err as Error)?.message ?? err), attempts })
              .eq("id", row.id);
            failed++;
          }
        } catch (err) {
          console.error("[cron/deadlines] delivering one outbox row failed:", row.id, err);
          skipped++;
        }
      }
    }
  } catch (err) {
    console.error("[cron/deadlines] DELIVER step threw:", err);
  }

  // ── (c) PURGE ──────────────────────────────────────────────────────────
  let purged = 0;
  try {
    const cutoffIso = purgeCutoffIso();
    // .lt("deleted_at", cutoffIso) already excludes untouched rows: SQL
    // evaluates `NULL < x` as NULL (not true), so no separate
    // .not("deleted_at", "is", null) is needed alongside it.
    const { data: purgeRows, error: purgeQueryError } = await admin
      .from("attachments")
      .select("id, storage_path")
      .lt("deleted_at", cutoffIso)
      .eq("legal_hold", false);

    if (purgeQueryError) {
      console.error("[cron/deadlines] purge query failed:", purgeQueryError.message, purgeQueryError.code);
    } else {
      const rows = (purgeRows ?? []) as Array<{ id: string; storage_path: string | null }>;
      for (const row of rows) {
        try {
          if (row.storage_path) {
            const { error: removeErr } = await admin.storage.from("documents").remove([row.storage_path]);
            if (removeErr) {
              console.error("[cron/deadlines] purge storage remove failed:", row.id, removeErr.message);
            }
          }
          const { error: delErr } = await admin.from("attachments").delete().eq("id", row.id);
          if (delErr) {
            console.error("[cron/deadlines] purge row delete failed:", row.id, delErr.message, delErr.code);
          } else {
            purged++;
          }
        } catch (err) {
          console.error("[cron/deadlines] purging one attachment threw:", row.id, err);
        }
      }
    }
  } catch (err) {
    console.error("[cron/deadlines] PURGE step threw:", err);
  }

  return NextResponse.json({ enqueued, sent, failed, missed, skipped, purged });
}
