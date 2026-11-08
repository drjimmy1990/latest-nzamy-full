"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowCounterClockwise, SpinnerGap } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { staffMaySee } from "@/lib/auth/adminNavAccess";

interface DeviceRow {
  id: string;
  label: string;
  firstSeen: string | null;
  lastSeen: string | null;
}

const fmt = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
};

/**
 * «أجهزة المكتبة» on the admin user page (owner ٤٢٧): the user's authorised
 * library devices and «إعادة تعيين الأجهزة» (revokes them all; the rows are
 * kept). GET / POST /api/v1/admin/users/[id]/library-devices. The reset is
 * library.lock_lift (super admin and operations), like lifting a library
 * lock; the server decides either way.
 */
export default function UserLibraryDevicesCard({ userId, isDark, card }: { userId: string; isDark: boolean; card: string }) {
  const { staffRole } = useUser();
  const canReset = staffMaySee(staffRole, "library.lock_lift");
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [available, setAvailable] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/users/${encodeURIComponent(userId)}/library-devices`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        setMsg({ ok: false, text: (body && typeof body.error === "string" && body.error) || "تعذّر تحميل الأجهزة." });
        return;
      }
      setDevices(Array.isArray(body.devices) ? body.devices : []);
      setAvailable(body.available !== false);
      setEnabled(body.enabled === true);
    } catch {
      setMsg({ ok: false, text: "تعذّر الاتصال." });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reset() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${encodeURIComponent(userId)}/library-devices`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg({ ok: false, text: (body && typeof body.error === "string" && body.error) || "تعذّر إعادة التعيين." });
        return;
      }
      setMsg({ ok: true, text: `أُعيد تعيين الأجهزة (${typeof body?.revoked === "number" ? body.revoked : 0}).` });
      setConfirming(false);
      await load();
    } catch {
      setMsg({ ok: false, text: "تعذّر الاتصال." });
    } finally {
      setBusy(false);
    }
  }

  const tp = isDark ? "text-white" : "text-slate-800";
  const ts = isDark ? "text-zinc-500" : "text-slate-400";
  const tv = isDark ? "text-zinc-300" : "text-slate-600";

  return (
    <div className={`${card} p-5`}>
      <p className={`text-[13px] font-bold mb-1 ${tp}`}>أجهزة المكتبة</p>
      <p className={`text-[11px] mb-3 ${ts}`}>
        {enabled ? "حد الأجهزة مفعّل." : "حد الأجهزة غير مفعّل حالياً (من الأمان والحماية ← أجهزة المكتبة)."}
      </p>
      {loading ? (
        <p className={`text-[11px] ${ts}`}>جارٍ التحميل…</p>
      ) : !available ? (
        <p className={`text-[11px] ${ts}`}>لم يُشغَّل ملف الترحيل 20261108_20 بعد.</p>
      ) : devices.length === 0 ? (
        <p className={`text-[11px] ${ts}`}>لا توجد أجهزة مصرّحة.</p>
      ) : (
        devices.map((d, i) => (
          <div key={d.id} className={`flex items-center justify-between py-2 ${i < devices.length - 1 ? `border-b ${isDark ? "border-white/[0.04]" : "border-slate-50"}` : ""}`}>
            <span className={`text-[11px] ${tv}`}>{d.label}</span>
            <span className={`text-[10px] ${ts}`}>آخر استخدام: {fmt(d.lastSeen)}</span>
          </div>
        ))
      )}
      {available && canReset && (
        <div className="mt-3 flex items-center gap-2">
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy || devices.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition-colors disabled:opacity-40"
            >
              <ArrowCounterClockwise size={13} /> إعادة تعيين الأجهزة
            </button>
          ) : (
            <>
              <span className={`text-[11px] ${tv}`}>تُلغى كل أجهزته المصرّحة ويسجّل أجهزته من جديد عند القراءة. متابعة؟</span>
              <button
                type="button"
                onClick={reset}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 disabled:opacity-40"
              >
                {busy && <SpinnerGap size={13} className="animate-spin" />} تأكيد
              </button>
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={`px-3 py-2 text-[11px] font-bold ${ts}`}>
                إلغاء
              </button>
            </>
          )}
        </div>
      )}
      {msg && <p className={`mt-2 text-[11px] ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</p>}
    </div>
  );
}
