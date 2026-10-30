import type { MetadataRoute } from "next";
import { librarySitemapUrls } from "../lib/library/libraryMetadata.ts";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://nezamy.sa";

  return {
    rules: [
      {
        userAgent: "*",
        // Owner note ١٤ §٢ item ١٠: with all of /_next/ blocked Googlebot could
        // not load the scripts and styles that draw a page, and saw it blank
        // (a soft 404). The build's static files and the image optimizer are
        // open; the longest matching rule wins, so they beat "/_next/" below,
        // which keeps every other /_next/ path (data routes) blocked.
        allow: ["/", "/_next/static/", "/_next/image"],
        disallow: [
          "/dashboard/",
          "/api/",
          "/ai/settings",
          "/ai/vault",
          "/ai/share-history",
          // Client case tracking links (N3.6): private, token-keyed, noindex.
          "/track/",
          "/_next/",
          // NOT /precedents/judgment/: it carries a noindex tag, which a
          // crawler must be allowed to read.
        ],
      },
    ],
    // The site map, then the library's per-type document maps (Next emits no
    // sitemap index, so each one is listed here).
    sitemap: [`${baseUrl}/sitemap.xml`, ...librarySitemapUrls()],
    host: baseUrl,
  };
}
