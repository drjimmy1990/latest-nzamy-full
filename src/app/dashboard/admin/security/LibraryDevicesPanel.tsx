"use client";

import { useEffect, useState } from "react";
import { Devices, FloppyDisk, SpinnerGap } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { staffMaySee } from "@/lib/auth/adminNavAccess";

/**
 * «أجهزة المكتبة» — owner ٤٢٧: the device limit on the subscriber library.
 * The switch and the number are two columns of the library settings row
 * (library_monitor_settings.device_limit_enabled / device_limit, 20261108_20),
 * read and written through /api/v1/admin/library-monitor/devices.
 * Saving is settings.write (super admin); every admin may read. Ships OFF.
 * A user's devices are reset from his page (المستخدمون ← الأمان).
 */
type Props = { isDark: boolean; card: string };

export default function LibraryDevicesPanel({ isDark, card }: Props) {
  const { staffRole } = useUser();
  const canWrite = staffMaySee(staffRole, "settings.write");
  const [enabled, setEnabled] = useState(false);
  const [limit, setLimit] = useState(2);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/admin/library-monitor/devices", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !body) {
          setNotice({ ok: false, msg: (body && typeof body.error === "string" && body.error) || "تعذّر تحميل الإعداد." });
        } else {
          setEnabled(body.enabled === true);
          setLimit(typeof body.limit === "number" ? body.limit : 2);
          setAvailable(body.available !== false);
        }
      } catch {
        if (!cancelled) setNotice({ ok: false, msg: "تعذّر الاتصال." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/admin/library-monitor/devices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, limit }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice({ ok: false, msg: (body && typeof body.error === "string" && body.error) || "تعذّر الحفظ." });
        return;
      }
      setEnabled(body.enabled === true);
      setLimit(typeof body.limit === "number" ? body.limit : limit);
      setNotice({ ok: true, msg: "حُفظ الإعداد. يسري على القراءات الجديدة خلال دقيقة." });
    } catch {
      setNotice({ ok: false, msg: "تعذّر الاتصال." });
    } finally {
      setSaving(false);
    }
  }

  const tp = isDark ? "text-white" : "text-slate-800";
  const ts = isDark ? "text-zinc-400" : "text-slate-500";

  return (
    <div className={`${card} p-5 space-y-4`} dir="rtl">
      <div className="flex items-center gap-2">
        <Devices size={18} className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
        <p className={`text-[13px] font-bold ${tp}`}>حد الأجهزة في المكتبة (المشتركون)</p>
      </div>
      <p className={`text-[11px] leading-6 ${ts}`}>
        عند التفعيل يُرفض الجهاز الجديد بعد بلوغ العدد المحدد، ويُطلب من المستخدم تسجيل الخروج من أحد أجهزته المصرّحة.
        يشمل نص المكتبة الكامل للمشترك فقط (الأنظمة، القرارات، المبادئ، الكتب، والبحث داخل الوثيقة)؛ الزائر وغير المشترك لا يُفحص جهازه،
        وحسابات المسؤولين مستثناة. إعادة تعيين أجهزة مستخدم من صفحته: المستخدمون ← الأمان.
      </p>

      {loading ? (
        <p className={`text-[11px] ${ts}`}>جارٍ التحميل…</p>
      ) : !available ? (
        <p className={`text-[11px] ${isDark ? "text-amber-300" : "text-amber-700"}`}>
          شغّل ملف الترحيل 20261108_20_library_device_limit.sql أولاً.
        </p>
      ) : (
        <div className="space-y-3">
          <label className={`flex items-center gap-2 text-[12px] font-bold ${tp}`}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canWrite || saving}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            تفعيل حد الأجهزة
          </label>
          <label className={`flex items-center gap-2 text-[12px] ${tp}`}>
            عدد الأجهزة المصرّحة لكل حساب
            <input
              type="number"
              min={1}
              max={10}
              value={limit}
              disabled={!canWrite || saving}
              onChange={(e) => setLimit(Math.max(1, Math.min(10, Math.trunc(Number(e.target.value) || 1))))}
              className={`w-20 rounded-lg border px-2 py-1 text-[12px] ${isDark ? "border-white/[0.08] bg-zinc-800 text-white" : "border-slate-200 bg-white text-slate-800"}`}
            />
          </label>
          {canWrite && (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50"
            >
              {saving ? <SpinnerGap size={13} className="animate-spin" /> : <FloppyDisk size={13} />} حفظ
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className={`text-[11px] ${notice.ok ? "text-emerald-500" : "text-red-500"}`}>{notice.msg}</p>
      )}
    </div>
  );
}
