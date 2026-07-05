/**
 * Settings Layout — pass-through.
 *
 * /settings renders its own full-page chrome (Navbar + settings-tab rail + Footer
 * + FloatingButtons) in src/app/settings/page.tsx. Wrapping it in a dashboard
 * layout (SharedSidebar + `lg:mr-64` main offset + a duplicate FloatingButtons)
 * caused the sidebar/rail overlap + duplicated controls reported in CLIENT-2.6.
 * Keep this a no-op wrapper.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
