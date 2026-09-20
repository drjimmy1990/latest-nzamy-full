"use client";

import { useEffect, useRef, useState } from "react";
import Navbar          from "@/components/Navbar";
import Footer          from "@/components/Footer";
import { useTheme }    from "@/components/ThemeProvider";
import { useUser, type UserType } from "@/hooks/useUser";
import { getPlanList, getComparisonList, faqs } from "@/constants/pricingData";
import type { AudienceTab, Billing, CompanySize } from "@/constants/pricingData";

import { PricingHero }         from "@/components/pricing/PricingHero";
import { PricingCards }        from "@/components/pricing/PricingCards";
import { PricingComparison }   from "@/components/pricing/PricingComparison";
import { PricingTestimonials } from "@/components/pricing/PricingTestimonials";
import { PricingFAQ }          from "@/components/pricing/PricingFAQ";
import { PricingCTA }          from "@/components/pricing/PricingCTA";
import { GovernmentRolesInfo } from "@/components/pricing/GovernmentRolesInfo";

// FIX P5: package family (AudienceTab) a logged-in user's account type
// defaults to. Guests and account types with no dedicated family (e.g.
// "admin" — there's no admin pricing tab) fall back to "individuals", the
// platform-wide default; the selector stays visible so anyone can still
// browse the other families explicitly.
const USER_TYPE_TO_AUDIENCE: Partial<Record<NonNullable<UserType>, AudienceTab>> = {
  lawyer:     "lawyers",
  firm:       "firms",
  individual: "individuals",
  corporate:  "companies",
  micro:      "micro",
  government: "government",
  ngo:        "ngo",
  provider:   "providers",
};

function audienceForUserType(userType: UserType | null | undefined): AudienceTab {
  return (userType && USER_TYPE_TO_AUDIENCE[userType]) || "individuals";
}

export default function PricingPage() {
  const { lang } = useTheme();
  const isAr = lang === "ar";
  const { userType, isLoggedIn, loading: userLoading } = useUser();

  const [billing,  setBilling]  = useState<Billing>("monthly");
  const [companySize,  setCompanySize]  = useState<CompanySize>("small");
  const [hasLegalDept, setHasLegalDept] = useState(false);
  const [libraryMode,  setLibraryMode]  = useState(false);

  // FIX P5: smart-default audience tab based on logged-in user role.
  // Starts at the guest default — same on server and client — so the first
  // client render matches the SSR markup exactly (audience also toggles
  // extra DOM, e.g. the library-mode toggle, so guessing synchronously from
  // localStorage here caused a hydration mismatch). Once useUser() resolves
  // client-side, the effect below applies the real default — but only until
  // the user explicitly picks a tab themselves, so we never clobber that.
  const [audience, setAudience] = useState<AudienceTab>("individuals");
  const userPickedRef = useRef(false);
  useEffect(() => {
    if (userLoading || userPickedRef.current || !isLoggedIn) return;
    setAudience(audienceForUserType(userType));
  }, [userLoading, isLoggedIn, userType]);

  const planList       = getPlanList(audience, isAr, { hasLegalDept, companySize, libraryMode });
  const comparisonList = getComparisonList(audience, isAr);
  const faqList        = isAr ? faqs.ar : faqs.en;

  // Reset library mode when switching away from lawyers/firms
  function handleSetAudience(a: typeof audience) {
    userPickedRef.current = true; // explicit user choice — stop auto-defaulting
    if (a !== "lawyers" && a !== "firms") setLibraryMode(false);
    setAudience(a);
  }

  return (
    <>
      <Navbar />
      <div className="bg-surface dark:bg-dark-bg transition-colors duration-300">

        {/* Hero + audience tabs + billing toggle + company filters */}
        <PricingHero
          isAr={isAr} billing={billing} setBilling={setBilling}
          audience={audience} setAudience={handleSetAudience}
          companySize={companySize} setCompanySize={setCompanySize}
          hasLegalDept={hasLegalDept} setHasLegalDept={setHasLegalDept}
          libraryMode={libraryMode} setLibraryMode={setLibraryMode}
        />

        {/* Plan cards + enterprise + SME + quarterly */}
        <PricingCards
          planList={planList} billing={billing}
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
            planList={planList} comparisonList={comparisonList} isAr={isAr}
          />
        )}

        {/* Social proof testimonials */}
        <PricingTestimonials isAr={isAr} planList={planList} />

        {/* FAQ accordion */}
        <PricingFAQ isAr={isAr} faqList={faqList} />

        {/* Bottom CTA */}
        <PricingCTA isAr={isAr} />

      </div>
      <Footer />
          </>
  );
}
