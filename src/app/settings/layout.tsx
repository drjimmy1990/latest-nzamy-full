import ServerSessionGate from "@/components/auth/ServerSessionGate";
import TermsReacceptGate from "@/components/legal/TermsReacceptGate";
import { PRIVATE_ROBOTS } from "@/lib/publicSeo/privatePages";

// Owner 18 Nov, item 4.3: a private page — <meta name="robots" content="noindex, follow">
// (next.config.ts also sends it as X-Robots-Tag). A child page's own robots wins.
export const metadata = { robots: PRIVATE_ROBOTS };

/**
 * Settings Layout — pass-through, plus the server-side session gate.
 *
 * /settings renders its own full-page chrome (Navbar + settings-tab rail + Footer
 * + FloatingButtons) in src/app/settings/page.tsx. Wrapping it in a dashboard
 * layout (SharedSidebar + `lg:mr-64` main offset + a duplicate FloatingButtons)
 * caused the sidebar/rail overlap + duplicated controls reported in CLIENT-2.6.
 * Keep this a no-op wrapper.
 *
 * The one thing it now does: this file is (and always was) a SERVER component,
 * while src/app/settings/page.tsx is "use client" — so this is the only place on
 * the /settings route where the server can be asked who the visitor is. It adds
 * no chrome; ServerSessionGate renders `children` unchanged unless the session
 * is definitively absent (redirect to /login) or unverifiable (an Arabic banner
 * above the page, never a sign-out). See ServerSessionGate for why.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // R7: the terms re-ask modal (renders nothing unless the account has not
  // accepted the current terms version).
  return (
    <ServerSessionGate fallbackPath="/settings">
      {children}
      <TermsReacceptGate />
    </ServerSessionGate>
  );
}
