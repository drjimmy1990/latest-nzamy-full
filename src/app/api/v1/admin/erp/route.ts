import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";
import { monthlyEquivalent } from "@/lib/payments/planRowPrice";
import { ERP_FIRMS_MAX, idChunks } from "@/lib/admin/erpOverview";

export async function GET(request: NextRequest) {
  // 1. Auth check
  // l16 (C35): the staff-role gate (least privilege, staffRoles.ts), not admin-only.
  const adminCheck = await requireStaff("read");
  if (!adminCheck.ok) return adminCheck.response;

  const adminClient = await createServiceClient();

  try {
    // 2. One page of firms, then only the rows that belong to them.
    // N05-E2 (owner package 13 Nov): only the columns this screen reads. The
    // plan embed stays `( * )`, as in admin/stats: monthlyEquivalent reads the
    // cycle price columns 20261026_10 added, and a missing column would fail
    // the whole read.
    // Live check row 49: the four reads used to be unbounded (every firm,
    // member, open case and subscription on the platform). Now the newest
    // ERP_FIRMS_MAX firms (with an exact total), and members, cases and
    // subscriptions scoped to those firms by id, in URL-safe chunks.
    const firmsRes = await adminClient
      .from("firm_profiles")
      .select("id, owner_user_id, name_ar, size, verification_status, rating:metadata->rating, city:metadata->>city", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(ERP_FIRMS_MAX);
    if (firmsRes.error) throw firmsRes.error;
    const firmsData = firmsRes.data || [];
    const firmsTotal = typeof firmsRes.count === "number" ? firmsRes.count : firmsData.length;

    const membersData: any[] = [];
    for (const ids of idChunks(firmsData.map((f: any) => f.id))) {
      const res = await adminClient.from("firm_members").select("firm_id, user_id").eq("status", "active").in("firm_id", ids);
      if (res.error) throw res.error;
      membersData.push(...(res.data || []));
    }
    const ownerIds = firmsData.map((f: any) => f.owner_user_id);
    const staffIds = [...ownerIds, ...membersData.map((m: any) => m.user_id)];

    const casesData: any[] = [];
    const subsData: any[] = [];
    for (const ids of idChunks(staffIds)) {
      const res = await adminClient.from("cases").select("assigned_user_id, status").or("status.eq.active,status.eq.open").in("assigned_user_id", ids);
      if (res.error) throw res.error;
      casesData.push(...(res.data || []));
    }
    for (const ids of idChunks(ownerIds)) {
      const res = await adminClient.from("subscriptions").select(`
        user_id,
        billing_cycle,
        status,
        subscription_plans ( * )
      `).eq("status", "active").in("user_id", ids);
      if (res.error) throw res.error;
      subsData.push(...(res.data || []));
    }

    // 3. Map firms to the requested schema and calculate stats
    const firms = firmsData.map((firm: any) => {
      const firmMembers = membersData.filter((m: any) => m.firm_id === firm.id);
      const memberUserIds = firmMembers.map((m: any) => m.user_id);
      const allStaffIds = [firm.owner_user_id, ...memberUserIds];

      const lawyers = firmMembers.length;
      const activeCases = casesData.filter((c: any) => allStaffIds.includes(c.assigned_user_id)).length;

      // Find subscription for this firm's owner
      const sub = subsData.find((s: any) => s.user_id === firm.owner_user_id);
      let plan = "مجاني";
      let mrr = 0;

      if (sub) {
        const planDetails: any = sub.subscription_plans;
        if (planDetails) {
          plan = planDetails.name_ar || "مجاني";
          mrr = monthlyEquivalent(planDetails, sub.billing_cycle);
        }
      }

      // Rating and city from metadata, or null: no invented 4.5 or «الرياض»
      // for a firm that never gave one (N05-E2).
      const ratingNum = firm.rating === null || firm.rating === undefined ? NaN : Number(firm.rating);
      const rating = Number.isFinite(ratingNum) ? ratingNum : null;
      const city = typeof firm.city === "string" && firm.city.trim() !== "" ? firm.city.trim() : null;

      // Map status matching ERPTab.tsx keys: 'excellent' | 'good' | 'average' | 'warning'
      let status = "good";
      const size = firm.size || "small";
      if (size === "enterprise" || size === "large") status = "excellent";
      else if (size === "medium") status = "good";
      else if (size === "small") status = "average";
      else if (size === "solo") status = "warning";

      if (firm.verification_status === "suspended" || firm.verification_status === "rejected") {
        status = "warning";
      }

      return {
        id: firm.id,
        name: firm.name_ar,
        city,
        lawyers,
        activeCases,
        plan,
        mrr: Math.round(mrr * 100) / 100, // round to 2 decimal places
        rating,
        status
      };
    });

    // 4. Calculate summary KPIs
    const totalMRR = firms.reduce((acc, f) => acc + f.mrr, 0);
    const totalLawyers = firms.reduce((acc, f) => acc + f.lawyers, 0);
    const totalCases = firms.reduce((acc, f) => acc + f.activeCases, 0);
    // The firm count is the exact platform total; the other three cover the
    // firms listed, and `truncated` says when that is not every firm.
    const totalFirms = firmsTotal;

    const summary = {
      totalMRR: Math.round(totalMRR * 100) / 100,
      totalLawyers,
      totalCases,
      totalFirms,
      listedFirms: firms.length,
      truncated: firmsTotal > firms.length,
    };

    return NextResponse.json({
      firms,
      summary
    });

  } catch (err: any) {
    console.error("[admin/erp] GET error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب سجلات المكاتب" },
      { status: 500 }
    );
  }
}
