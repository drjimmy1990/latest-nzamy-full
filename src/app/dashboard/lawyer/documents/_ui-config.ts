import type { ElementType } from "react";
import { FileDoc, FilePdf, FileText, Image } from "@phosphor-icons/react";
import type { DocType, TemplateCategory } from "./_taxonomy";

export const TYPE_ICON: Record<DocType, ElementType> = {
  pdf: FilePdf,
  docx: FileDoc,
  image: Image,
  other: FileText,
};

export const TYPE_COLOR: Record<DocType, string> = {
  pdf: "text-red-500 bg-red-500/10",
  docx: "text-blue-500 bg-blue-500/10",
  image: "text-emerald-500 bg-emerald-500/10",
  other: "text-slate-400 bg-slate-100",
};

export const TMPL_CAT_CONFIG_ICONS: Partial<Record<TemplateCategory, ElementType>> = {
  memo: FileText,
};
