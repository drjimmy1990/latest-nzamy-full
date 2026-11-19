import { checkLibraryAccess } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";
import { loadLibraryGuardSettings } from "@/lib/library/publicGuardServer";
import { guestShellCount, publicRulingCards, type PublicRulingCard } from "@/lib/library/publicRulingsShell";

/**
 * The free rulings of a collection in the server HTML (owner register 14
 * item 13 + pending #44): the items a GUEST reads in full — the API's own rule
 * (collectionFreeCount: public_full_rulings_per_collection, owner 2, at most
 * 3; an admin per-collection override wins) in the API's own order — and
 * nothing more. Rendered by the layout beside «عن هذه المجموعة», outside
 * LibraryGuard, only while the library is open (the layout's load is "ok").
 * Shown to every visitor (a closed <details>, like the shell above it), never
 * to crawlers alone. Any failure renders nothing.
 */
async function loadPublicRulingCards(collectionId: string): Promise<PublicRulingCard[]> {
  try {
    const [guard, probe] = await Promise.all([
      loadLibraryGuardSettings(),
      checkLibraryAccess(null, collectionId, 0, "principles", { includeExplicitFreeItem: false }),
    ]);
    const serverOnly = await createServiceClient();
    const head = await serverOnly
      .schema("library")
      .from("principles")
      .select("id", { count: "exact", head: true })
      .eq("collection_id", collectionId);
    if (head.error || typeof head.count !== "number") return [];
    const n = guestShellCount(probe, head.count, guard.rulings);
    if (n <= 0) return [];
    // The API's window order (precedents/[slug]/route.ts): order_index, then id.
    const { data, error } = await serverOnly
      .schema("library")
      .from("principles")
      .select("id, principle_number, issuing_body, session_date, text")
      .eq("collection_id", collectionId)
      .order("order_index", { ascending: true })
      .order("id", { ascending: true })
      .range(0, n - 1);
    if (error) {
      console.error(`[library-seo] public rulings read failed for "${collectionId}":`, error.code ?? "no-code", error.message);
      return [];
    }
    return publicRulingCards(data ?? [], n);
  } catch (err) {
    console.error(`[library-seo] public rulings failed for "${collectionId}":`, err instanceof Error ? err.message : err);
    return [];
  }
}

export default async function PublicRulings({ collectionId }: { collectionId: string }) {
  const cards = await loadPublicRulingCards(collectionId);
  if (cards.length === 0) return null;
  return (
    <section dir="rtl" aria-label="أحكام متاحة للجميع" className="mx-auto w-full max-w-5xl px-4 pb-10" data-testid="public-rulings">
      <details className="rounded-xl border border-zinc-300/60 dark:border-white/10 px-4 py-3">
        <summary className="cursor-pointer select-none text-sm font-bold text-zinc-700 dark:text-zinc-300">
          أحكام متاحة للجميع في هذه المجموعة ({cards.length.toLocaleString("ar-SA")})
        </summary>
        <div className="mt-3 space-y-5 text-sm leading-7 text-zinc-700 dark:text-zinc-300">
          {cards.map((c) => (
            <article key={c.id}>
              <h2 className="mb-1 font-bold text-zinc-900 dark:text-white">{c.heading}</h2>
              <p className="whitespace-pre-line">{c.text}</p>
            </article>
          ))}
          <p className="text-zinc-600 dark:text-zinc-400">بقية الأحكام والمبادئ في هذه المجموعة لمشتركي المكتبة القانونية.</p>
        </div>
      </details>
    </section>
  );
}
