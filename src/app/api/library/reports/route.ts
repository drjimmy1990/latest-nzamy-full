import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/library/reports
 * Submit an issue report for any library entity.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    // Allow anonymous reports but track user_id if authenticated

    const body = await request.json();
    const { entityType, entityId, reportType, description } = body;

    if (!entityType || !entityId || !reportType || !description) {
      return NextResponse.json(
        { error: 'entityType, entityId, reportType, and description are required' },
        { status: 400 }
      );
    }

    // Validate report type
    const validTypes = ['error', 'missing', 'outdated', 'suggestion', 'other'];
    if (!validTypes.includes(reportType)) {
      return NextResponse.json(
        { error: `reportType must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const { data: report, error } = await supabase
      .schema('library')
      .from('issue_reports')
      .insert({
        user_id: user?.id || null,
        entity_type: entityType,
        entity_id: entityId,
        report_type: reportType,
        description,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('[Reports POST] Error:', error);
      return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 });
    }

    return NextResponse.json(
      { 
        success: true, 
        report,
        message: 'تم إرسال البلاغ بنجاح. شكراً لمساهمتك في تحسين المكتبة القانونية.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Reports POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
