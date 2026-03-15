import type { ThemeDefinition } from "./themeTypes";
import { THEME_COLOR_KEYS } from "./themeTypes";

/**
 * Apply a theme at runtime by setting CSS custom properties on <html>.
 * Uses `style.setProperty` which overrides `:root` and `[data-theme]` rules
 * in App.css with highest specificity. The CSS rules remain as fallback.
 */
export function applyTheme(theme: ThemeDefinition): void {
  const root = document.documentElement;

  // 1. Set data-theme attribute (controls color-scheme for native elements)
  root.setAttribute("data-theme", theme.appearance);

  // 2. Apply all color variables
  for (const key of THEME_COLOR_KEYS) {
    const value = theme.colors[key];
    if (value != null) {
      root.style.setProperty(`--${key}`, value);
    }
  }

  // 3. Apply color-scheme for scrollbars / form controls
  if (theme.appearance === "light") {
    root.style.setProperty("color-scheme", "light");
  } else {
    root.style.removeProperty("color-scheme");
  }

  // 4. Apply font overrides (if specified in theme)
  if (theme.fonts?.ui) {
    root.style.setProperty("--font", `"${theme.fonts.ui}", system-ui, sans-serif`);
  } else {
    root.style.removeProperty("--font");
  }
  if (theme.fonts?.mono) {
    root.style.setProperty("--font-mono", `"${theme.fonts.mono}", "Fira Code", monospace`);
  } else {
    root.style.removeProperty("--font-mono");
  }
}

/**
 * Remove all inline style overrides from <html>, allowing CSS rules to take over.
 * Useful when switching back to a theme that fully matches a CSS [data-theme] rule.
 */
export function clearThemeOverrides(): void {
  const root = document.documentElement;
  for (const key of THEME_COLOR_KEYS) {
    root.style.removeProperty(`--${key}`);
  }
  root.style.removeProperty("color-scheme");
  root.style.removeProperty("--font");
  root.style.removeProperty("--font-mono");
}
