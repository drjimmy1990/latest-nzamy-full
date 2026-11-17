import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import {
  FOUNDER_PROTECTION_ITEMS,
  FOUNDER_PROTECTION_TITLE,
  FOUNDER_TERMS_ITEMS,
  FOUNDER_TERMS_PENDING_NOTE,
  FOUNDER_TERMS_PUBLISHED,
  FOUNDER_TERMS_TITLE,
  boldSegments,
  type TermsItem,
} from "@/lib/founder/founderTerms";

/**
 * /founder-terms — the founder package's terms (owner draft + the
 * platform-protection clause). Gated by FOUNDER_TERMS_PUBLISHED
 * (src/lib/founder/founderTerms.ts): until a lawyer has reviewed the draft
 * and the owner has confirmed the refund item, the page shows only a short
 * honest note and a link to /terms, and is noindex. Never a 404 — /founder
 * links here.
 */

export const metadata = buildMetadata({
  titleAr: FOUNDER_TERMS_TITLE,
  titleEn: "Founding Lawyer Terms",
  descriptionAr: "شروط وأحكام باقة المحامي المؤسس في منصة نظامي.",
  path: "/founder-terms",
  noIndex: !FOUNDER_TERMS_PUBLISHED,
});

function Rich({ text }: { text: string }) {
  return (
    <>
      {boldSegments(text).map((part, i) =>
        i % 2 === 1 ? (
          <b key={i} className="font-bold text-[#0B3D2E] dark:text-[#E6CD8E]">
            {part}
          </b>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function Item({ item }: { item: TermsItem }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 font-brand text-lg font-bold text-[#0B3D2E] dark:text-[#E6CD8E]">{item.title}</h3>
      {item.paragraphs?.map((p) => (
        <p key={p} className="mb-2 leading-loose">
          <Rich text={p} />
        </p>
      ))}
      {item.bullets && (
        <ul className="list-disc space-y-2 ps-6 leading-loose">
          {item.bullets.map((b) => (
            <li key={b}>
              <Rich text={b} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const linkClass = "font-bold text-[#0B3D2E] underline dark:text-[#E6CD8E]";

export default function FounderTermsPage() {
  return (
    <div dir="rtl" className="min-h-[70vh] bg-[#F2F5F1] py-14 text-[#14261F] dark:bg-[#0c0f12] dark:text-zinc-200">
      <article className="mx-auto max-w-3xl px-4 sm:px-6">
        <p className="mb-4 text-sm">
          <Link href="/founder" className={linkClass}>
            باقة المحامي المؤسس
          </Link>
        </p>
        <h1 className="mb-6 font-brand text-3xl font-extrabold text-[#0B3D2E] dark:text-[#E6CD8E]">
          {FOUNDER_TERMS_TITLE}
        </h1>

        {!FOUNDER_TERMS_PUBLISHED ? (
          <div className="rounded-2xl border border-[#E8CF8A] bg-[#FFF3D6] p-5 text-[#5C4200]" data-light-surface>
            <p className="font-bold leading-loose">{FOUNDER_TERMS_PENDING_NOTE}.</p>
            <p className="mt-2 leading-loose">
              وإلى حين نشرها تسري{" "}
              <Link href="/terms" className="font-bold text-[#0B3D2E] underline">
                الشروط والأحكام العامة للمنصة
              </Link>
              .
            </p>
          </div>
        ) : (
          <>
            {FOUNDER_TERMS_ITEMS.map((item) => (
              <Item key={item.title} item={item} />
            ))}
            <h2 className="mb-4 mt-10 font-brand text-2xl font-extrabold text-[#0B3D2E] dark:text-[#E6CD8E]">
              {FOUNDER_PROTECTION_TITLE}
            </h2>
            {FOUNDER_PROTECTION_ITEMS.map((item) => (
              <Item key={item.title} item={item} />
            ))}
            <p className="mt-8 text-sm">
              تُقرأ هذه الشروط مع{" "}
              <Link href="/terms" className={linkClass}>
                الشروط والأحكام العامة
              </Link>{" "}
              و
              <Link href="/refund-policy" className={linkClass}>
                سياسة الاسترداد
              </Link>
              .
            </p>
          </>
        )}
      </article>
    </div>
  );
}
