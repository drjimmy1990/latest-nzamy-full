import { Metadata } from "next";

export const metadata: Metadata = {
  title: "المترجم القانوني — نظامي",
  description: "المترجم القانوني — قريباً. الأداة غير متاحة حالياً.",
};

export default function LegalTranslateLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
