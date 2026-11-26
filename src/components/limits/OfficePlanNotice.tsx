"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Info } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseMode } from "@/lib/services/api";
import { useUser } from "@/hooks/useUser";
import { OFFICE_PLAN_LINK_AR, OFFICE_PLAN_PRICING_HREF, officeAudienceFor, officePlanPhraseAr } from "@/lib/auth/officePlan";

function toArabicGb(bytes: number): string {
  const v = Math.round((bytes / 1024 ** 3) * 10) / 10;
  return String(v).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]).replace(".", "٫");
}

/**
 * Owner س٢١٢: an honest line for a professional account on the free side,
 * before it tries a paid write. Shown only when the database says so
 * (public.my_office_features_locked, 20261206_70); a paid lawyer, a founder, a
 * paid firm's member, a client — and any failed read — see nothing. The
 * server refuses the paid writes either way (src/lib/auth/assertOfficePlan.ts).
 */
export default function OfficePlanNotice({ isDark }: { isDark: boolean }) {
  const user = useUser();
  const [locked, setLocked] = useState(false);
  const [capGb, setCapGb] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseMode) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("my_office_features_locked");
        if (cancelled || error || data !== true) return;
        setLocked(true);
        // the cap is an admin setting (free_storage_quota, default 1 GB): read it, never assume it
        const quota = await supabase.rpc("my_storage_quota");
        const row = Array.isArray(quota.data) ? quota.data[0] : quota.data;
        const cap = Number((row as { cap_bytes?: unknown } | null)?.cap_bytes);
        if (!cancelled && !quota.error && Number.isFinite(cap) && cap > 0) setCapGb(toArabicGb(cap));
      } catch {
        // nothing shown: the server gate still decides
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!locked) return null;
  return (
    <div
      role="note"
      className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-[13px] leading-6 ${
        isDark ? "border-[#C8A762]/25 bg-[#C8A762]/10 text-zinc-200" : "border-[#C8A762]/40 bg-[#C8A762]/10 text-slate-700"
      }`}
    >
      <Info size={16} weight="fill" className="mt-1 flex-shrink-0 text-[#C8A762]" />
      <p className="flex-1">
        حسابك على الباقة المجانية: الملف المهني، واستقبال طلبات السوق، والأدوات بالنقاط{capGb ? `، وسعة ${capGb} جيجابايت للملفات` : ""}.
        {" "}أما الفريق والمقاعد، والقضايا والموكلون، والمستندات المشتركة، والمهام والجلسات، والفواتير والتقارير فمتاحة في {officePlanPhraseAr(officeAudienceFor(user.userType))}.
        {" "}
        <Link href={OFFICE_PLAN_PRICING_HREF} className="font-bold underline underline-offset-2">
          {OFFICE_PLAN_LINK_AR}
        </Link>
      </p>
    </div>
  );
}
