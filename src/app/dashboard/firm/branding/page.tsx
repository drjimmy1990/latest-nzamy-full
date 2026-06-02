"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Palette, Globe, Image as ImageIcon, Eye, CheckCircle,
  CloudArrowUp, ArrowSquareOut, Phone, EnvelopeSimple,
  WhatsappLogo, Sparkle, Buildings, Lock, PaintBrush,
  LinkSimple, ShieldCheck,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

export default function FirmBrandingPage() {
  const { isDark } = useTheme();
  const [firmName, setFirmName] = useState("مكتب المنشاوي وشركاه");
  const [firmNameEn, setFirmNameEn] = useState("Al-Menshawi & Partners");
  const [tagline, setTagline] = useState("محامون ومستشارون قانونيون");
  const [primaryColor, setPrimaryColor] = useState("#1a3a5c");
  const [accentColor, setAccentColor] = useState("#d4a843");
  const [domainType, setDomainType] = useState<"subdomain" | "custom">("subdomain");
  const [subdomain, setSubdomain] = useState("almenshawi");
  const [customDomain, setCustomDomain] = useState("clients.almenshawi-law.com");
  const [supportEmail, setSupportEmail] = useState("info@almenshawi-law.com");
  const [supportPhone, setSupportPhone] = useState("+966 5x xxxx xxxx");
  const [whatsapp, setWhatsapp] = useState("+966 5x xxxx xxxx");
  const [showPoweredBy, setShowPoweredBy] = useState(true);
  const [portalEnabled, setPortalEnabled] = useState(true);
  const [saved, setSaved] = useState(false);
  const [logoUploaded, setLogoUploaded] = useState(false);

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-500" : "text-zinc-400";
  const inputCls = `w-full rounded-xl border p-3 text-[13px] outline-none transition-colors ${
    isDark ? "border-white/[0.08] bg-zinc-800/50 text-white placeholder:text-zinc-600 focus:border-royal/50"
           : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 focus:border-royal/50"
  }`;

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <div className={`p-5 md:p-7 max-w-4xl mx-auto space-y-5 ${tp}`} dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-xl font-bold ${tp}`}>بوابة العميل — الهوية البصرية</h1>
            <span className="rounded-full bg-purple-500/15 border border-purple-500/30 px-2.5 py-0.5 text-[10px] font-bold text-purple-400">CORP</span>
          </div>
          <p className={`text-[13px] ${ts}`}>خصّص بوابة عملائك — شعار مكتبك، ألوانه، ودومينه الخاص</p>
        </div>
        <div className={`flex-shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center ${isDark ? "bg-purple-900/20" : "bg-purple-50"}`}>
          <Palette size={22} weight="duotone" className="text-purple-500" />
        </div>
      </div>

      {/* Portal status */}
      <div className={`${card} p-4 shadow-sm flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${portalEnabled ? "bg-emerald-500" : isDark ? "bg-zinc-600" : "bg-zinc-300"}`} />
          <span className={`text-[13px] font-semibold ${tp}`}>بوابة العميل {portalEnabled ? "مُفعّلة" : "مُعطّلة"}</span>
        </div>
        <button onClick={() => setPortalEnabled(!portalEnabled)}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
            portalEnabled
              ? "border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
              : isDark ? "border-white/[0.08] text-zinc-400" : "border-zinc-200 text-zinc-500"
          }`}>
          {portalEnabled ? "تعطيل" : "تفعيل"}
        </button>
      </div>

      {/* Logo upload */}
      <div className={`${card} p-5 shadow-sm`}>
        <p className={`text-[12px] font-bold mb-3 ${tp}`}><ImageIcon size={14} className="inline me-1" /> الشعار</p>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "الشعار الرئيسي", desc: "للخلفية الفاتحة" },
            { label: "الشعار الداكن (اختياري)", desc: "للوضع الداكن" },
          ].map((logo, i) => (
            <div key={i} onClick={() => setLogoUploaded(true)}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                logoUploaded && i === 0
                  ? isDark ? "border-emerald-700/30 bg-emerald-900/5" : "border-emerald-200 bg-emerald-50"
                  : isDark ? "border-white/[0.08] hover:border-royal/30" : "border-zinc-200 hover:border-royal/30"
              }`}>
              {logoUploaded && i === 0 ? (
                <div className="flex items-center justify-center gap-2">
                  <Buildings size={24} className="text-royal" />
                  <CheckCircle size={14} weight="fill" className="text-emerald-500" />
                </div>
              ) : (
                <CloudArrowUp size={24} className={`mx-auto mb-1 ${isDark ? "text-zinc-600" : "text-zinc-300"}`} />
              )}
              <p className={`text-[11px] font-medium mt-1 ${tp}`}>{logo.label}</p>
              <p className={`text-[10px] ${ts}`}>{logo.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Firm info */}
      <div className={`${card} p-5 shadow-sm space-y-4`}>
        <p className={`text-[12px] font-bold ${tp}`}><Buildings size={14} className="inline me-1" /> بيانات المكتب</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={`text-[11px] font-medium mb-1 block ${ts}`}>اسم المكتب (عربي)</label>
            <input value={firmName} onChange={e => setFirmName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={`text-[11px] font-medium mb-1 block ${ts}`}>اسم المكتب (إنجليزي)</label>
            <input value={firmNameEn} onChange={e => setFirmNameEn(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={`text-[11px] font-medium mb-1 block ${ts}`}>الشعار التعريفي</label>
          <input value={tagline} onChange={e => setTagline(e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Colors */}
      <div className={`${card} p-5 shadow-sm`}>
        <p className={`text-[12px] font-bold mb-3 ${tp}`}><PaintBrush size={14} className="inline me-1" /> الألوان</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={`text-[11px] font-medium mb-1 block ${ts}`}>اللون الرئيسي</label>
            <div className="flex items-center gap-3">
              <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                className="w-10 h-10 rounded-xl border-0 cursor-pointer" />
              <input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                className={`${inputCls} font-mono text-[12px]`} />
            </div>
          </div>
          <div>
            <label className={`text-[11px] font-medium mb-1 block ${ts}`}>اللون الثانوي</label>
            <div className="flex items-center gap-3">
              <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)}
                className="w-10 h-10 rounded-xl border-0 cursor-pointer" />
              <input value={accentColor} onChange={e => setAccentColor(e.target.value)}
                className={`${inputCls} font-mono text-[12px]`} />
            </div>
          </div>
        </div>
        {/* Preview */}
        <div className="mt-4 rounded-xl overflow-hidden border" style={{ borderColor: primaryColor + "40" }}>
          <div className="p-3 flex items-center gap-2" style={{ background: primaryColor }}>
            <Buildings size={16} className="text-white" />
            <span className="text-[12px] font-bold text-white">{firmName}</span>
          </div>
          <div className={`p-3 ${isDark ? "bg-zinc-800" : "bg-white"}`}>
            <p className={`text-[11px] ${ts}`}>هكذا تبدو بوابة عملائك</p>
            <button className="mt-1 px-3 py-1 rounded-lg text-[10px] font-bold text-white" style={{ background: accentColor }}>
              دخول البوابة
            </button>
          </div>
        </div>
      </div>

      {/* Domain */}
      <div className={`${card} p-5 shadow-sm space-y-4`}>
        <p className={`text-[12px] font-bold ${tp}`}><Globe size={14} className="inline me-1" /> الدومين</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { type: "subdomain" as const, label: "Subdomain مجاني", desc: `${subdomain}.nzamy.com`, tag: "مجاني" },
            { type: "custom" as const, label: "دومين خاص", desc: customDomain, tag: "٧,٩٩٩ ﷼/سنة" },
          ].map(opt => (
            <button key={opt.type} onClick={() => setDomainType(opt.type)}
              className={`rounded-xl border p-4 text-start transition-all ${
                domainType === opt.type
                  ? isDark ? "border-royal/50 bg-royal/10" : "border-royal/40 bg-royal/5"
                  : isDark ? "border-white/[0.06]" : "border-zinc-200"
              }`}>
              <div className="flex items-center justify-between mb-1">
                <LinkSimple size={16} className={domainType === opt.type ? "text-royal" : ts} weight="duotone" />
                <span className={`text-[9px] px-2 py-0.5 rounded-full ${
                  opt.type === "subdomain" ? "bg-emerald-500/10 text-emerald-500" : "bg-[#C8A762]/10 text-[#C8A762]"
                }`}>{opt.tag}</span>
              </div>
              <p className={`text-[12px] font-semibold ${tp}`}>{opt.label}</p>
              <p className="text-[11px] font-mono text-royal mt-1">{opt.desc}</p>
            </button>
          ))}
        </div>
        {domainType === "custom" && (
          <div className={`rounded-xl p-3 border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-[#C8A762]/20 bg-[#C8A762]/5"}`}>
            <p className="text-[11px] font-semibold text-[#C8A762] mb-1">إعداد DNS</p>
            <p className={`text-[10px] ${ts}`}>
              أضف CNAME record: <span className="font-mono font-bold text-royal">{customDomain}</span> → <span className="font-mono">cname.nzamy.com</span>
            </p>
            <div className="flex items-center gap-2 mt-2">
              <CheckCircle size={12} weight="fill" className="text-emerald-500" />
              <span className="text-[10px] text-emerald-500 font-semibold">متصل — SSL نشط</span>
            </div>
          </div>
        )}
      </div>

      {/* Contact */}
      <div className={`${card} p-5 shadow-sm space-y-4`}>
        <p className={`text-[12px] font-bold ${tp}`}><Phone size={14} className="inline me-1" /> التواصل</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={`text-[11px] font-medium mb-1 flex items-center gap-1 ${ts}`}><EnvelopeSimple size={12} /> البريد</label>
            <input value={supportEmail} onChange={e => setSupportEmail(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={`text-[11px] font-medium mb-1 flex items-center gap-1 ${ts}`}><Phone size={12} /> الهاتف</label>
            <input value={supportPhone} onChange={e => setSupportPhone(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={`text-[11px] font-medium mb-1 flex items-center gap-1 ${ts}`}><WhatsappLogo size={12} /> واتساب</label>
            <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      {/* Powered by toggle */}
      <div className={`${card} p-4 shadow-sm flex items-center justify-between`}>
        <div>
          <p className={`text-[12px] font-semibold ${tp}`}>"Powered by نظامي" في الفووتر</p>
          <p className={`text-[10px] ${ts}`}>{showPoweredBy ? "ظاهر للعملاء في أسفل البوابة" : "مخفي — Enterprise فقط"}</p>
        </div>
        <button onClick={() => setShowPoweredBy(!showPoweredBy)}
          className={`w-12 h-6 rounded-full relative transition-colors ${showPoweredBy ? "bg-royal" : isDark ? "bg-zinc-700" : "bg-zinc-300"}`}>
          <motion.div animate={{ x: showPoweredBy ? -2 : -22 }}
            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-white shadow-md" />
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button className={`flex-1 py-3 rounded-2xl border text-[13px] font-bold flex items-center justify-center gap-2 ${isDark ? "border-white/[0.08] text-zinc-400" : "border-zinc-200 text-zinc-500"}`}>
          <Eye size={14} /> معاينة البوابة
        </button>
        <motion.button onClick={handleSave} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className="flex-1 py-3 rounded-2xl bg-[#0B3D2E] text-white text-[13px] font-bold flex items-center justify-center gap-2 shadow-[0_8px_24px_-8px_rgba(11,61,46,0.4)]">
          {saved ? <><CheckCircle size={14} weight="fill" /> تم الحفظ</> : <><Sparkle size={14} weight="fill" /> حفظ وتفعيل البوابة</>}
        </motion.button>
      </div>
    </div>
  );
}
