"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * BUG-LIB-01 (S1 Task 7): whether `ref`'s element is within `rootMargin` of
 * the viewport. A reader colours only the blocks this says are near, so a
 * search over a long collection does not build <mark>s for every block.
 *
 * True when IntersectionObserver is missing (an old browser colours every
 * block, as before). The readers that use it render only on the client
 * (after their first fetch), so the first value never meets server HTML.
 */
export function useNearViewport(ref: RefObject<Element | null>, rootMargin = "800px 0px"): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, rootMargin]);
  return near;
}
