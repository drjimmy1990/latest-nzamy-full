import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get user's referral data
  const { data: referrals, error: refError } = await supabase
    .from("referrals")
    .select("*, referred:referred_user_id(id, display_name, avatar_url, created_at)")
    .eq("referrer_user_id", user.id)
    .order("created_at", { ascending: false });

  if (refError) return NextResponse.json({ error: refError.message }, { status: 500 });

  const stats = {
    totalInvites: referrals?.length || 0,
    joined: referrals?.filter(r => r.status === 'completed').length || 0,
    totalRewards: referrals?.reduce((sum, r) => sum + (r.reward_amount || 0), 0) || 0,
  };

  return NextResponse.json({
    data: {
      referralCode: user.id.slice(0, 8).toUpperCase(),
      referralUrl: `https://nezamy.sa/join?ref=${user.id.slice(0, 8).toUpperCase()}`,
      stats,
      friends: referrals || [],
    }
  });
}
