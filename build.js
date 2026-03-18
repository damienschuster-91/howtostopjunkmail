#!/usr/bin/env node
/**
 * build.js — HowToStopJunkMail.org build script
 *
 * A) Updates sidebar nav in every guides/SLUG/index.html
 * B) Updates the Guides nav dropdown in every HTML file (guides + root index.html)
 * C) Regenerates sitemap.xml from guides.json
 * D) Regenerates the guide card grid in guides/index.html from guides.json
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

// ── D) GUIDES INDEX ──────────────────────────────────────────────────────────

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

// ── MAIN ─────────────────────────────────────────────────────────────────────

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
  console.log(`   ${ok ? 'OK  ' : 'SKIP'}: ${label}`);
}

// C) Sitemap
console.log('\nC) Sitemap:');
regenerateSitemap();
console.log(`   OK  : sitemap.xml (lastmod ${today()})`);

// D) Guides index card grid
console.log('\nD) Guides index:');
const indexOk = buildGuidesIndex();
console.log(`   ${indexOk ? 'OK  ' : 'FAIL'}: guides/index.html`);

console.log('\nDone.');
