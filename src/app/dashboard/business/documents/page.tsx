"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, FolderOpen, UploadSimple, Trash, DownloadSimple } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { isSupabaseMode } from "@/lib/runtimeMode";
import {
  getDocuments,
  uploadDocumentFile,
  deleteDocument,
  getDocumentFileUrl,
  type Document,
} from "@/lib/services/documentService";
import {
  listOk,
  listFailed,
  listViewState,
  itemsOf,
  type ListRead,
} from "@/lib/services/listRead";

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
 *
 * ── THE READ, IN THREE STATES ────────────────────────────────────────────────
 *
 * The rule this page already stated in its own words — «Never fall through to
 * the empty state on a failure: «لا توجد وثائق» over a vault that could not be
 * read is the same screen as a genuinely empty one, and a company would
 * re-upload everything» — is now spelled with the shared helper, `ListRead` +
 * `listViewState()` (src/lib/services/listRead.ts), so this page and the nine
 * others in this sweep say it the same way.
 *
 * TWO PIECES OF STATE, NOT ONE, and that is deliberate. `read` is the LATEST
 * attempt's outcome; `lastGood` is the rows of the most recent SUCCESSFUL one.
 * Collapsing them into a single `ListRead` would empty the list whenever a
 * refresh failed — including the refresh that runs immediately after an upload
 * — so a company that had just watched a file save would be shown a vault with
 * nothing in it. The rows stay on screen, under a banner that says they are the
 * last list we managed to read rather than the current one.
 */
export default function BusinessDocumentsPage() {
  const { isDark } = useTheme();
  /** The latest attempt. null until the first one settles. */
  const [read, setRead] = useState<ListRead<Document> | null>(null);
  /** The rows of the last read that succeeded, kept across a failed refresh. */
  const [lastGood, setLastGood] = useState<Document[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /**
   * A failed upload/open/delete — NOT a failed load. They were one `err` string
   * before, which meant an unrelated «تعذّر فتح الوثيقة» also suppressed the
   * empty state (the old guard was `docs.length === 0 && !err`), so a company
   * with a genuinely empty vault that pressed a broken control saw neither the
   * empty state nor an explanation of the gap. Same split as
   * dashboard/client/documents/page.tsx, which separated the two for the same
   * reason.
   */
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getDocuments();
      // Only the unbound ones. A document already attached to an order belongs
      // to that order's file and is reachable from it; listing it here would
      // invite an admin-facing document to be re-attached somewhere else.
      const vault = all.filter((d) => !d.request_id);
      setRead(listOk(vault));
      setLastGood(vault);
    } catch (e) {
      // getDocuments() THROWS on failure (documentService.ts) — it does not
      // return []. That is what lets this branch exist at all.
      console.error("[business documents] load failed:", e);
      setRead(listFailed<Document>());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function upload(file: File) {
    setBusy(true);
    setActionError("");
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
      setActionError(message || "تعذّر رفع الوثيقة. تحقق من اتصالك وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function open(doc: Document) {
    setActionError("");
    try {
      const url = await getDocumentFileUrl(doc.storage_path ?? "");
      if (!url) { setActionError("تعذّر فتح الوثيقة."); return; }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setActionError("تعذّر فتح الوثيقة.");
    }
  }

  async function remove(doc: Document) {
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await deleteDocument(String(doc.id), doc.storage_path);
      setNotice("تم حذف الوثيقة من الخزنة.");
      await load();
    } catch {
      setActionError("تعذّر حذف الوثيقة.");
    } finally {
      setBusy(false);
    }
  }

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  const view = listViewState(loading, read);
  // On an unreadable read the rows shown are the last ones we managed to read,
  // and the banner above them says so. On a readable one they are the read.
  const rows = view === "unreadable" ? (lastGood ?? []) : itemsOf(read);

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
          {actionError && <p className="text-[12px] text-red-500">{actionError}</p>}

          {view === "unreadable" && (
            <div className={`${card} space-y-2 p-4`}>
              <p className="text-[12px] font-bold text-red-500">
                {/* The wording separates the two facts a company needs kept
                    apart: the vault could not be read, and — when rows are
                    still on screen below — they are not proof of what is in it
                    now. */}
                تعذّرت قراءة خزنة وثائق المنشأة.
                {rows.length > 0 && " ما يظهر أدناه هو آخر قائمة تم تحميلها بنجاح، وقد تكون قديمة."}
              </p>
              <button
                type="button"
                onClick={() => { void load(); }}
                disabled={busy}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition disabled:opacity-40 ${
                  isDark ? "border-white/[0.12] text-zinc-200 hover:bg-white/[0.06]" : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <ArrowClockwise size={13} weight="bold" />
                إعادة المحاولة
              </button>
            </div>
          )}

          {view === "loading" ? (
            <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>جارٍ التحميل…</p>
          ) : view === "empty" ? (
            <div className={`${card} p-5`}>
              <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                لا توجد وثائق محفوظة بعد.
              </p>
            </div>
          ) : rows.length > 0 ? (
            <ul className="space-y-2">
              {rows.map((d) => (
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
          ) : null
          /* view === "unreadable" with nothing to fall back on. The banner
             above has already said why the list is missing; «لا توجد وثائق»
             would be a claim about a vault we never managed to open. */}
        </>
      )}
    </div>
  );
}
