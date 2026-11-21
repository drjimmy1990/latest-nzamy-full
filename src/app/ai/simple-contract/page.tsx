import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAiTool } from "@/lib/ai/tools";
import { readPriceSetting } from "@/lib/ai/runCore";
import { SIMPLE_CONTRACT_DEFAULT_PRICE, SIMPLE_CONTRACT_PAGE, SIMPLE_CONTRACT_TOOL } from "@/lib/ai/simpleContract";
import { simpleContractAudience } from "./_audience";
import SimpleContractTool from "./_components/SimpleContractTool";

/**
 * /ai/simple-contract — «صائغ العقود المبسّط» for individuals and businesses
 * (owner ١٢٣, batch l12 simpledraft). The server reads who is asking and the
 * price the admin set (platform_settings simple_contract_price, 100 until
 * set), so the screen shows the price the run is charged; the run sends it
 * back as expectedPrice and a changed price is refused uncharged (runCore).
 * Whether the tool is switched on is read by the page itself (tool-status):
 * it ships off, and an account sees «قريباً» until the admin turns it on.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "صائغ العقود المبسّط | نظامي", robots: { index: false, follow: false } };

export default async function SimpleContractPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(SIMPLE_CONTRACT_PAGE)}`);

  const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", user.id).maybeSingle();
  const userType = typeof profile?.user_type === "string" ? profile.user_type : "";

  let price: number | null = SIMPLE_CONTRACT_DEFAULT_PRICE;
  const spec = getAiTool(SIMPLE_CONTRACT_TOOL);
  if (spec?.priceSetting) {
    try {
      const read = await readPriceSetting(await createServiceClient(), spec.priceSetting);
      // A failed read shows no price (the run would refuse it too).
      price = read === "error" ? null : (read ?? SIMPLE_CONTRACT_DEFAULT_PRICE);
    } catch {
      price = null;
    }
  }

  return <SimpleContractTool audience={simpleContractAudience(userType)} price={price} />;
}
