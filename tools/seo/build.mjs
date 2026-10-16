// Makes jasonoconnell.com readable by search engines and AI answer engines
// (Google, Brave, which Claude's web search uses, ChatGPT search, Perplexity).
//
// The home page builds its project list with JavaScript, so crawlers that do
// not run scripts see almost nothing. This script reads the same project list
// (const P in index.html) and writes plain HTML that needs no script:
//   p/<key>/index.html   one page per project, answer first, with structured data
//   projects/index.html  every project as a plain list
//   sitemap.xml, robots.txt, llms.txt
//   index.html           canonical link, structured data, and a static list
//                        inside <main> that the page's own script replaces
//
// Run it after any change to the project list:  node tools/seo/build.mjs
// It only rewrites what sits between its own markers, so running it twice is safe.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const SITE = "https://jasonoconnell.com";
const AUTHOR = "Jason O'Connell";
const HANDLE = "hurtz2k";
const SAME_AS = [
  "https://github.com/hurtz",
  "https://www.reddit.com/user/hurtz2k/",
  "https://www.linkedin.com/in/jloconne/",
];
const TODAY = new Date().toISOString().slice(0, 10);

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const write = (f, s) => {
  const full = path.join(ROOT, f);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, s);
};
const exists = (f) => fs.existsSync(path.join(ROOT, f));

// ---------- read the project list out of index.html ----------
let index = read("index.html");
const start = index.indexOf("const YT=");
const pStart = index.indexOf("const P=[", start);
const pEnd = index.indexOf("\n];", pStart);
if (start < 0 || pStart < 0 || pEnd < 0) throw new Error("Could not find the project list in index.html");
const code = index.slice(start, pEnd + 3);
const box = {};
vm.runInNewContext(code + "\nthis.out={YT,TAG,SEC,PLAY,P,RANK,FAV};", box);
const { TAG, SEC, PLAY, P, RANK, FAV } = box.out;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const abs = (u) => (/^https?:/i.test(u) ? u : SITE + "/" + u.replace(/^\/+/, ""));
const rel = (u) => (/^https?:/i.test(u) ? u : "/" + u.replace(/^\/+/, ""));

const projects = P.map(([key, name, sec, tags, line, links]) => {
  const tagNames = [...(tags || "")].map((t) => TAG[t] && TAG[t][0]).filter(Boolean);
  const playUrl = PLAY[key] || null;
  const hasPlayLink = (links || []).some(([label]) => /^play|browser demo/i.test(label));
  const playable = Boolean(playUrl) || hasPlayLink;
  const img = exists(`img/${key}.jpg`) ? `img/${key}.jpg` : null;
  return { key, name, sec, tags: tags || "", tagNames, line, links: links || [], playUrl, playable, img };
});

// A plain words label for what each thing is. Used in the first sentence.
function kind(p) {
  const t = p.tags;
  if (p.sec === 0) {
    if (t.includes("I")) return "iPhone game";
    return p.playable ? "free browser game" : "game";
  }
  if (p.sec === 1) return p.playable ? "free Halloween browser game" : "Halloween game";
  if (p.sec === 2) return p.playable ? "free file system game" : "file system game";
  if (p.sec === 3) {
    if (t.includes("T")) return "retro teardown";
    if (t.includes("E")) return "retro emulation project";
    if (t.includes("R")) return "retro remake";
    return "retro project";
  }
  if (p.sec === 4) return t.includes("H") ? "hardware build" : "homemade tool";
  if (p.sec === 5) return "video";
  return "weird web project";
}
const article = (w) => (/^[aeiou]/i.test(w) ? "an" : "a");

// Pages only for projects with enough real substance; the rest live on the list page.
const worthAPage = (p) => p.playable || p.links.length > 0 || p.line.length >= 70;

function schemaFor(p, url) {
  const author = { "@type": "Person", name: AUTHOR, alternateName: HANDLE, url: SITE + "/", sameAs: SAME_AS };
  const base = {
    "@context": "https://schema.org",
    name: p.name,
    description: p.line,
    url,
    author,
    creator: author,
    ...(p.img ? { image: SITE + "/" + p.img } : {}),
    ...(p.tagNames.length ? { keywords: p.tagNames.join(", ") } : {}),
  };
  if (p.sec <= 2) {
    return {
      ...base,
      "@type": "VideoGame",
      gamePlatform: p.tags.includes("I") ? ["iOS", "Web browser"] : ["Web browser"],
      ...(p.tags.includes("M") ? { playMode: "MultiPlayer" } : {}),
      ...(p.playable ? { isAccessibleForFree: true } : {}),
    };
  }
  if (p.sec === 4 && !p.tags.includes("H")) return { ...base, "@type": "SoftwareApplication", applicationCategory: "UtilitiesApplication" };
  return { ...base, "@type": "CreativeWork" };
}

const CSS = `:root{--sky:#0a2f5c;--ink:#f3f6fb;--mute:#a8c0e2;--orange:#ff8a1f;--gold:#ffd23c;--line:rgba(255,255,255,.14);color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#061d3b 0,var(--sky) 320px);color:var(--ink);font:16px/1.55 "IBM Plex Sans",system-ui,sans-serif}
.w{max-width:760px;margin:0 auto;padding:20px 16px 60px}a{color:var(--gold)}nav.crumb{font-size:14px;color:var(--mute)}nav.crumb a{color:var(--mute)}
h1{font:clamp(32px,6vw,52px)/1 "Bungee",Impact,sans-serif;margin:18px 0 10px}.lead{font-size:18px}.lead b{color:var(--gold);font-weight:600}
img.shot{width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;border:2px solid var(--ink);display:block;margin:18px 0}
.btns{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}.btn{display:inline-block;background:var(--orange);color:#04101f;font-weight:600;text-decoration:none;padding:10px 16px;border:2px solid var(--ink)}
.btn.alt{background:transparent;color:var(--ink)}dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;border-top:1px solid var(--line);padding-top:14px}
dt{color:var(--mute)}dd{margin:0}h2{font-size:18px;margin:30px 0 8px}ul.more{padding-left:18px}ul.more li{margin:4px 0}
footer{margin-top:40px;border-top:1px solid var(--line);padding-top:14px;color:var(--mute);font-size:14px}
.list h2{font:22px "Bungee",Impact,sans-serif;margin:34px 0 6px}.list p.s{color:var(--mute);margin:0 0 8px}.list ul{padding-left:18px}.list li{margin:6px 0}`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bungee&family=IBM+Plex+Sans:wght@400;600&display=swap">`;

function page({ title, desc, url, img, body, schema }) {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="${esc(AUTHOR)} (${HANDLE})">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img || SITE + "/img/og.jpg"}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/img/plain-weird-logo.png">
${FONTS}
<style>${CSS}</style>
${schema ? `<script type="application/ld+json">${JSON.stringify(schema)}</script>` : ""}
<body><div class="w">
${body}
<footer>Made by <a href="/">${esc(AUTHOR)}</a> (${HANDLE}) in Des Moines, Iowa, building at night with AI as the crew. <a href="/projects/">Every project</a> · <a href="https://github.com/hurtz">GitHub</a> · <a href="https://www.reddit.com/user/hurtz2k/">Reddit</a></footer>
</div></body>
</html>
`;
}

// ---------- one page per project ----------
const paged = projects.filter(worthAPage);
const pagedKeys = new Set(paged.map((p) => p.key));
for (const p of paged) {
  const url = `${SITE}/p/${p.key}/`;
  const k = kind(p);
  const lead = `<b>${esc(p.name)}</b> is ${article(k)} ${esc(k)} made by ${esc(AUTHOR)} (${HANDLE}) in Des Moines, Iowa.`;
  const buttons = [];
  if (p.playUrl) buttons.push(`<a class="btn" href="${rel(p.playUrl)}">${p.sec === 5 ? "Watch it" : p.sec <= 2 ? "Play it free" : "Open it"}</a>`);
  for (const [label, href] of p.links) buttons.push(`<a class="btn${buttons.length ? " alt" : ""}" href="${esc(rel(href))}">${esc(label)}</a>`);
  const where = p.playUrl
    ? p.sec <= 2 ? "In your browser, free, right on this site" : "Right on this site"
    : p.links.length ? p.links.map(([l]) => l).join(", ") : "Shown on the Plain Weird home page";
  const siblings = projects
    .filter((q) => q.sec === p.sec && q.key !== p.key && pagedKeys.has(q.key))
    .slice(0, 5)
    .map((q) => `<li><a href="/p/${q.key}/">${esc(q.name)}</a>: ${esc(q.line)}</li>`)
    .join("");
  const body = `<nav class="crumb"><a href="/">Plain Weird</a> / <a href="/projects/#s${p.sec}">${esc(SEC[p.sec][0])}</a></nav>
<h1>${esc(p.name)}</h1>
<p class="lead">${lead}</p>
<p>${esc(p.line)}</p>
${p.img ? `<img class="shot" src="/${p.img}" alt="${esc(p.name)}, a screen from the ${esc(k)}" width="1280" height="720">` : ""}
${buttons.length ? `<div class="btns">${buttons.join("")}</div>` : ""}
<dl>
<dt>What it is</dt><dd>${esc(k[0].toUpperCase() + k.slice(1))}</dd>
<dt>Made by</dt><dd>${esc(AUTHOR)} (${HANDLE}), Des Moines, Iowa</dd>
${p.tagNames.length ? `<dt>Tags</dt><dd>${esc(p.tagNames.join(", "))}</dd>` : ""}
<dt>Where</dt><dd>${esc(where)}</dd>
<dt>Part of</dt><dd><a href="/projects/#s${p.sec}">${esc(SEC[p.sec][0])}</a> on Plain Weird</dd>
</dl>
${siblings ? `<h2>More like this</h2><ul class="more">${siblings}</ul>` : ""}`;
  const desc = `${p.name}: ${p.line}`.slice(0, 300);
  write(
    `p/${p.key}/index.html`,
    page({
      title: `${p.name}: ${k[0].toUpperCase() + k.slice(1)} by ${AUTHOR}`,
      desc,
      url,
      img: p.img ? SITE + "/" + p.img : null,
      body,
      schema: schemaFor(p, url),
    })
  );
}

// ---------- the plain list of everything ----------
const ORDER_FOR_LIST = [0, 4, 5, 3, 1, 2, 6];
const itemHTML = (p) => {
  const href = pagedKeys.has(p.key) ? `/p/${p.key}/` : p.playUrl ? rel(p.playUrl) : p.links[0] ? rel(p.links[0][1]) : null;
  const nm = href ? `<a href="${esc(href)}">${esc(p.name)}</a>` : `<b>${esc(p.name)}</b>`;
  return `<li>${nm}: ${esc(p.line)}</li>`;
};
const listSections = ORDER_FOR_LIST.map((s) => {
  const items = projects.filter((p) => p.sec === s);
  if (s === 0) items.sort((a, b) => (RANK.indexOf(a.key) + 999) % 999 - (RANK.indexOf(b.key) + 999) % 999);
  if (!items.length) return "";
  return `<h2 id="s${s}">${esc(SEC[s][0])}</h2>${SEC[s][1] ? `<p class="s">${esc(SEC[s][1])}</p>` : ""}<ul>${items.map(itemHTML).join("")}</ul>`;
}).join("\n");

write(
  "projects/index.html",
  page({
    title: `Every Plain Weird project, by ${AUTHOR}`,
    desc: `All ${projects.length} games, retro teardowns, tools and videos made by ${AUTHOR} (${HANDLE}) in Des Moines, Iowa, in one plain list.`,
    url: `${SITE}/projects/`,
    body: `<nav class="crumb"><a href="/">Plain Weird</a></nav>
<h1>Every project</h1>
<p class="lead">Everything ${esc(AUTHOR)} (${HANDLE}) has made for Plain Weird: ${projects.length} games, retro teardowns, tools, videos and weird web things. Most of the games play free in your browser.</p>
<div class="list">${listSections}</div>`,
    schema: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Every Plain Weird project",
      url: `${SITE}/projects/`,
      author: { "@type": "Person", name: AUTHOR, alternateName: HANDLE, url: SITE + "/", sameAs: SAME_AS },
    },
  })
);

// ---------- sitemap, robots, llms.txt ----------
const urls = [`${SITE}/`, `${SITE}/projects/`, ...paged.map((p) => `${SITE}/p/${p.key}/`)];
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${TODAY}</lastmod></url>`).join("\n")}
</urlset>
`
);

write(
  "robots.txt",
  `# Everyone is welcome, including AI search and answer engines:
# OAI-SearchBot and ChatGPT-User (ChatGPT), Claude-SearchBot and Claude-User (Claude),
# PerplexityBot (Perplexity), Googlebot (Google, and Brave, which follows the same rules).
User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`
);

const llmsSections = ORDER_FOR_LIST.map((s) => {
  const items = projects.filter((p) => p.sec === s);
  if (!items.length) return "";
  return `## ${SEC[s][0]}\n\n${items
    .map((p) => {
      const href = pagedKeys.has(p.key) ? `${SITE}/p/${p.key}/` : p.playUrl ? abs(p.playUrl) : p.links[0] ? abs(p.links[0][1]) : null;
      return href ? `- [${p.name}](${href}): ${p.line}` : `- ${p.name}: ${p.line}`;
    })
    .join("\n")}\n`;
}).join("\n");
write(
  "llms.txt",
  `# Plain Weird by ${AUTHOR}

> Games, retro teardowns, tools and weird machines made by ${AUTHOR} (${HANDLE}) in Des Moines, Iowa, building at night with AI as the crew. Most of the games play free in a web browser at ${SITE}.

His favorites: ${FAV.map((k) => (projects.find((p) => p.key === k) || {}).name).filter(Boolean).join(", ")}.

${llmsSections}
## Elsewhere

- [GitHub](https://github.com/hurtz)
- [Reddit u/hurtz2k](https://www.reddit.com/user/hurtz2k/)
`
);

// ---------- patch the home page (between markers only) ----------
function between(src, open, close, inner, anchor, placeAfter = true) {
  const a = src.indexOf(open);
  const b = src.indexOf(close);
  if (a >= 0 && b > a) return src.slice(0, a) + open + inner + close + src.slice(b + close.length);
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error("anchor not found: " + anchor);
  const at = placeAfter ? i + anchor.length : i;
  return src.slice(0, at) + open + inner + close + src.slice(at);
}

const homeSchema = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", name: "Plain Weird", url: SITE + "/", author: { "@id": SITE + "/#jason" } },
    { "@type": "Person", "@id": SITE + "/#jason", name: AUTHOR, alternateName: HANDLE, url: SITE + "/", homeLocation: "Des Moines, Iowa", sameAs: SAME_AS },
    {
      "@type": "ItemList",
      name: "Plain Weird projects",
      itemListElement: paged.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/p/${p.key}/`, name: p.name })),
    },
  ],
};
index = between(
  index,
  "<!--seo:head-->",
  "<!--/seo:head-->",
  `\n<link rel="canonical" href="${SITE}/">\n<script type="application/ld+json">${JSON.stringify(homeSchema)}</script>\n`,
  `<meta name="twitter:card" content="summary_large_image">`
);

// Static list inside <main>; the page's own script replaces it with the full layout.
const staticList = `\n<div class="seo-static"><h2>Every project</h2><p>${esc(AUTHOR)} (${HANDLE}) makes games, retro teardowns and weird machines in Des Moines, Iowa. <a href="/projects/">See them all as a plain list.</a></p>${listSections}</div>\n`;
index = between(index, "<!--seo:list-->", "<!--/seo:list-->", staticList, `<main id="main">`);

// One small link in the footer so the list page is reachable from every visit.
const footer = (index.match(/<footer>[\s\S]*?<\/footer>/) || [""])[0];
if (!footer.includes(`href="/projects/"`)) {
  index = index.replace(/(<footer>[\s\S]*?)(<\/footer>)/, `$1 <a href="/projects/">Every project as a plain list</a>.$2`);
}
fs.writeFileSync(path.join(ROOT, "index.html"), index);

console.log(`project pages: ${paged.length} of ${projects.length}`);
console.log(`list only: ${projects.filter((p) => !pagedKeys.has(p.key)).map((p) => p.key).join(", ")}`);
console.log(`sitemap urls: ${urls.length}`);
