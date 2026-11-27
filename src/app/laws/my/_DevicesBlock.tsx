"use client";

import { useCallback, useEffect, useState } from "react";
import { Devices } from "@phosphor-icons/react";
import { Shimmer } from "@/components/ui/Skeleton";
import LibraryDeviceList, { type LibraryDeviceRow } from "@/components/library/LibraryDeviceList";
import { BlockNote, BlockShell } from "./_BlockShell";

interface DevicesAnswer {
  enabled: boolean;
  limit: number;
  devices: LibraryDeviceRow[];
  available: boolean;
}

function parseDevices(body: unknown): DevicesAnswer | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Partial<DevicesAnswer>;
  if (!Array.isArray(b.devices) || typeof b.available !== "boolean") return null;
  return {
    enabled: b.enabled === true,
    limit: typeof b.limit === "number" && b.limit > 0 ? b.limit : 2,
    devices: b.devices.filter((d): d is LibraryDeviceRow => !!d && typeof d.id === "string" && typeof d.label === "string"),
    available: b.available,
  };
}

/**
 * «الأجهزة» — the devices this account opened the library on (owner ٤٢٧),
 * GET /api/v1/library/devices, each with «إنهاء الجلسة» (POST
 * /api/v1/library/devices/[id]/revoke, the user is the session's). Before
 * 20261108_20 runs the route answers available: false — said as such.
 */
export function DevicesBlock() {
  // undefined = loading, null = the read failed
  const [data, setData] = useState<DevicesAnswer | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/library/devices", { credentials: "same-origin", cache: "no-store" });
      setData(res.ok ? parseDevices(await res.json().catch(() => null)) : null);
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <BlockShell id="devices" icon={Devices} title="الأجهزة" subtitle="الأجهزة التي فُتحت عليها المكتبة بحسابك.">
      {data === undefined ? (
        <div className="space-y-2" role="status" aria-label="جارٍ تحميل الأجهزة">
          <Shimmer className="h-12 w-full" />
          <Shimmer className="h-12 w-full" />
        </div>
      ) : data === null ? (
        <BlockNote tone="error">تعذّر تحميل أجهزتك الآن. حاول بعد قليل.</BlockNote>
      ) : !data.available ? (
        <BlockNote>إدارة أجهزة المكتبة غير مفعّلة بعد.</BlockNote>
      ) : (
        <div className="space-y-3">
          <BlockNote>
            {/* Batch l19 (owner ٢٣٣): enabled = the whole account's 1 phone + 1 computer; switching goes through the administration. */}
            {data.enabled
              ? "حسابك مفعّل على جوال واحد وحاسوب واحد في المنصة كلها. لتبديل جهاز أو إزالته تواصل مع إدارة نظامي."
              : "إنهاء جلسة جهاز يزيله من هذه القائمة. تسجيل الخروج من المنصة يحرّر مكان الجهاز تلقائياً."}
          </BlockNote>
          <LibraryDeviceList
            devices={data.devices}
            revokeLabel="إنهاء الجلسة"
            readOnly={data.enabled}
            onRevoked={(id) => setData((d) => (d ? { ...d, devices: d.devices.filter((x) => x.id !== id) } : d))}
          />
        </div>
      )}
    </BlockShell>
  );
}
