import { redirect } from "next/navigation";
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";

/**
 * /lawyers/browse — the multi-vendor directory. Closed during the single-firm
 * beta (BETA_MONOPOLY_MODE): the owner keeps it closed for privacy (Q151,
 * 2026-10-03), so it goes to the firm's intake as before. This redirect used
 * to sit in src/app/lawyers/layout.tsx and cover the whole subtree, including
 * each lawyer's own profile page; it is scoped to the directory now so a
 * lawyer's shared profile link (/lawyers/[slug]) opens.
 */
export default function LawyersBrowseLayout({ children }: { children: React.ReactNode }) {
  if (BETA_MONOPOLY_MODE) redirect("/services/lawyers");
  return <>{children}</>;
}
