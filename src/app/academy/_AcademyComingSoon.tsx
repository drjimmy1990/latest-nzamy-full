'use client';

/**
 * The academy's production frame (N05-A3/4/5, owner package 13 Nov 2026).
 *
 * The academy pages show invented courses, instructors, enrolments, a lesson
 * and a certificate; no course, enrolment or certificate store sits behind
 * them. Outside demo mode each page renders its own «قريباً» notice
 * (DashboardComingSoon, passed in as `children`) inside this frame: the public
 * Navbar and Footer the academy lacked, an optional link to the question bank
 * (/academy/quiz, which is real), and, for the personal pages («دوراتي»,
 * «شهاداتي»), a sign-in step before anything is shown.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Exam, SignIn } from '@phosphor-icons/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useTheme } from '@/components/ThemeProvider';
import { useUser } from '@/hooks/useUser';

export default function AcademyComingSoon({
  children,
  signInFrom,
  showQuizLink = false,
}: {
  children: ReactNode;
  /** A personal page: a visitor is asked to sign in first, then returned here. */
  signInFrom?: string;
  showQuizLink?: boolean;
}) {
  const { isDark } = useTheme();
  const user = useUser();
  const muted = isDark ? 'text-zinc-400' : 'text-slate-500';

  let body: ReactNode = children;
  if (signInFrom && user.loading) {
    body = <p className={`py-24 text-center text-sm ${muted}`}>جارٍ التحقق من الجلسة…</p>;
  } else if (signInFrom && !user.isLoggedIn) {
    body = (
      <div className="max-w-md mx-auto py-20 text-center space-y-4">
        <p className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>سجّل الدخول لعرض هذه الصفحة</p>
        <p className={`text-sm ${muted}`}>هذه الصفحة خاصة بحسابك.</p>
        <Link
          href={`/login?from=${encodeURIComponent(signInFrom)}`}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[13px] font-bold text-white"
        >
          <SignIn size={16} /> تسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <div dir="rtl" className={`min-h-screen flex flex-col ${isDark ? 'bg-[#0c0f12] text-white' : 'bg-gray-50 text-gray-900'}`}>
      <Navbar />
      <main className="flex-1 px-4 pt-24 pb-12">
        {body}
        {showQuizLink && (
          <div className="text-center">
            <Link
              href="/academy/quiz"
              className={`inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[13px] font-bold transition-colors ${
                isDark ? 'border-white/[0.1] text-[#C8A762] hover:bg-white/[0.04]' : 'border-slate-200 text-[#0B3D2E] hover:bg-slate-50'
              }`}
            >
              <Exam size={16} weight="duotone" /> بنك الأسئلة القانونية متاح الآن
            </Link>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
