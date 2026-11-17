import type { Metadata } from "next";
import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

/**
 * /ai/compliance — N06-22 (owner package 13 Nov 2026): the URL answered 404.
 * Nothing in the app links it; it is the URL people guess for a compliance
 * tool. No redirect: the only compliance pages are /ai/corp/compliance
 * (corporate-only, itself «قريباً», and the /ai/corp prefix switches the shell
 * to the business sidebar) and /ai/gov/compliance-checker (government) — the
 * wrong door for a lawyer or a firm. An honest «قريباً» page instead.
 */
export const metadata: Metadata = {
  title: "مراقب الامتثال — قريباً | نظامي",
  robots: { index: false, follow: false },
};

export default function AiCompliancePage() {
  return (
    <DashboardComingSoon
      title="مراقب الامتثال"
      description="أداة مراقبة الامتثال غير متاحة حالياً وستُفعَّل قريباً. لتتبّع ما يصدر ويُعدَّل من الأنظمة يمكنك استخدام «راصد التشريعات»."
      backHref="/ai"
    />
  );
}
