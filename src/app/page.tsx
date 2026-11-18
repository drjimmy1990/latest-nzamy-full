import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import { PromotionalCampaignBanner } from "@/components/pricing/PromotionalCampaignBanner";
import Hero from "@/components/Hero";
import UserTypeSelector from "@/components/UserTypeSelector";
import ServicesBento from "@/components/ServicesBento";
import ContractAnalysisShowcase from "@/components/ContractAnalysisShowcase";
import AIShowcase from "@/components/AIShowcase";
import SocialProof from "@/components/SocialProof";
import CommunityHighlights from "@/components/CommunityHighlights";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";
import { buildOrganizationJsonLd, serializeJsonLd } from "@/lib/publicSeo/structuredData";

const HOME_DESCRIPTION =
  "نظامي — المنصة القانونية الأولى في المملكة العربية السعودية: استشارات فورية، صياغة عقود بالذكاء الاصطناعي، تمثيل قضائي، وإدارة مكاتب المحاماة في منصة واحدة.";

// Organization structured data (schema.org) — server-rendered, so it lands in
// the initial HTML. Owner decision Q27: an Organization, not a schema.org
// LegalService (the type for law firms). Built in
// src/lib/publicSeo/structuredData.ts (owner 18 Nov, item 4.5): contact,
// address, sameAs, and the commercial-registration / licence fields, which
// stay out of the JSON-LD until the owner sends them.
const organizationJsonLd = buildOrganizationJsonLd();

export const metadata: Metadata = {
  title: "نظامي | منصة الخدمات القانونية الذكية في السعودية",
  description: HOME_DESCRIPTION,
  keywords: [
    "محامي", "استشارات قانونية", "عقود", "ذكاء اصطناعي قانوني",
    "محكمة", "ديوان المظالم", "المملكة العربية السعودية", "نظامي", "nezamy"
  ],
  alternates: {
    canonical: "https://nezamy.sa",
  },
  openGraph: {
    title: "نظامي | منصة الخدمات القانونية الذكية في السعودية",
    description: "استشارات قانونية فورية، صياغة عقود بالذكاء الاصطناعي، وتمثيل قضائي — كل ما تحتاجه في منصة واحدة.",
    url: "https://nezamy.sa",
    images: [{ url: "https://nezamy.sa/og-image.png", width: 1024, height: 1024, alt: "نظامي - المنصة القانونية الذكية" }],
  },
};

import HomeRedirectGuard from "@/components/HomeRedirectGuard";

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationJsonLd) }}
      />
      {/* S79: redirect مستخدم مسجّل لداشبورده تلقائياً */}
      <HomeRedirectGuard />
      <Navbar />
      <div className="flex flex-col">
        <Hero />
        {/* A dated campaign only (owner ١٧٩); renders nothing today. */}
        <PromotionalCampaignBanner />
        <UserTypeSelector />
        <ServicesBento />
        <ContractAnalysisShowcase />
        <AIShowcase />
        <SocialProof />
        <CommunityHighlights />
        <FAQ />
      </div>
      <Footer />
    </>
  );
}


