import ServerSessionGate from "@/components/auth/ServerSessionGate";
import { buildMetadata } from "@/lib/seo";
import { isSupabaseMode } from "@/lib/runtimeMode";

export const metadata = buildMetadata({
  titleAr: "أسئلتي والمحفوظة — المجتمع القانوني",
  titleEn: "My questions and saved — Legal Community",
  descriptionAr: "أسئلتك في المجتمع القانوني والأسئلة التي حفظتها للرجوع إليها",
  descriptionEn: "Your community questions and the ones you saved for later",
  path: "/community/me",
  noIndex: true,
});

/**
 * /community/me is one member's own list (his questions and his saved ones),
 * so it is gated on the server like /dashboard and /settings — src/proxy.ts is
 * not touched. Demo mode has no server session, so the gate applies in
 * supabase mode only.
 */
export default function CommunityMeLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseMode) return <>{children}</>;
  return <ServerSessionGate fallbackPath="/community/me">{children}</ServerSessionGate>;
}
