import { Metadata } from "next";

export const metadata: Metadata = {
  title: "المقارن الذكي — نظامي",
  description: "قارن بين نسختين من أي وثيقة قانونية واستخرج الاختلافات والمخاطر والتعارضات تلقائياً بالذكاء الاصطناعي",
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
