import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/library/folders/items — add one item to a user-owned smart folder.
 *
 * Auth + ownership mirror the DELETE-item check in ../route.ts. RLS
 * ("Users can add to own folders", 20260626_legal_library_schema.sql) enforces
 * ownership as defense-in-depth; the explicit check returns a clean 403.
 * Idempotent: upserts on (folder_id, entity_type, entity_id).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { folderId, entityType, entityId, title, titleEn, catId } = body ?? {};

    if (!folderId || !entityType || !entityId) {
      return NextResponse.json(
        { error: 'folderId, entityType and entityId are required' },
        { status: 400 },
      );
    }

    // Ownership guard (mirrors the DELETE-item check in ../route.ts).
    const { data: ownerFolder, error: folderError } = await supabase
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

    const { data: item, error } = await supabase
      .schema('library')
      .from('smart_folder_items')
      .upsert(
        {
          folder_id: folderId,
          entity_type: entityType,
          entity_id: entityId,
          title: title ?? null,
          title_en: titleEn ?? null,
          cat_id: catId ?? null,
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
