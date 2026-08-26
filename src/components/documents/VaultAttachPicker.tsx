"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen } from "@phosphor-icons/react";
import { isSupabaseMode } from "@/lib/runtimeMode";
import { getDocuments, type Document } from "@/lib/services/documentService";

/**
 * «أرفق من خزنة وثائقي» — owner item ٨, the half the client sees.
 *
 * The vault is simply the account's documents that are not bound to an order.
 * This lists them beside the file picker so a company attaches its commercial
 * register with one click instead of finding the PDF on someone's laptop for
 * the fourth time.
 *
 * Renders NOTHING when the vault is empty. An «أرفق من خزنتك» control over an
 * empty vault is an invitation to press a button that does nothing, and the
 * first-time client — who has no vault yet — is exactly who would press it.
 *
 * Already-attached documents are filtered out by the caller, so a document
 * cannot be attached to the same order twice.
 */
export function VaultAttachPicker({
  onAttach,
  attachedNames,
  disabled,
  isDark,
}: {
  /** Called with the vault document's id; the caller copies and attaches it. */
  onAttach: (documentId: string) => void | Promise<void>;
  /** Names already on this order — used to grey out what is already attached. */
  attachedNames: string[];
  disabled?: boolean;
  isDark: boolean;
}) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseMode) return;
    try {
      const all = await getDocuments();
      setDocs(all.filter((d) => !d.request_id));
    } catch {
      // Silent: the vault is a shortcut, and the ordinary file picker beside
      // it still works. An error banner here would suggest the form is broken
      // when nothing about it is.
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!isSupabaseMode || docs.length === 0) return null;

  return (
    <div className="space-y-2" dir="rtl">
      <button type="button" disabled={disabled} onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-bold disabled:opacity-40 ${
          isDark ? "border-white/10 text-zinc-300" : "border-zinc-200 text-zinc-600"}`}>
        <FolderOpen size={14} weight="bold" />
        أرفق من خزنة وثائقي ({docs.length})
      </button>

      {open && (
        <ul className="space-y-1.5">
          {docs.map((d) => {
            const already = attachedNames.includes(d.file_name);
            return (
              <li key={String(d.id)}>
                <button
                  type="button"
                  disabled={disabled || already}
                  onClick={() => onAttach(String(d.id))}
                  className={`w-full rounded-xl border px-3 py-2 text-right text-[12px] disabled:opacity-40 ${
                    isDark ? "border-white/[0.07] text-zinc-300 hover:border-white/[0.14]"
                      : "border-zinc-200 text-zinc-700 hover:border-zinc-300"}`}>
                  {already ? "✓ " : "📎 "}{d.file_name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
