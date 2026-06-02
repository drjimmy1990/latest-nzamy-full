"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AchievementsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard/lawyer/profile"); }, [router]);
  return null;
}
