/** Hand-written, mobile-first stylesheet for the knowledge base (~7 KB, no framework). */
export const LEARN_CSS = `
:root{--ink:#0b1020;--ink2:#060913;--muted:#5b6475;--line:#e7e3da;--paper:#fbfaf7;--card:#fff;--teal:#0f766e;--coral:#ff6b4a;--grape:#7c3aed;--sun:#ffd23f;--radius:18px}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:84px}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 Inter,system-ui,-apple-system,Segoe UI,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--teal)}
img{max-width:100%}
.wrap{max-width:1120px;margin:0 auto;padding:0 18px}
.narrow{max-width:780px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.skip{position:absolute;left:-999px;top:8px;background:#fff;padding:8px 12px;border-radius:8px;z-index:99}
.skip:focus{left:8px}
:focus-visible{outline:3px solid var(--coral);outline-offset:2px;border-radius:6px}

header.site{position:sticky;top:0;z-index:20;background:rgba(6,9,19,.92);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.bar{display:flex;align-items:center;justify-content:space-between;height:64px;gap:12px}
.logo{display:inline-flex;align-items:center;gap:10px;color:#fff;font:800 20px/1 "Bricolage Grotesque",Inter,sans-serif;text-decoration:none}
.mark{display:inline-flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:10px;background:linear-gradient(135deg,#2dd4bf,#8b5cf6 55%,#ff6b4a);font-size:17px}
header.site nav{display:flex;align-items:center;gap:4px}
header.site nav a{color:rgba(255,255,255,.75);text-decoration:none;font-weight:600;font-size:14px;padding:10px 12px;border-radius:999px}
header.site nav a:hover{color:#fff;background:rgba(255,255,255,.08)}
header.site nav a.cta{background:#fff;color:var(--ink2);padding:10px 16px}
@media(max-width:640px){.hide-sm{display:none}}

.hero{position:relative;overflow:hidden;background:var(--ink2);color:#fff;padding:56px 0 52px}
.hero::before{content:"";position:absolute;inset:-40% -10% auto;height:140%;background:radial-gradient(40% 50% at 15% 30%,rgba(20,184,166,.45),transparent 70%),radial-gradient(35% 45% at 85% 20%,rgba(124,58,237,.45),transparent 70%),radial-gradient(35% 45% at 60% 90%,rgba(255,107,74,.35),transparent 70%);pointer-events:none}
.hero.slim{padding:36px 0 34px}
.hero.slim::before{background:radial-gradient(45% 60% at 10% 20%,color-mix(in srgb,var(--c,#0d9488) 55%,transparent),transparent 70%),radial-gradient(35% 50% at 90% 40%,rgba(124,58,237,.35),transparent 70%)}
.hero .wrap{position:relative}
.hero h1{font:800 clamp(32px,6vw,58px)/1.05 "Bricolage Grotesque",Inter,sans-serif;letter-spacing:-.02em;margin:10px 0 14px;text-wrap:balance}
.hero.slim h1{font-size:clamp(28px,5vw,46px)}
.lede{font-size:clamp(16px,2.2vw,19px);color:rgba(255,255,255,.75);max-width:720px;margin:0 0 22px}
.kicker{font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--coral);margin:0}
.kicker.light{color:#ffe07a}
.byline{font-size:14px;color:rgba(255,255,255,.6);margin:0}

.search{display:flex;gap:8px;max-width:640px;background:rgba(255,255,255,.1);padding:6px;border-radius:16px;border:1px solid rgba(255,255,255,.18)}
.search input{flex:1;min-width:0;border:0;background:transparent;color:#fff;font:16px Inter,sans-serif;padding:10px 12px}
.search input::placeholder{color:rgba(255,255,255,.55)}
.search input:focus{outline:none}
.search button{border:0;border-radius:12px;background:linear-gradient(90deg,#ff6b4a,#ffd23f);color:var(--ink2);font:700 15px Inter,sans-serif;padding:0 18px;min-height:44px;cursor:pointer}
.search.big{margin-top:6px}

.chips{list-style:none;display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:22px 0 0}
.chips a{display:inline-block;text-decoration:none;color:#fff;font-weight:600;font-size:14px;padding:9px 14px;border-radius:999px;background:color-mix(in srgb,var(--c) 30%,transparent);border:1px solid color-mix(in srgb,var(--c) 60%,transparent)}
.chips.dark a{color:var(--ink)}

.crumbs ol{list-style:none;display:flex;flex-wrap:wrap;gap:6px;padding:0;margin:0 0 14px;font-size:13px;color:rgba(255,255,255,.6)}
.crumbs li+li::before{content:"›";margin-right:6px;opacity:.6}
.crumbs a{color:rgba(255,255,255,.8);text-decoration:none}

.pill{display:inline-block;font-size:12px;font-weight:700;text-decoration:none;padding:4px 10px;border-radius:999px;color:var(--c);background:color-mix(in srgb,var(--c) 14%,#fff)}
.hero .pill{background:color-mix(in srgb,var(--c) 30%,transparent);color:#fff}

.block{margin:44px 0}
.section{font:800 clamp(22px,3vw,30px)/1.15 "Bricolage Grotesque",Inter,sans-serif;letter-spacing:-.01em;margin:0 0 6px}
.section-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.section-head a{font-weight:700;font-size:14px;text-decoration:none}
.section-blurb{color:var(--muted);margin:0 0 18px}
.grid{list-style:none;padding:0;margin:18px 0 0;display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))}
.card a{display:flex;flex-direction:column;gap:8px;height:100%;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:20px;text-decoration:none;color:inherit;transition:transform .2s,box-shadow .2s}
.card a:hover{transform:translateY(-3px);box-shadow:0 14px 30px -18px rgba(11,16,32,.35)}
.card h3{font:700 19px/1.3 "Bricolage Grotesque",Inter,sans-serif;margin:4px 0 0}
.card p{margin:0;color:var(--muted);font-size:15px;flex:1}
.meta{font-size:13px;color:#8a8f9c}
.featured .card a{background:linear-gradient(160deg,#fff,#fff7f3);border-color:#ffd9cc}

.list{list-style:none;padding:0;margin:16px 0 0;border-top:1px solid var(--line)}
.list li{display:flex;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid var(--line)}
.list a{font-weight:600;text-decoration:none;color:var(--ink)}
.list span{color:#8a8f9c;font-size:13px;white-space:nowrap}

.article-grid{display:grid;gap:32px;padding-top:32px;padding-bottom:24px}
@media(min-width:1000px){.article-grid{grid-template-columns:240px minmax(0,760px);justify-content:center}.side{position:relative}.toc{position:sticky;top:90px}}
.toc{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;font-size:14px}
.toc strong{display:block;margin-bottom:6px}
.toc-mobile{padding:0 18px}
.toc-mobile summary{cursor:pointer;font-weight:700;padding:14px 0;list-style:none}
.toc-mobile summary::after{content:"▾";float:right;color:var(--coral)}
.toc-mobile[open] summary::after{content:"▴"}
.toc-mobile ol{padding-bottom:14px}
.toc-desktop{display:none}
@media(min-width:1000px){.toc-desktop{display:block}.toc-mobile{display:none}}
.toc ol{margin:0;padding-left:18px}
.toc li{margin:6px 0}
.toc a{text-decoration:none;color:var(--muted)}
.toc a:hover{color:var(--teal)}

.prose{min-width:0;font-size:17.5px;line-height:1.75}
.prose h2{font:800 clamp(24px,3.2vw,30px)/1.2 "Bricolage Grotesque",Inter,sans-serif;letter-spacing:-.01em;margin:2.1em 0 .5em;position:relative}
.prose h3{font:700 20px/1.3 "Bricolage Grotesque",Inter,sans-serif;margin:1.6em 0 .4em;position:relative}
.anchor{position:absolute;left:-1em;opacity:0;text-decoration:none;color:#b8bcc6}
.prose h2:hover .anchor,.prose h3:hover .anchor{opacity:1}
.prose p,.prose ul,.prose ol{margin:0 0 1.1em}
.prose li{margin:.35em 0}
.prose strong{color:var(--ink2)}
.prose blockquote{margin:1.4em 0;padding:14px 18px;border-left:4px solid var(--coral);background:#fff5f1;border-radius:0 12px 12px 0}
.prose blockquote p{margin:0}
.prose code{background:#f1eee6;padding:2px 6px;border-radius:6px;font-size:.9em}
.prose pre{background:var(--ink2);color:#e5e7eb;padding:16px;border-radius:14px;overflow-x:auto;font-size:14px;line-height:1.6}
.prose pre code{background:none;padding:0}
.table-wrap{overflow-x:auto;margin:1.2em 0;border:1px solid var(--line);border-radius:14px;background:#fff}
.prose table{border-collapse:collapse;width:100%;font-size:15px}
.prose th,.prose td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:top}
.prose th{background:#f6f3ec;font-weight:700;white-space:nowrap}
.prose tr:last-child td{border-bottom:0}
.prose hr{border:0;border-top:1px solid var(--line);margin:2em 0}

.faqs details{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:4px 18px;margin:10px 0}
.faqs summary{cursor:pointer;font-weight:700;padding:12px 0;list-style:none}
.faqs summary::-webkit-details-marker{display:none}
.faqs summary::after{content:"+";float:right;font-size:20px;line-height:1;color:var(--coral)}
.faqs details[open] summary::after{content:"−"}
.faqs details p{margin:0 0 14px;color:#374151}

.cta-box{margin:40px 0;padding:26px;border-radius:24px;color:#fff;background:linear-gradient(135deg,#0f766e,#7c3aed 55%,#ff6b4a)}
.cta-box.alt{background:linear-gradient(135deg,#060913,#1e1b4b 60%,#7c3aed)}
.cta-box .kicker{color:#ffe07a}
.cta-box h2{font:800 clamp(22px,3vw,28px)/1.2 "Bricolage Grotesque",Inter,sans-serif;margin:8px 0}
.cta-box p{margin:0 0 16px;color:rgba(255,255,255,.85)}
.btn{display:inline-block;background:#fff;color:var(--ink2);font-weight:800;text-decoration:none;padding:13px 20px;border-radius:14px;min-height:44px}
.disclaimer{font-size:13px;color:#8a8f9c;border-top:1px solid var(--line);padding-top:16px}
.related{padding-bottom:40px}

.results{list-style:none;padding:0;margin:0}
.results li a{display:block;padding:18px 0;border-bottom:1px solid var(--line);text-decoration:none;color:inherit}
.results h2{font:700 20px/1.3 "Bricolage Grotesque",Inter,sans-serif;margin:0 0 6px;color:var(--teal)}
.results p{margin:0 0 6px;color:#374151}
.empty{font-size:18px}

.glossary dt{font:700 19px/1.3 "Bricolage Grotesque",Inter,sans-serif;margin-top:22px}
.glossary dd{margin:6px 0 0;color:#374151}

footer.site{background:var(--ink2);color:rgba(255,255,255,.65);margin-top:40px;padding:40px 0 24px}
.foot{display:grid;gap:28px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.foot p{font-size:14px;max-width:320px}
footer.site nav{display:flex;flex-direction:column;gap:8px;font-size:14px}
footer.site nav strong{color:#fff}
footer.site a{color:rgba(255,255,255,.7);text-decoration:none}
footer.site a:hover{color:#fff}
.fine{font-size:12px;margin-top:28px;color:rgba(255,255,255,.45)}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
`;
