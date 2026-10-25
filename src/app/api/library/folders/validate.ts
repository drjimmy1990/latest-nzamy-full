/**
 * Input rules for the «مجلداتي» routes (folders/route.ts, folders/items/route.ts).
 *
 * Those routes write through the service client (owner fix 2026-10-25), so the
 * database's RLS no longer stands between a request and the row: ownership is
 * checked in the route, and these limits are the only shape checks a write
 * gets. Migration 20261026_50 mirrors the length limits as CHECK constraints.
 * Pure functions, no imports, so they run under `node --test`.
 */

export const FOLDER_NAME_MAX = 80;
export const FOLDER_ICON_MAX = 8;
export const ENTITY_ID_MAX = 200;
export const ITEM_TITLE_MAX = 300;
/** smart_folder_items.cat_id is varchar(30). */
export const CAT_ID_MAX = 30;

export const DEFAULT_FOLDER_COLOR = '#C8A762';
export const DEFAULT_FOLDER_ICON = '📁';

/** The LawRef["type"] union in src/app/laws/components/SmartFolderTypes.ts. */
export const FOLDER_ENTITY_TYPES = ['law', 'order', 'precedent', 'book'] as const;
export type FolderEntityType = (typeof FOLDER_ENTITY_TYPES)[number];

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Length in characters (code points), so an emoji or an Arabic letter counts once. */
function charLength(s: string): number {
  return Array.from(s).length;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** A JSON object body, or null for invalid JSON / null / an array / a scalar. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function checkFolderName(value: unknown): Checked<string> {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) return { ok: false, error: 'اسم المجلد مطلوب' };
  if (charLength(name) > FOLDER_NAME_MAX) return { ok: false, error: `اسم المجلد أطول من ${FOLDER_NAME_MAX} حرفاً` };
  return { ok: true, value: name };
}

export function isFolderColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

export function isFolderIcon(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && charLength(value) <= FOLDER_ICON_MAX;
}

/** POST: a missing or malformed colour / icon falls back to the default. */
export function folderColorOrDefault(value: unknown): string {
  return isFolderColor(value) ? value : DEFAULT_FOLDER_COLOR;
}
export function folderIconOrDefault(value: unknown): string {
  return isFolderIcon(value) ? value : DEFAULT_FOLDER_ICON;
}

export interface FolderItemInput {
  folderId: string;
  entityType: FolderEntityType;
  entityId: string;
  title: string | null;
  titleEn: string | null;
  catId: string | null;
}

function optionalText(value: unknown, max: number, label: string): Checked<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: `${label} must be a string` };
  const text = value.trim();
  if (charLength(text) > max) return { ok: false, error: `${label} is longer than ${max} characters` };
  return { ok: true, value: text || null };
}

export function checkFolderItem(body: Record<string, unknown>): Checked<FolderItemInput> {
  const { folderId, entityType, entityId, title, titleEn, catId } = body;
  if (!isUuid(folderId)) return { ok: false, error: 'folderId must be a folder id' };
  if (typeof entityType !== 'string' || !(FOLDER_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    return { ok: false, error: `entityType must be one of ${FOLDER_ENTITY_TYPES.join(', ')}` };
  }
  const id = typeof entityId === 'string' ? entityId.trim() : '';
  if (!id) return { ok: false, error: 'entityId is required' };
  if (charLength(id) > ENTITY_ID_MAX) return { ok: false, error: `entityId is longer than ${ENTITY_ID_MAX} characters` };
  const t = optionalText(title, ITEM_TITLE_MAX, 'title');
  if (!t.ok) return t;
  const te = optionalText(titleEn, ITEM_TITLE_MAX, 'titleEn');
  if (!te.ok) return te;
  // cat_id is display-only: a malformed one is dropped, not an error.
  const cat = typeof catId === 'string' && catId.trim() && catId.trim().length <= CAT_ID_MAX ? catId.trim() : null;
  return {
    ok: true,
    value: { folderId, entityType: entityType as FolderEntityType, entityId: id, title: t.value, titleEn: te.value, catId: cat },
  };
}

/** PATCH body → the columns to update; an empty set or any malformed field is an error. */
export function checkFolderPatch(body: Record<string, unknown>): Checked<{ folderId: string; updates: Record<string, unknown> }> {
  const { folderId, name, color, icon, isPinned } = body;
  if (!isUuid(folderId)) return { ok: false, error: 'folderId must be a folder id' };
  const updates: Record<string, unknown> = {};
  if (name !== undefined) {
    const n = checkFolderName(name);
    if (!n.ok) return n;
    updates.name = n.value;
  }
  if (color !== undefined) {
    if (!isFolderColor(color)) return { ok: false, error: 'color must be #RRGGBB' };
    updates.color = color;
  }
  if (icon !== undefined) {
    if (!isFolderIcon(icon)) return { ok: false, error: `icon must be 1–${FOLDER_ICON_MAX} characters` };
    updates.icon = icon;
  }
  if (isPinned !== undefined) {
    if (typeof isPinned !== 'boolean') return { ok: false, error: 'قيمة التثبيت يجب أن تكون true أو false' };
    updates.is_pinned = isPinned;
  }
  if (Object.keys(updates).length === 0) return { ok: false, error: 'nothing to update' };
  return { ok: true, value: { folderId, updates } };
}
