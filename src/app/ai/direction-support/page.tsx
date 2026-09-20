"use client";

// UAT-LIVE-AI-001 · UAT-GHOST-002 — honesty gate for «داعم الاتجاه».
//
// WHAT THIS PAGE WAS: a 681-line fixture. Every result it produced came from
// module constants in the `.data.ts` file beside this one — MOCK_TEXTS (نصوص
// نظامية), MOCK_PRECEDENTS (سوابق قضائية), MOCK_CASES (أحكام دولية), BRANCHES
// and EXAMPLES — rendered after a timed "search" that queried nothing. There was
// no API call, no Supabase read and no search index anywhere behind it; the
// only real I/O in the file was `addToInbox(...)`, which saved a fabricated
// result into the lawyer's own inbox. A lawyer could therefore search for the
// نظام governing his case, read back a list of articles and precedents, cite
// them, and none of it had been retrieved from anything.
//
// That is the worst class of defect on this platform — not a blank screen but
// a confident, plausible, invented legal answer — so the page is gated rather
// than left reachable, per owner decision Q5 («hide honestly now») in
// docs/plans/PROFILES_COMPLETION_PLAN_2026-09-20.md §5.
//
// WHAT IS KEPT: everything. The file is not deleted (owner decision ٤: «لا حذف
// للمصدر قبل قرار مستقل») and neither are its three siblings in this folder —
// the `.data.ts` fixture, `.cards.tsx` and `.types.ts` all stay in git and on
// disk. What changes is that NOTHING imports the fixture any more, so it
// leaves the bundle; the check is a grep for that fixture's filename across
// `src`, which must come back empty (this comment names it without spelling
// it, so the grep stays a real check rather than matching itself).
// The previous UI is one `git show` away when a real نصوص/سوابق backend exists
// («مطلب منتج موثق» in the UAT guide — its own spec, explicitly out of this
// plan).
//
// The nav no longer claims otherwise either: the two legal-sidebar rows and
// the lawyer dashboard's AI_QUICK tile were badged «جديد» and are now «قريباً»
// (the convention src/lib/services/navComingSoon.test.ts enforces), and the
// AI hub card no longer prices a page that cannot answer.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function DirectionSupportPage() {
  return (
    <DashboardComingSoon
      title="داعم الاتجاه"
      description="داعم الاتجاه غير متاح حالياً. النصوص النظامية والسوابق والأحكام التي كانت تظهر هنا كانت أمثلة ثابتة داخل الكود، لا نتائج بحث حقيقية في مصادر نظامية، فلا يصح الاستناد إليها. ستُفعَّل الأداة عند ربطها بمصدر نصوص وسوابق حقيقي."
      backHref="/ai"
    />
  );
}
