"use client";

import { useUser } from "@/hooks/useUser";

export const getUserMobile = (name?: string): string => {
  if (!name) return "0500000000";
  const n = name.trim();
  if (n.includes("فهد العتيبي")) return "0505123456";
  if (n.includes("محمد الزهراني")) return "0555654321";
  if (n.includes("الشمري")) return "0567890123";
  if (n.includes("الخليج")) return "0598765432";
  if (n.includes("العمر")) return "0555544332";
  if (n.includes("الحربي")) return "0544332211";
  if (n.includes("الناصر")) return "0533221100";
  if (n.includes("السالم")) return "0511223344";
  if (n.includes("القحطاني")) return "0522334455";
  if (n.includes("العبدالله")) return "0533445566";
  if (n.includes("الدوسري")) return "0544556677";
  if (n.includes("القرني")) return "0555667788";
  if (n.includes("الجهني")) return "0566778899";
  if (n.includes("السلمي")) return "0577889900";
  if (n.includes("الحارثي")) return "0588990011";
  if (n.includes("الزيد")) return "0599001122";
  if (n.includes("العيسى")) return "0500112233";
  if (n.includes("الرشيد")) return "0511223344";
  if (n.includes("المالكي")) return "0522334455";
  if (n.includes("الفيحاء")) return "0533445566";
  if (n.includes("العنزي")) return "0544556677";
  if (n.includes("الغامدي")) return "0555667788";
  return "0501234567";
};

export function PrintWatermark({ isRTL }: { isRTL?: boolean }) {
  const user = useUser();
  const mobile = getUserMobile(user.name);
  const displayName = user.name || (isRTL ? "عضو نظامي" : "Nezamy Member");

  return (
    <div style={{ display: 'none' }} className="print-watermark">
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="print-watermark-item">
          <div>نظامي - Nezamy</div>
          <div style={{ fontSize: '9px', marginTop: '2px' }}>
            {isRTL ? `المشترك: ${displayName}` : `Subscriber: ${displayName}`}
          </div>
          <div style={{ fontSize: '9px' }}>{mobile}</div>
        </div>
      ))}
    </div>
  );
}

