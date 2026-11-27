"use client";

import { useEffect, useState } from "react";
import { Devices, FloppyDisk, SpinnerGap } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { staffMaySee } from "@/lib/auth/adminNavAccess";

/**
 * «حد الأجهزة» — batch l19, owner ٢٣٣ (LIVE-17): one mobile + one computer for
 * the WHOLE account (it was the library's only: owner ٤٢٧ / ٤٠ / ٦٣, retired
 * with the e-mail code of a new device). One switch, the number is fixed:
 * library_monitor_settings.account_device_limit_enabled (20261209_40), read
 * and written through /api/v1/admin/library-monitor/devices. Saving is
 * settings.write (super admin); every admin may read. Ships OFF.
 * A user's devices are reset from his page (المستخدمون ← الأمان).
 */
type Props = { isDark: boolean; card: string };

export default function LibraryDevicesPanel({ isDark, card }: Props) {
  const { staffRole } = useUser();
  const canWrite = staffMaySee(staffRole, "settings.write");
  const [enabled, setEnabled] = useState(false);
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
        body: JSON.stringify({ enabled }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice({ ok: false, msg: (body && typeof body.error === "string" && body.error) || "تعذّر الحفظ." });
        return;
      }
      setEnabled(body.enabled === true);
      setNotice({ ok: true, msg: "حُفظ الإعداد. يسري خلال نصف دقيقة." });
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
        <p className={`text-[13px] font-bold ${tp}`}>حد الأجهزة للحساب كله (جوال واحد + حاسوب واحد)</p>
      </div>
      <div className={`text-[11px] leading-6 ${ts} space-y-1`}>
        <p>
          عند التفعيل يُفتح كل حساب على جوال واحد وحاسوب واحد في المنصة كلها — اللوحات والإعدادات وأدوات الذكاء
          الاصطناعي والمكتبة القانونية. يُسجَّل أول جوال وأول حاسوب يدخل منهما الحساب تلقائياً دون أي رمز.
        </p>
        <p>
          أي جهاز إضافي يُرفض وتظهر له رسالة تطلب التواصل مع الإدارة، ولا يُسجَّل خروج الجهازين المسجّلين. تسجيل الخروج لا يحرّر مكان
          الجهاز، ولا يستطيع المستخدم إزالة أجهزته بنفسه: لتبديل جهاز أعِد تعيين أجهزة المستخدم من صفحته (المستخدمون ← الأمان).
        </p>
        <p>
          حسابات الإدارة وفريق العمل مستثناة، ولكل عضو في مكتب أو شركة حدّه الخاص. إن تعذّر الفحص لعطل في الخادم يُسمح بالدخول مؤقتاً
          ويصل تنبيه إلى المسؤولين، حتى لا يُحرم المشتركون من حساباتهم بسبب العطل.
        </p>
      </div>

      {loading ? (
        <p className={`text-[11px] ${ts}`}>جارٍ التحميل…</p>
      ) : !available ? (
        <p className={`text-[11px] ${isDark ? "text-amber-300" : "text-amber-700"}`}>
          هذه الميزة لم تُفعَّل بعد على الخادم، ويتولّى ذلك الفريق التقني.
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
            تفعيل حد الأجهزة للحساب كله
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
