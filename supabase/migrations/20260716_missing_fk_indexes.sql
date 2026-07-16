-- 20260716_missing_fk_indexes.sql
-- Add missing foreign key indexes to improve join performance.
-- Without these, Postgres must do full sequential scans on FK lookups.

-- articles.author_id → used for author profile joins
CREATE INDEX IF NOT EXISTS idx_articles_author_id
  ON public.articles (author_id);

-- support_tickets.user_id → used for user-scoped ticket lists
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id
  ON public.support_tickets (user_id);

-- support_tickets.assignee_id → used for admin assignment filtering
CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee_id
  ON public.support_tickets (assignee_id);
