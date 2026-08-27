"use client";

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

/**
 * «تحديثات قضيتي» — retired in favour of an honest marker.
 *
 * WHAT WAS HERE: a complete, entirely fabricated case file. A named lawyer
 * («م. فيصل الغامدي») who is in no table; two court hearings with dates
 * («جلسة المرافعة النهائية — ٢٢ مايو ٢٠٢٦»); a filed statement of claim; a
 * court acceptance notice; and a «تقدّم القضية ٦٧٪» progress bar computed off
 * that invented list — all of it under a subheading promising «كل ما شاركه
 * محاميك معك — مباشرة وفوري». Every client saw the same six rows about the
 * same imaginary lawsuit. It also carried an «اسأل عن قضيتي» button wired to
 * nothing.
 *
 * WHY THIS IS A MARKER AND NOT A REBUILD — two facts, both checked:
 *
 *  1. There is no cross-order event feed to read. `request_events` is exposed
 *     to a client in exactly one place, GET /api/v1/service-requests/[id],
 *     i.e. one order at a time. Assembling "all my updates" would mean N
 *     detail fetches from the browser, or a new endpoint. Neither is a page.
 *
 *  2. The per-order timeline this page was imitating ALREADY EXISTS and is
 *     already real: ../[id]/page.tsx renders those same `request_events` rows
 *     as «مسار القضية», with `EVENT_LABELS` translating the vocabulary from
 *     src/lib/events.ts. Rebuilding a second, weaker copy of it here would add
 *     a place for the two to disagree.
 *
 * And hearings, which were half of what this page showed, are not modelled at
 * all: nothing in the schema stores a hearing for a client, so no honest
 * version of this screen can list one. Removing the promise is the fix.
 *
 * Nothing in the tree links here — the route stays only so an existing
 * bookmark lands on the truth instead of a 404.
 */
export default function ClientCaseUpdatesPage() {
  return (
    <DashboardComingSoon
      title="تحديثات قضيتي"
      description="لا يوجد حتى الآن سجلّ موحّد لتحديثات جميع قضاياك في صفحة واحدة. سجلّ الأحداث يُحفظ لكل طلب على حدة، وتجده كاملاً داخل «ملف القضية» تحت عنوان «مسار القضية». ومواعيد الجلسات لا تُسجَّل في المنصة بعد، فلا يمكن عرضها هنا."
      backHref="/dashboard/client/cases"
    />
  );
}
