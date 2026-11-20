/**
 * crawlerList.ts — the closed list of search / answer crawlers (owner
 * register 14 items 56, 60, 64) and the visitor agents (register 60), with
 * how each crawler is proven. Data only — no network, no Node modules — so
 * the admin page can show the list. The proof itself is crawlerVerify.ts.
 */
export interface CrawlerDef {
  /** Settings key (crawler_view_limits). */
  id: string;
  /** Shown on the admin page. */
  label: string;
  /** The token its User-Agent carries. */
  ua: RegExp;
  /** Reverse-DNS names must end in one of these (on a dot boundary). Empty = not used. */
  rdnsSuffixes: readonly string[];
  /** The provider's published address list (JSON with ipv4Prefix / ipv6Prefix), or null. */
  rangesUrl: string | null;
  /** Owner register 64: on probation — its switch starts OFF. */
  probation: boolean;
  /** Where the method comes from (for the evidence pack and the admin page). */
  source: string;
}

/**
 * The closed list (register 60, Amazonbot added by 64). Order matters only
 * for a User-Agent that names two of them (the first wins).
 */
export const VERIFIED_CRAWLERS: readonly CrawlerDef[] = Object.freeze([
  {
    id: "googlebot",
    label: "Googlebot (Google)",
    ua: /\bGooglebot\b/i,
    rdnsSuffixes: ["googlebot.com", "google.com"],
    rangesUrl: "https://developers.google.com/static/crawling/ipranges/common-crawlers.json",
    probation: false,
    source: "developers.google.com/search/docs/crawling-indexing/verifying-googlebot",
  },
  {
    id: "bingbot",
    label: "Bingbot (Microsoft Bing)",
    ua: /\bbingbot\b/i,
    rdnsSuffixes: ["search.msn.com"],
    // Reported by Bing's 2021 announcement; reverse DNS is the primary check.
    rangesUrl: "https://www.bing.com/toolbox/bingbot.json",
    probation: false,
    source: "blogs.bing.com (How to Verify that Bingbot is Bingbot) + bing.com/toolbox/bingbot.json",
  },
  {
    id: "applebot",
    label: "Applebot (Apple)",
    // Applebot-Extended is a robots.txt token, never a User-Agent.
    ua: /\bApplebot\b(?!-Extended)/i,
    rdnsSuffixes: ["applebot.apple.com"],
    rangesUrl: "https://search.developer.apple.com/applebot.json",
    probation: false,
    source: "support.apple.com/en-us/119829",
  },
  {
    id: "oai-searchbot",
    label: "OAI-SearchBot (OpenAI)",
    ua: /\bOAI-SearchBot\b/i,
    rdnsSuffixes: [],
    rangesUrl: "https://openai.com/searchbot.json",
    probation: false,
    source: "developers.openai.com/api/docs/bots",
  },
  {
    id: "claude-searchbot",
    label: "Claude-SearchBot (Anthropic)",
    ua: /\bClaude-SearchBot\b/i,
    rdnsSuffixes: [],
    // One list for all of Anthropic's crawlers (not per bot).
    rangesUrl: "https://claude.com/crawling/bots.json",
    probation: false,
    source: "support.claude.com/en/articles/8896518",
  },
  {
    id: "perplexitybot",
    label: "PerplexityBot (Perplexity)",
    ua: /\bPerplexityBot\b/i,
    rdnsSuffixes: [],
    rangesUrl: "https://www.perplexity.ai/perplexitybot.json",
    probation: false,
    source: "docs.perplexity.ai/guides/bots",
  },
  {
    id: "amazonbot",
    label: "Amazonbot (Amazon) — تحت التجربة",
    ua: /\bAmazonbot\b/i,
    rdnsSuffixes: [],
    // An HTML page that embeds the JSON list; parsePublishedPrefixes reads it.
    rangesUrl: "https://developer.amazon.com/amazonbot/ip-addresses/",
    probation: true,
    source: "developer.amazon.com/amazonbot",
  },
]);

export interface AgentDef {
  id: string;
  label: string;
  ua: RegExp;
}

/** Register 60: these fetch for a person — ordinary visitors with a per-provider number. */
export const VISITOR_AGENTS: readonly AgentDef[] = Object.freeze([
  { id: "chatgpt-user", label: "ChatGPT-User (OpenAI)", ua: /\bChatGPT-User\b/i },
  { id: "claude-user", label: "Claude-User (Anthropic)", ua: /\bClaude-User\b/i },
  { id: "perplexity-user", label: "Perplexity-User (Perplexity)", ua: /\bPerplexity-User\b/i },
]);
