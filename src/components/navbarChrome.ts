/**
 * navbarChrome.ts — when the top navbar is see-through (owner, 4 Oct item 130:
 * «شريط التنقل الشفاف»).
 *
 * Over the home page's hero the bar has no surface of its own, so the hero
 * shows through it. It turns solid once the page has scrolled more than
 * NAV_SOLID_AFTER_PX, while the phone menu is open (the drawer needs a surface
 * to sit on), and on every other page, all the time. "Home" is the path "/"
 * exactly (`usePathname()` drops the `?noredirect=true` query).
 *
 * Pure, so `designTokens.test.ts` can run it under `node --test`.
 */
export const NAV_SOLID_AFTER_PX = 8;

export function isPastSolidThreshold(scrollY: number): boolean {
  return scrollY > NAV_SOLID_AFTER_PX;
}

export function isNavbarTransparent(pathname: string | null, scrolled: boolean, menuOpen: boolean): boolean {
  return pathname === "/" && !scrolled && !menuOpen;
}
