import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // B4 — referrals columns are referrer_id, referee_id, commission_amount, and
  // status in ('pending','contacted','converted','expired','cancelled'). The
  // "joined" count is status === 'converted' (not 'completed').
  // Get user's referrals with the friend's profile joined on referee_id.
  const { data: referrals, error: refError } = await supabase
    .from("referrals")
    .select("*, friend:referee_id(id, display_name, avatar_url, created_at)")
    .eq("referrer_id", user.id)
    .order("created_at", { ascending: false });

  if (refError) return NextResponse.json({ error: refError.message }, { status: 500 });

  const stats = {
    totalInvites: referrals?.length || 0,
    joined: referrals?.filter(r => r.status === 'converted').length || 0,
    totalRewards: referrals?.reduce((sum, r) => sum + (r.commission_amount || 0), 0) || 0,
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
