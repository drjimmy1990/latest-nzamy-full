import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { needsOnboarding } from "@/lib/auth/onboardingGate";
import {
  FALLBACK_DASHBOARD_PATH,
  dashboardPathFor,
  isDbUserType,
} from "@/lib/auth/userTypes";

/**
 * OAuth callback route handler.
 *
 * An OAuth provider sends the browser back here with a `code`. This route
 * exchanges that code for a session and then decides where the person lands:
 * the onboarding wizard if their account is not finished, otherwise the
 * dashboard for their account type.
 *
 * ── Where the account type comes from, and why it changed (defect G4) ──────
 * This route used to read `user.user_metadata.user_type` and default it to
 * `"individual"`. An OAuth provider populates none of our own metadata, so
 * that read was `undefined` for every Google account and the default fired
 * every time: a lawyer, a firm, a company, a government body, an NGO and a
 * service provider were all sent to /dashboard/client. `profiles.user_type`
 * is written by the signup trigger for every account however it was created,
 * so it is read here instead. Metadata is no longer consulted for routing.
 *
 * ── Why the profiles row is already there when this runs ───────────────────
 * `on_auth_user_created` is an AFTER INSERT ... FOR EACH ROW trigger on
 * auth.users (supabase/migrations/20260630_handle_new_user_sectors.sql:111-114;
 * its function body was later replaced by
 * supabase/migrations/20260716_security_hardening.sql:19-110). A row-level
 * AFTER INSERT trigger runs inside the transaction that performs the insert,
 * so the profiles row commits together with the auth.users row — and if the
 * trigger were to fail, the auth.users insert would roll back with it and
 * there would be no session to exchange a code for. There is therefore no
 * window in which the read below can arrive before the row exists. (That
 * reasoning assumes reads and writes hit the same database, which is the case
 * today; it would need revisiting if read replicas were ever put in front of
 * PostgREST.)
 *
 * A row that is nonetheless unreadable — a profile deleted by hand, or a
 * transient PostgREST error — is treated exactly like a missing one: no
 * account type is known, `needsOnboarding` says so, and the person is sent to
 * /onboarding rather than to a dashboard chosen by guesswork.
 *
 * ── State of the feature ───────────────────────────────────────────────────
 * Nothing reaches this route until the Google OAuth client is registered in
 * Google Cloud and the provider is enabled in Supabase. This file decides
 * routing only; it does not enable or configure any provider.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // `next` is an explicit landing override. No call-site sets it today — the
  // sign-in buttons in src/app/login/page.tsx:223,
  // src/app/register/client/page.tsx:342 and src/app/register/provider/page.tsx
  // all pass a bare `/auth/callback` — and it is only consulted below
  // for an account type this app does not recognise, which the NOT NULL CHECK
  // on profiles.user_type (supabase/migrations/20260603_phase1_001_profiles.sql:32-35)
  // does not currently permit. It is validated anyway because it arrives in
  // the URL: it is interpolated after `origin`, so an absolute value such as
  // "https://elsewhere.example" would build a string that is not a URL at all
  // and NextResponse.redirect would throw — a 500 rather than a redirect —
  // while "//elsewhere.example" and its "/\" variant would leave this site.
  const nextParam = searchParams.get("next");
  const next =
    nextParam &&
    nextParam.startsWith("/") &&
    !nextParam.startsWith("//") &&
    !nextParam.startsWith("/\\")
      ? nextParam
      : FALLBACK_DASHBOARD_PATH;

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options),
              );
            } catch {
              // Ignored in Server Components
            }
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // The same cookie-scoped, RLS-enforced client that performed the
        // exchange. The "users read own profile" policy
        // (supabase/migrations/20260603_phase1_001_profiles.sql:66-68) limits
        // this to the caller's own row, so no id from the request is trusted.
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_type, phone, onboarding_completed")
          .eq("id", user.id)
          .maybeSingle();

        const userType: string = profile?.user_type ?? "";

        // Non-empty after trimming, not merely truthy. A row created by the
        // signup trigger has no phone at all — it inserts id, display_name,
        // email and user_type only — and a whitespace-only number reaches
        // nobody, so it must not count as one.
        const phone: unknown = profile?.phone;
        const hasPhone = typeof phone === "string" && phone.trim() !== "";

        // One shared predicate with src/proxy.ts, so this route and the proxy
        // cannot disagree about who still has to finish onboarding. Sending an
        // unfinished user to a dashboard here would only be undone by the
        // proxy on the very next request, visibly.
        if (
          needsOnboarding({
            userType,
            onboardingCompleted: profile?.onboarding_completed,
            hasPhone,
          })
        ) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }

        // `dashboardPathFor` always returns a string, so it can never fall
        // through to `next` on its own — the recognised/unrecognised decision
        // has to be made here for `next` to mean anything.
        const redirectTo = isDbUserType(userType)
          ? dashboardPathFor(userType)
          : next;
        return NextResponse.redirect(`${origin}${redirectTo}`);
      }
    }
  }

  // No code, a failed exchange, or a session that carries no user: nothing
  // here can route the caller, so send them back to sign in.
  //
  // KNOWN GAP, owned by /login, not by this file: src/app/login/page.tsx never
  // reads the query string (it imports useRouter at :4 and no useSearchParams;
  // its `error` at :151 is local component state), so this parameter renders
  // nothing and the person sees an ordinary sign-in page with no explanation
  // of what went wrong. The parameter is kept so that whoever fixes /login has
  // something to read.
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
