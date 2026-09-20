-- ============================================================================
-- Migration: 20260820_academy_schema.sql
-- Description: Comprehensive Nezamy Academy schema (Questions, Quizzes, Attempts, Certificates)
-- ============================================================================

create schema if not exists academy;

-- 1. Academy Questions (بنك الأسئلة الشامل)
create table if not exists academy.questions (
  id text primary key,
  category_id text not null,
  category_number text not null,
  category_name text not null,
  law_slug text,
  law_name text not null,
  article_number text,
  question_type text not null check (question_type in ('mcq', 'tf', 'match', 'scenario')),
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  tags text[] default '{}',
  question text not null,
  options jsonb, -- array of 4 choices for MCQ & Scenario
  correct_answer integer not null, -- 0-3 for MCQ, 0/1 for TF, or mapped index
  explanation text not null, -- Detailed legal reasoning
  statutory_citation jsonb, -- {instrument, decreeNo, article, textSnippet}
  pairs jsonb, -- array of {a, b} for match questions
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Preset Academy Quizzes / Exams (الاختبارات الجاهزة والشهادات)
create table if not exists academy.quizzes (
  id text primary key,
  slug text not null unique,
  title text not null,
  subtitle text,
  category_id text not null,
  level text not null check (level in ('مبتدئ', 'متوسط', 'متقدم')),
  duration_minutes integer not null default 15,
  passing_score_pct integer not null default 70,
  question_ids text[] not null default '{}',
  is_published boolean not null default true,
  certificate_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. User Quiz Attempts (سجل محاولات ونتائج المستخدمين)
create table if not exists academy.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  category_ids text[] not null,
  quiz_id text references academy.quizzes(id) on delete set null,
  questions_count integer not null,
  score integer not null,
  percentage numeric(5, 2) not null,
  time_spent_seconds integer not null,
  answers jsonb not null default '[]',
  peer_percentile numeric(5, 2) default 50.0,
  completed_at timestamptz not null default now()
);

-- 4. Issued Certificates (الشهادات الرقمية المعتمدة)
create table if not exists academy.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  user_name text not null,
  course_title text not null,
  category_name text not null,
  score numeric(5, 2) not null,
  verify_id text not null unique,
  issued_date_hijri text not null,
  issued_date_gregorian text not null,
  created_at timestamptz not null default now()
);

-- Indexes for lightning fast queries
create index if not exists idx_academy_questions_category on academy.questions(category_id);
create index if not exists idx_academy_questions_difficulty on academy.questions(difficulty);
create index if not exists idx_academy_questions_type on academy.questions(question_type);
create index if not exists idx_academy_attempts_user on academy.attempts(user_id);
create index if not exists idx_academy_certificates_verify on academy.certificates(verify_id);
create index if not exists idx_academy_certificates_user on academy.certificates(user_id);

-- RLS Policies
alter table academy.questions enable row level security;
alter table academy.quizzes enable row level security;
alter table academy.attempts enable row level security;
alter table academy.certificates enable row level security;

-- Public can read active questions and published quizzes
create policy "Public read active questions" on academy.questions for select using (is_active = true);
create policy "Public read published quizzes" on academy.quizzes for select using (is_published = true);

-- Users can read their own attempts or anonymous attempts
create policy "Users read own attempts" on academy.attempts for select using (
  auth.uid() = user_id or user_id is null
);
create policy "Users insert own attempts" on academy.attempts for insert with check (
  auth.uid() = user_id or user_id is null
);

-- Public can verify certificates by verify_id
create policy "Public verify certificates" on academy.certificates for select using (true);
create policy "Service role manage certificates" on academy.certificates for all using (true);

-- Public view aliases in public schema if needed
create or replace view public.academy_questions as select * from academy.questions;
create or replace view public.academy_quizzes as select * from academy.quizzes;
