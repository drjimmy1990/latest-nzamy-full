-- 20260701_smart_folder_items_display_cols.sql
-- Adds display metadata to library.smart_folder_items so a saved item can render
-- its title/category without a second lookup (the client LawRef model needs
-- {slug, title, titleEn, catId}). RLS already governs the table
-- (20260626_legal_library_schema.sql §6d). Additive + idempotent.
begin;

alter table library.smart_folder_items
  add column if not exists title      text,
  add column if not exists title_en   text,
  add column if not exists cat_id      varchar(30);

-- Prevent duplicate saves of the same entity into the same folder (also lets the
-- item-add endpoint upsert on this constraint).
create unique index if not exists uq_smart_folder_items_folder_entity
  on library.smart_folder_items (folder_id, entity_type, entity_id);

comment on column library.smart_folder_items.title    is 'Denormalized Arabic display title (rendered in the folder UI).';
comment on column library.smart_folder_items.title_en is 'Denormalized English display title.';
comment on column library.smart_folder_items.cat_id   is 'Denormalized taxonomy category id (e.g. SA-04).';

commit;
