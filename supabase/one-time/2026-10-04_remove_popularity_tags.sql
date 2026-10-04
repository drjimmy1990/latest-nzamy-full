-- ════════════════════════════════════════════════════════════════════════════
-- One-time data fix — 2026-10-04 — badges stored in the pricing catalog.
--
-- /api/client-pricing shows `admin_pricing_catalog.metadata.tag` ahead of the
-- code's own labels, so the code sweep of 2026-10-04 (owner Q164: no
-- popularity claim without data) cannot remove a tag stored here. Measured
-- read-only on 2026-10-04:
--   contract-draft  «الأكثر طلبا»   — a popularity claim with no data behind it
--   ai-case-eval    «جديد»          — a static «new» badge (owner Q9: removed)
-- «الأسرع» / «الأشمل» / «موصى به» are descriptive and stay.
--
-- Only the `tag` key is removed; nothing else in the row changes. The admin
-- pricing screen can set a tag again at any time.
-- Run in the Supabase SQL Editor, block by block.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) PREVIEW — expect 2 rows on 2026-10-04 (contract-draft, ai-case-eval).
select service_id, metadata->>'tag' as tag
from public.admin_pricing_catalog
where metadata->>'tag' in ('الأكثر طلبا', 'الأكثر طلباً', 'الأكثر طلبًا', 'جديد', 'شائع');

-- 2) REMOVE THE TAG
begin;
update public.admin_pricing_catalog
set metadata = metadata - 'tag'
where metadata->>'tag' in ('الأكثر طلبا', 'الأكثر طلباً', 'الأكثر طلبًا', 'جديد', 'شائع');
commit;

-- 3) VERIFY — expect 0 rows.
select service_id, metadata->>'tag' as tag
from public.admin_pricing_catalog
where metadata->>'tag' in ('الأكثر طلبا', 'الأكثر طلباً', 'الأكثر طلبًا', 'جديد', 'شائع');
