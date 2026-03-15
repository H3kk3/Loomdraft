# Loomdraft

**A distraction-free writing app for novelists, built for your desktop.**

<!-- screenshot: Hero — full app window showing sidebar with document tree on the left and the editor with a chapter open on the right. A dark theme is active. -->

---

## What is Loomdraft?

Loomdraft is a local-first desktop writing application designed for novelists, screenwriters, and long-form creative writers. It combines a hierarchical project manager with a rich Markdown editor — giving you a place to draft your manuscript and organize your world-building notes side by side. Your data never leaves your machine.

---

## Features

### Project Organization

Structure your novel as a tree of documents. Separate your manuscript from planning materials, drag nodes to reorder, and let the sidebar keep everything at your fingertips.

- Hierarchical document tree with manuscript and planning sections
- 14 document types — from Parts and Chapters down to Characters, Locations, and Lore entries
- Drag-and-drop reordering with visual drop indicators
- Right-click context menus for adding, renaming, and deleting nodes
- Recent projects list for quick access

<!-- screenshot: Sidebar — expanded document tree showing manuscript section (Part → Chapters → Scenes) and planning section (Characters, Locations) with icons for each doc type. -->

### Rich Markdown Editor

Write in Markdown with a fast, modern editor powered by CodeMirror 6. Auto-save means you never lose work.

- Full Markdown syntax support with live formatting
- Auto-save every 10 seconds
- Real-time word and character count
- Undo/redo with smart grouping
- Soft word wrap toggle
- Collapsible heading outline for quick navigation
- Inline image rendering with optional size syntax (`![alt|600x400](path)`)
- Image import dialog (PNG, JPG, GIF, WebP, SVG, BMP)

<!-- screenshot: Editor — a chapter document open showing Markdown content with headings, emphasis, wiki-links, and an inline image. The toolbar is visible at the top with formatting buttons and toggles. -->

### Writing Modes

Tailor the editor to how you write best.

- **Typewriter Mode** — keeps your cursor line centered on screen as you type
- **Focus Mode** — dims every line except the one you're writing, reducing visual noise
- **Distraction-Free Mode** — hides the sidebar entirely for full-screen writing
- **Manuscript Mode** — centers your content in a narrower column for a book-page feel

<!-- screenshot: Focus Mode — editor with Focus Mode active, showing the current line in full brightness while surrounding lines are dimmed. -->

### Wiki Links & Cross-References

Connect your documents with `[[wiki-links]]`. Click to navigate, hover to preview, and track backlinks automatically.

- Type `[[Character Name]]` to create a cross-reference
- Click any wiki-link to jump to the linked document
- Hover to see a preview card with title, type, and opening text
- Resolved links styled in blue, unresolved in red
- Automatic backlink tracking via SQLite index

<!-- screenshot: Wiki-link hover — the editor showing a [[Character Name]] link with a hover preview card floating above it, displaying the character document's title, type badge, and first few lines of content. -->

### Spell Check

Real-time spell checking powered by nspell with a bundled English dictionary. Misspelled words are underlined directly in the editor. Code blocks, URLs, and wiki-links are skipped automatically.

### Full-Text Search

Find anything in your project instantly. Search across all documents with results ranked by relevance.

- Project-wide full-text search (Ctrl/Cmd + Shift + F)
- Powered by SQLite FTS5 for fast, ranked results
- Keyboard-navigable results with snippets
- Backlink graph tracking — see which documents reference each other

<!-- screenshot: Search panel — the search overlay open with a query typed, showing a list of matching documents with highlighted snippet text. -->

### Export

Compile your manuscript into a single file, ready to share or print.

- **Markdown** — clean plaintext export
- **HTML** — styled and self-contained with serif typography and table of contents
- **PDF** — print-ready with proper margins, serif fonts, and clickable TOC

Exports walk your manuscript tree in order, strip frontmatter and wiki-links, and generate heading levels based on document type (Part → H1, Chapter → H2, Scene → H3). A toast shows word count and section count when done.

<!-- screenshot: Export dialog — the export format picker showing Markdown, HTML, and PDF options with the project title. -->

### Version History

Every save creates a backup. Browse and restore any previous version of a document.

- Automatic backup on every save (up to 20 per document)
- Browse backups with timestamps, file sizes, and content previews
- One-click restore to roll back to any version
- Safety backup created before each restore

<!-- screenshot: Version history — the version history panel showing a list of backups with timestamps, sizes, and restore buttons. -->

### Themes

Seven built-in themes with full syntax highlighting — or import your own.

| Theme | Appearance | Vibe |
|-------|-----------|------|
| **Dark** | Dark | Purple accent on cool gray — the default |
| **Light** | Light | Indigo accent on clean white |
| **Midnight Jazz** | Dark | Deep navy with warm gold — late-night lounge |
| **Forest Canopy** | Dark | Moss greens with amber — dappled forest light |
| **Sunset Drift** | Dark | Warm tones with coral and peach — desert dusk |
| **Arctic Fog** | Light | Ice blue and slate — clean and calming |
| **Sepia Study** | Light | Cream and brown — leather-bound journal |

Each theme includes a complete color palette and syntax highlighting colors for headings, emphasis, links, code blocks, and more.

<!-- screenshot: Theme showcase — a grid or strip showing the same document rendered in all 7 built-in themes, demonstrating the visual variety. -->

### Custom Themes & Fonts

Import your own color themes as JSON files, or change the editor and UI fonts to anything you like.

**Theme JSON format:**

```json
{
  "name": "My Theme",
  "id": "my-theme",
  "appearance": "dark",
  "colors": {
    "bg": "#1a1a2e", "bg-2": "#16213e", "bg-3": "#0f3460",
    "border": "#2a3a5c", "text": "#e0e0e0", "text-dim": "#888",
    "accent": "#e94560", "accent-h": "#ff6b81",
    "drop-line": "#5c7aaa", "danger": "#e05252", "radius": "6px"
  },
  "syntax": {
    "heading": "#ff6b81", "emphasis": "#c8a0e0",
    "strong": "#e0e0e0", "link": "#5b9fd4",
    "code": "#8bc4a0", "quote": "#888",
    "list": "#e94560", "meta": "#5a5e7e"
  }
}
```

**Custom fonts:** Import `.ttf`, `.otf`, or `.woff2` files for the UI or editor font. Fonts are stored in the app data directory and persist across sessions.

<!-- screenshot: Theme picker — the theme picker popover open in the sidebar, showing the list of built-in themes with accent-color dots, a custom theme section, the import button, and font controls at the bottom. -->

---

## Document Types

Loomdraft separates your work into two categories:

| Manuscript | Planning |
|-----------|----------|
| Part | Character |
| Chapter | Location |
| Scene | Item |
| Interlude | Organization |
| Snippet | Event |
| | Lore |
| | Outline |
| | Research |
| | Note |

Manuscript documents compile into your exported file in tree order. Planning documents are for reference — character sheets, world-building notes, outlines — and are excluded from export.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Tauri 2](https://tauri.app/) |
| Frontend | React 19, TypeScript, Vite 7 |
| Editor | [CodeMirror 6](https://codemirror.net/) with Markdown |
| Backend | Rust |
| Database | SQLite with FTS5 (via rusqlite) |
| Spell Check | [nspell](https://github.com/wooorm/nspell) (Hunspell-compatible) |
| Markdown Processing | [comrak](https://github.com/kivikakk/comrak) |
| PDF Generation | [printpdf](https://github.com/fschutt/printpdf) |
| Icons | [Lucide](https://lucide.dev/) |

**Local-first.** Your projects are plain files on disk — Markdown documents with YAML frontmatter, organized in folders. No cloud, no accounts, no telemetry.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- Tauri 2 system dependencies ([see Tauri docs](https://tauri.app/start/prerequisites/))

### Development

```bash
git clone https://github.com/your-username/loomdraft.git
cd loomdraft
pnpm install

# Run the full app (frontend + Rust backend with hot reload)
pnpm tauri dev

# Run frontend only (without Tauri shell)
pnpm dev
```

### Build

```bash
# Build release binary
pnpm tauri build
```

---

## Project Structure (on disk)

When you create a Loomdraft project, it generates this structure:

```
MyNovel/
├── project.json                 # Project manifest (node tree, metadata)
├── manuscript/                  # Manuscript documents
│   ├── part_the-beginning.md
│   ├── chapter_a-dark-night.md
│   ├── scene_the-encounter.md
│   └── ...
├── kb/                          # Knowledge base (planning docs)
│   ├── character_hero.md
│   ├── location_castle.md
│   └── ...
├── assets/
│   └── images/                  # Imported images (UUID-prefixed)
└── .app/                        # App-internal data
    ├── index.sqlite             # Full-text search index
    └── backups/                 # Auto-backups per document
        └── {node-id}/
            └── 20260308T143012.123.md
```

Each document is a standard Markdown file with YAML frontmatter:

```markdown
---
id: a1b2c3d4
type: chapter
title: A Dark Night
created: 2026-03-08T14:30:12Z
modified: 2026-03-08T15:45:00Z
---

The rain hammered against the window as she reached for the door handle...
```

---

## License

<!-- Add your license here -->
