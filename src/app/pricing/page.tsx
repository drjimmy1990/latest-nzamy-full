"use client";

import { useState } from "react";
import Navbar          from "@/components/Navbar";
import Footer          from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme }    from "@/components/ThemeProvider";
import { getPlanList, getComparisonList, faqs } from "@/constants/pricingData";
import type { AudienceTab, Billing, CompanySize } from "@/constants/pricingData";

import { PricingHero }         from "@/components/pricing/PricingHero";
import { PricingCards }        from "@/components/pricing/PricingCards";
import { PricingComparison }   from "@/components/pricing/PricingComparison";
import { PricingTestimonials } from "@/components/pricing/PricingTestimonials";
import { PricingFAQ }          from "@/components/pricing/PricingFAQ";
import { PricingCTA }          from "@/components/pricing/PricingCTA";
import { GovernmentRolesInfo } from "@/components/pricing/GovernmentRolesInfo";

export default function PricingPage() {
  const { lang } = useTheme();
  const isAr = lang === "ar";

  const [billing,  setBilling]  = useState<Billing>("monthly");
  const [companySize,  setCompanySize]  = useState<CompanySize>("small");
  const [hasLegalDept, setHasLegalDept] = useState(false);

  // FIX B8: smart-default audience tab based on logged-in user role
  const [audience, setAudience] = useState<AudienceTab>(() => {
    if (typeof window === "undefined") return "individuals";
    try {
      const raw = localStorage.getItem("nzamy_demo_role");
      if (raw && raw !== "guest") {
        const parsed = JSON.parse(raw) as { userType?: string };
        if (parsed.userType === "lawyer")    return "lawyers";
        if (parsed.userType === "firm")      return "firms";
        if (parsed.userType === "corporate") return "companies";
        if (parsed.userType === "micro")     return "micro";
        if (parsed.userType === "provider")  return "providers";
      }
    } catch {}
    return "individuals";
  });

  const planList       = getPlanList(audience, isAr, { hasLegalDept, companySize });
  const comparisonList = getComparisonList(audience, isAr);
  const faqList        = isAr ? faqs.ar : faqs.en;

  return (
    <>
      <Navbar />
      <main className="bg-surface dark:bg-dark-bg transition-colors duration-300">

        {/* Hero + audience tabs + billing toggle + company filters */}
        <PricingHero
          isAr={isAr} billing={billing} setBilling={setBilling}
          audience={audience} setAudience={setAudience}
          companySize={companySize} setCompanySize={setCompanySize}
          hasLegalDept={hasLegalDept} setHasLegalDept={setHasLegalDept}
        />

        {/* Plan cards + enterprise + SME + quarterly */}
        <PricingCards
          planList={planList} billing={billing}
          isAr={isAr} audience={audience}
        />

        {/* Explain Sub-Roles for B2G License */}
        {audience === "government" && (
          <GovernmentRolesInfo isAr={isAr} />
        )}

        {/* Feature comparison table */}
        <PricingComparison
          planList={planList} comparisonList={comparisonList} isAr={isAr}
        />

        {/* Social proof testimonials */}
        <PricingTestimonials isAr={isAr} planList={planList} />

        {/* FAQ accordion */}
        <PricingFAQ isAr={isAr} faqList={faqList} />

        {/* Bottom CTA */}
        <PricingCTA isAr={isAr} />

      </main>
      <Footer />
      <FloatingButtons />
    </>
  );
}
