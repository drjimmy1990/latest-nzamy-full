import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mayOpenSpecialty, type ProviderSpecialty, type SpecialtyFacts } from "@/lib/auth/providerSpecialty";

/**
 * Server gate for one provider specialty's pages (live check of 13 Nov,
 * row 23: a notary could open the arbitrator's pages). Reads the viewer's own
 * `profiles.user_type` and `provider_profiles.sub_role` through their RLS
 * client and sends anyone else to the provider dashboard. Signed-out visitors
 * never get here: dashboard/layout.tsx's ServerSessionGate answers first.
 */
export default async function ProviderSpecialtyGate({
  specialty,
  children,
}: {
  specialty: ProviderSpecialty;
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) redirect("/dashboard/provider");

  const facts: SpecialtyFacts = { userType: null, subRole: "unavailable" };
  const profile = await supabase.from("profiles").select("user_type").eq("id", userId).maybeSingle();
  if (!profile.error) facts.userType = (profile.data as { user_type?: string } | null)?.user_type ?? null;

  if (facts.userType === "provider") {
    const row = await supabase.from("provider_profiles").select("sub_role").eq("user_id", userId).maybeSingle();
    if (!row.error) {
      const raw = (row.data as { sub_role?: unknown } | null)?.sub_role;
      facts.subRole = typeof raw === "string" ? raw : null;
    }
  }

  if (!mayOpenSpecialty(specialty, facts)) redirect("/dashboard/provider");
  return <>{children}</>;
}
