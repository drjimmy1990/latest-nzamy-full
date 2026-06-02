"use client";
// /community/public — redirect to main community (public tab is default)
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CommunityPublicRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/community");
  }, [router]);
  return null;
}
