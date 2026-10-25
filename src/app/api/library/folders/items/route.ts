import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";
import { checkFolderItem, readJsonObject } from '../validate';

/**
 * POST /api/library/folders/items — add one item to a user-owned smart folder.
 *
 * Authenticates via the request cookie client (`supabase.auth.getUser()`),
 * verifies folder ownership (`smart_folders.user_id = user.id`), and writes via
 * `createServiceClient()` so saves succeed even when `authenticated` lacks
 * table-level INSERT/UPDATE grants on `library.smart_folder_items`.
 * Idempotent: upserts on (folder_id, entity_type, entity_id).
 * Body rules (../validate): folderId a UUID, entityType law|order|precedent|book,
 * entityId 1–200 chars, title / titleEn ≤ 300, catId ≤ 30 (else dropped).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // D6 (owner ٢٩٨): a frozen account (a pending deletion) changes nothing.
    const frozen = frozenAccountResponse(user);
    if (frozen) return frozen;

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const checked = checkFolderItem(body);
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }
    const { folderId, entityType, entityId, title, titleEn, catId } = checked.value;

    const serverOnly = await createServiceClient();

    // Ownership guard (mirrors the DELETE-item check in ../route.ts).
    const { data: ownerFolder, error: folderError } = await serverOnly
      .schema('library')
      .from('smart_folders')
      .select('id')
      .eq('id', folderId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (folderError) {
      console.error('[Folder Items POST] Ownership check error:', folderError);
      return NextResponse.json({ error: 'Failed to add item' }, { status: 500 });
    }
    if (!ownerFolder) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: item, error } = await serverOnly
      .schema('library')
      .from('smart_folder_items')
      .upsert(
        {
          folder_id: folderId,
          entity_type: entityType,
          entity_id: entityId,
          title,
          title_en: titleEn,
          cat_id: catId,
        },
        { onConflict: 'folder_id,entity_type,entity_id' },
      )
      .select()
      .single();

    if (error) {
      console.error('[Folder Items POST] Error:', error);
      return NextResponse.json({ error: 'Failed to add item' }, { status: 500 });
    }

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error('[Folder Items POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
