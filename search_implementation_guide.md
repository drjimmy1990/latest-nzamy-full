# Search and Advanced Search Implementation Guide

This guide details the complete implementation plan, database schemas, API configurations, and user interface modifications required to move the legal library from local static lists to a dynamic, scalable search engine using **Supabase (PostgreSQL)** and **Next.js**.

---

## 1. Database Schema & Migration Setup

Run the following SQL migrations in your Supabase SQL Editor. This sets up the relational tables for laws, regulations, judicial principles, and books, configured with GIN indices and generated search vectors for Arabic/Simple text indexing.

```sql
-- ==========================================================
-- 1. BASE TABLES
-- ==========================================================

-- Laws Table
CREATE TABLE public.laws (
  id TEXT PRIMARY KEY,                  -- e.g., 'evidence-law' or 'companies-law'
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,                  -- e.g., 'نظام الإثبات'
  category TEXT,                        -- Taxonomy category code (e.g., SA-04)
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Articles Table
CREATE TABLE public.law_articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  law_id TEXT REFERENCES public.laws(id) ON DELETE CASCADE NOT NULL,
  chapter_title TEXT,                   -- Chapter or Section title (e.g. الباب الأول)
  article_number TEXT NOT NULL,         -- e.g., '1'
  article_number_text TEXT NOT NULL,    -- e.g., 'الأولى'
  text TEXT NOT NULL,                   -- Text body of the article
  status TEXT DEFAULT 'active',         -- active, amended, repealed, etc.
  free BOOLEAN DEFAULT true,            -- Control preview for paywall
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Executive Regulations Table (linked directly to articles)
CREATE TABLE public.law_regulations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID REFERENCES public.law_articles(id) ON DELETE CASCADE NOT NULL,
  instrument TEXT,                      -- e.g., 'لائحة تنفيذية', 'أدلة إجرائية'
  reference TEXT,                       -- e.g., 'المادة المقابلة في الأدلة الإجرائية'
  text TEXT NOT NULL,                   -- Regulation text
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Judicial Principles Table
CREATE TABLE public.judicial_principles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  number INTEGER NOT NULL,              -- e.g. 1
  issuing_body TEXT NOT NULL,           -- e.g., 'المحكمة العليا بهيئتها العامة'
  issuing_body_abbr TEXT,               -- e.g., 'ك ع ع'
  source_ref TEXT,                      -- e.g., '/٢أ'
  date TEXT,                            -- e.g., '١٤٣٤/٨/٢٩هـ'
  topic TEXT,                           -- e.g., 'الأصول والقواعد'
  text TEXT NOT NULL,                   -- Principle body text
  free BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Books Table
CREATE TABLE public.books (
  id TEXT PRIMARY KEY,                  -- e.g., 'al-waseet-sanhuri'
  title TEXT NOT NULL,
  author TEXT,
  type TEXT,                            -- e.g., 'كتاب قانوني مقارن'
  publisher TEXT,
  volumes_total INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Book Contents (Pages) Table
CREATE TABLE public.book_contents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id TEXT REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  volume INTEGER NOT NULL,
  page TEXT NOT NULL,                   -- e.g., '124' or 'أ'
  chapter_title TEXT,
  text TEXT NOT NULL,                   -- Content body text
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================================
-- 2. FULL-TEXT SEARCH VECTORS & INDEXES
-- ==========================================================

-- Law Articles Search Vectors
ALTER TABLE public.law_articles ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  to_tsvector('simple', coalesce(article_number_text, '') || ' ' || coalesce(text, ''))
) STORED;
CREATE INDEX law_articles_search_idx ON public.law_articles USING gin(search_vector);

-- Law Regulations Search Vectors
ALTER TABLE public.law_regulations ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  to_tsvector('simple', coalesce(reference, '') || ' ' || coalesce(text, ''))
) STORED;
CREATE INDEX law_regulations_search_idx ON public.law_regulations USING gin(search_vector);

-- Judicial Principles Search Vectors
ALTER TABLE public.judicial_principles ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  to_tsvector('simple', coalesce(topic, '') || ' ' || coalesce(text, ''))
) STORED;
CREATE INDEX judicial_principles_search_idx ON public.judicial_principles USING gin(search_vector);

-- Book Contents Search Vectors
ALTER TABLE public.book_contents ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  to_tsvector('simple', coalesce(chapter_title, '') || ' ' || coalesce(text, ''))
) STORED;
CREATE INDEX book_contents_search_idx ON public.book_contents USING gin(search_vector);

-- ==========================================================
-- 3. UNIFIED GLOBAL SEARCH VIEW
-- ==========================================================

CREATE OR REPLACE VIEW public.unified_search AS
  SELECT 
    a.id AS item_id,
    a.law_id AS parent_id,
    l.title AS parent_title,
    'law_article' AS content_type,
    a.chapter_title AS section_title,
    a.article_number_text AS item_identifier,
    a.text AS content_body,
    a.free AS free_access,
    a.search_vector AS search_vector
  FROM public.law_articles a
  JOIN public.laws l ON a.law_id = l.id
  
  UNION ALL
  
  SELECT 
    r.id AS item_id,
    a.law_id AS parent_id,
    l.title AS parent_title,
    'law_regulation' AS content_type,
    r.reference AS section_title,
    a.article_number_text AS item_identifier,
    r.text AS content_body,
    a.free AS free_access,
    r.search_vector AS search_vector
  FROM public.law_regulations r
  JOIN public.law_articles a ON r.article_id = a.id
  JOIN public.laws l ON a.law_id = l.id
  
  UNION ALL
  
  SELECT 
    p.id AS item_id,
    'judicial-principles' AS parent_id,
    p.issuing_body AS parent_title,
    'judicial_principle' AS content_type,
    p.topic AS section_title,
    'المبدأ رقم ' || p.number AS item_identifier,
    p.text AS content_body,
    p.free AS free_access,
    p.search_vector AS search_vector
  FROM public.judicial_principles p
  
  UNION ALL
  
  SELECT 
    c.id AS item_id,
    c.book_id AS parent_id,
    b.title AS parent_title,
    'book_page' AS content_type,
    c.chapter_title AS section_title,
    'الصفحة ' || c.page AS item_identifier,
    c.text AS content_body,
    true AS free_access,
    c.search_vector AS search_vector
  FROM public.book_contents c
  JOIN public.books b ON c.book_id = b.id;
```

---

## 2. Advanced Search Database Stored Procedure (RPC)

Create the search function inside the database. It handles complex search filtering (by category, parent documents, free/paid content, or specific content types) and returns relevant results ranked by text search matching relevance.

```sql
CREATE OR REPLACE FUNCTION public.advanced_global_search(
  search_query TEXT,
  filter_type TEXT DEFAULT NULL,       -- 'law_article', 'law_regulation', 'judicial_principle', 'book_page'
  filter_parent_id TEXT DEFAULT NULL,  -- e.g. 'evidence-law', 'companies-law'
  filter_free_only BOOLEAN DEFAULT false
)
RETURNS TABLE (
  item_id UUID,
  parent_id TEXT,
  parent_title TEXT,
  content_type TEXT,
  section_title TEXT,
  item_identifier TEXT,
  content_body TEXT,
  free_access BOOLEAN,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.item_id,
    u.parent_id,
    u.parent_title,
    u.content_type,
    u.section_title,
    u.item_identifier,
    u.content_body,
    u.free_access,
    ts_rank(u.search_vector, plainto_tsquery('simple', search_query)) AS rank
  FROM public.unified_search u
  WHERE 
    (search_query IS NULL OR search_query = '' OR u.search_vector @@ plainto_tsquery('simple', search_query))
    AND (filter_type IS NULL OR u.content_type = filter_type)
    AND (filter_parent_id IS NULL OR u.parent_id = filter_parent_id)
    AND (NOT filter_free_only OR u.free_access = true)
  ORDER BY 
    CASE WHEN search_query IS NOT NULL AND search_query != '' 
         THEN ts_rank(u.search_vector, plainto_tsquery('simple', search_query)) 
         ELSE 0 
    END DESC;
END;
$$ LANGUAGE plpgsql;
```

---

## 3. [OPTIONAL] AI-Powered Semantic & Hybrid Search

If you want to implement AI-powered semantic search (meaning-based search using vector embeddings), follow this optional setup.

### 1. Enable pgvector & Setup Embedding Columns
Run this in your Supabase SQL Editor:
```sql
-- Enable the vector extension
create extension if not exists vector;

-- Add embedding columns (1536 dimensions for OpenAI text-embedding-3-small)
alter table public.law_articles add column embedding vector(1536);
alter table public.judicial_principles add column embedding vector(1536);
alter table public.book_contents add column embedding vector(1536);

-- Create HNSW indexes for extremely fast vector cosine similarity search
create index law_articles_embedding_idx on public.law_articles 
using hnsw (embedding vector_cosine_ops);

create index judicial_principles_embedding_idx on public.judicial_principles 
using hnsw (embedding vector_cosine_ops);

create index book_contents_embedding_idx on public.book_contents 
using hnsw (embedding vector_cosine_ops);
```

### 2. Semantic Search Stored Procedure
This database function performs semantic matching using cosine distance (`<=>` operator):
```sql
create or replace function public.semantic_article_search(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  law_id text,
  chapter_title text,
  article_number_text text,
  text text,
  similarity float
) as $$
begin
  return query
  select
    a.id,
    a.law_id,
    a.chapter_title,
    a.article_number_text,
    a.text,
    1 - (a.embedding <=> query_embedding) as similarity
  from public.law_articles a
  where 1 - (a.embedding <=> query_embedding) > match_threshold
  order by a.embedding <=> query_embedding
  limit match_count;
end;
$$ language plpgsql;
```

---

## 4. Next.js API Integration

Create a backend API route at `src/app/api/search/route.ts` to query Supabase dynamically based on front-end selections.

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Make sure process.env variables are configured in your .env file
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const type = searchParams.get("type") || null;
  const parentId = searchParams.get("parentId") || null;
  const freeOnly = searchParams.get("freeOnly") === "true";

  try {
    const { data, error } = await supabase.rpc("advanced_global_search", {
      search_query: q,
      filter_type: type,
      filter_parent_id: parentId,
      filter_free_only: freeOnly,
    });

    if (error) throw error;

    return NextResponse.json({ success: true, results: data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

---

## 5. Frontend Client Page Integration

Replace the static Javascript search filter in your main library page file:
`src/app/laws/page.tsx`

Add a React `state` to fetch search results dynamically:

```typescript
import { useState, useEffect, useCallback } from "react";

// Add inside your LegalLibraryPage component:
const [results, setResults] = useState<any[]>([]);
const [loading, setLoading] = useState(false);

const handleSearch = useCallback(async () => {
  setLoading(true);
  try {
    const params = new URLSearchParams({
      q: search, // State bound to search bar input
      category: activeCat !== "all" ? activeCat : "", // State bound to tabs
      // Add extra filters from Advanced Search Modal here
    });

    const res = await fetch(`/api/search?${params.toString()}`);
    const data = await res.json();
    if (data.success) {
      setResults(data.results);
    }
  } catch (err) {
    console.error("Error executing advanced search", err);
  } finally {
    setLoading(false);
  }
}, [search, activeCat]);

// Run search with debouncing
useEffect(() => {
  const delayDebounceFn = setTimeout(() => {
    handleSearch();
  }, 350);

  return () => clearTimeout(delayDebounceFn);
}, [search, activeCat, handleSearch]);
```

Update your result list renderer to display the returned `results` array using components from `src/app/laws/components/ListItems.tsx`.
