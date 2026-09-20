import ServerSessionGate from "@/components/auth/ServerSessionGate";

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
  return <ServerSessionGate fallbackPath="/settings">{children}</ServerSessionGate>;
}
