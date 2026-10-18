import { Metadata } from "next";

export const metadata: Metadata = {
  title: "المقارن الذكي — نظامي",
  description: "المقارن الذكي — قريباً. الأداة غير متاحة حالياً.",
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
