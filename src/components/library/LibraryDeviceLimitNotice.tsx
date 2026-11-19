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
 * registers on the next read (with the e-mail code when the server sends
 * codes). Owner ٦٣: a third device is never suspended — it lands here, with a
 * link to «مكتبتي» (/laws/my#devices) where the devices are managed too.
 */
export function LibraryDeviceLimitNotice({ refusal }: { refusal: DeviceRefusal }) {
  const { isDark } = useTheme();
  const [devices, setDevices] = useState(refusal.devices);

  // Owner ٤٠ (20261127_60): a new device waits for its e-mail code.
  if (refusal.mode === "code") return <DeviceCodeCard messageAr={refusal.messageAr} />;

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
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            href="/laws/my#devices"
            className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${
              isDark ? "border-white/10 text-zinc-200 hover:bg-white/5" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            إدارة أجهزتي في «مكتبتي»
          </Link>
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

/**
 * Owner ٤٠: «كل جهاز جديد يتطلب رمز تحقق على البريد». The code is sent only
 * when the user asks (never by a read), checked by the server, and on success
 * the page reloads with this device verified. No other session of the account
 * is ended (register 14 item 9: the rule is the library's only; 20261129_40).
 */
function DeviceCodeCard({ messageAr }: { messageAr: string }) {
  const { isDark } = useTheme();
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (busy) return;
    setBusy("send");
    setError(null);
    try {
      const res = await fetch("/api/v1/library/devices/code", { method: "POST" });
      const json = (await res.json().catch(() => null)) as { to?: string; error?: string } | null;
      if (!res.ok) throw new Error(json?.error || "تعذّر إرسال الرمز.");
      setSentTo(json?.to ?? "بريدك المسجّل");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر إرسال الرمز.");
    } finally {
      setBusy(null);
    }
  };

  const verify = async () => {
    if (busy || !code.trim()) return;
    setBusy("verify");
    setError(null);
    try {
      const res = await fetch("/api/v1/library/devices/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error || "تعذّر التحقق من الرمز.");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر التحقق من الرمز.");
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16" dir="rtl">
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="device-code-title"
        className={`w-full max-w-lg rounded-3xl border p-6 text-center shadow-xl ${
          isDark ? "border-amber-500/20 bg-zinc-900 text-white" : "border-amber-200 bg-white text-zinc-900"
        }`}
      >
        <Devices size={40} className={`mx-auto mb-3 ${isDark ? "text-amber-300" : "text-amber-700"}`} />
        <h2 id="device-code-title" className="mb-2 text-base font-bold">تفعيل هذا الجهاز للمكتبة</h2>
        <p className={`mb-5 text-sm leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>{messageAr}</p>
        {sentTo ? (
          <p role="status" className={`mb-3 text-xs ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
            أرسلنا الرمز إلى {sentTo}. صالح عشر دقائق.
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy !== null}
            className={`rounded-xl border px-4 py-2 text-xs font-bold transition disabled:opacity-50 ${
              isDark ? "border-white/10 text-zinc-200 hover:bg-white/5" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {busy === "send" ? "جارٍ الإرسال…" : sentTo ? "أرسل رمزاً جديداً" : "أرسل رمز التحقق إلى بريدي"}
          </button>
          <label htmlFor="device-code" className="sr-only">رمز التحقق</label>
          <input
            id="device-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="الرمز المكوّن من ستة أرقام"
            className={`rounded-xl border px-4 py-2 text-center text-sm tracking-widest outline-none ${
              isDark ? "border-white/10 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-900"
            }`}
          />
          <button
            type="button"
            onClick={() => void verify()}
            disabled={busy !== null || !code.trim()}
            className="rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy === "verify" ? "جارٍ التحقق…" : "تأكيد الرمز وفتح المكتبة"}
          </button>
          {error && (
            <p role="alert" className={`text-xs ${isDark ? "text-red-300" : "text-red-700"}`}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
