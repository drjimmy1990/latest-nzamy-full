-- 20260706_draft_cart_payload.sql
-- law_draft_carts previously stored only (law_slug, article_number,
-- article_title), which is lossy for the rich client CartEntry (article text,
-- principles, precedents, exec-reg). Add a jsonb payload column so the draft
-- cart round-trips losslessly once persisted server-side (useDraftCart
-- dual-mode). Older rows have payload = null and are reconstructed minimally.
alter table public.law_draft_carts add column if not exists payload jsonb;
