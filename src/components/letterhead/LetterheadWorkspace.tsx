"use client";

/**
 * LetterheadWorkspace — «الورق المروّس الرسمي» for an individual lawyer
 * (/dashboard/lawyer/letterhead) and for a firm (/dashboard/firm/letterhead),
 * owner decision ٢٥٦.
 *
 * Left: the identity vault (names, contacts, accent colour, own logo; the
 * licence read-only from the verified profile) and the letter (date in
 * Gregorian + Hijri, recipient, subject, body, signature). Right: the A4 sheet
 * as it will print. «طباعة / حفظ PDF» opens the browser's print dialog; what
 * prints is a second copy of the sheet portalled straight under <body>, and
 * the print CSS hides everything else — the dashboard chrome never reaches
 * the paper. The letter itself is not stored: compose, print, done.
 *
 * Before 20261026_63 runs the API answers `available: false`: the vault is
 * read-only with «يتطلب تحديث قاعدة البيانات», and a letter still prints with
 * the profile's own name.
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { Printer, FloppyDisk, CloudArrowUp, Trash, Warning, SpinnerGap, CheckCircle, Info, ArrowClockwise } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { LetterheadSheet } from "./Letterhead";
import { useLetterhead } from "./useLetterhead";
import {
  BRANDING_DEFAULT_ACCENT,
  BRANDING_FIELD_LABEL_AR,
  BRANDING_LOGO_MAX_BYTES,
  BRANDING_TEXT_FIELDS,
  EMPTY_BRANDING_FIELDS,
  type BrandingFields,
  type BrandingScope,
  type BrandingTextField,
} from "@/lib/branding/brandingVault";
import { qrNoteAr } from "@/lib/branding/letterheadIdentity";
import { describeDateLinesAr } from "@/lib/services/dualCalendar";
import { isoDate } from "@/lib/services/deadlineEngine";

const PRINT_ROOT_ID = "nz-letterhead-print-root";

const PRINT_CSS = `
@page { size: A4; margin: 14mm 16mm 12mm; }
@media screen { #${PRINT_ROOT_ID} { display: none !important; } }
@media print {
  html, body { background: #FFFFFF !important; }
  body > *:not(#${PRINT_ROOT_ID}) { display: none !important; }
  #${PRINT_ROOT_ID} { display: block !important; }
  #${PRINT_ROOT_ID}, #${PRINT_ROOT_ID} * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

interface Letter {
  date: string;
  recipient: string;
  subject: string;
  body: string;
  signature: string;
}

const TEXT_INPUTS: { key: BrandingTextField; ltr?: boolean; placeholder: string }[] = [
  { key: "display_name_ar", placeholder: "مكتب المحامي فهد الشمري للمحاماة والاستشارات القانونية" },
  { key: "display_name_en", ltr: true, placeholder: "Fahad Al-Shammari Law Office" },
  { key: "address", placeholder: "الرياض — حي العليا — طريق الملك فهد" },
  { key: "phone", ltr: true, placeholder: "+966 5x xxx xxxx" },
  { key: "email", ltr: true, placeholder: "office@example.sa" },
  { key: "website", ltr: true, placeholder: "https://example.sa" },
];

function LetterBody({ letter }: { letter: Letter }) {
  const lines = letter.date ? describeDateLinesAr(letter.date) : null;
  return (
    <div>
      {lines && (
        <div style={{ textAlign: "left", fontSize: "10pt", color: "#374151", marginBottom: "6mm" }}>
          <div>التاريخ: {lines.gregorian}</div>
          {lines.hijri && <div>الموافق: {lines.hijri}</div>}
        </div>
      )}
      {letter.recipient && <div style={{ fontWeight: 700, marginBottom: "2mm" }}>{letter.recipient}</div>}
      {letter.subject && (
        <div style={{ marginBottom: "5mm" }}>
          <span style={{ fontWeight: 700 }}>الموضوع: </span>{letter.subject}
        </div>
      )}
      <div style={{ whiteSpace: "pre-wrap", textAlign: "justify", minHeight: "60mm" }}>{letter.body}</div>
      {letter.signature && (
        <div style={{ marginTop: "12mm", textAlign: "left" }}>
          <div style={{ fontWeight: 700 }}>{letter.signature}</div>
          <div style={{ marginTop: "8mm", color: "#6B7280", fontSize: "9pt" }}>التوقيع: ............................</div>
        </div>
      )}
    </div>
  );
}

export default function LetterheadWorkspace({ scope }: { scope: BrandingScope }) {
  const { isDark } = useTheme();
  const { state, reload, identityFor } = useLetterhead(scope);
  const [fields, setFields] = useState<BrandingFields>(EMPTY_BRANDING_FIELDS);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message?: string }>({ kind: "idle" });
  const [logoState, setLogoState] = useState<{ kind: "idle" | "busy" | "error"; message?: string }>({ kind: "idle" });
  const [letter, setLetter] = useState<Letter>({
    date: "",
    recipient: "",
    subject: "",
    body: "السلام عليكم ورحمة الله وبركاته، وبعد:\n\n",
    signature: "",
  });
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Today on the client only (an SSR or nginx-cached date would be stale).
  useEffect(() => {
    setLetter((l) => (l.date ? l : { ...l, date: isoDate(new Date()) }));
  }, []);

  useEffect(() => {
    if (state.status !== "ready") return;
    setFields(state.data.fields);
    setLogoUrl(state.data.logoUrl);
    setLetter((l) => (l.signature ? l : { ...l, signature: state.data.fields.display_name_ar || state.data.defaults.display_name_ar }));
  }, [state]);

  useEffect(() => {
    const el = document.createElement("div");
    el.id = PRINT_ROOT_ID;
    document.body.appendChild(el);
    setPrintRoot(el);
    return () => { el.remove(); };
  }, []);

  const identity = useMemo(() => identityFor(fields, logoUrl), [identityFor, fields, logoUrl]);
  const available = state.status === "ready" && state.data.available;

  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60" : "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const tp = isDark ? "text-white" : "text-slate-800";
  const ts = isDark ? "text-zinc-400" : "text-slate-500";
  const inputCls = `w-full rounded-xl border px-3 py-2 text-[13px] outline-none transition-colors disabled:opacity-60 ${
    isDark ? "border-white/[0.08] bg-zinc-800/50 text-white placeholder:text-zinc-600 focus:border-[#C8A762]/60"
           : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:border-[#C8A762]"
  }`;
  const labelCls = `mb-1 block text-[11px] font-semibold ${ts}`;

  const save = async () => {
    setSaveState({ kind: "saving" });
    try {
      const res = await fetch(`/api/v1/branding?scope=${scope}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveState({ kind: "error", message: (body as { error?: string }).error ?? "تعذّر الحفظ" });
        return;
      }
      setFields((body as { fields: BrandingFields }).fields);
      setSaveState({ kind: "saved" });
    } catch {
      setSaveState({ kind: "error", message: "تعذّر الاتصال بالخادم" });
    }
  };

  const uploadLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > BRANDING_LOGO_MAX_BYTES) {
      setLogoState({ kind: "error", message: "حجم الشعار يتجاوز ١ ميجابايت" });
      return;
    }
    setLogoState({ kind: "busy" });
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/v1/branding/logo?scope=${scope}`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // nginx answers an oversized body itself, with an HTML 413 (no JSON).
        const fallback = res.status === 413 ? "حجم الشعار يتجاوز ١ ميجابايت" : "تعذّر رفع الشعار";
        setLogoState({ kind: "error", message: (body as { error?: string }).error ?? fallback });
        return;
      }
      setLogoUrl((body as { logoUrl: string | null }).logoUrl);
      setLogoState({ kind: "idle" });
    } catch {
      setLogoState({ kind: "error", message: "تعذّر الاتصال بالخادم" });
    }
  };

  const removeLogo = async () => {
    setLogoState({ kind: "busy" });
    try {
      const res = await fetch(`/api/v1/branding/logo?scope=${scope}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLogoState({ kind: "error", message: (body as { error?: string }).error ?? "تعذّر حذف الشعار" });
        return;
      }
      setLogoUrl(null);
      setLogoState({ kind: "idle" });
    } catch {
      setLogoState({ kind: "error", message: "تعذّر الاتصال بالخادم" });
    }
  };

  if (state.status === "loading") {
    return (
      <div className="p-16 text-center" dir="rtl">
        <SpinnerGap size={26} className={`mx-auto animate-spin ${ts}`} />
        <p className={`mt-3 text-[12px] ${ts}`}>جارٍ تحميل بيانات الهوية…</p>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-xl px-4 py-16" dir="rtl">
        <div className={`${card} p-6 text-center`}>
          <Warning size={26} weight="duotone" className="mx-auto mb-3 text-amber-500" />
          <p className={`text-[14px] font-bold ${tp}`}>{state.message}</p>
          {state.httpStatus !== 403 && state.httpStatus !== 404 && (
            <button onClick={() => void reload()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-[#C8A762]">
              <ArrowClockwise size={14} /> إعادة المحاولة
            </button>
          )}
        </div>
      </div>
    );
  }

  const data = state.data;
  const note = identity ? qrNoteAr(identity.qr) : null;
  const setField = (key: keyof BrandingFields, value: string) => {
    setFields((f) => ({ ...f, [key]: value }));
    if (saveState.kind !== "saving") setSaveState({ kind: "idle" });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-5 md:p-7" dir="rtl">
      <style href="nz-letterhead-print" precedence="default">{PRINT_CSS}</style>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={`text-xl font-bold ${tp}`}>الورق المروّس الرسمي</h1>
          <p className={`mt-1 text-[13px] ${ts}`}>
            {scope === "firm" ? "هوية المكتب على خطاباته الرسمية" : "هويتك المهنية على خطاباتك الرسمية"} — مع ختم منصة نظامي ورمزها الذكي في الذيل.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          disabled={!identity}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[13px] font-bold text-[#C8A762] shadow-sm transition-colors hover:bg-[#0a3328] disabled:opacity-50"
        >
          <Printer size={16} weight="bold" /> طباعة / حفظ PDF
        </button>
      </div>

      {!data.available && (
        <div className={`flex items-start gap-2 rounded-xl border p-3 text-[12px] ${isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
          <Warning size={16} className="mt-0.5 flex-shrink-0" />
          <span>{data.message} يمكنك طباعة خطاب بالاسم من ملفك، دون حفظ الهوية أو رفع شعار.</span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className={`${card} space-y-3 p-5`}>
            <h2 className={`text-[14px] font-bold ${tp}`}>هوية الورق</h2>
            {TEXT_INPUTS.map(({ key, ltr, placeholder }) => (
              <div key={key}>
                <label className={labelCls} htmlFor={`lh-${key}`}>{BRANDING_FIELD_LABEL_AR[key]}</label>
                <input
                  id={`lh-${key}`}
                  dir={ltr ? "ltr" : "rtl"}
                  value={fields[key]}
                  maxLength={BRANDING_TEXT_FIELDS[key]}
                  placeholder={placeholder}
                  disabled={!available}
                  onChange={(e) => setField(key, e.target.value)}
                  className={inputCls}
                />
              </div>
            ))}
            <div>
              <label className={labelCls} htmlFor="lh-accent">{BRANDING_FIELD_LABEL_AR.accent_color}</label>
              <div className="flex items-center gap-3">
                <input
                  id="lh-accent"
                  type="color"
                  value={/^#[0-9A-Fa-f]{6}$/.test(fields.accent_color) ? fields.accent_color : BRANDING_DEFAULT_ACCENT}
                  disabled={!available}
                  onChange={(e) => setField("accent_color", e.target.value.toUpperCase())}
                  className="h-9 w-12 cursor-pointer rounded-lg border-0 disabled:cursor-not-allowed"
                />
                <span dir="ltr" className={`font-mono text-[12px] ${ts}`}>{fields.accent_color}</span>
                {fields.accent_color !== BRANDING_DEFAULT_ACCENT && available && (
                  <button onClick={() => setField("accent_color", BRANDING_DEFAULT_ACCENT)} className={`text-[11px] underline ${ts}`}>
                    ذهبي المنصة
                  </button>
                )}
              </div>
            </div>
            <div className={`rounded-xl border p-3 text-[12px] ${isDark ? "border-white/[0.06] text-zinc-300" : "border-slate-200 text-slate-600"}`}>
              <span className="font-semibold">رقم الترخيص: </span>
              {data.licence.verified && data.licence.number
                ? <span dir="ltr">{data.licence.number}</span>
                : <span>يظهر على الورق بعد توثيق {scope === "firm" ? "ملف المكتب" : "ملفك"} من المنصة.</span>}
              <span className={`block text-[11px] ${ts}`}>يُقرأ من الملف الموثّق ولا يُعدَّل من هنا.</span>
            </div>

            <div>
              <p className={labelCls}>شعار {scope === "firm" ? "المكتب" : "المكتب الخاص"} (اختياري)</p>
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadLogo} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={!available || logoState.kind === "busy"}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold disabled:opacity-50 ${isDark ? "border-white/[0.08] text-zinc-300" : "border-slate-200 text-slate-600"}`}
                >
                  {logoState.kind === "busy" ? <SpinnerGap size={14} className="animate-spin" /> : <CloudArrowUp size={14} />}
                  {logoUrl ? "استبدال الشعار" : "رفع شعار"}
                </button>
                {logoUrl && (
                  <button
                    onClick={() => void removeLogo()}
                    disabled={!available || logoState.kind === "busy"}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold text-red-500 disabled:opacity-50"
                  >
                    <Trash size={14} /> حذف
                  </button>
                )}
              </div>
              <p className={`mt-1 text-[11px] ${ts}`}>PNG أو JPEG أو WebP، حتى ١ ميجابايت. لا يُقبل SVG.</p>
              {logoState.kind === "error" && <p className="mt-1 text-[11px] text-red-500">{logoState.message}</p>}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => void save()}
                disabled={!available || saveState.kind === "saving"}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-[#C8A762] disabled:opacity-50"
              >
                {saveState.kind === "saving" ? <SpinnerGap size={14} className="animate-spin" /> : <FloppyDisk size={14} />}
                حفظ الهوية
              </button>
              {saveState.kind === "saved" && <span className="inline-flex items-center gap-1 text-[12px] text-emerald-500"><CheckCircle size={14} weight="fill" /> حُفظت</span>}
              {saveState.kind === "error" && <span className="text-[12px] text-red-500">{saveState.message}</span>}
            </div>
            {scope === "firm" && (
              <p className={`text-[11px] ${ts}`}>يدير هوية المكتب مالكه والشريك المدير ومدير المكتب.</p>
            )}
          </section>

          <section className={`${card} space-y-3 p-5`}>
            <h2 className={`text-[14px] font-bold ${tp}`}>الخطاب</h2>
            <div>
              <label className={labelCls} htmlFor="lh-date">التاريخ</label>
              <input id="lh-date" type="date" value={letter.date} onChange={(e) => setLetter({ ...letter, date: e.target.value })} className={inputCls} />
              {letter.date && describeDateLinesAr(letter.date)?.hijri && (
                <p className={`mt-1 text-[11px] ${ts}`}>الموافق {describeDateLinesAr(letter.date)?.hijri}</p>
              )}
            </div>
            <div>
              <label className={labelCls} htmlFor="lh-to">إلى</label>
              <input id="lh-to" value={letter.recipient} placeholder="أصحاب الفضيلة / الجهة المرسل إليها" onChange={(e) => setLetter({ ...letter, recipient: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="lh-subject">الموضوع</label>
              <input id="lh-subject" value={letter.subject} onChange={(e) => setLetter({ ...letter, subject: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="lh-body">نص الخطاب</label>
              <textarea id="lh-body" rows={10} value={letter.body} onChange={(e) => setLetter({ ...letter, body: e.target.value })} className={`${inputCls} leading-7`} />
            </div>
            <div>
              <label className={labelCls} htmlFor="lh-sign">التوقيع (الاسم)</label>
              <input id="lh-sign" value={letter.signature} onChange={(e) => setLetter({ ...letter, signature: e.target.value })} className={inputCls} />
            </div>
            <p className={`text-[11px] ${ts}`}>لا يُحفظ نص الخطاب على المنصة؛ اطبعه أو احفظه PDF من نافذة الطباعة.</p>
          </section>
        </div>

        <div className="min-w-0 space-y-2">
          <p className={`text-[12px] font-semibold ${ts}`}>معاينة (A4)</p>
          <div className={`overflow-x-auto rounded-2xl p-3 ${isDark ? "bg-zinc-800/60" : "bg-slate-100"}`}>
            {identity && (
              <LetterheadSheet identity={identity} style={{ width: "210mm", minHeight: "297mm", margin: "0 auto", padding: "14mm 16mm 12mm", boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}>
                <LetterBody letter={letter} />
              </LetterheadSheet>
            )}
          </div>
          {note && (
            <p className={`flex items-start gap-1.5 text-[11px] ${ts}`}>
              <Info size={13} className="mt-0.5 flex-shrink-0" /> {note}
            </p>
          )}
        </div>
      </div>

      {printRoot && identity && createPortal(
        <LetterheadSheet identity={identity}>
          <LetterBody letter={letter} />
        </LetterheadSheet>,
        printRoot,
      )}
    </div>
  );
}
