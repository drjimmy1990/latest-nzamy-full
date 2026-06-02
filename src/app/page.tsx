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

export const metadata: Metadata = {
  title: "نظامي | منصة الخدمات القانونية الذكية في السعودية",
  description:
    "نظامي — المنصة القانونية الأولى في المملكة العربية السعودية: استشارات فورية، صياغة عقود بالذكاء الاصطناعي، تمثيل قضائي، وإدارة مكاتب المحاماة في منصة واحدة.",
  keywords: [
    "محامي", "استشارات قانونية", "عقود", "ذكاء اصطناعي قانوني",
    "محكمة", "ديوان المظالم", "المملكة العربية السعودية", "نظامي", "nezamy"
  ],
  alternates: {
    canonical: "https://nezamy.online",
  },
  openGraph: {
    title: "نظامي | منصة الخدمات القانونية الذكية في السعودية",
    description: "استشارات قانونية فورية، صياغة عقود بالذكاء الاصطناعي، وتمثيل قضائي — كل ما تحتاجه في منصة واحدة.",
    url: "https://nezamy.online",
    images: [{ url: "https://nezamy.online/og-image.png", width: 1200, height: 630, alt: "نظامي - المنصة القانونية الذكية" }],
  },
};

import FloatingButtons from "@/components/FloatingButtons";
import HomeRedirectGuard from "@/components/HomeRedirectGuard";

export default function Home() {
  return (
    <>
      {/* S79: redirect مستخدم مسجّل لداشبورده تلقائياً */}
      <HomeRedirectGuard />
      <Navbar />
      <main>
        <Hero />
        <UserTypeSelector />
        <ServicesBento />
        <ContractAnalysisShowcase />
        <AIShowcase />
        <SocialProof />
        <CommunityHighlights />
        <FAQ />
      </main>
      <Footer />
      <FloatingButtons />
    </>
  );
}


