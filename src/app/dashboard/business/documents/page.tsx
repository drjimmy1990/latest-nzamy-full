"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, UploadSimple, Trash, DownloadSimple } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { isSupabaseMode } from "@/lib/runtimeMode";
import {
  getDocuments,
  uploadDocumentFile,
  deleteDocument,
  getDocumentFileUrl,
  type Document,
} from "@/lib/services/documentService";

/**
 * خزنة وثائق المنشأة — owner item ٨.
 *
 * «عند قيام الشركة بتقديم أي طلب خدمة مستقبلي، تتاح الوثائق للإرفاق الفوري
 * بنقرة واحدة دون إعادة رفعها من الجهاز.» A company uploads its commercial
 * register, its articles and its signatory list once; every later request
 * attaches them from here.
 *
 * The vault is the set of the account's documents that are NOT bound to an
 * order (`attachments.request_id is null`). That is not a new concept invented
 * for this page — it is the state every upload already passes through, and the
 * state POST /api/v1/service-requests requires before it will bind one. So the
 * vault needs no table, no migration and no second permission model; it is a
 * view over rows the platform was already creating.
 *
 * Attaching from here COPIES (POST /api/v1/documents/[id]/copy) rather than
 * binding the original, because binding is a move — see that route for why
 * this distinction is the difference between a vault and a one-shot inbox.
 */
export default function BusinessDocumentsPage() {
  const { isDark } = useTheme();
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const all = await getDocuments();
      // Only the unbound ones. A document already attached to an order belongs
      // to that order's file and is reachable from it; listing it here would
      // invite an admin-facing document to be re-attached somewhere else.
      setDocs(all.filter((d) => !d.request_id));
    } catch {
      // Never fall through to the empty state on a failure: «لا توجد وثائق»
      // over a vault that could not be read is the same screen as a genuinely
      // empty one, and a company would re-upload everything.
      setErr("تعذّر تحميل وثائق المنشأة. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function upload(file: File) {
    setBusy(true);
    setErr("");
    setNotice("");
    try {
      await uploadDocumentFile(file);
      setNotice(`تم حفظ «${file.name}» في خزنة المنشأة.`);
      await load();
    } catch (e) {
      // uploadDocumentFile's own errors carry Arabic in `.message` (see
      // UploadTimeoutError); anything else falls back rather than showing the
      // client a raw cause.
      const message = e instanceof Error && /[؀-ۿ]/.test(e.message) ? e.message : "";
      setErr(message || "تعذّر رفع الوثيقة. تحقق من اتصالك وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function open(doc: Document) {
    setErr("");
    try {
      const url = await getDocumentFileUrl(doc.storage_path ?? "");
      if (!url) { setErr("تعذّر فتح الوثيقة."); return; }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setErr("تعذّر فتح الوثيقة.");
    }
  }

  async function remove(doc: Document) {
    setBusy(true);
    setErr("");
    setNotice("");
    try {
      await deleteDocument(String(doc.id), doc.storage_path);
      setNotice("تم حذف الوثيقة من الخزنة.");
      await load();
    } catch {
      setErr("تعذّر حذف الوثيقة.");
    } finally {
      setBusy(false);
    }
  }

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <div className="p-5 md:p-7 max-w-3xl mx-auto space-y-4" dir="rtl">
      <div className="space-y-1">
        <h1 className={`flex items-center gap-2 text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
          <FolderOpen size={20} weight="bold" /> خزنة وثائق المنشأة
        </h1>
        <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          ارفع السجل التجاري وعقد التأسيس وقائمة المفوّضين مرة واحدة — وأرفقها
          مع أي طلب لاحق بنقرة، دون رفعها من جهازك مرة أخرى.
        </p>
      </div>

      {!isSupabaseMode ? (
        <div className={`${card} p-5`}>
          <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
            خزنة الوثائق تتطلب الاتصال بقاعدة البيانات.
          </p>
        </div>
      ) : (
        <>
          <label className={`${card} flex cursor-pointer items-center justify-center gap-2 p-5 text-[12px] font-bold ${
            busy ? "opacity-40 pointer-events-none" : ""} ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
            <UploadSimple size={16} weight="bold" />
            {busy ? "جارٍ الرفع…" : "رفع وثيقة جديدة"}
            <input type="file" className="hidden" disabled={busy}
              onChange={(e) => {
                // Read the file out of the live FileList BEFORE resetting the
                // input. Resetting first empties the list and the upload
                // silently receives nothing — the bug that made four other
                // pickers on this platform look like they worked.
                const picked = e.target.files?.[0] ?? null;
                e.target.value = "";
                if (picked) upload(picked);
              }} />
          </label>

          {notice && <p className="text-[12px] text-emerald-600">{notice}</p>}
          {err && <p className="text-[12px] text-red-500">{err}</p>}

          {loading ? (
            <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>جارٍ التحميل…</p>
          ) : docs.length === 0 && !err ? (
            <div className={`${card} p-5`}>
              <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                لا توجد وثائق محفوظة بعد.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {docs.map((d) => (
                <li key={String(d.id)} className={`${card} flex items-center gap-3 p-4`}>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
                      {d.file_name}
                    </p>
                    <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                      {d.created_at ? new Date(d.created_at).toLocaleDateString("ar-SA") : ""}
                      {typeof d.size_bytes === "number" ? ` · ${Math.max(1, Math.round(d.size_bytes / 1024))} ك.ب` : ""}
                    </p>
                  </div>
                  <button onClick={() => open(d)} disabled={busy}
                    className="shrink-0 rounded-xl border border-emerald-500/30 px-3 py-1.5 text-[11px] font-bold text-emerald-500 disabled:opacity-40">
                    <DownloadSimple size={13} weight="bold" className="inline" /> فتح
                  </button>
                  <button onClick={() => remove(d)} disabled={busy}
                    className="shrink-0 rounded-xl border border-red-500/30 px-3 py-1.5 text-[11px] font-bold text-red-500 disabled:opacity-40">
                    <Trash size={13} weight="bold" className="inline" /> حذف
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
