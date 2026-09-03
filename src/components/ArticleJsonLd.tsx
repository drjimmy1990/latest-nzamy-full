// ArticleJsonLd.tsx — server component emitting Article/FAQPage/Breadcrumb JSON-LD
// for a blog article. Rendered from the server [slug] page so it lands in the
// initial HTML (no hydration). No "use client".

interface AeoPair {
  question: string;
  answer: string;
}

export interface ArticleLdData {
  slug: string;
  title: string;
  description?: string | null;
  cover?: string | null;
  published_at?: string | null;
  date_modified?: string | null;
  author_name?: string | null;
  author_url?: string | null;
  author_credentials?: string | null;
  schema_type?: string | null;
  aeo_pairs?: AeoPair[] | null;
  category?: string | null;
  canonical_url?: string | null;
}

import { BLOG_FALLBACK_AUTHOR } from "@/constants/platformContent";

const BASE_URL = "https://nezamy.sa";

export function ArticleJsonLd({ article }: { article: ArticleLdData }) {
  const url = article.canonical_url || `${BASE_URL}/blog/${article.slug}`;
  // The V8.2 corpus declares `schema_type: LegalArticle` on every article; keep
  // it rather than flattening it to Article (schema.org LegalArticle is a valid
  // Article subtype and is what the content spec requires).
  const schemaType =
    article.schema_type === "FAQPage" ? "FAQPage"
    : article.schema_type === "HowTo" ? "HowTo"
    : article.schema_type === "LegalArticle" ? "LegalArticle"
    : "Article";

  const author = {
    "@type": "Person",
    name: article.author_name || BLOG_FALLBACK_AUTHOR,
    ...(article.author_url ? { url: article.author_url } : {}),
    ...(article.author_credentials ? { description: article.author_credentials } : {}),
  };

  const articleLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaType,
    headline: article.title,
    description: article.description || undefined,
    image: article.cover ? [article.cover] : undefined,
    datePublished: article.published_at || undefined,
    dateModified: article.date_modified || article.published_at || undefined,
    author,
    publisher: {
      "@type": "Organization",
      name: "نظامي",
      url: BASE_URL,
      logo: { "@type": "ImageObject", url: `${BASE_URL}/og-image.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };

  const blocks: object[] = [articleLd];

  if (Array.isArray(article.aeo_pairs) && article.aeo_pairs.length) {
    blocks.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: article.aeo_pairs.map((p) => ({
        "@type": "Question",
        name: p.question,
        acceptedAnswer: { "@type": "Answer", text: p.answer },
      })),
    });
  }

  blocks.push({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "المدونة", item: `${BASE_URL}/blog` },
      ...(article.category ? [{ "@type": "ListItem", position: 2, name: article.category }] : []),
      {
        "@type": "ListItem",
        position: article.category ? 3 : 2,
        name: article.title,
        item: url,
      },
    ],
  });

  return (
    <>
      {blocks.map((b, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(b) }}
        />
      ))}
    </>
  );
}