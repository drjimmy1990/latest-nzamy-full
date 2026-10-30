/**
 * libraryDocumentSeo — the server read behind a library document's <head>,
 * JSON-LD and SSR shell (owner note ١٤, phase 1). Server-only.
 * ─────────────────────────────────────────────────────────────────────────────
 * One read per request (React cache(): generateMetadata and the layout body
 * share it), with the SERVICE ROLE and named columns: summary_brief,
 * latest_update and issue_date_hijri are column-locked for anon (20261004_01,
 * 20261025_20, T28-22). Nothing the read returns leaves this module raw — it
 * is shaped by libraryMetadata.ts as a guest sees the document, whoever asked
 * (no cookie client here, so no tier can reach a shared HTML or cache).
 *
 * Never throws. The library switch (platform_settings.library_status) is read
 * first: while it is closed nothing about a document is read or rendered.
 */

import { cache } from "react";
import type { Metadata } from "next";
import { buildLibraryFallbackMetadata, buildLibraryMetadata } from "@/lib/seo";
import { createServiceClient } from "@/lib/supabase/server";
import { getLibraryStatus } from "@/lib/access-control";
import {
  decodeRouteSlug,
  lawDateModified,
  ORDER_TYPE_LABEL,
  publicDescription,
  publicDocumentTitle,
  type LibraryDocKind,
  type LibraryDocSeo,
} from "./libraryMetadata.ts";

export type LibraryDocLoad =
  | { status: "ok"; doc: LibraryDocSeo; shell?: LibraryDocShell }
  | { status: "closed" | "not_found" | "error" };

/** What the visible «عن هذا الكتاب» block may show (books only, for now). */
export interface LibraryDocShell {
  author: string;
  /** Top-level chapter titles, in book order (at most SHELL_TOC_LIMIT). */
  toc: string[];
  tocTruncated: boolean;
}

export const SHELL_TOC_LIMIT = 60;

/** decrees_circulars.id is a uuid: anything else is "no such decree", not a 22P02 error. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isClosed = cache(async (): Promise<boolean> => (await getLibraryStatus()).closed);

const str = (v: unknown): string => (typeof v === "string" ? v : "");

async function readLaw(slug: string): Promise<LibraryDocLoad> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .schema("library")
    .from("laws")
    .select("slug, title, type, summary_brief, latest_update, issue_date_hijri")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.error(`[library-seo] law read failed for "${slug}":`, error.code ?? "no-code", error.message);
    return { status: "error" };
  }
  if (!data) return { status: "not_found" };
  const type = str(data.type);
  return {
    status: "ok",
    doc: {
      kind: "law",
      id: str(data.slug) || slug,
      name: publicDocumentTitle("law", { title: str(data.title), type }),
      description: publicDescription("law", str(data.summary_brief)),
      dateModified: lawDateModified(data),
      legislationType: type || null,
    },
  };
}

async function readOrder(id: string): Promise<LibraryDocLoad> {
  if (!UUID.test(id)) return { status: "not_found" };
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .schema("library")
    .from("decrees_circulars")
    .select("id, title, type, summary_brief, summary")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(`[library-seo] decree read failed for "${id}":`, error.code ?? "no-code", error.message);
    return { status: "error" };
  }
  if (!data) return { status: "not_found" };
  const summary = str(data.summary_brief) || str(data.summary);
  return {
    status: "ok",
    doc: {
      kind: "order",
      id: str(data.id) || id,
      name: publicDocumentTitle("order", { title: str(data.title), type: str(data.type), summary }),
      description: publicDescription("order", str(data.summary_brief), str(data.summary)),
      // A decree's own date is its issue date — a subscriber's (٣١٨). No
      // visitor-visible legislative-event date exists for decrees yet.
      dateModified: null,
      legislationType: ORDER_TYPE_LABEL[str(data.type)] ?? null,
    },
  };
}

async function readCollection(id: string): Promise<LibraryDocLoad> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .schema("library")
    .from("judicial_collections")
    .select("id, title, court, description, ruling_count")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(`[library-seo] collection read failed for "${id}":`, error.code ?? "no-code", error.message);
    return { status: "error" };
  }
  if (!data) return { status: "not_found" };
  const title = str(data.title);
  const court = str(data.court);
  return {
    status: "ok",
    doc: {
      kind: "collection",
      id: str(data.id) || id,
      name: publicDocumentTitle("collection", { title }),
      description: publicDescription("collection", str(data.description), court ? `${title} — ${court}` : ""),
      dateModified: null,
      collectionSize: typeof data.ruling_count === "number" ? data.ruling_count : null,
    },
  };
}

async function readBook(id: string): Promise<LibraryDocLoad> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .schema("library")
    .from("feqh_books")
    .select("id, title, author, description")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(`[library-seo] book read failed for "${id}":`, error.code ?? "no-code", error.message);
    return { status: "error" };
  }
  if (!data) return { status: "not_found" };
  const title = str(data.title);
  const author = str(data.author);
  // The TOC is supplementary: a failed read is no TOC, never a failed page.
  const { data: chapters, error: tocError } = await supabase
    .schema("library")
    .from("feqh_chapters")
    .select("title")
    .eq("book_id", id)
    .order("order_index", { ascending: true })
    .order("id", { ascending: true })
    .limit(SHELL_TOC_LIMIT + 1);
  if (tocError) console.warn(`[library-seo] book TOC read failed for "${id}":`, tocError.message);
  const titles = (chapters ?? []).map((c: { title?: unknown }) => str(c.title).trim()).filter(Boolean);
  return {
    status: "ok",
    doc: {
      kind: "book",
      id: str(data.id) || id,
      name: publicDocumentTitle("book", { title }),
      description: publicDescription("book", str(data.description), author ? `${title} — ${author}` : ""),
      dateModified: null,
      author: author || null,
    },
    shell: { author, toc: titles.slice(0, SHELL_TOC_LIMIT), tocTruncated: titles.length > SHELL_TOC_LIMIT },
  };
}

const READERS: Record<LibraryDocKind, (id: string) => Promise<LibraryDocLoad>> = {
  law: readLaw,
  order: readOrder,
  collection: readCollection,
  book: readBook,
};

/**
 * The document behind a reader route, as a guest may see it. `rawSlug` is the
 * route param; it is decoded once here (the database stores ids decoded).
 */
export const loadLibraryDocSeo = cache(async (kind: LibraryDocKind, rawSlug: string): Promise<LibraryDocLoad> => {
  try {
    if (await isClosed()) return { status: "closed" };
    const id = decodeRouteSlug(rawSlug).trim();
    if (!id) return { status: "not_found" };
    return await READERS[kind](id);
  } catch (err) {
    console.error(`[library-seo] ${kind} read threw:`, err);
    return { status: "error" };
  }
});

/**
 * generateMetadata for a reader route: the document's own <head> when it
 * reads; noindex with no database value when the library is closed or the
 * document does not exist; the section's generic, indexable <head> when the
 * read failed (a passing outage must not de-index a real page).
 */
export async function libraryDocMetadata(kind: LibraryDocKind, rawSlug: string): Promise<Metadata> {
  const load = await loadLibraryDocSeo(kind, rawSlug);
  if (load.status === "ok") {
    return buildLibraryMetadata({ kind, id: load.doc.id, name: load.doc.name, description: load.doc.description });
  }
  return buildLibraryFallbackMetadata(kind, { noIndex: load.status !== "error" });
}
