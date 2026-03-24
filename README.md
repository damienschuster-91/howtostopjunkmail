# HowToStopJunkMail.org

Static site deployed on Vercel at [howtostopjunkmail.org](https://howtostopjunkmail.org).

## Build

```
node build.js
```

Runs five steps:
- **A** — Updates the sidebar nav in every `guides/*/index.html` (reads from `guides.json`)
- **B** — Updates the Guides nav dropdown in every HTML file; injects hamburger CSS and favicon tags if missing
- **C** — Regenerates `sitemap.xml` from `guides.json`
- **D** — Regenerates `llms.txt` from `guides.json`
- **E** — Regenerates the guide card grid in `guides/index.html` from `guides.json`

Always run `node build.js` after adding or editing a guide.

## Adding a new guide

### Option 1 — Interactive scaffold

```
node build.js --new-guide
```

You will be prompted for each token value. For multi-line content (body, sidebar TOC, citations), enter a short placeholder and edit the file afterward.

### Option 2 — JSON data file

Create a `tokens.json` file:

```json
{
  "SLUG":              "my-new-guide",
  "TITLE":             "My New Guide",
  "META_DESCRIPTION":  "One sentence describing the guide.",
  "H1":                "My New <em>Guide</em>",
  "LEAD":              "Opening paragraph shown below the h1.",
  "DATA_BG":           "Guide",
  "SIDEBAR_TOC":       "<li><a href=\"#section-1\">Section One</a></li>",
  "MAIN_CONTENT":      "<p>Guide body goes here.</p>",
  "FOOTER_CITATIONS":  "<li>Source: <a href=\"https://example.com\">Example</a></li>"
}
```

Then run:

```
node build.js --new-guide --data=tokens.json
```

You can also pass JSON inline:

```
node build.js --new-guide --data='{"SLUG":"my-guide","TITLE":"My Guide"}'
```

### After scaffolding

1. Add the guide to `guides.json` (controls nav, sitemap, llms.txt, and the guides index card grid)
2. Edit `guides/[slug]/index.html` to fill in any remaining `{{TOKEN}}` placeholders
3. Run `node build.js`
4. Commit and push — Vercel deploys automatically

## Affiliate links

Affiliate redirects are managed in `vercel.json` under `redirects`. Use `/go/incogni`, `/go/deleteme`, `/go/optery` in guide HTML. To update a destination, edit only `vercel.json`.

## Template

The canonical guide template lives at `templates/guide-template.html`. It is a copy of `guides/can-you-recycle-junk-mail/index.html` with placeholder tokens for all page-specific content.
