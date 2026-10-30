/**
 * The 7- and 3-day library reminders (owner note ١٨ C06) — the pure half of
 * POST /api/v1/cron/library-grant-reminders.
 *
 * A user is reminded about the END OF HIS CHAIN of grants (libraryCoverage):
 * someone who renewed early is not told "ends in 7 days" while the next
 * grant is already lined up. The reminder key is (chain-end grant, offset);
 * the database primary key on public.library_grant_reminders (20261030_66)
 * makes the send idempotent — the route inserts the marker first and
 * notifies only when the insert created it.
 *
 * Relative imports only: `node --test` loads it (libraryAccessReminders.test.ts).
 */

import {
  libraryCoverage,
  libraryDaysLeft,
  libraryEndsAtAr,
  libraryReminderOffset,
  type LibraryGrantRow,
  type LibraryReminderOffset,
} from './libraryAccess.ts';

export interface LibraryGrantRowWithUser extends LibraryGrantRow {
  user_id: string;
}

export interface PlannedLibraryReminder {
  userId: string;
  /** The grant whose end is the end of the user's chain (the marker key). */
  grantId: string;
  offset: LibraryReminderOffset;
  endsAt: string;
}

/**
 * Which reminders are due at `now`, one per user at most. `rows` are the
 * candidate users' live grants (any order, any mix of users). A user whose
 * access has not started yet ('upcoming') is not reminded.
 */
export function planLibraryReminders(rows: readonly LibraryGrantRowWithUser[], now: Date): PlannedLibraryReminder[] {
  const byUser = new Map<string, LibraryGrantRowWithUser[]>();
  for (const r of rows) {
    if (!r || typeof r.user_id !== 'string') continue;
    const list = byUser.get(r.user_id);
    if (list) list.push(r);
    else byUser.set(r.user_id, [r]);
  }
  const out: PlannedLibraryReminder[] = [];
  for (const [userId, list] of byUser) {
    const c = libraryCoverage(list, now);
    if (c.status !== 'active') continue;
    const offset = libraryReminderOffset(c.endsAt, now);
    if (offset === null) continue;
    out.push({ userId, grantId: c.lastGrantId, offset, endsAt: c.endsAt });
  }
  return out.sort((a, b) => a.endsAt.localeCompare(b.endsAt) || a.userId.localeCompare(b.userId));
}

/** The in-app notice of one reminder (Arabic). The link opens the renew page. */
export function libraryReminderNotice(r: PlannedLibraryReminder, now: Date): {
  title: string;
  body: string;
  href: string;
} {
  const until = libraryEndsAtAr(r.endsAt);
  const days = libraryDaysLeft(r.endsAt, now);
  const left =
    days <= 1 ? 'خلال يوم واحد' : days === 2 ? 'خلال يومين' : `خلال ${days} أيام`;
  return {
    title: r.offset === 3 ? 'اشتراك المكتبة ينتهي قريباً جداً' : 'اشتراك المكتبة ينتهي قريباً',
    body:
      `ينتهي اشتراكك في المكتبة القانونية ${left}`.trim() +
      (until ? ` (${until})` : '') +
      '. جدّد الآن حتى لا ينقطع وصولك إلى النصوص الكاملة.',
    href: '/laws/subscribe',
  };
}
