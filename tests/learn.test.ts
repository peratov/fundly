import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CATEGORIES, loadArticles, parseFrontmatter, search } from "../server/learn/content";
import { setup, type TestEnv } from "./helpers";

/*
 * Content quality gate: every Markdown file in content/learn must pass these
 * checks, so publishing more guides can't quietly break SEO or navigation.
 */

const { articles, byslug } = loadArticles();
const APP_ROUTES = new Set(["/", "/signup", "/login", "/tools/merry-go-round"]);

describe("knowledge base content", () => {
  it("has a substantial library", () => {
    expect(articles.length).toBeGreaterThanOrEqual(25);
    for (const key of Object.keys(CATEGORIES)) expect(articles.filter((a) => a.category === key).length, key).toBeGreaterThanOrEqual(4);
  });

  it.each(articles.map((a) => [a.slug, a] as const))("%s meets the editorial bar", (_, a) => {
    expect(a.slug).toMatch(/^[a-z0-9-]+$/);
    expect(a.title.length).toBeGreaterThan(20);
    expect(a.description.length, "meta description 70–170 chars").toBeGreaterThanOrEqual(70);
    expect(a.description.length, "meta description 70–170 chars").toBeLessThanOrEqual(170);
    expect(Object.keys(CATEGORIES)).toContain(a.category);
    expect(a.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(a.updated >= a.published).toBe(true);
    expect(a.words, "no thin content").toBeGreaterThanOrEqual(500);
    expect(a.toc.length, "at least three sections").toBeGreaterThanOrEqual(3);
    expect(a.html, "no empty sections").not.toMatch(/<\/h2>\s*<h2/);
    for (const f of a.faqs) expect(f.q && f.a).toBeTruthy();
  });

  it("has unique titles and descriptions", () => {
    expect(new Set(articles.map((a) => a.title)).size).toBe(articles.length);
    expect(new Set(articles.map((a) => a.description)).size).toBe(articles.length);
  });

  it("never links to a page that doesn't exist", () => {
    const broken: string[] = [];
    for (const a of articles) {
      for (const link of a.internalLinks) {
        const ok = link.startsWith("/learn/") ? byslug.has(link.slice(7)) || link.startsWith("/learn/category/") : APP_ROUTES.has(link) || link === "/learn";
        if (!ok) broken.push(`${a.slug} → ${link}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("links every guide from at least one other guide (no orphans)", () => {
    const linked = new Set(articles.flatMap((a) => a.internalLinks.filter((l) => l.startsWith("/learn/")).map((l) => l.slice(7))));
    const orphans = articles.filter((a) => !linked.has(a.slug)).map((a) => a.slug);
    expect(orphans).toEqual([]);
  });

  it("parses frontmatter lists and FAQs", () => {
    const { data } = parseFrontmatter(`---\ntitle: "A: B"\ntags: [x, y]\nfaqs:\n  - q: One?\n    a: "Yes: really"\n---\nBody`);
    expect(data).toEqual({ title: "A: B", tags: ["x", "y"], faqs: [{ q: "One?", a: "Yes: really" }] });
  });

  it("ranks obvious searches sensibly", () => {
    expect(search("susu ghana", articles)[0].slug).toBe("susu-ghana-guide");
    expect(search("flat interest", articles)[0].slug).toBe("flat-vs-reducing-balance-interest");
    expect(search("qwertyzzz", articles)).toEqual([]);
  });
});

describe("knowledge base pages", () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await setup();
  });
  afterAll(async () => env.handle.close());
  const get = (p: string, headers: Record<string, string> = {}) => env.app.request(p, { headers });

  it("serves an indexable hub with site search structured data", async () => {
    const res = await get("/learn");
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<link rel="canonical" href="http://localhost:5173/learn">');
    expect(html).toContain('"@type":"SearchAction"');
    expect(html).toContain("index, follow");
  });

  it("serves articles with Article, BreadcrumbList and FAQPage data", async () => {
    const html = await (await get("/learn/what-is-a-merry-go-round")).text();
    for (const t of ['"@type":"Article"', '"@type":"BreadcrumbList"', '"@type":"FAQPage"', 'property="og:type" content="article"', '<h2 id="']) expect(html).toContain(t);
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("returns real 404s and noindexes search", async () => {
    expect((await get("/learn/does-not-exist")).status).toBe(404);
    const s = await (await get("/learn/search?q=chama")).text();
    expect(s).toContain("noindex");
    expect(s).toContain("/learn/chama-kenya-guide");
  });

  it("lists every guide in the sitemap and RSS, and keeps private pages out of robots", async () => {
    const sitemap = await (await get("/sitemap.xml")).text();
    const rss = await (await get("/learn/rss.xml")).text();
    for (const a of articles) {
      expect(sitemap).toContain(`/learn/${a.slug}</loc>`);
      expect(rss).toContain(`/learn/${a.slug}</link>`);
    }
    const robots = await (await get("/robots.txt")).text();
    for (const p of ["Disallow: /c/", "Disallow: /api/", "Disallow: /f/", "Sitemap: http://localhost:5173/sitemap.xml"]) expect(robots).toContain(p);
  });

  it("supports conditional requests", async () => {
    const first = await get("/learn/glossary");
    const etag = first.headers.get("etag")!;
    expect(first.headers.get("cache-control")).toContain("public");
    expect((await get("/learn/glossary", { "if-none-match": etag })).status).toBe(304);
  });
});
