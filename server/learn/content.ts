import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";

/*
 * The knowledge base is plain Markdown files in content/learn. Adding a file is
 * all it takes to publish: it's picked up by the index, category pages, search,
 * sitemap and RSS automatically. Content is parsed once at startup.
 */

export const CATEGORIES = {
  "merry-go-rounds": { name: "Merry-go-rounds", blurb: "Susu, chama, esusu and every other rotating savings circle — how they work and how to run one well.", color: "#ff6b4a" },
  "running-a-fund": { name: "Running a group fund", blurb: "Constitutions, committees, dues, welfare and audits for alumni, church and community funds.", color: "#0d9488" },
  "loans-and-credit": { name: "Loans & credit", blurb: "Lending inside a group: interest, credit scores, repayments, shares and dividends.", color: "#8b5cf6" },
  "payments-and-records": { name: "Payments & records", blurb: "Mobile money collection, reminders, bookkeeping and moving off spreadsheets.", color: "#f5b700" },
} as const;
export type CategoryKey = keyof typeof CATEGORIES;

export interface Faq {
  q: string;
  a: string;
}

export interface Article {
  slug: string;
  title: string;
  description: string;
  category: CategoryKey;
  tags: string[];
  published: string;
  updated: string;
  featured: boolean;
  faqs: Faq[];
  html: string;
  text: string;
  toc: { id: string; text: string }[];
  words: number;
  readingMinutes: number;
  internalLinks: string[];
}

// ---------------------------------------------------------------- tiny frontmatter parser
// Supports: `key: value`, quoted values, `key: [a, b]`, and a list of `- q: / a:` objects.

function unquote(v: string) {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1).replace(/\\"/g, '"');
  return t;
}

export function parseFrontmatter(src: string): { data: Record<string, unknown>; body: string } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: src };
  const data: Record<string, unknown> = {};
  let listKey: string | null = null;
  let current: Record<string, string> | null = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const item = raw.match(/^\s*-\s+(\w+):\s*(.*)$/);
    const cont = raw.match(/^\s{2,}(\w+):\s*(.*)$/);
    const kv = raw.match(/^(\w+):\s*(.*)$/);
    if (listKey && item) {
      current = { [item[1]]: unquote(item[2]) };
      (data[listKey] as Record<string, string>[]).push(current);
    } else if (listKey && cont && current) {
      current[cont[1]] = unquote(cont[2]);
    } else if (kv) {
      const [, key, value] = kv;
      if (value === "") {
        listKey = key;
        data[key] = [];
        current = null;
      } else {
        listKey = null;
        data[key] = value.startsWith("[") ? value.slice(1, -1).split(",").map((s) => unquote(s)).filter(Boolean) : unquote(value);
      }
    }
  }
  return { data, body: m[2] };
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function decode(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** Markdown → HTML with stable heading anchors, a table of contents, and responsive tables. */
export function renderMarkdown(md: string) {
  let html = marked.parse(md, { async: false, gfm: true }) as string;
  const toc: { id: string; text: string }[] = [];
  const used = new Set<string>();
  html = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_, level: string, inner: string) => {
    let id = slugify(inner) || "section";
    while (used.has(id)) id += "-2";
    used.add(id);
    if (level === "2") toc.push({ id, text: decode(inner) });
    return `<h${level} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${inner}</h${level}>`;
  });
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, "</table></div>");
  // External links open safely in a new tab; internal ones stay put.
  html = html.replace(/<a href="(https?:\/\/[^"]+)"/g, '<a href="$1" rel="noopener" target="_blank"');
  const text = decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const internalLinks = [...md.matchAll(/\]\((\/[^)\s#]*)/g)].map((m) => m[1]);
  return { html, toc, text, internalLinks };
}

let cache: { articles: Article[]; byslug: Map<string, Article>; etag: string } | null = null;

export function contentDir() {
  return path.resolve(process.env.LEARN_DIR ?? "content/learn");
}

export function loadArticles(dir = contentDir()) {
  if (cache) return cache;
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
  const hash = createHash("sha1");
  const articles: Article[] = files.map((file) => {
    const src = readFileSync(path.join(dir, file), "utf8");
    hash.update(src);
    const { data, body } = parseFrontmatter(src);
    const r = renderMarkdown(body);
    const words = r.text.split(" ").length;
    const faqs = ((data.faqs as Faq[]) ?? []).filter((f) => f.q && f.a);
    return {
      slug: file.replace(/\.md$/, ""),
      title: String(data.title ?? file),
      description: String(data.description ?? ""),
      category: (String(data.category ?? "running-a-fund") as CategoryKey),
      tags: (data.tags as string[]) ?? [],
      published: String(data.published ?? "2026-01-01"),
      updated: String(data.updated ?? data.published ?? "2026-01-01"),
      featured: data.featured === "true",
      faqs,
      html: r.html,
      text: r.text,
      toc: r.toc,
      words,
      readingMinutes: Math.max(1, Math.round(words / 220)),
      internalLinks: r.internalLinks,
    };
  });
  articles.sort((a, b) => b.updated.localeCompare(a.updated) || a.title.localeCompare(b.title));
  cache = { articles, byslug: new Map(articles.map((a) => [a.slug, a])), etag: `"${hash.digest("hex").slice(0, 16)}"` };
  return cache;
}

/** For tests and hot reload. */
export function resetArticleCache() {
  cache = null;
}

/** Related = same category first, then shared tags, then anything linked from the article. */
export function related(a: Article, all: Article[], n = 3) {
  return all
    .filter((x) => x.slug !== a.slug)
    .map((x) => ({ x, score: (x.category === a.category ? 3 : 0) + x.tags.filter((t) => a.tags.includes(t)).length * 2 + (a.internalLinks.includes(`/learn/${x.slug}`) ? 1 : 0) }))
    .sort((p, q) => q.score - p.score || q.x.updated.localeCompare(p.x.updated))
    .slice(0, n)
    .map((p) => p.x);
}

/** Simple ranked full-text search: title hits outweigh description, tags and body. */
export function search(q: string, all: Article[]) {
  const terms = q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9-]/g, ""))
    .filter((t) => t.length > 1);
  if (!terms.length) return [];
  return all
    .map((a) => {
      const title = a.title.toLowerCase();
      const desc = a.description.toLowerCase();
      const tags = a.tags.join(" ").toLowerCase();
      const body = a.text.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (title.includes(t)) score += 10;
        if (desc.includes(t)) score += 4;
        if (tags.includes(t)) score += 4;
        const hits = body.split(t).length - 1;
        score += Math.min(hits, 10);
      }
      const allMatch = terms.every((t) => title.includes(t) || desc.includes(t) || body.includes(t));
      return { a, score: allMatch ? score * 1.5 : score };
    })
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((r) => r.a);
}

export function snippet(a: Article, q: string, len = 180) {
  const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const lower = a.text.toLowerCase();
  const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((x, y) => x - y)[0];
  if (at === undefined) return a.description;
  const start = Math.max(0, at - 60);
  return (start > 0 ? "…" : "") + a.text.slice(start, start + len).trim() + "…";
}
