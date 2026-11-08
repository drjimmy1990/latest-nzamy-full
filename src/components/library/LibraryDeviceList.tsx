"use client";

import { useState } from "react";
import { DeviceMobile, Desktop, SignOut, SpinnerGap } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { deviceLastSeenAr } from "@/lib/library/readerRefusal";

export interface LibraryDeviceRow {
  id: string;
  label: string;
  lastSeen: string | null;
  current?: boolean;
}

/**
 * The list of a user's authorised library devices (owner ٤٢٧), each with
 * «تسجيل خروج هذا الجهاز». Used by the device-limit refusal in the readers and
 * by «أجهزتي» in the settings. The revoke goes through
 * POST /api/v1/library/devices/[id]/revoke — the user is the session's.
 */
export default function LibraryDeviceList({
  devices,
  onRevoked,
}: {
  devices: LibraryDeviceRow[];
  onRevoked: (id: string) => void;
}) {
  const { isDark } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();

  async function revoke(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/library/devices/${encodeURIComponent(id)}/revoke`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const msg = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
        setError(typeof msg === "string" ? msg : "تعذّر تسجيل خروج الجهاز.");
        return;
      }
      onRevoked(id);
    } catch {
      setError("تعذّر الاتصال. حاول مرة أخرى.");
    } finally {
      setBusy(null);
    }
  }

  if (devices.length === 0) {
    return <p className={`text-xs ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>لا توجد أجهزة مصرّحة حالياً.</p>;
  }

  return (
    <div className="space-y-2" dir="rtl">
      {devices.map((d) => {
        const phone = d.label.startsWith("جوال") || d.label.startsWith("جهاز لوحي");
        const Icon = phone ? DeviceMobile : Desktop;
        const seen = deviceLastSeenAr(d.lastSeen, now);
        return (
          <div
            key={d.id}
            className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-start ${
              isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-zinc-200 bg-white"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Icon size={20} className={isDark ? "text-zinc-300" : "text-zinc-600"} />
              <div className="min-w-0">
                <p className={`truncate text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>
                  {d.label}
                  {d.current && (
                    <span className={`ms-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${isDark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-700"}`}>
                      هذا الجهاز
                    </span>
                  )}
                </p>
                {seen && (
                  <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>آخر استخدام: {seen}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => revoke(d.id)}
              disabled={busy !== null}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition disabled:opacity-50 ${
                isDark
                  ? "border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                  : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
              }`}
            >
              {busy === d.id ? <SpinnerGap size={13} className="animate-spin" /> : <SignOut size={13} />}
              تسجيل خروج هذا الجهاز
            </button>
          </div>
        );
      })}
      {error && <p className={`text-xs ${isDark ? "text-red-300" : "text-red-600"}`}>{error}</p>}
    </div>
  );
}
