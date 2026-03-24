#!/usr/bin/env node
/**
 * build.js — HowToStopJunkMail.org build script
 *
 * Normal build (no flags):
 *   A) Updates sidebar nav in every guides/SLUG/index.html
 *   B) Updates the Guides nav dropdown in every HTML file (guides + root index.html)
 *   C) Regenerates sitemap.xml from guides.json
 *   D) Regenerates llms.txt from guides.json
 *   E) Regenerates the guide card grid in guides/index.html from guides.json
 *
 * New guide scaffold:
 *   node build.js --new-guide
 *   node build.js --new-guide --data='{"SLUG":"my-slug","TITLE":"My Title",...}'
 *   node build.js --new-guide --data=tokens.json
 */

const fs   = require('fs');
const path = require('path');

const ROOT        = __dirname;
const GUIDES_JSON = path.join(ROOT, 'guides.json');
const SITEMAP     = path.join(ROOT, 'sitemap.xml');

const { guides } = JSON.parse(fs.readFileSync(GUIDES_JSON, 'utf8'));

// ── helpers ──────────────────────────────────────────────────────────────────

function readFile(p)       { return fs.readFileSync(p, 'utf8'); }
function writeFile(p, txt) { fs.writeFileSync(p, txt, 'utf8'); }

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// ── A) SIDEBAR NAV ───────────────────────────────────────────────────────────

function buildSidebarNav(currentSlug) {
  const items = guides.map(g => {
    const href  = `/guides/${g.slug}/`;
    const label = g.title;
    if (g.slug === currentSlug) {
      return `        <li><a href="${href}" style="color:var(--forest);font-weight:600;">↳ ${label}</a></li>`;
    }
    return `        <li><a href="${href}">${label}</a></li>`;
  });
  return `<ul class="sidebar-nav">\n${items.join('\n')}\n      </ul>`;
}

function updateSidebar(filePath, slug) {
  let html = readFile(filePath);
  const OPEN  = '<ul class="sidebar-nav">';
  const CLOSE = '</ul>';
  const start = html.indexOf(OPEN);
  if (start === -1) return false;
  const end = html.indexOf(CLOSE, start) + CLOSE.length;
  html = html.slice(0, start) + buildSidebarNav(slug) + html.slice(end);
  writeFile(filePath, html);
  return true;
}

// ── FAVICON ──────────────────────────────────────────────────────────────────

const FAVICON_TAGS = `<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/favicon.svg">
<meta name="theme-color" content="#1a3a2a">`;

function ensureFavicon(filePath) {
  let html = readFile(filePath);
  if (html.includes('favicon.svg')) return false;
  const updated = html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n' + FAVICON_TAGS);
  if (updated === html) return false;
  writeFile(filePath, updated);
  return true;
}

// ── NAV HAMBURGER CSS ────────────────────────────────────────────────────────
// Injected into every file that is missing it whenever the nav is rebuilt.

const NAV_HAMBURGER_CSS = `/* MOBILE HAMBURGER */
.nav-hamburger {
  display: none;
  background: none;
  border: none;
  color: var(--cream);
  font-size: 22px;
  cursor: pointer;
  padding: 0 4px;
}
@media (max-width: 768px) {
  .nav-hamburger { display: block; }
}`;

function ensureHamburgerCSS(filePath) {
  let html = readFile(filePath);
  if (html.includes('.nav-hamburger')) return false; // already present
  // Insert after .nav-logo small line
  const updated = html.replace(
    /(\.nav-logo small \{[^\n]+\n)/,
    '$1' + NAV_HAMBURGER_CSS + '\n'
  );
  if (updated === html) return false;
  writeFile(filePath, updated);
  return true;
}

// ── B) NAV DROPDOWN ──────────────────────────────────────────────────────────

/**
 * The guides dropdown is identified by the label "Opt-Out Guides".
 * We replace only the guide <a> links between that label and the next
 * <hr class="nav-dropdown-divider"> (or </div> closing the dropdown).
 * Tools items, dividers, and the "View All Guides" link are untouched.
 */
function buildNavDropdownLinks() {
  return guides
    .map(g => `        <a href="/guides/${g.slug}/">${g.title}</a>`)
    .join('\n');
}

const NAV_LABEL  = '<div class="nav-dropdown-label">Opt-Out Guides</div>';
const NAV_DIVIDER = '        <hr class="nav-dropdown-divider">';

function updateNavDropdown(filePath) {
  let html = readFile(filePath);
  let changed = false;

  // A file may have one or two nav blocks (homepage had a duplicate; now fixed,
  // but we handle multiple occurrences defensively with a loop).
  let searchFrom = 0;
  while (true) {
    const labelIdx = html.indexOf(NAV_LABEL, searchFrom);
    if (labelIdx === -1) break;

    // Find the first <a href="/guides/ after the label
    const firstLinkIdx = html.indexOf('\n        <a href="/guides/', labelIdx);
    if (firstLinkIdx === -1) break;

    // Find the <hr> that ends the guide links section
    const dividerIdx = html.indexOf(NAV_DIVIDER, labelIdx);
    if (dividerIdx === -1) break;

    const newLinks = '\n' + buildNavDropdownLinks();
    html = html.slice(0, firstLinkIdx) + newLinks + '\n' + html.slice(dividerIdx);
    changed = true;

    // Advance past this dropdown so we don't loop on modified content
    searchFrom = html.indexOf(NAV_LABEL, labelIdx) + 1;
    if (searchFrom <= labelIdx) break; // no more occurrences
  }

  if (changed) writeFile(filePath, html);
  return changed;
}

// ── C) SITEMAP ───────────────────────────────────────────────────────────────

function regenerateSitemap() {
  const date = today();

  // Preserve the static preamble (homepage + tools + guides index) from
  // the existing sitemap and only regenerate the <!-- Guides --> section.
  const existing = readFile(SITEMAP);

  // Build the guides block fresh
  const guideEntries = guides.map(g => `  <url>
    <loc>https://howtostopjunkmail.org/guides/${g.slug}/</loc>
    <lastmod>${date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n');

  // Replace everything from <!-- Guides --> to </urlset>
  const guidesComment = '  <!-- Guides -->';
  const endTag        = '</urlset>';
  const commentIdx    = existing.indexOf(guidesComment);
  if (commentIdx === -1) {
    console.error('sitemap.xml: could not find <!-- Guides --> marker');
    return;
  }
  const newSitemap =
    existing.slice(0, commentIdx) +
    guidesComment + '\n' +
    guideEntries + '\n\n' +
    endTag + '\n';

  writeFile(SITEMAP, newSitemap);
}

// ── D) LLMS.TXT ──────────────────────────────────────────────────────────────

function regenerateLlms() {
  const llmsPath = path.join(ROOT, 'llms.txt');
  const existing = readFile(llmsPath);

  const guideLines = guides
    .map(g => `- [${g.title}](https://howtostopjunkmail.org/guides/${g.slug}/) — ${g.desc}`)
    .join('\n');

  // Replace everything between "## Guides\n\n" and "\n\n## Key Facts"
  const updated = existing.replace(
    /(## Guides\n\n)[\s\S]*?(\n\n## Key Facts)/,
    `$1${guideLines}$2`
  );

  if (!/(## Guides\n\n)[\s\S]*?(\n\n## Key Facts)/.test(existing)) {
    console.error('   ERROR: could not find ## Guides / ## Key Facts markers in llms.txt');
    return false;
  }
  if (updated !== existing) writeFile(llmsPath, updated);
  return true;
}

// ── E) GUIDES INDEX ──────────────────────────────────────────────────────────

const SECTION_LABELS = {
  featured:   'Core Guides',
  situations: 'By Situation',
  reference:  'Reference',
};

function buildGuideCard(g, cardIndex) {
  const isDark    = cardIndex % 4 === 0;
  const cardClass = isDark ? 'guide-card-dark' : 'guide-card-light';
  const tag       = g.tag ? `\n          <div class="guide-card-tag">${g.tag}</div>` : '';
  return (
    `        <a href="/guides/${g.slug}/" class="guide-card ${cardClass}">${tag}\n` +
    `          <div class="guide-card-title">${g.title}</div>\n` +
    `          <p class="guide-card-desc">${g.desc}</p>\n` +
    `          <div class="guide-card-read">Read guide →</div>\n` +
    `        </a>`
  );
}

function buildGuidesIndex() {
  const indexPath = path.join(ROOT, 'guides', 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.error('   ERROR: guides/index.html not found');
    return false;
  }

  let html = readFile(indexPath);
  const OPEN_MARKER  = '<!-- GUIDES_START -->';
  const CLOSE_MARKER = '<!-- GUIDES_END -->';
  const startIdx = html.indexOf(OPEN_MARKER);
  const endIdx   = html.indexOf(CLOSE_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    console.error('   ERROR: GUIDES_START/END markers not found in guides/index.html');
    return false;
  }

  // Group guides by section, preserving JSON order within each section
  const groups = {};
  for (const key of Object.keys(SECTION_LABELS)) groups[key] = [];
  for (const g of guides) {
    const sect = g.section && groups[g.section] ? g.section : 'reference';
    groups[sect].push(g);
  }

  let cardIndex = 0;
  let inner = '\n';
  for (const [sectKey, sectGuides] of Object.entries(groups)) {
    if (sectGuides.length === 0) continue;
    inner += `      <div class="guide-section-label">${SECTION_LABELS[sectKey]}</div>\n`;
    inner += `      <div class="guide-card-grid">\n`;
    for (const g of sectGuides) {
      inner += buildGuideCard(g, cardIndex) + '\n';
      cardIndex++;
    }
    inner += `      </div>\n`;
  }

  html = html.slice(0, startIdx + OPEN_MARKER.length) +
         inner +
         '    ' + html.slice(endIdx);
  writeFile(indexPath, html);
  return true;
}

// ── F) NEW GUIDE SCAFFOLD ─────────────────────────────────────────────────────

const GUIDE_TOKENS = [
  'SLUG',
  'TITLE',
  'META_DESCRIPTION',
  'H1',
  'LEAD',
  'DATA_BG',
  'SIDEBAR_TOC',
  'MAIN_CONTENT',
  'FOOTER_CITATIONS',
];

async function createNewGuide() {
  const templatePath = path.join(ROOT, 'templates', 'guide-template.html');
  if (!fs.existsSync(templatePath)) {
    console.error('ERROR: templates/guide-template.html not found');
    process.exit(1);
  }

  // Resolve token values from --data arg or interactive prompts
  const dataArg = process.argv.find(a => a.startsWith('--data='));
  let tokens = {};

  if (dataArg) {
    const val = dataArg.slice('--data='.length);
    try {
      tokens = JSON.parse(val);
    } catch {
      if (fs.existsSync(val)) {
        tokens = JSON.parse(fs.readFileSync(val, 'utf8'));
      } else {
        console.error('--data value is neither valid JSON nor a readable file path');
        process.exit(1);
      }
    }
  } else {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = q => new Promise(resolve => rl.question(q, resolve));

    console.log('=== New Guide Creator ===\n');
    console.log('Tip: for multi-line tokens (MAIN_CONTENT, SIDEBAR_TOC, FOOTER_CITATIONS)');
    console.log('enter a short placeholder here and edit the file afterward, or use:');
    console.log('  node build.js --new-guide --data=tokens.json\n');

    for (const token of GUIDE_TOKENS) {
      tokens[token] = await ask(`${token}: `);
    }
    rl.close();
    console.log('');
  }

  if (!tokens.SLUG) {
    console.error('ERROR: SLUG is required');
    process.exit(1);
  }

  // Replace all tokens in the template
  let html = readFile(templatePath);
  for (const [key, val] of Object.entries(tokens)) {
    html = html.split('{{' + key + '}}').join(val || ('{{' + key + '}}'));
  }

  // Write to guides/[slug]/index.html
  const outDir = path.join(ROOT, 'guides', tokens.SLUG);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'index.html');
  writeFile(outPath, html);

  console.log(`OK  : Created ${path.relative(ROOT, outPath)}`);
  console.log('\nNext steps:');
  console.log(`  1. Add an entry for "${tokens.SLUG}" to guides.json`);
  console.log('  2. Edit the file to fill in any remaining {{TOKEN}} placeholders');
  console.log('  3. Run: node build.js');
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

if (process.argv.includes('--new-guide')) {
  createNewGuide()
    .then(() => process.exit(0))
    .catch(e => { console.error(e.message); process.exit(1); });
} else {

console.log('=== build.js ===\n');

// A) Sidebar nav — all guide pages
const guideFiles = guides.map(g =>
  path.join(ROOT, 'guides', g.slug, 'index.html')
);
console.log('A) Sidebar nav:');
for (const [i, g] of guides.entries()) {
  const filePath = guideFiles[i];
  if (!fs.existsSync(filePath)) {
    console.log(`   SKIP (not found): ${g.slug}`);
    continue;
  }
  const ok = updateSidebar(filePath, g.slug);
  console.log(`   ${ok ? 'OK  ' : 'SKIP'}: ${g.slug}`);
}

// B) Nav dropdown + hamburger CSS — guides + root index
const navFiles = [
  path.join(ROOT, 'index.html'),
  path.join(ROOT, 'guides', 'index.html'),
  ...guideFiles,
];
console.log('\nB) Nav dropdown:');
for (const filePath of navFiles) {
  if (!fs.existsSync(filePath)) {
    console.log(`   SKIP (not found): ${filePath}`);
    continue;
  }
  const label = path.relative(ROOT, filePath);
  const ok = updateNavDropdown(filePath);
  ensureHamburgerCSS(filePath);
  ensureFavicon(filePath);
  console.log(`   ${ok ? 'OK  ' : 'SKIP'}: ${label}`);
}

// C) Sitemap
console.log('\nC) Sitemap:');
regenerateSitemap();
console.log(`   OK  : sitemap.xml (lastmod ${today()})`);

// D) llms.txt
console.log('\nD) llms.txt:');
const llmsOk = regenerateLlms();
console.log(`   ${llmsOk ? 'OK  ' : 'FAIL'}: llms.txt`);

// E) Guides index card grid
console.log('\nE) Guides index:');
const indexOk = buildGuidesIndex();
console.log(`   ${indexOk ? 'OK  ' : 'FAIL'}: guides/index.html`);

console.log('\nDone.');

} // end else (normal build)
