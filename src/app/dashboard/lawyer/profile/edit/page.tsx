"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle, SpinnerGap, Warning } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";

type Form = {
  bio_ar: string;
  specialties: string; // comma-separated in the input, split on submit
  years_experience: string;
  hourly_rate: string;
  license_number: string;
  bar_association: string;
  city: string;
  marketplace_visible: boolean;
  is_accepting_clients: boolean;
  show_contact: boolean;
};

const EMPTY: Form = {
  bio_ar: "", specialties: "", years_experience: "", hourly_rate: "",
  license_number: "", bar_association: "", city: "",
  marketplace_visible: false, is_accepting_clients: true, show_contact: false,
};

type ProfileApiResponse = {
  profile: { city?: string | null } | null;
  roleProfile: {
    bio_ar?: string | null; specialties?: string[] | null;
    years_experience?: number | null; hourly_rate?: number | null;
    license_number?: string | null; bar_association?: string | null;
    city?: string | null; marketplace_visible?: boolean | null;
    is_accepting_clients?: boolean | null; show_contact?: boolean | null;
  } | null;
};

export default function LawyerProfileEditPage() {
  const { isDark } = useTheme();
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseMode) { setLoading(false); return; }
    try {
      const res = await apiGet<ProfileApiResponse>("/api/v1/profile");
      const r = res.roleProfile;
      if (r) setForm({
        bio_ar: r.bio_ar ?? "",
        specialties: (r.specialties ?? []).join("، "),
        years_experience: r.years_experience != null ? String(r.years_experience) : "",
        hourly_rate: r.hourly_rate != null ? String(r.hourly_rate) : "",
        license_number: r.license_number ?? "",
        bar_association: r.bar_association ?? "",
        city: (r.city ?? res.profile?.city) ?? "",
        marketplace_visible: r.marketplace_visible ?? false,
        is_accepting_clients: r.is_accepting_clients ?? true,
        show_contact: r.show_contact ?? false,
      });
    } catch { setMsg({ type: "err", text: "تعذّر تحميل بيانات الملف" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true); setMsg(null);
    try {
      const body = {
        bio_ar: form.bio_ar,
        specialties: form.specialties.split(/[،,]/).map((s) => s.trim()).filter(Boolean),
        years_experience: form.years_experience ? parseInt(form.years_experience, 10) : 0,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
        license_number: form.license_number,
        bar_association: form.bar_association,
        city: form.city,
        marketplace_visible: form.marketplace_visible,
        is_accepting_clients: form.is_accepting_clients,
        show_contact: form.show_contact,
      };
      // Route the PATCH through the same api service used for the GET so auth /
      // base-url handling is consistent (never a raw fetch).
      await apiMutate("/api/v1/profile", "PATCH", body);
      setMsg({ type: "ok", text: "تم حفظ التعديلات بنجاح" });
      setTimeout(() => router.push("/dashboard/lawyer/profile"), 800);
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "حدث خطأ" });
    } finally { setSaving(false); }
  };

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const input = `w-full px-3 py-2 rounded-xl text-[13px] border transition-colors ${
    isDark ? "bg-zinc-800 border-white/[0.06] text-zinc-200 placeholder:text-zinc-600"
           : "bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400"}`;
  const label = `text-[11px] font-bold mb-1 block ${isDark ? "text-zinc-400" : "text-slate-500"}`;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (loading) return <div className="max-w-2xl mx-auto p-10 text-center" dir="rtl"><SpinnerGap size={24} className="animate-spin mx-auto text-zinc-400" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-5" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <Link href="/dashboard/lawyer/profile"
          className={`h-10 w-10 rounded-xl flex items-center justify-center ${isDark ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"} transition-colors`}>
          <ArrowLeft size={16} />
        </Link>
        <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>تعديل الملف المهني</h1>
      </motion.div>

      <div className={`${card} p-5 space-y-4`}>
        <div>
          <label className={label}>نبذة تعريفية</label>
          <textarea rows={4} value={form.bio_ar} onChange={(e) => set("bio_ar", e.target.value)} className={input} placeholder="نبذة عن خبرتك ومجالات عملك" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={label}>التخصصات (افصل بفاصلة)</label>
            <input value={form.specialties} onChange={(e) => set("specialties", e.target.value)} className={input} placeholder="قانون تجاري، قانون عمل" /></div>
          <div><label className={label}>المدينة</label>
            <input value={form.city} onChange={(e) => set("city", e.target.value)} className={input} /></div>
          <div><label className={label}>سنوات الخبرة</label>
            <input type="number" min="0" value={form.years_experience} onChange={(e) => set("years_experience", e.target.value)} className={input} /></div>
          <div><label className={label}>سعر الساعة (ر.س)</label>
            <input type="number" min="0" value={form.hourly_rate} onChange={(e) => set("hourly_rate", e.target.value)} className={input} /></div>
          <div><label className={label}>رقم الترخيص</label>
            <input value={form.license_number} onChange={(e) => set("license_number", e.target.value)} className={input} placeholder="رقم ترخيص المحاماة" /></div>
          <div><label className={label}>جهة الترخيص</label>
            <input value={form.bar_association} onChange={(e) => set("bar_association", e.target.value)} className={input} placeholder="الهيئة السعودية للمحامين" /></div>
        </div>

        <div className="space-y-3 pt-2">
          {([
            ["marketplace_visible", "الظهور في دليل المحامين"],
            ["is_accepting_clients", "أستقبل موكلين جدد"],
            ["show_contact", "إظهار بيانات التواصل في الدليل العام"],
          ] as const).map(([k, lbl]) => (
            <label key={k} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} className="accent-[#0B3D2E] w-4 h-4" />
              <span className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{lbl}</span>
            </label>
          ))}
        </div>

        {msg && (
          <div className={`text-[12px] font-bold px-3 py-2 rounded-xl flex items-center gap-2 ${msg.type === "ok" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
            {msg.type === "ok" ? <CheckCircle size={14} /> : <Warning size={14} />} {msg.text}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors disabled:opacity-40">
            {saving ? <SpinnerGap size={14} className="animate-spin" /> : <CheckCircle size={14} />} حفظ التعديلات
          </button>
          <Link href="/dashboard/lawyer/profile"
            className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
            إلغاء
          </Link>
        </div>
      </div>
    </div>
  );
}
