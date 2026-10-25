import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";
import {
  checkFolderName,
  checkFolderPatch,
  folderColorOrDefault,
  folderIconOrDefault,
  isUuid,
  readJsonObject,
} from './validate';

/**
 * GET /api/library/folders — List user's smart folders
 * POST /api/library/folders — Create a new smart folder
 * PATCH /api/library/folders — Update a user-owned smart folder
 * DELETE /api/library/folders — Delete a user-owned smart folder or folder item
 *
 * Authentication runs on the request cookie client (`supabase.auth.getUser()`).
 * Database reads/writes run through `createServiceClient()` with explicit
 * `user_id = user.id` ownership filters on every query because live
 * `library` table-level grants only gave `authenticated` SELECT (no INSERT,
 * UPDATE, or DELETE), which broke «حفظ في مجلداتي» with 42501.
 * Because RLS no longer guards these writes, every body field is checked in
 * ./validate (name 1–80, colour #RRGGBB, icon ≤ 8, ids are UUIDs).
 */

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serverOnly = await createServiceClient();

    const { data: folders, error } = await serverOnly
      .schema('library')
      .from('smart_folders')
      .select(`
        *,
        smart_folder_items ( id, entity_type, entity_id, title, title_en, cat_id, created_at )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Folders GET] Error:', error);
      return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 });
    }

    return NextResponse.json({ folders: folders || [] });
  } catch (error) {
    console.error('[Folders GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
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
    const name = checkFolderName(body.name);
    if (!name.ok) {
      return NextResponse.json({ error: name.error }, { status: 400 });
    }

    const serverOnly = await createServiceClient();

    const { data: folder, error } = await serverOnly
      .schema('library')
      .from('smart_folders')
      .insert({
        user_id: user.id,
        name: name.value,
        color: folderColorOrDefault(body.color),
        icon: folderIconOrDefault(body.icon),
      })
      .select()
      .single();

    if (error) {
      console.error('[Folders POST] Error:', error);
      return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
    }

    return NextResponse.json({ folder }, { status: 201 });
  } catch (error) {
    console.error('[Folders POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
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
    const patch = checkFolderPatch(body);
    if (!patch.ok) {
      return NextResponse.json({ error: patch.error }, { status: 400 });
    }
    const { folderId, updates } = patch.value;

    const serverOnly = await createServiceClient();

    const { data: folder, error } = await serverOnly
      .schema('library')
      .from('smart_folders')
      .update(updates)
      .eq('id', folderId)
      .eq('user_id', user.id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[Folders PATCH] Error:', error);
      return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 });
    }
    if (!folder) {
      // Not this user's folder (or gone) — same answer either way.
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    return NextResponse.json({ folder });
  } catch (error) {
    console.error('[Folders PATCH] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // D6 (owner ٢٩٨): a frozen account (a pending deletion) changes nothing.
    const frozen = frozenAccountResponse(user);
    if (frozen) return frozen;

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');
    const itemId = searchParams.get('itemId');
    if ((itemId !== null && !isUuid(itemId)) || (itemId === null && folderId !== null && !isUuid(folderId))) {
      return NextResponse.json({ error: 'folderId / itemId must be an id' }, { status: 400 });
    }

    const serverOnly = await createServiceClient();

    if (itemId) {
      // IDOR guard: verify the item belongs to a smart_folder owned by this user
      const { data: item, error: lookupError } = await serverOnly
        .schema('library')
        .from('smart_folder_items')
        .select('id, folder_id')
        .eq('id', itemId)
        .maybeSingle();

      if (lookupError) {
        console.error('[Folders DELETE] Item lookup error:', lookupError);
        return NextResponse.json({ error: 'Failed to remove item' }, { status: 500 });
      }
      if (!item) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      }

      const { data: ownerFolder, error: folderError } = await serverOnly
        .schema('library')
        .from('smart_folders')
        .select('id')
        .eq('id', item.folder_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (folderError) {
        console.error('[Folders DELETE] Folder ownership check error:', folderError);
        return NextResponse.json({ error: 'Failed to remove item' }, { status: 500 });
      }
      if (!ownerFolder) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const { error } = await serverOnly
        .schema('library')
        .from('smart_folder_items')
        .delete()
        .eq('id', itemId);

      if (error) {
        return NextResponse.json({ error: 'Failed to remove item' }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (folderId) {
      const { error } = await serverOnly
        .schema('library')
        .from('smart_folders')
        .delete()
        .eq('id', folderId)
        .eq('user_id', user.id);

      if (error) {
        return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'folderId or itemId required' }, { status: 400 });
  } catch (error) {
    console.error('[Folders DELETE] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
