import { CATEGORIES, type Article, type CategoryKey } from "./content";

/*
 * Server-rendered pages for the knowledge base. No client JavaScript: pages are
 * complete HTML the moment they arrive, which is what search engines index best
 * and what cheap phones on slow networks load fastest.
 */

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const jsonLd = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export interface PageMeta {
  title: string;
  description: string;
  path: string;
  base: string;
  type?: "website" | "article";
  noindex?: boolean;
  structured?: unknown[];
  published?: string;
  updated?: string;
}

const ORG = (base: string) => ({ "@type": "Organization", name: "Fundly", url: base, logo: `${base}/icons/icon-512.png` });

function head(m: PageMeta) {
  const url = `${m.base}${m.path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(m.title)}</title>
<meta name="description" content="${esc(m.description)}">
<link rel="canonical" href="${esc(url)}">
${m.noindex ? '<meta name="robots" content="noindex, follow">' : '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">'}
<meta name="theme-color" content="#060913">
<meta property="og:site_name" content="Fundly">
<meta property="og:type" content="${m.type ?? "website"}">
<meta property="og:title" content="${esc(m.title)}">
<meta property="og:description" content="${esc(m.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${m.base}/icons/icon-512.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(m.title)}">
<meta name="twitter:description" content="${esc(m.description)}">
${m.published ? `<meta property="article:published_time" content="${m.published}">` : ""}
${m.updated ? `<meta property="article:modified_time" content="${m.updated}">` : ""}
<link rel="alternate" type="application/rss+xml" title="Fundly Learn" href="${m.base}/learn/rss.xml">
<link rel="icon" href="/icons/icon-192.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700..800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/learn/assets/learn.css">
${(m.structured ?? []).map(jsonLd).join("\n")}
</head>`;
}

function shell(m: PageMeta, main: string) {
  return `${head(m)}
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site">
  <div class="wrap bar">
    <a class="logo" href="/"><span class="mark" aria-hidden="true">F</span>Fundly</a>
    <nav aria-label="Site">
      <a href="/learn">Learn</a>
      <a href="/tools/merry-go-round" class="hide-sm">Free planner</a>
      <a href="/#pricing" class="hide-sm">Pricing</a>
      <a href="/signup" class="cta">Start free</a>
    </nav>
  </div>
</header>
<main id="main">
${main}
</main>
<footer class="site">
  <div class="wrap foot">
    <div>
      <a class="logo" href="/"><span class="mark" aria-hidden="true">F</span>Fundly</a>
      <p>Savings, loans and welfare software for alumni associations, susu groups and community funds.</p>
    </div>
    <nav aria-label="Knowledge base">
      <strong>Learn</strong>
      ${Object.entries(CATEGORIES).map(([k, c]) => `<a href="/learn/category/${k}">${esc(c.name)}</a>`).join("")}
      <a href="/learn/glossary">Glossary</a>
    </nav>
    <nav aria-label="Product">
      <strong>Product</strong>
      <a href="/tools/merry-go-round">Free merry-go-round planner</a>
      <a href="/#features">Features</a>
      <a href="/#pricing">Pricing</a>
      <a href="/login">Sign in</a>
    </nav>
  </div>
  <p class="wrap fine">Guides are general information, not financial or legal advice. © ${new Date().getFullYear()} Fundly · <a href="/learn/rss.xml">RSS</a></p>
</footer>
</body>
</html>`;
}

function searchForm(q = "", big = false) {
  return `<form class="search${big ? " big" : ""}" action="/learn/search" method="get" role="search">
<label class="sr" for="q">Search the knowledge base</label>
<input id="q" name="q" type="search" value="${esc(q)}" placeholder="Search guides — e.g. susu payout order, loan interest" autocomplete="off">
<button type="submit">Search</button>
</form>`;
}

function card(a: Article) {
  const c = CATEGORIES[a.category];
  return `<li class="card"><a href="/learn/${a.slug}">
<span class="pill" style="--c:${c.color}">${esc(c.name)}</span>
<h3>${esc(a.title)}</h3>
<p>${esc(a.description)}</p>
<span class="meta">${a.readingMinutes} min read · Updated ${fmtDate(a.updated)}</span>
</a></li>`;
}

function crumbs(items: { name: string; path: string }[], base: string) {
  const html = `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map((i, n) => (n < items.length - 1 ? `<li><a href="${i.path}">${esc(i.name)}</a></li>` : `<li aria-current="page">${esc(i.name)}</li>`)).join("")}</ol></nav>`;
  const ld = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((i, n) => ({ "@type": "ListItem", position: n + 1, name: i.name, item: `${base}${i.path}` })) };
  return { html, ld };
}

const CTA_TOOL = `<aside class="cta-box">
<p class="kicker">Free tool</p>
<h2>Plan your merry-go-round in 60 seconds</h2>
<p>Add your friends, spin the wheel for a fair payout order, and share one link with the group chat.</p>
<a class="btn" href="/tools/merry-go-round">Open the free planner →</a>
</aside>`;

const CTA_FUND = `<aside class="cta-box alt">
<p class="kicker">Fundly</p>
<h2>Run your group fund like a real bank</h2>
<p>Dues by mobile money, fair loans, welfare cover and books that always balance. 14 days free.</p>
<a class="btn" href="/signup">Start your fund free →</a>
</aside>`;

// ---------------------------------------------------------------- pages

export function indexPage(all: Article[], base: string) {
  const featured = all.filter((a) => a.featured);
  const latest = all.slice(0, 9);
  const m: PageMeta = {
    title: "Fundly Learn — guides for susu, chama, merry-go-rounds and group savings funds",
    description: "Free, practical guides for running merry-go-rounds, susu and chama groups, alumni welfare funds and member loans — from payout order to bookkeeping.",
    path: "/learn",
    base,
    structured: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Fundly",
        url: base,
        potentialAction: { "@type": "SearchAction", target: `${base}/learn/search?q={search_term_string}`, "query-input": "required name=search_term_string" },
      },
      { "@context": "https://schema.org", "@type": "CollectionPage", name: "Fundly Learn", url: `${base}/learn`, publisher: ORG(base), hasPart: all.map((a) => ({ "@type": "Article", headline: a.title, url: `${base}/learn/${a.slug}` })) },
    ],
  };
  return shell(
    m,
    `<section class="hero">
  <div class="wrap">
    <p class="kicker light">Fundly Learn</p>
    <h1>Everything you need to run a group fund your members trust</h1>
    <p class="lede">Practical guides for merry-go-rounds, susu and chama groups, alumni welfare funds and member loans. Written in plain English, with templates you can copy.</p>
    ${searchForm("", true)}
    <ul class="chips">${Object.entries(CATEGORIES).map(([k, c]) => `<li><a href="/learn/category/${k}" style="--c:${c.color}">${esc(c.name)}</a></li>`).join("")}<li><a href="/learn/glossary" style="--c:#38bdf8">Glossary</a></li></ul>
  </div>
</section>
<div class="wrap">
  ${featured.length ? `<section class="block"><h2 class="section">Start here</h2><ul class="grid featured">${featured.map(card).join("")}</ul></section>` : ""}
  ${Object.entries(CATEGORIES)
    .map(([k, c]) => {
      const items = all.filter((a) => a.category === k).slice(0, 3);
      if (!items.length) return "";
      return `<section class="block"><div class="section-head"><h2 class="section">${esc(c.name)}</h2><a href="/learn/category/${k}">All ${all.filter((a) => a.category === k).length} guides →</a></div><p class="section-blurb">${esc(c.blurb)}</p><ul class="grid">${items.map(card).join("")}</ul></section>`;
    })
    .join("")}
  <section class="block"><h2 class="section">Recently updated</h2><ul class="list">${latest.map((a) => `<li><a href="/learn/${a.slug}">${esc(a.title)}</a><span>${fmtDate(a.updated)}</span></li>`).join("")}</ul></section>
  ${CTA_TOOL}
</div>`,
  );
}

export function categoryPage(key: CategoryKey, all: Article[], base: string) {
  const c = CATEGORIES[key];
  const items = all.filter((a) => a.category === key);
  const path = `/learn/category/${key}`;
  const bc = crumbs([{ name: "Learn", path: "/learn" }, { name: c.name, path }], base);
  return shell(
    {
      title: `${c.name} guides | Fundly Learn`,
      description: c.blurb,
      path,
      base,
      structured: [
        bc.ld,
        { "@context": "https://schema.org", "@type": "CollectionPage", name: `${c.name} guides`, url: `${base}${path}`, publisher: ORG(base), mainEntity: { "@type": "ItemList", itemListElement: items.map((a, i) => ({ "@type": "ListItem", position: i + 1, url: `${base}/learn/${a.slug}`, name: a.title })) } },
      ],
    },
    `<section class="hero slim" style="--c:${c.color}">
  <div class="wrap">${bc.html}<h1>${esc(c.name)}</h1><p class="lede">${esc(c.blurb)}</p>${searchForm()}</div>
</section>
<div class="wrap"><ul class="grid block">${items.map(card).join("")}</ul>${key === "merry-go-rounds" ? CTA_TOOL : CTA_FUND}</div>`,
  );
}

export function articlePage(a: Article, rel: Article[], base: string) {
  const c = CATEGORIES[a.category];
  const path = `/learn/${a.slug}`;
  const bc = crumbs([{ name: "Learn", path: "/learn" }, { name: c.name, path: `/learn/category/${a.category}` }, { name: a.title, path }], base);
  const structured: unknown[] = [
    bc.ld,
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: a.title,
      description: a.description,
      datePublished: a.published,
      dateModified: a.updated,
      wordCount: a.words,
      articleSection: c.name,
      keywords: a.tags.join(", "),
      mainEntityOfPage: `${base}${path}`,
      author: { "@type": "Organization", name: "Fundly editorial team", url: `${base}/learn` },
      publisher: ORG(base),
      image: `${base}/icons/icon-512.png`,
    },
  ];
  if (a.faqs.length) {
    structured.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: a.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
  }
  const items = a.toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join("");
  // Desktop: sticky sidebar. Phones: a collapsed dropdown so the article starts on the first screen.
  const toc =
    a.toc.length > 2
      ? `<nav class="toc toc-desktop" aria-label="On this page"><strong>On this page</strong><ol>${items}</ol></nav><details class="toc toc-mobile"><summary>On this page (${a.toc.length} sections)</summary><ol>${items}</ol></details>`
      : "";
  const faqs = a.faqs.length
    ? `<section class="faqs"><h2 id="faq">Frequently asked questions</h2>${a.faqs.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</section>`
    : "";
  return shell(
    { title: `${a.title} | Fundly Learn`, description: a.description, path, base, type: "article", structured, published: a.published, updated: a.updated },
    `<article>
<header class="hero slim" style="--c:${c.color}">
  <div class="wrap narrow">
    ${bc.html}
    <a class="pill" style="--c:${c.color}" href="/learn/category/${a.category}">${esc(c.name)}</a>
    <h1>${esc(a.title)}</h1>
    <p class="lede">${esc(a.description)}</p>
    <p class="byline">By the Fundly editorial team · <time datetime="${a.updated}">Updated ${fmtDate(a.updated)}</time> · ${a.readingMinutes} min read</p>
  </div>
</header>
<div class="wrap article-grid">
  <aside class="side">${toc}</aside>
  <div class="prose">
    ${a.html}
    ${faqs}
    ${a.category === "merry-go-rounds" ? CTA_TOOL : CTA_FUND}
    <p class="disclaimer">This guide is general information to help groups organise themselves. It isn't financial, tax or legal advice — rules for savings groups differ by country, so check with a qualified adviser for your situation.</p>
  </div>
</div>
${rel.length ? `<section class="wrap related"><h2 class="section">Keep reading</h2><ul class="grid">${rel.map(card).join("")}</ul></section>` : ""}
</article>`,
  );
}

export function searchPage(q: string, results: { a: Article; snippet: string }[], all: Article[], base: string) {
  return shell(
    { title: q ? `Search: ${q} | Fundly Learn` : "Search | Fundly Learn", description: "Search Fundly's guides for savings groups.", path: `/learn/search`, base, noindex: true },
    `<section class="hero slim"><div class="wrap narrow"><h1>${q ? `Results for “${esc(q)}”` : "Search the guides"}</h1>${searchForm(q)}</div></section>
<div class="wrap narrow block">
${
  q && !results.length
    ? `<p class="empty">No guides matched <b>${esc(q)}</b>. Try fewer words, or browse a topic:</p><ul class="chips dark">${Object.entries(CATEGORIES).map(([k, c]) => `<li><a href="/learn/category/${k}" style="--c:${c.color}">${esc(c.name)}</a></li>`).join("")}</ul>`
    : ""
}
<ol class="results">${results.map(({ a, snippet }) => `<li><a href="/learn/${a.slug}"><h2>${esc(a.title)}</h2><p>${esc(snippet)}</p><span class="meta">${esc(CATEGORIES[a.category].name)} · ${a.readingMinutes} min read</span></a></li>`).join("")}</ol>
${!q ? `<ul class="list">${all.map((a) => `<li><a href="/learn/${a.slug}">${esc(a.title)}</a></li>`).join("")}</ul>` : ""}
</div>`,
  );
}

export function notFoundPage(base: string) {
  return shell(
    { title: "Guide not found | Fundly Learn", description: "That guide doesn't exist.", path: "/learn", base, noindex: true },
    `<section class="hero slim"><div class="wrap narrow"><h1>We couldn't find that guide</h1><p class="lede">It may have moved. Try searching instead.</p>${searchForm()}</div></section>`,
  );
}

// ---------------------------------------------------------------- feeds

export function sitemapXml(all: Article[], base: string) {
  const newest = all.reduce((m, a) => (a.updated > m ? a.updated : m), "2026-01-01");
  const urls = [
    { loc: "/", lastmod: newest, priority: "1.0" },
    { loc: "/tools/merry-go-round", lastmod: newest, priority: "0.9" },
    { loc: "/learn", lastmod: newest, priority: "0.9" },
    ...Object.keys(CATEGORIES).map((k) => ({ loc: `/learn/category/${k}`, lastmod: newest, priority: "0.7" })),
    ...all.map((a) => ({ loc: `/learn/${a.slug}`, lastmod: a.updated, priority: a.featured ? "0.8" : "0.6" })),
    { loc: "/signup", lastmod: newest, priority: "0.5" },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${esc(base + u.loc)}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.priority}</priority></url>`).join("\n")}
</urlset>`;
}

export function rssXml(all: Article[], base: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>Fundly Learn</title>
<link>${base}/learn</link>
<atom:link href="${base}/learn/rss.xml" rel="self" type="application/rss+xml"/>
<description>Guides for merry-go-rounds, susu, chama and group savings funds.</description>
<language>en</language>
${all
  .slice(0, 50)
  .map(
    (a) => `<item><title>${esc(a.title)}</title><link>${base}/learn/${a.slug}</link><guid isPermaLink="true">${base}/learn/${a.slug}</guid><pubDate>${new Date(`${a.published}T08:00:00Z`).toUTCString()}</pubDate><category>${esc(CATEGORIES[a.category].name)}</category><description>${esc(a.description)}</description></item>`,
  )
  .join("\n")}
</channel>
</rss>`;
}

export function robotsTxt(base: string) {
  return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /f/
Disallow: /admin
Disallow: /app
Disallow: /invite/
# Shared circle pages contain friends' names; keep them out of search results.
Disallow: /c/
Disallow: /learn/search

Sitemap: ${base}/sitemap.xml
`;
}
