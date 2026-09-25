import { Hono, type Context } from "hono";
import type { AppEnv } from "../lib/context";
import { CATEGORIES, loadArticles, related, search, snippet, type CategoryKey } from "./content";
import { articlePage, categoryPage, indexPage, notFoundPage, robotsTxt, rssXml, searchPage, sitemapXml } from "./render";
import { LEARN_CSS } from "./styles";

/** Public, server-rendered knowledge base + crawl files (sitemap, robots, RSS). */
export const learnRoutes = new Hono<AppEnv>();

const base = (c: Context<AppEnv>) => c.get("deps").config.appUrl;

/** Cache at the edge/browser for a while; ETag lets repeat visits revalidate cheaply. */
function cached(c: Context<AppEnv>, body: string, type: string, maxAge = 300) {
  const { etag } = loadArticles();
  c.header("Cache-Control", `public, max-age=${maxAge}, s-maxage=${maxAge * 12}, stale-while-revalidate=86400`);
  c.header("ETag", etag);
  if (c.req.header("if-none-match") === etag) return c.body(null, 304);
  c.header("Content-Type", type);
  return c.body(body);
}
const html = (c: Context<AppEnv>, body: string) => cached(c, body, "text/html; charset=utf-8");

learnRoutes.get("/learn/assets/learn.css", (c) => cached(c, LEARN_CSS, "text/css; charset=utf-8", 86400));

learnRoutes.get("/learn", (c) => html(c, indexPage(loadArticles().articles, base(c))));

learnRoutes.get("/learn/search", (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 100);
  const all = loadArticles().articles;
  const results = q ? search(q, all).slice(0, 20).map((a) => ({ a, snippet: snippet(a, q) })) : [];
  c.header("Cache-Control", "no-store");
  return c.html(searchPage(q, results, all, base(c)));
});

learnRoutes.get("/learn/rss.xml", (c) => cached(c, rssXml(loadArticles().articles, base(c)), "application/rss+xml; charset=utf-8"));

learnRoutes.get("/learn/category/:key", (c) => {
  const key = c.req.param("key") as CategoryKey;
  if (!(key in CATEGORIES)) return c.html(notFoundPage(base(c)), 404);
  return html(c, categoryPage(key, loadArticles().articles, base(c)));
});

learnRoutes.get("/learn/:slug", (c) => {
  const { articles, byslug } = loadArticles();
  const slug = c.req.param("slug").toLowerCase();
  const a = byslug.get(slug);
  if (!a) return c.html(notFoundPage(base(c)), 404);
  return html(c, articlePage(a, related(a, articles), base(c)));
});

learnRoutes.get("/sitemap.xml", (c) => cached(c, sitemapXml(loadArticles().articles, base(c)), "application/xml; charset=utf-8", 3600));
learnRoutes.get("/robots.txt", (c) => cached(c, robotsTxt(base(c)), "text/plain; charset=utf-8", 3600));
