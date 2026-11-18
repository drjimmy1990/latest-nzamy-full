import ServerSessionGate from "@/components/auth/ServerSessionGate";
import TermsReacceptGate from "@/components/legal/TermsReacceptGate";
import OfferPopup from "@/components/offers/OfferPopup";

/**
 * The first server-side gate any /dashboard/* route has ever had.
 *
 * There was no src/app/dashboard/layout.tsx at all. Each role's layout under it
 * is a "use client" component whose own guard (`<UserTypeGuard>`) reads a
 * browser-side session — and two of the nine carry no guard at all
 * (docs/audits/2026-09-20-profiles-uat/02-auth-session-audit.md §4). This layout
 * is async and runs on the server, so an unauthenticated direct URL is answered
 * before any dashboard markup is produced.
 *
 * The nested client layouts (dashboard/lawyer/layout.tsx and the eight beside
 * it) keep working unchanged: App Router allows a client layout under a server
 * parent — `children` crosses the boundary as an already-rendered React node,
 * and this file imports none of them.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // R7: the terms re-ask modal (renders nothing unless the account has not
  // accepted the current terms version).
  return (
    <ServerSessionGate fallbackPath="/dashboard">
      {children}
      <TermsReacceptGate />
      {/* Owner item 5: one offer popup per sign-in (never on billing,
          wallets, the admin console, or while the terms re-ask is open). */}
      <OfferPopup />
    </ServerSessionGate>
  );
}
