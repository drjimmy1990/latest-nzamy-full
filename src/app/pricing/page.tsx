"use client";

import { useEffect, useState } from "react";
import Navbar          from "@/components/Navbar";
import Footer          from "@/components/Footer";
import { useTheme }    from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { getPlanList, getComparisonList, faqs } from "@/constants/pricingData";
import type { AudienceTab, Billing, CompanySize } from "@/constants/pricingData";

import { PricingHero }         from "@/components/pricing/PricingHero";
import { PricingCards }        from "@/components/pricing/PricingCards";
import { PromotionalCampaignBanner } from "@/components/pricing/PromotionalCampaignBanner";
import { PricingComparison }   from "@/components/pricing/PricingComparison";
import { PricingTestimonials } from "@/components/pricing/PricingTestimonials";
import { PricingFAQ }          from "@/components/pricing/PricingFAQ";
import { PricingCTA }          from "@/components/pricing/PricingCTA";
import { GovernmentRolesInfo } from "@/components/pricing/GovernmentRolesInfo";
import { audienceTabsView, extraPlanIdsFor, withExtraPlans } from "@/lib/pricing/audienceForUserType";
import { displayCycle, offeredCycles } from "@/lib/pricing/cardPrice";

// Which package families the audience bar offers (owner, 2026-10-24): a
// member sees only their own account type's family — the bar is locked to it
// — while guests and account types with no family of their own (e.g. "admin")
// keep the full bar. The map lives in audienceForUserType.ts so Settings →
// «الاشتراك والباقة» shows the same family.

export default function PricingPage() {
  const { lang } = useTheme();
  const isAr = lang === "ar";
  const { userType, practiceKind, isLoggedIn, loading: userLoading } = useUser();

  const [billing,  setBilling]  = useState<Billing>("monthly");
  const [companySize,  setCompanySize]  = useState<CompanySize>("small");
  const [hasLegalDept, setHasLegalDept] = useState(false);
  const [libraryModeState, setLibraryMode] = useState(false);

  // The audience a guest (or an admin) is browsing. Starts at the guest
  // default — same on server and client — so the first client render matches
  // the SSR markup exactly (audience also toggles extra DOM, e.g. the
  // library-mode toggle).
  const [pickedAudience, setPickedAudience] = useState<AudienceTab>("individuals");

  // Once useUser() resolves, a member is locked to their own family. While it
  // is still loading the bar is not rendered at all (tabsView "pending"), so a
  // member never sees every family flash up and then disappear.
  const tabsView = audienceTabsView({ loading: userLoading, isLoggedIn, userType });
  const audience: AudienceTab = tabsView.kind === "locked" ? tabsView.audience : pickedAudience;
  // The library plans exist on the lawyers and firms tabs only.
  const libraryMode = libraryModeState && (audience === "lawyers" || audience === "firms");

  // Open at the plans, not wherever the previous page was scrolled to.
  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0);
  }, []);

  const planList       = getPlanList(audience, isAr, { hasLegalDept, companySize, libraryMode });
  // A locked independent consultant also gets the «مستشار مستقل» card on the
  // lawyers family (extraPlanIdsFor). Cards only: the comparison table has no
  // column for it.
  const extraPlanIds   = tabsView.kind === "locked" ? extraPlanIdsFor(userType, practiceKind, libraryMode) : [];
  const cardPlanList   = withExtraPlans(planList, extraPlanIds, getPlanList("providers", isAr));
  const comparisonList = getComparisonList(audience, isAr);
  // The table's columns are the cards it has rows for: the individuals'
  // top-ups (owner ٣٠٢) are cards with no column.
  const comparisonPlans = planList.filter((p) => comparisonList.some((c) => c.rows.some((r) => Object.hasOwn(r, p.id))));
  // The cycle toggle (§2 rule 1): the audience's allowed cycles that a card on
  // screen prices; the cards are drawn in the picked cycle while it is offered.
  const cycles         = offeredCycles(audience, cardPlanList);
  const shownBilling   = displayCycle(cycles, billing);
  const faqList        = isAr ? faqs.ar : faqs.en;

  // Reset library mode when switching away from lawyers/firms
  function handleSetAudience(a: typeof audience) {
    if (a !== "lawyers" && a !== "firms") setLibraryMode(false);
    setPickedAudience(a);
  }

  return (
    <>
      <Navbar />
      <div className="bg-surface dark:bg-dark-bg transition-colors duration-300">

        {/* Hero + audience tabs + billing toggle + company filters */}
        <PricingHero
          isAr={isAr} billing={shownBilling} setBilling={setBilling} cycles={cycles}
          audience={audience} setAudience={handleSetAudience}
          companySize={companySize} setCompanySize={setCompanySize}
          hasLegalDept={hasLegalDept} setHasLegalDept={setHasLegalDept}
          libraryMode={libraryMode} setLibraryMode={setLibraryMode}
          audienceTabs={tabsView.kind === "locked" ? "own" : tabsView.kind}
        />

        {/* A dated campaign only (owner ١٧٩); renders nothing today. */}
        <PromotionalCampaignBanner />

        {/* Plan cards + enterprise + SME + quarterly */}
        <PricingCards
          planList={cardPlanList} billing={shownBilling}
          isAr={isAr} audience={audience}
          libraryMode={libraryMode}
        />

        {/* Explain Sub-Roles for B2G License */}
        {audience === "government" && (
          <GovernmentRolesInfo isAr={isAr} />
        )}

        {/* Feature comparison table */}
        {!libraryMode && (
          <PricingComparison
            planList={comparisonPlans} comparisonList={comparisonList} isAr={isAr}
          />
        )}

        {/* Social proof testimonials */}
        <PricingTestimonials isAr={isAr} planList={planList} />

        {/* FAQ accordion */}
        <PricingFAQ isAr={isAr} faqList={faqList} />

        {/* Bottom CTA — sign-up copy, so guests only. */}
        {!isLoggedIn && <PricingCTA isAr={isAr} />}

      </div>
      <Footer />
          </>
  );
}
