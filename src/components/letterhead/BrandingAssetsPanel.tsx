"use client";

/**
 * BrandingAssetsPanel — «مطبوعات المكتب الجاهزة» inside the vault's branding
 * tab (owner note 09 §٢-أ, NOTE-09-C01, LIVE-F08): upload, replace, download
 * and delete the office's Word letterhead template, full-page PDF letterhead,
 * stamp and signature. Backed by /api/v1/branding/assets (20261030_10).
 *
 * Honest about its reach: the files are STORED here and downloaded from here.
 * The platform does not yet merge a document into the Word template, print
 * over the PDF, or place the stamp and signature on any output — the note
 * under the list says so. Before 20261030_10 runs the server answers
 * `available: false` and the panel says «يتطلب تحديث قاعدة البيانات» with
 * every button disabled; nothing is pretended.
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { CloudArrowUp, DownloadSimple, Trash, SpinnerGap, Warning, FileDoc, FilePdf, Stamp, Signature } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { BRANDING_ASSET_KINDS, BRANDING_ASSET_SPEC, type BrandingAssetKind } from "@/lib/branding/brandingAssets";
import type { BrandingScope } from "@/lib/branding/brandingVault";
import type { LetterheadPermissions } from "@/lib/branding/firmLetterheadPermissions";

interface AssetView {
  kind: BrandingAssetKind;
  name: string;
  size: number;
  uploadedAt: string;
  downloadUrl: string | null;
}

type PanelState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; available: boolean; message?: string; assets: AssetView[]; permissions: LetterheadPermissions };

const ICON: Record<BrandingAssetKind, typeof FileDoc> = {
  letterhead_docx: FileDoc,
  letterhead_pdf: FilePdf,
  stamp: Stamp,
  signature: Signature,
};

function sizeAr(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
  return `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`;
}

export default function BrandingAssetsPanel({ scope }: { scope: BrandingScope }) {
  const { isDark } = useTheme();
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const [busy, setBusy] = useState<BrandingAssetKind | null>(null);
  const [errors, setErrors] = useState<Partial<Record<BrandingAssetKind, string>>>({});
  const inputs = useRef<Partial<Record<BrandingAssetKind, HTMLInputElement | null>>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/branding/assets?scope=${scope}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ status: "error", message: (body as { error?: string }).error ?? "تعذّر تحميل مطبوعات المكتب" });
        return;
      }
      const b = body as { available: boolean; message?: string; assets: AssetView[]; permissions?: LetterheadPermissions };
      setState({ status: "ready", available: b.available, message: b.message, assets: b.assets ?? [], permissions: b.permissions ?? { print: true, manage: true } });
    } catch {
      setState({ status: "error", message: "تعذّر الاتصال بالخادم" });
    }
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60" : "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const tp = isDark ? "text-white" : "text-slate-800";
  const ts = isDark ? "text-zinc-400" : "text-slate-500";
  const row = isDark ? "border-white/[0.06]" : "border-slate-200";

  const upload = async (kind: BrandingAssetKind, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const spec = BRANDING_ASSET_SPEC[kind];
    if (file.size > spec.maxBytes) {
      setErrors((x) => ({ ...x, [kind]: `حجم الملف يتجاوز ${spec.maxLabel}` }));
      return;
    }
    setBusy(kind);
    setErrors((x) => ({ ...x, [kind]: undefined }));
    try {
      const form = new FormData();
      form.append("kind", kind);
      form.append("file", file);
      const res = await fetch(`/api/v1/branding/assets?scope=${scope}`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fallback = res.status === 413 ? `حجم الملف يتجاوز ${spec.maxLabel}` : "تعذّر رفع الملف";
        setErrors((x) => ({ ...x, [kind]: (body as { error?: string }).error ?? fallback }));
        return;
      }
      setState((s) => (s.status === "ready" ? { ...s, assets: (body as { assets: AssetView[] }).assets ?? s.assets } : s));
    } catch {
      setErrors((x) => ({ ...x, [kind]: "تعذّر الاتصال بالخادم" }));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (kind: BrandingAssetKind) => {
    setBusy(kind);
    setErrors((x) => ({ ...x, [kind]: undefined }));
    try {
      const res = await fetch(`/api/v1/branding/assets?scope=${scope}&kind=${kind}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors((x) => ({ ...x, [kind]: (body as { error?: string }).error ?? "تعذّر حذف الملف" }));
        return;
      }
      setState((s) => (s.status === "ready" ? { ...s, assets: (body as { assets: AssetView[] }).assets ?? [] } : s));
    } catch {
      setErrors((x) => ({ ...x, [kind]: "تعذّر الاتصال بالخادم" }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={`${card} space-y-3 p-5`}>
      <div>
        <h3 className={`text-[14px] font-bold ${tp}`}>مطبوعات {scope === "firm" ? "المكتب" : "مكتبك"} الجاهزة</h3>
        <p className={`mt-1 text-[12px] ${ts}`}>ارفع ورقك المروّس الجاهز وختمك وتوقيعك لتُحفظ في الخزنة وتنزّلها متى شئت.</p>
      </div>

      {state.status === "loading" && (
        <p className={`flex items-center gap-2 text-[12px] ${ts}`}><SpinnerGap size={14} className="animate-spin" /> جارٍ التحميل…</p>
      )}
      {state.status === "error" && (
        <div className="flex items-start gap-2 text-[12px] text-red-500">
          <Warning size={14} className="mt-0.5 flex-shrink-0" /> {state.message}
          <button onClick={() => void load()} className={`underline ${ts}`}>إعادة المحاولة</button>
        </div>
      )}
      {state.status === "ready" && !state.available && (
        <div className={`flex items-start gap-2 rounded-xl border p-3 text-[12px] ${isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
          <Warning size={16} className="mt-0.5 flex-shrink-0" />
          <span>{state.message ?? "رفع مطبوعات المكتب غير مفعّل بعد على هذا الخادم."}</span>
        </div>
      )}

      {state.status === "ready" && (
        <ul className="space-y-2">
          {BRANDING_ASSET_KINDS.map((kind) => {
            const spec = BRANDING_ASSET_SPEC[kind];
            const asset = state.assets.find((a) => a.kind === kind) ?? null;
            const Icon = ICON[kind];
            const disabled = !state.available || !state.permissions.manage || busy !== null;
            return (
              <li key={kind} className={`rounded-xl border p-3 ${row}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <Icon size={18} weight="duotone" className="mt-0.5 flex-shrink-0 text-[#C8A762]" />
                    <div className="min-w-0">
                      <p className={`text-[12px] font-semibold ${tp}`}>{spec.label}</p>
                      {asset ? (
                        <p className={`truncate text-[11px] ${ts}`} dir="auto">{asset.name} — {sizeAr(asset.size)}</p>
                      ) : (
                        <p className={`text-[11px] ${ts}`}>{spec.hint} حتى {spec.maxLabel}.</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={(el) => { inputs.current[kind] = el; }}
                      type="file"
                      accept={spec.accept}
                      className="hidden"
                      onChange={(e) => void upload(kind, e)}
                    />
                    {asset?.downloadUrl && (
                      <a
                        href={asset.downloadUrl}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${isDark ? "border-white/[0.08] text-zinc-300" : "border-slate-200 text-slate-600"}`}
                      >
                        <DownloadSimple size={13} /> تنزيل
                      </a>
                    )}
                    {state.permissions.manage && (
                      <button
                        onClick={() => inputs.current[kind]?.click()}
                        disabled={disabled}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50 ${isDark ? "border-white/[0.08] text-zinc-300" : "border-slate-200 text-slate-600"}`}
                      >
                        {busy === kind ? <SpinnerGap size={13} className="animate-spin" /> : <CloudArrowUp size={13} />}
                        {asset ? "استبدال" : "رفع"}
                      </button>
                    )}
                    {asset && state.permissions.manage && (
                      <button
                        onClick={() => void remove(kind)}
                        disabled={disabled}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-red-500 disabled:opacity-50"
                        aria-label={`حذف ${spec.label}`}
                      >
                        <Trash size={13} />
                      </button>
                    )}
                  </div>
                </div>
                {errors[kind] && <p className="mt-1 text-[11px] text-red-500">{errors[kind]}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <p className={`text-[11px] leading-5 ${ts}`}>
        تُحفظ الملفات في خزنتك الخاصة ولا يراها غيرك{scope === "firm" ? " ومن يدير هوية المكتب" : ""}. لا تدمج المنصة بعدُ نصوص الخطابات
        في قالب Word المرفوع ولا تطبع فوق ملف PDF، ولا تضع الختم والتوقيع على المخرجات تلقائياً.
      </p>
    </section>
  );
}
