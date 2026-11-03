"use client";

/**
 * SaveToFolderButton — owner note ٠٤ (last bullet): «حفظ في مجلد» on a /laws
 * result card. A real <button> (never inside a <Link>): it stops the click so
 * the card does not also open its document.
 */

import { BookmarkSimple } from "@phosphor-icons/react";
import type { SaveToFolderDoc } from "../saveToFolder";

export function SaveToFolderButton({
  doc,
  onSave,
  isDark,
  className = "",
}: {
  doc: SaveToFolderDoc | null;
  onSave?: (doc: SaveToFolderDoc) => void;
  isDark: boolean;
  className?: string;
}) {
  if (!doc || !onSave) return null;
  return (
    <button
      type="button"
      data-testid="save-to-folder"
      aria-label="حفظ في مجلد"
      title="حفظ في مجلد"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSave(doc);
      }}
      className={`p-1.5 rounded-lg border transition-colors pointer-events-auto ${
        isDark
          ? "border-[#2d3748] bg-[#161b22] text-gray-400 hover:text-[#C8A762] hover:border-[#C8A762]/50"
          : "border-gray-200 bg-white text-gray-500 hover:text-[#0B3D2E] hover:border-[#0B3D2E]/40"
      } ${className}`}
    >
      <BookmarkSimple size={15} />
    </button>
  );
}
