import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * OAuth callback route handler.
 * After Google (or other OAuth) sign-in, Supabase redirects here with a `code` param.
 * We exchange the code for a session, then redirect to the user's dashboard.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard/client";

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
      // Get user type to redirect to correct dashboard
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const userType = user?.user_metadata?.user_type ?? "individual";
      const dashboardMap: Record<string, string> = {
        individual: "/dashboard/client",
        lawyer: "/dashboard/lawyer",
        firm: "/dashboard/firm",
        corporate: "/dashboard/business",
        micro: "/dashboard/micro",
        provider: "/dashboard/provider",
        government: "/dashboard/government",
        ngo: "/dashboard/ngo",
        admin: "/dashboard/admin",
      };

      const redirectTo = dashboardMap[userType] ?? next;
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  // If code exchange failed, redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
