"use client";

/**
 * PlatformLicenceCard — the platform's licence number and issuer (owner file
 * 20 row 4, file 15 rows 11 / 45; batch l9). Two platform_settings rows,
 * license_number and license_issuer, written through PATCH
 * /api/v1/admin/settings (validated + audited there). Filled, the licence line
 * shows on /faq, in the footer, the Organization JSON-LD and /llms.txt within
 * about five minutes; empty, it is hidden whole. The commercial registration
 * and legal name come from «بيانات المنشأة» (billing_company) above.
 */

import { useEffect, useState } from "react";
import { Certificate, FloppyDisk, SpinnerGap } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { LICENSE_ISSUER_KEY, LICENSE_NUMBER_KEY } from "@/lib/publicSeo/platformRegistry";

type Status = { ok: boolean; text: string } | null;

async function patchSetting(key: string, value: string): Promise<{ ok: boolean; text: string }> {
  try {
    const res = await fetch("/api/v1/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (res.ok) return { ok: true, text: "حُفظ، ويظهر في الصفحات العامة خلال نحو خمس دقائق." };
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return { ok: false, text: typeof body?.error === "string" && body.error ? body.error : "تعذّر الحفظ، حاول مرة أخرى." };
  } catch {
    return { ok: false, text: "تعذّر الحفظ، حاول مرة أخرى." };
  }
}

export function PlatformLicenceCard() {
  const { isDark } = useTheme();
  const [number, setNumber] = useState("");
  const [issuer, setIssuer] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/admin/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { data?: Record<string, unknown> } | null) => {
        if (!alive) return;
        const data = body?.data ?? {};
        setNumber(typeof data[LICENSE_NUMBER_KEY] === "string" ? (data[LICENSE_NUMBER_KEY] as string) : "");
        setIssuer(typeof data[LICENSE_ISSUER_KEY] === "string" ? (data[LICENSE_ISSUER_KEY] as string) : "");
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    setSaving(true);
    setStatus(null);
    const first = await patchSetting(LICENSE_NUMBER_KEY, number.trim());
    const second = first.ok ? await patchSetting(LICENSE_ISSUER_KEY, issuer.trim()) : first;
    setStatus(second);
    setSaving(false);
  }

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const input = `w-full px-4 py-2.5 rounded-xl border text-sm outline-none ${
    isDark ? "bg-[#0d1117] border-white/10 text-white focus:border-[#C8A762]/40" : "bg-white border-slate-200 text-gray-900 focus:border-[#0B3D2E]/40"
  }`;

  return (
    <div className={`rounded-2xl border p-6 ${isDark ? "bg-zinc-900/60 border-white/[0.06]" : "bg-white border-slate-100 shadow-sm"}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <Certificate size={22} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
          <div>
            <p className={`text-sm font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>ترخيص المنصة</p>
            <p className={`text-xs mt-0.5 ${muted}`}>
              يظهر سطر «رقم الترخيص، الجهة المانحة» في الأسئلة الشائعة وتذييل الموقع وبيانات المنشأة لمحركات البحث. ما دام رقم الترخيص فارغاً لا يظهر السطر أبداً. السجل التجاري والاسم النظامي يُؤخذان من «بيانات المنشأة».
            </p>
          </div>
        </div>
        <button
          onClick={save}
          disabled={!loaded || saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328] disabled:opacity-50 transition-colors"
        >
          {saving ? <SpinnerGap size={16} className="animate-spin" /> : <FloppyDisk size={16} />}
          حفظ
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="platform-licence-number" className={`text-xs font-bold block mb-1.5 ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
            رقم الترخيص
          </label>
          <input id="platform-licence-number" type="text" dir="ltr" maxLength={60} value={number} onChange={(e) => setNumber(e.target.value)} className={`${input} font-mono`} />
        </div>
        <div>
          <label htmlFor="platform-licence-issuer" className={`text-xs font-bold block mb-1.5 ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
            الجهة المانحة
          </label>
          <input id="platform-licence-issuer" type="text" maxLength={120} value={issuer} onChange={(e) => setIssuer(e.target.value)} className={input} />
        </div>
      </div>
      {status && (
        <p className={`text-xs mt-3 font-bold ${status.ok ? "text-emerald-500" : isDark ? "text-red-400" : "text-red-600"}`}>{status.text}</p>
      )}
    </div>
  );
}
