import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  // 1. Auth check
  const adminCheck = await requireAdmin();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error || "غير مصرح" },
      { status: adminCheck.status || 403 }
    );
  }

  const adminClient = await createServiceClient();

  try {
    // 2. Fetch business profiles and active subscriptions
    const [companiesRes, subsRes] = await Promise.all([
      adminClient.from("business_profiles").select("*"),
      adminClient.from("subscriptions").select(`
        user_id,
        billing_cycle,
        status,
        tier,
        subscription_plans (
          id,
          name_ar,
          price_monthly,
          price_yearly
        )
      `).eq("status", "active")
    ]);

    if (companiesRes.error) throw companiesRes.error;
    if (subsRes.error) throw subsRes.error;

    const companiesData = companiesRes.data || [];
    const subsData = subsRes.data || [];

    // 3. Map companies to the requested schema
    const companies = companiesData.map((company: any) => {
      const activeSub = subsData.find((s: any) => s.user_id === company.owner_user_id);
      
      let mrr = 0;
      if (activeSub) {
        const planDetails: any = activeSub.subscription_plans;
        if (planDetails) {
          if (activeSub.billing_cycle === "yearly" && planDetails.price_yearly) {
            mrr = Number(planDetails.price_yearly) / 12;
          } else if (planDetails.price_monthly) {
            mrr = Number(planDetails.price_monthly);
          }
        }
      }

      const metadata = company.metadata || {};
      const features = metadata.features || {};

      return {
        id: company.id,
        name: company.company_name_ar || company.company_name_en,
        plan: activeSub?.tier || company.plan_id || "Starter",
        mrr: Math.round(mrr * 100) / 100, // round to 2 decimal places
        features: {
          hasSecondment: features.hasSecondment || false,
          hasLitigation: features.hasLitigation || false,
          hasMarketplace: features.hasMarketplace || false,
          hasGovernance: features.hasGovernance || false
        }
      };
    });

    return NextResponse.json({
      companies
    });

  } catch (err: any) {
    console.error("[admin/corporates] GET error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب الشركات" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  // 1. Auth check
  const adminCheck = await requireAdmin();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error || "غير مصرح" },
      { status: adminCheck.status || 403 }
    );
  }

  const adminClient = await createServiceClient();

  try {
    const body = await request.json();
    const { id, features } = body;

    if (!id) {
      return NextResponse.json(
        { error: "معرف الشركة مطلوب" },
        { status: 400 }
      );
    }

    // 2. Fetch the current metadata
    const { data: company, error: fetchError } = await adminClient
      .from("business_profiles")
      .select("metadata")
      .eq("id", id)
      .single();

    if (fetchError || !company) {
      return NextResponse.json(
        { error: "الشركة غير موجودة" },
        { status: 404 }
      );
    }

    // 3. Merge the new feature flags into metadata.features
    const currentMetadata = company.metadata || {};
    const currentFeatures = currentMetadata.features || {};
    const updatedFeatures = {
      ...currentFeatures,
      ...features
    };
    const updatedMetadata = {
      ...currentMetadata,
      features: updatedFeatures
    };

    // 4. Save/update company profile's metadata column
    const { error: updateError } = await adminClient
      .from("business_profiles")
      .update({ metadata: updatedMetadata })
      .eq("id", id);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      message: "تم تحديث صلاحيات الشركة بنجاح"
    });

  } catch (err: any) {
    console.error("[admin/corporates] PATCH error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تحديث صلاحيات الشركة" },
      { status: 500 }
    );
  }
}
