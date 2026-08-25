import { NextRequest, NextResponse } from 'next/server';
import { getQuizQuestions } from '@/lib/academy/questionsStore';
import { AcademyCategoryId, DifficultyLevel } from '@/types/academy';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawCategories = searchParams.get('categories') || 'all';
    const count = parseInt(searchParams.get('count') || '5', 10);
    const difficulty = (searchParams.get('difficulty') || undefined) as DifficultyLevel | undefined;

    const categories = rawCategories.split(',').map(s => s.trim()) as AcademyCategoryId[];

    const questions = getQuizQuestions(categories, count, difficulty);

    return NextResponse.json({
      success: true,
      count: questions.length,
      questions,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch questions' },
      { status: 500 }
    );
  }
}
