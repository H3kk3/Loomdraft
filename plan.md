# Loomdraft Landing Page — Hugo One-Pager Plan

## Overview

A single-page Hugo site deployed via GitHub Pages to showcase Loomdraft and provide download links. Personality-driven, minimal, and visually striking — matching Loomdraft's creative-writing DNA.

---

## Download Strategy

Hugo is a static site generator and **cannot host binary files for download directly**. Here are the approaches:

| Approach | Pros | Cons |
|----------|------|------|
| **GitHub Releases (Recommended)** | Free hosting, versioned, auto-generates per-platform assets, integrates with CI | Requires a GitHub release workflow |
| Direct links to `.dmg`/`.msi`/`.deb` on a CDN | Full control over URLs | Extra infra to maintain |
| GitHub LFS in the repo | Simple | Eats LFS quota fast, not designed for this |

**Recommendation:** Link download buttons directly to GitHub Releases URLs (`https://github.com/H3kk3/Loomdraft/releases/latest/download/...`). This is the standard approach for open-source desktop apps on GitHub Pages.

---

## Site Structure

```
docs/                          # Hugo site root (GitHub Pages can serve from /docs)
├── hugo.toml                  # Hugo config
├── content/
│   └── _index.md              # Single page content (copy lives here)
├── layouts/
│   ├── index.html             # Full landing page template
│   └── partials/
│       ├── head.html          # <head> with meta, OG tags, fonts
│       ├── hero.html          # Hero section
│       ├── features.html      # Feature grid
│       ├── themes.html        # Theme showcase
│       ├── download.html      # Download CTA with platform detection
│       └── footer.html        # Footer
├── static/
│   ├── css/
│   │   └── style.css          # All styles (single file, no framework)
│   ├── images/
│   │   ├── logo.png           # Loomdraft icon (copied from src-tauri/icons)
│   │   ├── hero-screenshot.png # App screenshot (placeholder — to be replaced)
│   │   └── og-image.png       # Open Graph social preview
│   └── js/
│       └── main.js            # Minimal JS: platform detection, smooth scroll
├── .github/
│   └── workflows/
│       └── hugo.yml           # GitHub Actions deploy workflow (optional, noted)
└── .nojekyll                  # Tell GitHub Pages not to use Jekyll
```

**Why `docs/`?** GitHub Pages can serve from the `docs/` folder on any branch — no separate `gh-pages` branch needed. Alternatively, a GitHub Action can build and deploy to `gh-pages`.

---

## Page Sections (Top → Bottom)

### 1. Hero
- Loomdraft logo (the quill/vortex icon) large and centered
- **Tagline**: *"Your stories deserve a home — not a cloud."*
- Subtext: A local-first writing app for novelists, screenwriters, and anyone who takes long-form seriously.
- **Primary CTA**: "Download for [detected OS]" button (large, gradient accent)
- Secondary link: "View on GitHub →"
- Subtle animated gradient background (CSS only, matching the purple-to-orange brand palette)

### 2. Feature Highlights (3-column grid → stacked on mobile)
Six cards with Lucide-style icons (inline SVG) and short punchy copy:

| Icon | Title | Copy |
|------|-------|------|
| Shield | **Local-first, always** | Your manuscripts live on your machine. No accounts, no cloud, no telemetry. Ever. |
| FolderTree | **Organize everything** | Chapters, scenes, characters, world-building — a full project tree at your fingertips. |
| Pen | **Distraction-free writing** | Typewriter mode, focus mode, manuscript mode. Pick your zen. |
| Palette | **7 gorgeous themes** | From Midnight Jazz to Arctic Fog. Or import your own. |
| Link | **Wiki links** | Connect your world. Link characters to scenes, hover to preview, trace backlinks. |
| FileDown | **Export anywhere** | Markdown, HTML, or PDF. Your work, your format. |

### 3. Theme Showcase
- Horizontal strip or carousel showing 3–4 theme previews (static screenshots or CSS mockups)
- Theme names below each: *Dark · Midnight Jazz · Forest Canopy · Sepia Study*
- Adds visual richness and shows the app's personality

### 4. Download Section (Final CTA)
- Repeat download CTA with all three platform buttons:
  - **macOS** (`.dmg`)
  - **Windows** (`.msi` / `.exe`)
  - **Linux** (`.deb` / `.AppImage`)
- Each links to the corresponding GitHub Release asset
- Version badge: "v0.1.0 — Free & open source"
- Small note: *"Built with Tauri, React, and Rust. Star us on GitHub."*

### 5. Footer
- "Made by Hekke" · GitHub link · License
- Minimal, one line

---

## Visual Design

### Color Palette (derived from Loomdraft's Dark theme)
- **Background**: `#1a1a2e` (deep navy) → `#16213e` gradient
- **Text**: `#e0e0e0` (light gray)
- **Accent primary**: `#7b6ef6` (purple, from Dark theme)
- **Accent secondary**: `#f0a050` (warm orange, from the logo quill)
- **Cards**: `rgba(255,255,255,0.05)` with subtle border
- **CTA buttons**: Linear gradient `#7b6ef6 → #f0a050`

### Typography
- **Headings**: Inter (or system-ui) — clean, modern
- **Body**: Same, lighter weight
- **No web font dependencies** needed if using system-ui stack (fastest load)

### Personality Touches
- Hero background: subtle CSS animated gradient (slow-moving purple ↔ orange)
- Feature cards: gentle hover lift with box-shadow transition
- Download button: gradient shimmer animation on hover
- Copy tone: confident, warm, slightly poetic (matches a writing app)

### Responsive
- Single breakpoint approach: grid collapses to single column below 768px
- Hero text scales down; download buttons stack vertically
- No hamburger menu needed (single page, no nav)

---

## Technical Notes

### Hugo Config (`hugo.toml`)
```toml
baseURL = "https://h3kk3.github.io/Loomdraft/"
languageCode = "en"
title = "Loomdraft — Local-First Writing App"
theme = ""  # No theme, custom layouts only

[params]
  description = "A distraction-free desktop writing app for novelists and screenwriters"
  version = "0.1.0"
  githubRepo = "https://github.com/H3kk3/Loomdraft"
  # Release download URLs (update per release)
  downloadMac = "https://github.com/H3kk3/Loomdraft/releases/latest/download/Loomdraft.dmg"
  downloadWin = "https://github.com/H3kk3/Loomdraft/releases/latest/download/Loomdraft.msi"
  downloadLinux = "https://github.com/H3kk3/Loomdraft/releases/latest/download/Loomdraft.deb"
```

### Platform Detection (`main.js`)
```js
// Auto-detect OS for primary download button
const ua = navigator.userAgent;
if (ua.includes('Mac')) showButton('mac');
else if (ua.includes('Win')) showButton('win');
else showButton('linux');
```

### GitHub Pages Deployment
Two options:
1. **Simple**: Build locally, commit `docs/public/` output, serve from `docs/` folder
2. **CI/CD**: GitHub Action runs `hugo --minify`, deploys to `gh-pages` branch

Option 2 is cleaner long-term but option 1 works immediately.

---

## Implementation Steps

1. Create `docs/` directory structure
2. Write `hugo.toml` config
3. Create `layouts/index.html` with all partials
4. Write `static/css/style.css` — full stylesheet
5. Write `static/js/main.js` — platform detection + smooth scroll
6. Copy logo from `src-tauri/icons/icon.png` to `static/images/`
7. Create a placeholder screenshot image (or note for user to add one)
8. Add OG meta tags for social sharing
9. Test with `hugo server`
10. Commit and push

---

## What's NOT Included (Keep It Simple)
- No analytics / tracking (consistent with Loomdraft's no-telemetry philosophy)
- No JavaScript framework
- No CSS framework (hand-written, ~200 lines)
- No cookie banners
- No blog section
- No changelog (link to GitHub releases instead)
