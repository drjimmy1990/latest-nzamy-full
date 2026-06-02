"use client";

import MyMarketplaceDashboard from "@/components/marketplace/MyMarketplaceDashboard";
import { RoleGuard } from "@/components/dashboard/RoleGuard";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";

export default function BusinessMarketplacePage() {
  return (
    <RoleGuard allowedRoles={["owner", "legal_manager"]}>
      <SubscriptionGuard featureKey="marketplace">
        <MyMarketplaceDashboard userType="corporate" />
      </SubscriptionGuard>
    </RoleGuard>
  );
}
