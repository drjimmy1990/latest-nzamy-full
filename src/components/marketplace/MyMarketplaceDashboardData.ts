/**
 * MyMarketplaceDashboardData — types only.
 *
 * ─── WHY THIS FILE IS EMPTY OF DATA ──────────────────────────────────────────
 * This module used to export `MY_REQUESTS` and `COLLAB_REQUESTS`: hardcoded
 * arrays presented to the signed-in lawyer as HIS OWN marketplace activity.
 * They named real-world places and people — a request to notarise a power of
 * attorney "from an inmate in سجن الحائر بالرياض", a labour hearing "الثلاثاء"
 * at محكمة العمل بجدة, an offer from "أبو عبدالله — موثّق معتمد" carrying
 * `status: "accepted"`, and two collaboration invitations from "أ. سعد الحربي"
 * and "مكتب العتيبي وشركاه" worth 15,000 and 22,000 ر.س with a 40٪/25٪ fee
 * split — and the component rendered them as live state, complete with a
 * pulsing "new invitation" dot and an «قبول الدعوة» button.
 *
 * None of it had a source. A lawyer could reasonably read that screen and
 * believe he had a hearing to cover on Tuesday and a pending 6,000 ر.س
 * engagement. Six real lawyers use this dashboard in production.
 *
 * There is also nothing to wire it to. `marketplace_listings` /
 * `marketplace_offers` exist in the schema
 * (supabase/migrations/20260603_phase1_005_advanced_features.sql:8,33) but
 * nothing in this app ever writes them — the only reference anywhere is a
 * read in src/app/api/v1/admin/marketplace/route.ts:22 — and there is no
 * collaboration-invitation table at all. Making the screen real means
 * building the marketplace subsystem, which is a product decision, not a
 * fix. So the promise is withdrawn instead: MyMarketplaceDashboard now
 * renders an honest «غير متاح حالياً».
 *
 * ─── WHY THE TYPES SURVIVE ───────────────────────────────────────────────────
 * `CollabRequest` is imported by src/components/marketplace/FeeSplitModal.tsx:6,
 * which is outside this change's scope. Deleting the type would break a file
 * this pass cannot edit. The interfaces below therefore stay as the shape any
 * future real marketplace API should return; they carry no values.
 */

export type ReqStatus = "open" | "in-progress" | "completed" | "cancelled";

export interface Offer {
  id: number;
  providerName: string;
  rating: number;
  price: number;
  deliveryTime: string;
  isTop: boolean;
  status: "pending" | "accepted" | "rejected";
}

export interface MyRequest {
  id: number;
  categoryLabel: string;
  title: string;
  city: string;
  urgency: "urgent" | "normal" | "flexible";
  budgetMin: number;
  budgetMax: number;
  status: ReqStatus;
  offersCount: number;
  postedAt: string;
  offers: Offer[];
}

export interface CollabRequest {
  id: string;
  fromLawyer: string;
  fromCity: string;
  fromRating: number;
  caseTitle: string;
  caseType: string;
  myRole: string;
  mySplit: number;
  totalFee: number;
  status: "pending" | "accepted" | "negotiating";
  sentAt: string;
}
