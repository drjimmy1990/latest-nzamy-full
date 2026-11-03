"use client";

/**
 * LetterheadWorkspace — «هوية ومطبوعات المكتب»: the official letterhead of an
 * individual lawyer or a firm (owner decision ٢٥٦), shown as the «branding»
 * tab of the legal vault (/dashboard/{lawyer,firm}/vault?tab=branding — owner
 * note 09 §٤, package 2026-10-30, NOTE-09-C06). The old /letterhead pages
 * redirect there.
 *
 * Left: the identity (names, contacts, accent colour, own logo; the licence
 * read-only from the verified profile) and — through `extra` — the office's
 * own stationery files (BrandingAssetsPanel). Right: the A4 sheet as it will
 * print, with a toggle between a faded sample text (preview only) and the
 * blank sheet.
 *
 * NO LETTER EDITOR (owner note 09 §٢-ثانياً, NOTE-09-C03/C04): the «الخطاب»
 * section (date / to / subject / body / signature, never saved) is gone. This
 * page sets up the identity and prints the letterhead BLANK; letters are
 * written in the platform's document tools. Those tools do not adopt the
 * sheet yet (Letterhead.tsx lists the candidates) — that wiring lives in
 * src/app/ai/* and is recorded as open in the 2026-10-30 ledger.
 *
 * PRINT: «طباعة الورق فارغاً / حفظ PDF» opens the browser's print dialog; what
 * prints is a second, blank copy of the sheet portalled straight under <body>,
 * and the print CSS hides everything else. A firm's sheet prints only for a
 * caller holding the explicit `letterhead.print` permission (owner ٣١٥): the
 * server refuses the identity to anyone else, and the button is shown only
 * when the server says `permissions.print`.
 *
 * SAVING (CODE-F37): every identity input is disabled while a save is in
 * flight (identityInputsLocked), so the server's normalised reply can replace
 * the fields without wiping anything typed meanwhile.
 *
 * Before 20261026_63 runs the API answers `available: false`: the identity is
 * read-only with «يتطلب تحديث قاعدة البيانات», and the sheet still prints with
 * the profile's own name.
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Printer, FloppyDisk, CloudArrowUp, Trash, Warning, SpinnerGap, CheckCircle, Info, ArrowClockwise, LockSimple } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { LetterheadSheet } from "./Letterhead";
import { useLetterhead } from "./useLetterhead";
import { identityInputsLocked, type LetterheadSaveKind } from "./letterheadFormLock";
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
import { LETTERHEAD_PERMISSION_DENIED_AR, type LetterheadPermissions } from "@/lib/branding/firmLetterheadPermissions";

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

const TEXT_INPUTS: { key: BrandingTextField; ltr?: boolean; placeholder: string }[] = [
  { key: "display_name_ar", placeholder: "مكتب المحامي فهد الشمري للمحاماة والاستشارات القانونية" },
  { key: "display_name_en", ltr: true, placeholder: "Fahad Al-Shammari Law Office" },
  { key: "address", placeholder: "الرياض — حي العليا — طريق الملك فهد" },
  { key: "phone", ltr: true, placeholder: "+966 5x xxx xxxx" },
  { key: "email", ltr: true, placeholder: "office@example.sa" },
  { key: "website", ltr: true, placeholder: "https://example.sa" },
];

type PreviewMode = "sample" | "blank";

/** A faded placeholder text — on the SCREEN preview only, never printed. */
function SampleBody() {
  const faded = { color: "#C4C9D1" };
  return (
    <div style={faded} aria-label="نص نموذجي للمعاينة فقط">
      <div style={{ textAlign: "left", fontSize: "10pt", marginBottom: "6mm" }}>التاريخ: ..../..../........</div>
      <div style={{ fontWeight: 700, marginBottom: "2mm" }}>الجهة المرسل إليها</div>
      <div style={{ marginBottom: "5mm" }}><span style={{ fontWeight: 700 }}>الموضوع: </span>نص نموذجي للمعاينة فقط</div>
      <div style={{ textAlign: "justify", minHeight: "60mm" }}>
        السلام عليكم ورحمة الله وبركاته، وبعد: هذا نص نموذجي باهت يوضح موضع متن الخطاب على الورق المروّس، ولا يُطبع.
        يُكتب الخطاب أو المذكرة أو الرأي في أدوات المستندات بالمنصة.
      </div>
    </div>
  );
}

/** The printed body: empty room under the header (the footer is fixed to the page foot). */
function BlankBody() {
  return <div style={{ minHeight: "200mm" }} />;
}

export default function LetterheadWorkspace({ scope, embedded = false, extra }: { scope: BrandingScope; embedded?: boolean; extra?: ReactNode }) {
  const { isDark } = useTheme();
  const { state, reload, identityFor } = useLetterhead(scope);
  const [fields, setFields] = useState<BrandingFields>(EMPTY_BRANDING_FIELDS);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<{ kind: LetterheadSaveKind; message?: string }>({ kind: "idle" });
  const [logoState, setLogoState] = useState<{ kind: "idle" | "busy" | "error"; message?: string }>({ kind: "idle" });
  const [preview, setPreview] = useState<PreviewMode>("sample");
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status !== "ready") return;
    setFields(state.data.fields);
    setLogoUrl(state.data.logoUrl);
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
  // From the server (owner ٣١٥); a server without the field predates the
  // explicit permission and only ever answered a manager.
  const permissions: LetterheadPermissions = (state.status === "ready" && state.data.permissions) || { print: true, manage: true };
  const locked = identityInputsLocked({ available, canManage: permissions.manage, saveKind: saveState.kind });

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
      // Safe: the inputs were locked for the whole request (CODE-F37), so the
      // server's normalised copy is also the latest thing the user typed.
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
    if (locked) return;
    setFields((f) => ({ ...f, [key]: value }));
    setSaveState({ kind: "idle" });
  };
  const Heading = embedded ? "h2" : "h1";
  const toggleBtn = (mode: PreviewMode, label: string) => (
    <button
      type="button"
      onClick={() => setPreview(mode)}
      aria-pressed={preview === mode}
      className={`rounded-lg px-3 py-1 text-[11px] font-semibold transition-colors ${
        preview === mode
          ? "bg-[#0B3D2E] text-[#C8A762]"
          : isDark ? "text-zinc-400 hover:text-white" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className={`${embedded ? "" : "mx-auto max-w-7xl p-5 md:p-7"} space-y-5`} dir="rtl">
      <style href="nz-letterhead-print" precedence="default">{PRINT_CSS}</style>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading className={`${embedded ? "text-lg" : "text-xl"} font-bold ${tp}`}>الورق المروّس والهوية</Heading>
          <p className={`mt-1 text-[13px] ${ts}`}>
            {scope === "firm" ? "هوية المكتب على مطبوعاته الرسمية" : "هويتك المهنية على مطبوعاتك الرسمية"} — مع ختم منصة نظامي ورمزها الذكي في الذيل.
          </p>
        </div>
        {permissions.print ? (
          <button
            onClick={() => window.print()}
            disabled={!identity}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[13px] font-bold text-[#C8A762] shadow-sm transition-colors hover:bg-[#0a3328] disabled:opacity-50"
          >
            <Printer size={16} weight="bold" /> طباعة الورق فارغاً / حفظ PDF
          </button>
        ) : (
          <span className={`inline-flex items-center gap-1.5 text-[12px] ${ts}`}>
            <LockSimple size={14} /> {LETTERHEAD_PERMISSION_DENIED_AR["letterhead.print"]}
          </span>
        )}
      </div>

      {!data.available && (
        <div className={`flex items-start gap-2 rounded-xl border p-3 text-[12px] ${isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
          <Warning size={16} className="mt-0.5 flex-shrink-0" />
          <span>{data.message} يمكنك طباعة الورق بالاسم من ملفك، دون حفظ الهوية أو رفع شعار.</span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className={`${card} space-y-3 p-5`}>
            <h3 className={`text-[14px] font-bold ${tp}`}>هوية الورق</h3>
            {TEXT_INPUTS.map(({ key, ltr, placeholder }) => (
              <div key={key}>
                <label className={labelCls} htmlFor={`lh-${key}`}>{BRANDING_FIELD_LABEL_AR[key]}</label>
                <input
                  id={`lh-${key}`}
                  dir={ltr ? "ltr" : "rtl"}
                  value={fields[key]}
                  maxLength={BRANDING_TEXT_FIELDS[key]}
                  placeholder={placeholder}
                  disabled={locked}
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
                  disabled={locked}
                  onChange={(e) => setField("accent_color", e.target.value.toUpperCase())}
                  className="h-9 w-12 cursor-pointer rounded-lg border-0 disabled:cursor-not-allowed"
                />
                <span dir="ltr" className={`font-mono text-[12px] ${ts}`}>{fields.accent_color}</span>
                {fields.accent_color !== BRANDING_DEFAULT_ACCENT && (
                  <button onClick={() => setField("accent_color", BRANDING_DEFAULT_ACCENT)} disabled={locked} className={`text-[11px] underline disabled:opacity-50 ${ts}`}>
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
                  disabled={locked || logoState.kind === "busy"}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold disabled:opacity-50 ${isDark ? "border-white/[0.08] text-zinc-300" : "border-slate-200 text-slate-600"}`}
                >
                  {logoState.kind === "busy" ? <SpinnerGap size={14} className="animate-spin" /> : <CloudArrowUp size={14} />}
                  {logoUrl ? "استبدال الشعار" : "رفع شعار"}
                </button>
                {logoUrl && (
                  <button
                    onClick={() => void removeLogo()}
                    disabled={locked || logoState.kind === "busy"}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold text-red-500 disabled:opacity-50"
                  >
                    <Trash size={14} /> حذف
                  </button>
                )}
              </div>
              <p className={`mt-1 text-[11px] ${ts}`}>PNG أو JPEG أو WebP، حتى ١ ميجابايت. لا يُقبل SVG.</p>
              {logoState.kind === "error" && <p className="mt-1 text-[11px] text-red-500">{logoState.message}</p>}
            </div>

            {permissions.manage && (
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => void save()}
                  disabled={locked}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-[#C8A762] disabled:opacity-50"
                >
                  {saveState.kind === "saving" ? <SpinnerGap size={14} className="animate-spin" /> : <FloppyDisk size={14} />}
                  {saveState.kind === "saving" ? "جارٍ الحفظ…" : "حفظ الهوية"}
                </button>
                {saveState.kind === "saved" && <span className="inline-flex items-center gap-1 text-[12px] text-emerald-500"><CheckCircle size={14} weight="fill" /> حُفظت</span>}
                {saveState.kind === "error" && <span className="text-[12px] text-red-500">{saveState.message}</span>}
              </div>
            )}
            {scope === "firm" && (
              <p className={`text-[11px] ${ts}`}>يدير هوية المكتب ويطبع ورقه المروّس مالكه والشريك المدير ومدير المكتب فقط.</p>
            )}
          </section>

          {extra}

          <section className={`${card} space-y-2 p-5`}>
            <h3 className={`text-[14px] font-bold ${tp}`}>أين أكتب الخطاب؟</h3>
            <p className={`text-[12px] leading-6 ${ts}`}>
              هذه الصفحة لإعداد الهوية وطباعة الورق المروّس فارغاً فقط. تُكتب الخطابات والمذكرات والآراء في أدوات المستندات بالمنصة؛
              ولا تطبّق تلك الأدوات هذه الهوية تلقائياً بعد — اطبع الورق فارغاً هنا أو استعمل قالبك المرفوع إلى أن يُفعَّل الربط.
            </p>
          </section>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`text-[12px] font-semibold ${ts}`}>معاينة (A4)</p>
            <div className={`inline-flex items-center gap-1 rounded-xl p-1 ${isDark ? "bg-zinc-800/60" : "bg-slate-100"}`} role="group" aria-label="نوع المعاينة">
              {toggleBtn("sample", "بنص نموذجي باهت")}
              {toggleBtn("blank", "ورقة فارغة")}
            </div>
          </div>
          <div className={`overflow-x-auto rounded-2xl p-3 ${isDark ? "bg-zinc-800/60" : "bg-slate-100"}`}>
            {identity && (
              <LetterheadSheet identity={identity} style={{ width: "210mm", minHeight: "297mm", margin: "0 auto", padding: "14mm 16mm 12mm", boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}>
                {preview === "sample" ? <SampleBody /> : <BlankBody />}
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

      {printRoot && identity && permissions.print && createPortal(
        <LetterheadSheet identity={identity}>
          <BlankBody />
        </LetterheadSheet>,
        printRoot,
      )}
    </div>
  );
}
