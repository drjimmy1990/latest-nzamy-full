import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Valid DB service_requests.status values that count as "active" for a client.
const ACTIVE_STATUSES = ["pending_assignment", "assigned", "in_review"];

/**
 * GET /api/v1/lawyer/clients
 * Auth required. Returns clients who have service requests assigned to this lawyer.
 * Includes both auth-backed clients (via requester_user_id → profiles) and
 * manually-added clients (service_requests with metadata.client = true, no
 * requester_user_id).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const uid = user.id;

    // Get all service requests assigned to this lawyer
    const { data: requests, error: reqError } = await supabase
      .from("service_requests")
      .select("id, requester_user_id, status, type, created_at, metadata, requester")
      .eq("assigned_to", uid);

    if (reqError || !requests || requests.length === 0) {
      return NextResponse.json([]);
    }

    // Group by sender_id to get unique auth-backed clients with stats
    const clientMap = new Map<string, { requestCount: number; activeCount: number; lastActivity: string }>();
    // Manually-added clients (metadata.client = true, no requester_user_id)
    const manualClients: Array<{
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      requestCount: number;
      activeCount: number;
      lastActivity: string;
    }> = [];

    for (const req of requests) {
      const meta = (req.metadata as Record<string, unknown> | null) ?? {};
      const requester = (req.requester as Record<string, unknown> | null) ?? {};

      if (!req.requester_user_id && meta.client === true) {
        // Manually-added client row
        const existing = manualClients.find((c) => c.id === req.id);
        if (existing) {
          existing.requestCount++;
          if (ACTIVE_STATUSES.includes(req.status)) existing.activeCount++;
          if (req.created_at > existing.lastActivity) existing.lastActivity = req.created_at;
        } else {
          manualClients.push({
            id: req.id,
            name: String(requester.name ?? "عميل جديد"),
            phone: typeof requester.phone === "string" ? requester.phone : null,
            email: typeof requester.email === "string" ? requester.email : null,
            requestCount: 1,
            activeCount: ACTIVE_STATUSES.includes(req.status) ? 1 : 0,
            lastActivity: req.created_at,
          });
        }
        continue;
      }

      if (!req.requester_user_id) continue;
      const existing = clientMap.get(req.requester_user_id) || { requestCount: 0, activeCount: 0, lastActivity: "" };
      existing.requestCount++;
      if (ACTIVE_STATUSES.includes(req.status)) {
        existing.activeCount++;
      }
      if (!existing.lastActivity || req.created_at > existing.lastActivity) {
        existing.lastActivity = req.created_at;
      }
      clientMap.set(req.requester_user_id, existing);
    }

    // Fetch profiles for auth-backed client IDs
    const clientIds = Array.from(clientMap.keys());
    const { data: profiles } = clientIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name, email, phone, avatar_url, user_type")
          .in("id", clientIds)
      : { data: [] };

    const clients = [
      ...(profiles ?? []).map((profile) => {
        const stats = clientMap.get(profile.id) || { requestCount: 0, activeCount: 0, lastActivity: "" };
        return {
          id: profile.id,
          name: profile.display_name || "عميل نظامي",
          email: profile.email,
          phone: profile.phone,
          avatar: profile.avatar_url,
          userType: profile.user_type,
          ...stats,
        };
      }),
      // Manually-added clients (no profile row)
      ...manualClients.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        avatar: null,
        userType: "client",
        requestCount: c.requestCount,
        activeCount: c.activeCount,
        lastActivity: c.lastActivity,
      })),
    ];

    return NextResponse.json(clients);
  } catch (err) {
    console.error("[lawyer/clients GET] Unexpected error:", err);
    return NextResponse.json([]);
  }
}

/**
 * POST /api/v1/lawyer/clients
 * Auth required. Creates a manually-added client as a service_requests row
 * (receiver: "lawyer", assigned_to: the lawyer, metadata.client = true, status: "assigned").
 * Returns a LawyerClient-shaped row.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, phone, email, type, flags, rating, totalFees, paidFees } = body as {
      name?: string;
      phone?: string;
      email?: string;
      type?: string;
      flags?: string[];
      rating?: number;
      totalFees?: number;
      paidFees?: number;
    };

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const metadata: Record<string, unknown> = { client: true };
    if (type) metadata.clientType = type;
    if (Array.isArray(flags)) metadata.flags = flags;
    if (typeof rating === "number") metadata.rating = rating;
    if (typeof totalFees === "number") metadata.totalFees = totalFees;
    if (typeof paidFees === "number") metadata.paidFees = paidFees;

    const { data, error } = await supabase
      .from("service_requests")
      .insert({
        id,
        requester_user_id: null,
        type: "service",
        title: `موكّل: ${name.trim()}`,
        description: "",
        requester: {
          name: name.trim(),
          role: "client",
          tier: "free",
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
        },
        receiver: "lawyer",
        assigned_to: user.id,
        status: "assigned",
        payment: { amount: 0, status: "not_required" },
        source_path: "",
        metadata,
      })
      .select("id, status, type, created_at, metadata, requester")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Insert failed" }, { status: 500 });
    }

    const requester = (data.requester as Record<string, unknown> | null) ?? {};
    return NextResponse.json({
      data: {
        id: data.id,
        name: String(requester.name ?? name),
        email: typeof requester.email === "string" ? requester.email : null,
        phone: typeof requester.phone === "string" ? requester.phone : null,
        avatar: null,
        userType: "client",
        requestCount: 1,
        activeCount: 1,
        lastActivity: data.created_at,
      },
    });
  } catch (err) {
    console.error("[lawyer/clients POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}