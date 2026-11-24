import { PRIVATE_ROBOTS } from "@/lib/publicSeo/privatePages";

// A private page (batch l15): <meta name="robots" content="noindex, follow">.
export const metadata = { robots: PRIVATE_ROBOTS, title: "تأكيد رقم الجوال" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
