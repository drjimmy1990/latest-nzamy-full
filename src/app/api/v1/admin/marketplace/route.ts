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
    // 2. Fetch tables in parallel to avoid complex/flaky joins
    const [listingsRes, profilesRes, offersRes, workspacesRes] = await Promise.all([
      adminClient.from("marketplace_listings").select("*").order("created_at", { ascending: false }),
      adminClient.from("profiles").select("id, display_name"),
      adminClient.from("marketplace_offers").select("*"),
      adminClient.from("marketplace_workspaces").select("*")
    ]);

    if (listingsRes.error) throw listingsRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (offersRes.error) throw offersRes.error;
    if (workspacesRes.error) throw workspacesRes.error;

    const listings = listingsRes.data || [];
    const profiles = profilesRes.data || [];
    const offers = offersRes.data || [];
    const workspaces = workspacesRes.data || [];

    // 3. Create helper maps for in-memory resolution
    const profileMap = new Map(profiles.map((p: any) => [p.id, p]));
    const offerMap = new Map(offers.map((o: any) => [o.id, o]));
    const workspaceMap = new Map(workspaces.map((w: any) => [w.listing_id, w]));

    // Group offers by listing
    const offersByListing = new Map();
    offers.forEach((o: any) => {
      if (!offersByListing.has(o.listing_id)) {
        offersByListing.set(o.listing_id, []);
      }
      offersByListing.get(o.listing_id).push(o);
    });

    // 4. Map results to requested schema
    const requests = listings.map((listing: any) => {
      const ownerProfile = profileMap.get(listing.owner_id);
      const client = ownerProfile ? ownerProfile.display_name : "عميل غير معروف";

      const workspace = workspaceMap.get(listing.id);
      const listingOffers = offersByListing.get(listing.id) || [];
      const acceptedOffer = listingOffers.find((o: any) => o.status === "accepted");

      let provider = null;
      let amount = null;
      let commission = null;
      let status = listing.status;

      if (workspace) {
        status = workspace.status;
        const offer = offerMap.get(workspace.offer_id);
        if (offer) {
          amount = Number(offer.amount);
          const commissionPct = Number(offer.commission_pct || 15.00);
          commission = amount * (commissionPct / 100);
          const offerorProfile = profileMap.get(offer.offeror_id);
          provider = offerorProfile ? offerorProfile.display_name : null;
        }
      } else if (acceptedOffer) {
        amount = Number(acceptedOffer.amount);
        const commissionPct = Number(acceptedOffer.commission_pct || 15.00);
        commission = amount * (commissionPct / 100);
        const offerorProfile = profileMap.get(acceptedOffer.offeror_id);
        provider = offerorProfile ? offerorProfile.display_name : null;
      }

      const date = listing.created_at
        ? new Date(listing.created_at).toISOString().split("T")[0]
        : "";

      return {
        id: listing.id,
        client,
        clientType: listing.owner_type,
        service: listing.title,
        provider,
        amount,
        commission,
        status,
        date
      };
    });

    return NextResponse.json({ requests });

  } catch (err: any) {
    console.error("[admin/marketplace] GET error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب طلبات السوق" },
      { status: 500 }
    );
  }
}
