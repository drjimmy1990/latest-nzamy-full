import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/library/folders — List user's smart folders
 * POST /api/library/folders — Create a new smart folder
 */

export async function GET() {
  try {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: folders, error } = await supabase
      .schema('library')
      .from('smart_folders')
      .select(`
        *,
        smart_folder_items ( id, entity_type, entity_id, created_at )
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
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, color, icon } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const { data: folder, error } = await supabase
      .schema('library')
      .from('smart_folders')
      .insert({
        user_id: user.id,
        name,
        color: color || '#C8A762',
        icon: icon || '📁',
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
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { folderId, name, color, icon } = body;

    if (!folderId) {
      return NextResponse.json({ error: 'folderId is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (name) updates.name = name;
    if (color) updates.color = color;
    if (icon) updates.icon = icon;

    const { data: folder, error } = await supabase
      .schema('library')
      .from('smart_folders')
      .update(updates)
      .eq('id', folderId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('[Folders PATCH] Error:', error);
      return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 });
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
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');
    const itemId = searchParams.get('itemId');

    if (itemId) {
      // Delete a single item from a folder
      const { error } = await supabase
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
      // Delete entire folder (cascade deletes items)
      const { error } = await supabase
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
