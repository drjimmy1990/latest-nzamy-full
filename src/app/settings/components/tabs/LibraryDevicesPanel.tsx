"use client";

import { useCallback, useEffect, useState } from "react";
import LibraryDeviceList, { type LibraryDeviceRow } from "@/components/library/LibraryDeviceList";
import { isSupabaseMode } from "@/lib/services/api";
import { SectionTitle } from "./_shared";

interface DevicesAnswer {
  enabled: boolean;
  limit: number;
  devices: LibraryDeviceRow[];
  available: boolean;
}

/** «جهاز واحد», «جهازين», «3 أجهزة», «11 جهازاً». */
function devicesCountAr(n: number): string {
  if (n === 1) return "جهاز واحد";
  if (n === 2) return "جهازين";
  if (n >= 3 && n <= 10) return `${n} أجهزة`;
  return `${n} جهازاً`;
}

/**
 * «أجهزتي» in Settings → الأمان (owner ٤٢٧): the devices this account opened
 * the subscriber library on, with «تسجيل خروج هذا الجهاز» on each.
 * GET /api/v1/library/devices. Hidden before 20261108_20 runs (available
 * false) and in demo mode.
 */
export function LibraryDevicesPanel() {
  const [data, setData] = useState<DevicesAnswer | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/library/devices", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const body = (await res.json()) as DevicesAnswer;
      setData(body);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (isSupabaseMode) void load();
  }, [load]);

  if (!isSupabaseMode) return null;
  if (data && !data.available) return null;

  return (
    <div>
      <SectionTitle>أجهزتي</SectionTitle>
      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] p-4 space-y-3">
        <p className="text-xs leading-6 text-gray-600 dark:text-gray-300">
          {data?.enabled
            ? `يمكن فتح المكتبة القانونية بحسابك على ${devicesCountAr(data.limit)} مصرّحة. سجّل الخروج من جهاز لا تستخدمه ليتاح مكانه لجهاز آخر.`
            : "الأجهزة التي فتحت عليها المكتبة القانونية بحسابك. تسجيل الخروج من المنصة يحرّر مكان الجهاز تلقائياً."}
        </p>
        {failed && <p className="text-xs text-red-600 dark:text-red-300">تعذّر تحميل أجهزتك.</p>}
        {!data && !failed && <p className="text-xs text-gray-500 dark:text-gray-400">جارٍ التحميل…</p>}
        {data && (
          <LibraryDeviceList
            devices={data.devices}
            onRevoked={(id) => setData((d) => (d ? { ...d, devices: d.devices.filter((x) => x.id !== id) } : d))}
          />
        )}
      </div>
    </div>
  );
}
