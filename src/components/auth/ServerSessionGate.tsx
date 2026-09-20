import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveAuthOutcome } from "@/lib/auth/resolveAuthOutcome";

/**
 * The server-side half of "is this visitor signed in?".
 *
 * Before this component, NO route under /dashboard was protected by anything
 * that runs on the server. `src/proxy.ts` gated the request, and then the page
 * itself decided who the visitor was entirely in the browser: `useUser()` +
 * `<UserTypeGuard>`, i.e. a React state that can be, and in demo mode was,
 * populated from localStorage. Seven of the nine dashboard layouts carried a
 * UserTypeGuard, two carried none at all
 * (docs/audits/2026-09-20-profiles-uat/02-auth-session-audit.md §4, H3). This
 * asks the server, on the server, with the request's own cookies.
 *
 * It is NOT a replacement for RLS and does not pretend to be one — RLS is what
 * keeps one account's rows away from another. It is the gate that makes an
 * unauthenticated direct URL land on /login instead of rendering a shell.
 *
 * The three outcomes follow src/lib/auth/resolveAuthOutcome.ts:
 *   anonymous   → redirect to /login?from=<this path>
 *   unavailable → render the page with an honest Arabic banner. A dropped
 *                 packet must not sign anyone out; the page's own data reads
 *                 will fail on their own terms and say so.
 *   ok          → children, untouched.
 */

/** Where the banner's copy lives, so /dashboard and /settings cannot drift. */
export const SESSION_UNAVAILABLE_BANNER_AR =
  "تعذّر التحقق من الجلسة، بعض البيانات قد لا تظهر";

/**
 * Next gives a server layout no way to ask "which URL am I rendering?", so
 * src/proxy.ts stamps it on the request for every PROTECTED page. The other two
 * names are read as well in case a future Next release exposes one of them;
 * `fallbackPath` is used when none is present (a direct render in a context the
 * proxy never saw).
 */
async function currentPath(fallbackPath: string): Promise<string> {
  const h = await headers();
  return (
    h.get("x-nzamy-pathname") ??
    h.get("x-pathname") ??
    h.get("x-invoke-path") ??
    fallbackPath
  );
}

export default async function ServerSessionGate({
  children,
  fallbackPath,
}: {
  children: React.ReactNode;
  /** Used for the ?from= value when the proxy header is absent. */
  fallbackPath: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const outcome = resolveAuthOutcome(user, error);

  if (outcome === "anonymous") {
    const from = await currentPath(fallbackPath);
    redirect(`/login?from=${encodeURIComponent(from)}`);
  }

  if (outcome === "unavailable") {
    console.error("[auth] getUser transport failure (server gate)", {
      path: await currentPath(fallbackPath),
      name: error?.name,
      status: error?.status,
      message: error?.message,
    });
    return (
      <>
        <div
          dir="rtl"
          role="status"
          className="mx-auto mt-3 w-[min(100%-1.5rem,64rem)] rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-[13px] font-semibold text-amber-700 dark:text-amber-300"
        >
          {SESSION_UNAVAILABLE_BANNER_AR}
        </div>
        {children}
      </>
    );
  }

  return <>{children}</>;
}
