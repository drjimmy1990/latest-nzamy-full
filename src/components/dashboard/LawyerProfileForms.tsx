"use client";

/*
 * ─── WHAT THIS FILE NO LONGER EXPORTS ────────────────────────────────────────
 * `OverviewTab` below is the only export left, and the only one that ever had a
 * caller: src/app/dashboard/lawyer/profile/page.tsx. Five orphans were deleted
 * — exported, imported nowhere, and reachable from no screen:
 *
 *   • `ShareModal` — the worst of them, and a landmine for whoever re-mounted
 *     it. It displayed `nezamy.sa/share/lawyer/xK9mP3q` as the lawyer's share
 *     link and copied `https://nezamy.sa/share/lawyer/xK9mP3q` to his
 *     clipboard: one hardcoded literal, identical for all six lawyers, and a
 *     404. Its two action buttons — «مشاركة عبر واتسآب» and «مشاركة البطاقة» —
 *     had no onClick at all, so the six privacy toggles above them (including
 *     «التحليلات المالية») were collected and dropped. It also required a
 *     `WIN_RATE_PCT` prop, and no win rate exists: nothing in this schema
 *     records a case outcome. This closes the audit rows recorded at
 *     docs/audits/2026-08-27-lawyer-audit.md:83-84.
 *   • `AchievementsTab` and `ReviewsTab` — the tabs the profile page had
 *     already stopped rendering. Both took their entire contents as props
 *     (points, milestones, reviews) and no caller remained to supply them;
 *     there is no achievements table and no reviews table.
 *   • `SpotlightCard` and `RingScore` — presentational leftovers of the removed
 *     «الأداء» tab. Components NAMED SpotlightCard also exist, locally and
 *     independently, in src/app/ai/analyze/_components/ClientMediaPanel.tsx:67,
 *     src/app/lawyers/browse/page.tsx:245 and
 *     src/components/pricing/PricingCards.tsx:35 — each declared with a local
 *     `function`, none of them importing this one. Verified before deleting.
 *
 * The framer-motion, react and @phosphor-icons/react imports went with them:
 * OverviewTab uses no hook, no animation and no icon.
 *
 * All of it is in git history and can be restored the day it has a data source.
 */

// ─── Overview Tab ────────────────────────────────────────────────────────────

/*
 * ─── WHAT THIS TAB NO LONGER CLAIMS ──────────────────────────────────────────
 * Four cards were removed. None of them could ever hold anything, so each one
 * was a heading over nothing on every lawyer's screen — not an empty state
 * waiting to fill:
 *
 *   • «المؤهلات»  — mapped `profile.education`.
 *   • «المحاكم»   — mapped `profile.courts`.
 *   • «اللغات»    — mapped `profile.languages`, and drew a five-segment
 *     proficiency bar whose fill condition was `s <= 5`, i.e. always true, so
 *     any language it ever listed would have shown permanent full fluency.
 *   • «التواصل الاجتماعي» — worse than empty. It mapped a TWO-ELEMENT LITERAL
 *     array over `profile.linkedin` / `profile.twitter`, so it painted a
 *     LinkedIn icon and an X icon beside two blank spans on every render,
 *     regardless of what the profile contained.
 *
 * `lawyer_profiles` (supabase/migrations/20260603_phase1_001_profiles.sql) has
 * no education, courts, languages, linkedin or twitter column; GET
 * /api/v1/profile never sets any of them; and nothing in the app collects them.
 * Making them real needs a schema change plus an editor, so the promise is
 * removed rather than displayed. The three-column grid went with them: with the
 * whole side column gone it reserved a third of the page for an empty div.
 *
 * What remains is what has a source — `bio_ar` and `specialties`.
 *
 * CORRECTED: this paragraph used to argue that "this tab renders only in the
 * `ready` state, so a blank here means the field is genuinely empty". That was
 * wrong, and it is what let the empty-bio sentence become a false statement.
 * `ready` covers the whole GET; it says nothing about whether the
 * `lawyer_profiles` sub-query inside that GET succeeded. A blank `bio` in the
 * `ready` state can still mean "not read", which is why the render below takes
 * `roleProfileReadFailed` rather than trusting the load state.
 *
 * The removed UI is preserved in git history and can be restored once the
 * columns exist.
 */

interface OverviewTabProps {
  isDark: boolean;
  profile: {
    bio: string;
    expertise: string[];
    /*
     * Whether the `lawyer_profiles` read FAILED — supplied by the page from the
     * route's `roleProfileReadFailed` marker.
     *
     * This tab renders in the `ready` state, and `ready` does NOT imply the
     * professional row was read: the page computes the two independently
     * (profile/page.tsx, `setLoadState("ready")` runs whatever the sub-query
     * did). So an empty `bio` has two causes, and only one of them may be
     * described as the lawyer's own omission — see the gate below.
     */
    roleProfileReadFailed: boolean;
  };
  cardClass: string;
}

export function OverviewTab({ isDark, profile, cardClass }: OverviewTabProps) {
  return (
    <div className={`${cardClass} p-5 space-y-4`}>
      <h2 className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>نبذة مهنية</h2>
      {profile.bio.trim() ? (
        <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
          {profile.bio}
        </p>
      ) : profile.roleProfileReadFailed ? (
        /*
          «لم تُضَف … بعد» is a claim about what the LAWYER did, and it was
          being made over a bio the server had merely failed to fetch: the
          route discarded the sub-query error, the page mapped the resulting
          null to `bio: ""`, and this line told a lawyer who HAD written a
          bio that he had not. It also contradicted the banner ~110 lines up
          the same screen, which promised «لم نعرض قيماً بديلة عن الحقول التي
          لم تُقرأ» — and then this supplied one.
        */
        <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          تعذّر قراءة نبذتك المهنية، فلم نعرض شيئاً مكانها.
        </p>
      ) : (
        // Read succeeded and the field is genuinely empty — including the case
        // of no professional row at all, where "has not been added" is still
        // true.
        <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          لم تُضَف نبذة مهنية بعد.
        </p>
      )}

      {profile.expertise.length > 0 && (
        <div>
          <p
            className={`text-[11px] font-bold uppercase tracking-wide mb-2 ${
              isDark ? "text-zinc-600" : "text-slate-400"
            }`}
          >
            مجالات التخصص
          </p>
          <div className="flex flex-wrap gap-1.5">
            {profile.expertise.map((e) => (
              <span
                key={e}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                  isDark ? "bg-[#0B3D2E]/30 text-emerald-400" : "bg-[#0B3D2E]/8 text-[#0B3D2E]"
                }`}
              >
                {e}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
