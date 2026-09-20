import { NextResponse } from 'next/server';
import { libraryGate } from '@/lib/library-gate';
import { rateLimit, clientIpFrom } from '@/lib/rateLimit';

/**
 * POST /api/ai/explain-article
 * Proxies to n8n webhook for AI-powered article explanation.
 * 
 * Request body:
 *   { articleId: string, lawSlug: string, question?: string }
 * 
 * Response (from n8n):
 *   { explanation: string, relatedArticles: { num: string, text: string }[] }
 */

const N8N_EXPLAIN_WEBHOOK_URL = process.env.N8N_EXPLAIN_WEBHOOK_URL;
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;

export async function POST(request: Request) {
  // The n8n response carries `relatedArticles[].text` — real statutory text — so
  // this is a content route despite living under /api/ai/.
  const gate = await libraryGate();
  if (gate) return gate;

  const ip = clientIpFrom(request);
  const rl = rateLimit(`ai:explain-article:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "طلبات كثيرة خلال وقت قصير — حاول مجدداً بعد قليل" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  try {
    // Check if n8n is configured
    if (!N8N_EXPLAIN_WEBHOOK_URL) {
      return NextResponse.json(
        {
          error: 'AI explanation service not configured',
          message: 'يرجى تكوين خدمة الذكاء الاصطناعي. اتصل بالمسؤول.',
          configured: false,
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { articleId, lawSlug, question } = body;

    if (!articleId || !lawSlug) {
      return NextResponse.json(
        { error: 'articleId and lawSlug are required' },
        { status: 400 }
      );
    }

    if (
      (typeof articleId === 'string' && articleId.length > 200) ||
      (typeof lawSlug === 'string' && lawSlug.length > 200)
    ) {
      return NextResponse.json(
        { error: 'معرّف المادة أو رابط النظام طويل جداً — الحد الأقصى 200 حرف' },
        { status: 400 }
      );
    }

    // Forward to n8n webhook
    const n8nResponse = await fetch(N8N_EXPLAIN_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(N8N_WEBHOOK_SECRET ? { 'X-Webhook-Secret': N8N_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify({
        articleId,
        lawSlug,
        question: question || 'اشرح هذه المادة بشكل مبسط',
        timestamp: new Date().toISOString(),
      }),
    });

    if (!n8nResponse.ok) {
      console.error('[AI Explain] n8n responded with:', n8nResponse.status);
      return NextResponse.json(
        { error: 'AI service temporarily unavailable' },
        { status: 502 }
      );
    }

    const result = await n8nResponse.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[AI Explain] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
