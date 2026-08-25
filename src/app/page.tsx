import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import UserTypeSelector from "@/components/UserTypeSelector";
import ServicesBento from "@/components/ServicesBento";
import ContractAnalysisShowcase from "@/components/ContractAnalysisShowcase";
import AIShowcase from "@/components/AIShowcase";
import SocialProof from "@/components/SocialProof";
import CommunityHighlights from "@/components/CommunityHighlights";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";

const HOME_DESCRIPTION =
  "نظامي — المنصة القانونية الأولى في المملكة العربية السعودية: استشارات فورية، صياغة عقود بالذكاء الاصطناعي، تمثيل قضائي، وإدارة مكاتب المحاماة في منصة واحدة.";

// LegalService structured data (schema.org) — same server-rendered
// <script type="application/ld+json"> pattern as ArticleJsonLd.tsx, so it
// lands in the initial HTML with no client hydration required.
const legalServiceJsonLd = {
  "@context": "https://schema.org",
  "@type": "LegalService",
  name: "نظامي",
  url: "https://nezamy.sa",
  logo: "https://nezamy.sa/logo.png",
  description: HOME_DESCRIPTION,
  areaServed: "SA",
  availableLanguage: ["ar", "en"],
};

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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(legalServiceJsonLd) }}
      />
      {/* S79: redirect مستخدم مسجّل لداشبورده تلقائياً */}
      <HomeRedirectGuard />
      <Navbar />
      <div className="flex flex-col">
        <Hero />
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


