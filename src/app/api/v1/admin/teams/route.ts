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
    const { data, error } = await adminClient
      .from("profiles")
      .select("*")
      .eq("user_type", "admin")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const team = (data || []).map((p: any) => {
      const meta = p.metadata || {};
      return {
        id: p.id,
        name: p.display_name,
        email: p.email,
        role: meta.role || "مسؤول",
        department: meta.department || "الإدارة",
        description: meta.description || "",
        access: meta.access_list || meta.access || [],
        accessList: meta.access_list || meta.access || [],
        dashboardTabs: meta.tabs_list || meta.dashboardTabs || [],
        tabsList: meta.tabs_list || meta.dashboardTabs || [],
        status: meta.status || "active"
      };
    });

    return NextResponse.json({ team });

  } catch (err: any) {
    console.error("[admin/teams] GET error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب أعضاء الفريق" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // 1. Auth check
  const adminCheck = await requireAdmin();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error || "غير مصرح" },
      { status: adminCheck.status || 403 }
    );
  }

  try {
    const { name, email, role, department } = await request.json();

    if (!name || !email) {
      return NextResponse.json(
        { error: "الاسم والبريد الإلكتروني مطلوبان لدعوة العضو" },
        { status: 400 }
      );
    }

    const adminClient = await createServiceClient();

    let userId = "";

    // Create the user in auth.users
    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        user_type: "admin",
        display_name: name
      }
    });

    if (authError) {
      // Check if user already exists
      if (authError.message.includes("already registered") || authError.message.includes("exists")) {
        const { data: existingProfile } = await adminClient
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();

        if (existingProfile) {
          userId = existingProfile.id;
        } else {
          return NextResponse.json({ error: authError.message }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }
    } else if (authUser?.user) {
      userId = authUser.user.id;
    }

    if (!userId) {
      return NextResponse.json(
        { error: "فشل إنشاء مستخدم جديد في المصادقة" },
        { status: 400 }
      );
    }

    // Upsert the profile to set the user details and metadata
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: userId,
        user_type: "admin",
        display_name: name,
        email,
        metadata: {
          role: role || "مسؤول",
          department: department || "الإدارة",
          status: "invited",
          description: "",
          access_list: [],
          tabs_list: []
        }
      });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "تم إرسال الدعوة بنجاح"
    });

  } catch (err: any) {
    console.error("[admin/teams] POST error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء إرسال الدعوة" },
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

  try {
    const { id, status } = await request.json();

    if (!id || !status) {
      return NextResponse.json(
        { error: "المعرف والحالة مطلوبان لتحديث حالة العضو" },
        { status: 400 }
      );
    }

    const adminClient = await createServiceClient();

    // Fetch the existing profile to modify the metadata object
    const { data: profile, error: fetchError } = await adminClient
      .from("profiles")
      .select("metadata")
      .eq("id", id)
      .single();

    if (fetchError || !profile) {
      return NextResponse.json(
        { error: "عضو الفريق غير موجود" },
        { status: 404 }
      );
    }

    const currentMetadata = profile.metadata && typeof profile.metadata === "object" ? profile.metadata : {};
    const updatedMetadata = {
      ...currentMetadata,
      status
    };

    const { error: updateError } = await adminClient
      .from("profiles")
      .update({
        metadata: updatedMetadata
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "تم تحديث حالة عضو الفريق بنجاح"
    });

  } catch (err: any) {
    console.error("[admin/teams] PATCH error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تحديث حالة عضو الفريق" },
      { status: 500 }
    );
  }
}
