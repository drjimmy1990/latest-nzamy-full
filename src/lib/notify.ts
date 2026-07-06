/**
 * notify.ts — server-side in-app notification writer
 * ─────────────────────────────────────────────────────────
 * The notifications *plumbing* already exists (table `notifications`, route
 * /api/v1/notifications, useNotifications Realtime hook, Navbar bell,
 * /notifications page). This is the missing piece: a service-role helper that
 * INSERTS a row when a server event happens (entitlement decided, service
 * request created/assigned/completed, …). Best-effort — never throws into the
 * caller's happy path.
 *
 * The `notifications` table columns are (id, user_id, title, body, href,
 * read_at, created_at). type/severity live client-side (notificationsStore),
 * so we only write the four content columns.
 */

import { createServiceClient } from "@/lib/supabase/server";

export interface NotifyInput {
  userId: string;
  title: string;
  body?: string;
  href?: string;
}

export async function recordNotification(input: NotifyInput): Promise<void> {
  try {
    const admin = await createServiceClient();
    await admin.from("notifications").insert({
      user_id: input.userId,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
    });
  } catch (e) {
    // Notifications are non-critical — log and swallow.
    console.error("[notify] recordNotification failed:", e);
  }
}
