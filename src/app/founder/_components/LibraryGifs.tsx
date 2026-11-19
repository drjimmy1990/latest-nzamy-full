"use client";

import { useSyncExternalStore, useState } from "react";
import { Play } from "@phosphor-icons/react";

/**
 * The two live recordings (library search, smart researcher), lazy-loaded.
 * Under `prefers-reduced-motion` an animated GIF is not loaded until the
 * visitor asks for it. Phones get the narrower library recording.
 */

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const reducedNow = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Gif({
  src,
  mobileSrc,
  width,
  height,
  alt,
  bar,
  caption,
  aspectClass,
}: {
  src: string;
  mobileSrc?: string;
  width: number;
  height: number;
  alt: string;
  bar: string;
  caption: string;
  /** Tailwind aspect classes (literal, so the build sees them). */
  aspectClass: string;
}) {
  // Server snapshot: reduced (nothing loads before the client knows).
  const reduced = useSyncExternalStore(subscribe, reducedNow, () => true);
  const [play, setPlay] = useState(false);
  const show = !reduced || play;

  return (
    <figure className="m-0 overflow-hidden rounded-2xl border border-[#D9E3DD] bg-white shadow-[0_12px_30px_rgba(6,32,26,.12)]" data-light-surface>
      <div className="flex items-center gap-1.5 bg-[#EEF3F0] px-3 py-2" dir="ltr" aria-hidden>
        <i className="h-[9px] w-[9px] rounded-full bg-[#C8A762]" />
        <i className="h-[9px] w-[9px] rounded-full bg-[#C8A762]" />
        <i className="h-[9px] w-[9px] rounded-full bg-[#C8A762]" />
        <span className="ms-2.5 text-xs text-[#4B6158]">{bar}</span>
      </div>
      <div className={`relative bg-[#0c0f12] ${aspectClass}`}>
        {show ? (
          <picture>
            {mobileSrc && <source media="(max-width: 639px)" srcSet={mobileSrc} />}
            {/* A plain <img>: next/image would re-encode or freeze an animated GIF. */}
            <img
              src={src}
              alt={alt}
              width={width}
              height={height}
              loading="lazy"
              decoding="async"
              className="block h-full w-full object-contain"
            />
          </picture>
        ) : (
          <button
            type="button"
            onClick={() => setPlay(true)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm font-bold text-[#E6CD8E]"
          >
            <Play size={36} weight="fill" aria-hidden />
            اعرض التسجيل
          </button>
        )}
      </div>
      <figcaption className="px-3.5 py-2.5 text-sm text-[#4B6158]">{caption}</figcaption>
    </figure>
  );
}

export function LibraryGifs() {
  return (
    <div className="mt-6 grid gap-5 md:grid-cols-2">
      <Gif
        src="/founder/library-search-desktop.gif"
        mobileSrc="/founder/library-search.gif"
        width={700}
        height={294}
        alt="تسجيل حي للبحث في المكتبة القانونية ثم فتح المادة"
        bar="nezamy.sa/laws"
        caption="البحث في المكتبة، ثم فتح المادة ولائحتها"
        aspectClass="aspect-[560/494] sm:aspect-[700/294]"
      />
      <Gif
        src="/founder/smart-search-desktop.gif"
        width={760}
        height={289}
        alt="تسجيل حي للباحث الذكي يجيب بمواد موثقة"
        bar="الباحث الذكي"
        caption="إجابة موثقة بأرقام المواد، ينقلك كل رقم إلى المادة في المكتبة"
        aspectClass="aspect-[760/289]"
      />
    </div>
  );
}
