import { NextRequest, NextResponse } from 'next/server';
import { calculateQuizResult } from '@/lib/academy/questionsStore';
import { QuizAttemptPayload } from '@/types/academy';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as QuizAttemptPayload;

    if (!body || typeof body.score !== 'number' || typeof body.questionsCount !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Invalid quiz attempt payload' },
        { status: 400 }
      );
    }

    const result = calculateQuizResult(body);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to submit attempt' },
      { status: 500 }
    );
  }
}
