// ── Theme System Types ───────────────────────────────────────────────────────

/** Color variables that map 1:1 to CSS custom properties (--bg, --bg-2, etc.) */
export interface ThemeColors {
  bg: string;
  "bg-2": string;
  "bg-3": string;
  border: string;
  text: string;
  "text-dim": string;
  accent: string;
  "accent-h": string;
  "drop-line": string;
  danger: string;
  radius: string;
}

/** Optional syntax highlighting colors for CodeMirror HighlightStyle */
export interface ThemeSyntaxColors {
  heading?: string;
  emphasis?: string;
  strong?: string;
  link?: string;
  code?: string;
  quote?: string;
  list?: string;
  meta?: string;
}

/** Font overrides — null means "use system default" */
export interface ThemeFonts {
  ui?: string | null;
  mono?: string | null;
}

/** Full theme definition — used for both built-in and custom themes */
export interface ThemeDefinition {
  name: string;
  id: string;
  author: string;
  version: number;
  appearance: "dark" | "light";
  colors: ThemeColors;
  syntax?: ThemeSyntaxColors;
  fonts?: ThemeFonts;
}

/** Lightweight metadata for listing themes without loading full color data */
export interface ThemeMetadata {
  name: string;
  id: string;
  appearance: "dark" | "light";
  author: string;
  isBuiltin: boolean;
}

/** Info about an imported font file */
export interface FontInfo {
  filename: string;
  family_name: string;
  format: string; // "truetype" | "opentype" | "woff2"
}

/** Persisted font preference in localStorage */
export interface FontPreference {
  ui?: { filename: string; familyName: string } | null;
  mono?: { filename: string; familyName: string } | null;
}

/** All CSS variable keys that a theme can set */
export const THEME_COLOR_KEYS: (keyof ThemeColors)[] = [
  "bg",
  "bg-2",
  "bg-3",
  "border",
  "text",
  "text-dim",
  "accent",
  "accent-h",
  "drop-line",
  "danger",
  "radius",
];
