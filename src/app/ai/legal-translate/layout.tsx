import { Metadata } from "next";

export const metadata: Metadata = {
  title: "المترجم القانوني — نظامي",
  description: "ترجمة احترافية للنصوص القانونية من وإلى العربية والإنجليزية والفرنسية مع قاموس مصطلحات تلقائي",
};

export default function LegalTranslateLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
