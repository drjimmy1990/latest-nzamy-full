import { NextResponse } from 'next/server';
import { ACADEMY_CATEGORIES } from '@/data/academy/categories';
import { ACADEMY_QUESTIONS } from '@/data/academy/questions';

export async function GET() {
  try {
    const categoriesWithStats = ACADEMY_CATEGORIES.map(cat => {
      const questionsCount = cat.id === 'all'
        ? ACADEMY_QUESTIONS.length
        : ACADEMY_QUESTIONS.filter(q => q.categoryId === cat.id).length;

      return {
        ...cat,
        questionsCount,
      };
    });

    return NextResponse.json({
      success: true,
      totalCategories: categoriesWithStats.length,
      categories: categoriesWithStats,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}
