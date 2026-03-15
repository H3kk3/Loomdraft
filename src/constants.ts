// ── Timing ───────────────────────────────────────────────────────────────────

/** Interval between automatic saves (ms). */
export const AUTOSAVE_INTERVAL_MS = 10_000;

/** Debounce delay for project-wide search input (ms). */
export const SEARCH_DEBOUNCE_MS = 200;

/** Toast auto-dismiss duration (ms). */
export const TOAST_DURATION_MS = 4_000;

/** CodeMirror undo-group delay — keypresses within this window merge into one undo step (ms). */
export const UNDO_GROUP_DELAY_MS = 800;

// ── Drag & drop ──────────────────────────────────────────────────────────────

/** Minimum pointer movement (px) before a tree drag activates. */
export const DRAG_THRESHOLD_PX = 5;

// ── Sidebar tree ─────────────────────────────────────────────────────────────

/** Per-depth left indentation for tree nodes (px). */
export const TREE_INDENT_PX = 16;

// ── Caches & limits ──────────────────────────────────────────────────────────

/** Max entries in the image data-URL cache before LRU eviction. */
export const IMAGE_CACHE_MAX_ENTRIES = 100;

/** Max characters shown in a link-preview snippet. */
export const LINK_PREVIEW_SNIPPET_MAX_CHARS = 300;

/** Maximum recent projects shown on the Welcome screen. */
export const MAX_RECENT_PROJECTS = 5;
