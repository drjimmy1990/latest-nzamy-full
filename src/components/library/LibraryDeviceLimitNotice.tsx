"use client";

import { useState } from "react";
import { Devices } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { ReaderRefusal } from "@/lib/library/readerRefusal";
import LibraryDeviceList from "./LibraryDeviceList";

type DeviceRefusal = Extract<ReaderRefusal, { kind: "device" }>;

/**
 * Owner ٤٢٧ — the third device: «هذا الحساب مفعّل على جهازين بالفعل. سجّل
 * الخروج من أحد أجهزتك المصرّحة لتفتح المكتبة من هذا الجهاز.» with the
 * authorised devices (label + last use) and «تسجيل خروج هذا الجهاز» on each.
 * Signing one out frees its slot; the page then reloads and this device
 * registers on the next read.
 */
export function LibraryDeviceLimitNotice({ refusal }: { refusal: DeviceRefusal }) {
  const { isDark } = useTheme();
  const [devices, setDevices] = useState(refusal.devices);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16" dir="rtl">
      <div
        role="alertdialog"
        aria-modal="false"
        className={`w-full max-w-lg rounded-3xl border p-6 text-center shadow-xl ${
          isDark ? "border-amber-500/20 bg-zinc-900 text-white" : "border-amber-200 bg-white text-zinc-900"
        }`}
      >
        <Devices size={40} className={`mx-auto mb-3 ${isDark ? "text-amber-300" : "text-amber-700"}`} />
        <h2 className="mb-2 text-base font-bold">تجاوزت عدد الأجهزة المصرّح بها</h2>
        <p className={`mb-5 text-sm leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>{refusal.messageAr}</p>
        <LibraryDeviceList
          devices={devices}
          onRevoked={(id) => {
            setDevices((list) => list.filter((d) => d.id !== id));
            window.location.reload();
          }}
        />
        <div className="mt-5 flex justify-center">
          <Link href="/laws" className="rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-bold text-white transition hover:opacity-90">
            العودة إلى المكتبة القانونية
          </Link>
        </div>
      </div>
    </div>
  );
}

/** The refusal as a whole page, for the readers that have no refusal layout of their own. */
export default function LibraryDeviceLimitPage({ refusal }: { refusal: DeviceRefusal }) {
  const { isDark } = useTheme();
  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir="rtl">
      <Navbar />
      <div className="flex-1 max-w-[1280px] mx-auto w-full px-3 pt-28 pb-24">
        <LibraryDeviceLimitNotice refusal={refusal} />
      </div>
      <Footer />
    </div>
  );
}
