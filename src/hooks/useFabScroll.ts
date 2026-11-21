"use client";

/**
 * useFabScroll — one scroll listener for the library readers' floating
 * buttons (batch l12, lib02 / New 1 and L2). Mounted once, by FloatingButtons
 * (it is on every page), active on a library reader only.
 *
 *   - `scrollY`: where the page was when the answer last changed (crossing
 *     DRAFT_FAB_SCROLL_THRESHOLD or flipping `hidden`), for the draft button's
 *     «after 300 px» rule (draftFab.ts draftFabVisible);
 *   - `hidden` + `<html data-fab-scroll="down|up">`: the narrow-screen
 *     auto-hide (draftFab.ts nextFabHidden). Any floating button marked
 *     `data-fab-autohide` fades out below lg while the reader scrolls down
 *     (globals.css) — the phone tools stack, the article-index button, the
 *     scroll-to-top button, WhatsApp and the draft button — so nothing sits
 *     over the line being read. Desktop (lg+) is untouched.
 *
 * Re-renders only when one of the two answers changes, not on every frame.
 */
import { useEffect, useState } from "react";
import { DRAFT_FAB_SCROLL_THRESHOLD, FAB_SCROLL_JITTER, nextFabHidden } from "@/lib/library/draftFab";

export function useFabScroll(active: boolean): { scrollY: number; hidden: boolean } {
  const [state, setState] = useState({ scrollY: 0, hidden: false });

  useEffect(() => {
    const root = document.documentElement;
    if (!active) {
      delete root.dataset.fabScroll;
      setState((s) => (s.scrollY === 0 && !s.hidden ? s : { scrollY: 0, hidden: false }));
      return;
    }
    let anchorY = window.scrollY;
    let hidden = false;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const y = window.scrollY;
      const maxY = Math.max(0, root.scrollHeight - window.innerHeight);
      hidden = nextFabHidden(hidden, anchorY, y, maxY);
      if (Math.abs(y - anchorY) >= FAB_SCROLL_JITTER) anchorY = y;
      root.dataset.fabScroll = hidden ? "down" : "up";
      setState((s) =>
        s.hidden === hidden && s.scrollY > DRAFT_FAB_SCROLL_THRESHOLD === y > DRAFT_FAB_SCROLL_THRESHOLD ? s : { scrollY: y, hidden },
      );
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      delete root.dataset.fabScroll;
    };
  }, [active]);

  return state;
}
