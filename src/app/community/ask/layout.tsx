import ServerSessionGate from "@/components/auth/ServerSessionGate";
import { isSupabaseMode } from "@/lib/runtimeMode";

/**
 * /community/ask writes a question, which needs an account (owner TODO
 * N05-C4..8: `/community/ask` joins the protected pages). The check runs on the
 * server, in this layout — src/proxy.ts is not touched: a guest who opens the
 * page is sent to /login?from=/community/ask before any form is rendered,
 * instead of filling it in and being refused with a 401 at «نشر».
 * Reading the community (/community, /community/[id]) stays open to guests.
 *
 * Demo mode has no server session (communityStore is its backend), so the
 * gate applies in supabase mode only.
 */
export default function CommunityAskLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseMode) return <>{children}</>;
  return <ServerSessionGate fallbackPath="/community/ask">{children}</ServerSessionGate>;
}
