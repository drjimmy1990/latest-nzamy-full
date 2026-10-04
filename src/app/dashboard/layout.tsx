import ServerSessionGate from "@/components/auth/ServerSessionGate";

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
  return <ServerSessionGate fallbackPath="/dashboard">{children}</ServerSessionGate>;
}
