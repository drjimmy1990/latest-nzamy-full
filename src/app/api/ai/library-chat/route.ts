import { NextResponse } from 'next/server';

/**
 * POST /api/ai/library-chat
 * Proxies to n8n webhook for AI-powered library chat assistant.
 * 
 * Request body:
 *   { message: string, context: { slug?: string, section?: string, activeArticleId?: string } }
 * 
 * Response (from n8n):
 *   { reply: string, sources: { title: string, slug: string, section: string }[] }
 */

const N8N_LIBRARY_CHAT_WEBHOOK_URL = process.env.N8N_LIBRARY_CHAT_WEBHOOK_URL;
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;

export async function POST(request: Request) {
  try {
    if (!N8N_LIBRARY_CHAT_WEBHOOK_URL) {
      return NextResponse.json(
        {
          error: 'AI chat service not configured',
          message: 'يرجى تكوين خدمة المحادثة الذكية. اتصل بالمسؤول.',
          configured: false,
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { message, context } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 }
      );
    }

    const n8nResponse = await fetch(N8N_LIBRARY_CHAT_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(N8N_WEBHOOK_SECRET ? { 'X-Webhook-Secret': N8N_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify({
        message,
        context: context || {},
        timestamp: new Date().toISOString(),
      }),
    });

    if (!n8nResponse.ok) {
      console.error('[AI Chat] n8n responded with:', n8nResponse.status);
      return NextResponse.json(
        { error: 'AI service temporarily unavailable' },
        { status: 502 }
      );
    }

    const result = await n8nResponse.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[AI Chat] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
