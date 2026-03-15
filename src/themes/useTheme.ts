import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ThemeDefinition, ThemeMetadata, FontInfo, FontPreference } from "./themeTypes";
import { BUILTIN_THEMES, BUILTIN_THEME_LIST } from "./builtinThemes";
import { applyTheme } from "./applyTheme";

// ── Constants ────────────────────────────────────────────────────────────────

const THEME_KEY = "loomdraft:theme";
const FONT_KEY = "loomdraft:custom-fonts";
const DEFAULT_THEME_ID = "dark";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getStoredThemeId(): string {
  try {
    const val = localStorage.getItem(THEME_KEY);
    if (val) return val;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME_ID;
}

function resolveTheme(themeId: string): ThemeDefinition {
  return BUILTIN_THEMES[themeId] ?? BUILTIN_THEMES[DEFAULT_THEME_ID];
}

function getStoredFontPrefs(): FontPreference {
  try {
    const val = localStorage.getItem(FONT_KEY);
    if (val) return JSON.parse(val);
  } catch {
    /* ignore */
  }
  return {};
}

function setStoredFontPrefs(prefs: FontPreference): void {
  try {
    localStorage.setItem(FONT_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/** Inject a @font-face rule into <head> and return the style element */
function injectFontFace(familyName: string, dataUri: string, format: string): HTMLStyleElement {
  const style = document.createElement("style");
  style.dataset.customFont = familyName;
  style.textContent = `@font-face {
  font-family: "${familyName}";
  src: url("${dataUri}") format("${format}");
  font-display: swap;
}`;
  document.head.appendChild(style);
  return style;
}

/** Remove previously injected @font-face rules for a family */
function removeFontFace(familyName: string): void {
  document.querySelectorAll(`style[data-custom-font="${familyName}"]`).forEach((el) => el.remove());
}

/** Apply font preference to CSS variable */
function applyFontVar(target: "ui" | "mono", familyName: string | null): void {
  const root = document.documentElement;
  if (target === "ui") {
    if (familyName) {
      root.style.setProperty("--font", `"${familyName}", system-ui, sans-serif`);
    } else {
      root.style.removeProperty("--font");
    }
  } else {
    if (familyName) {
      root.style.setProperty("--font-mono", `"${familyName}", "Fira Code", monospace`);
    } else {
      root.style.removeProperty("--font-mono");
    }
  }
}

// ── Appearance type (backward-compatible) ────────────────────────────────────

export type Theme = "dark" | "light";

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTheme() {
  const [activeThemeId, setActiveThemeId] = useState<string>(getStoredThemeId);
  const [activeTheme, setActiveTheme] = useState<ThemeDefinition>(() =>
    resolveTheme(getStoredThemeId()),
  );
  const [customThemes, setCustomThemes] = useState<ThemeMetadata[]>([]);
  const [customFonts, setCustomFonts] = useState<FontInfo[]>([]);
  const [fontPrefs, setFontPrefs] = useState<FontPreference>(getStoredFontPrefs);
  const fontStylesRef = useRef<Map<string, HTMLStyleElement>>(new Map());

  // Apply theme on mount and whenever activeTheme changes
  useEffect(() => {
    applyTheme(activeTheme);
    // Re-apply font overrides after theme application (theme resets --font/--font-mono)
    if (fontPrefs.ui) applyFontVar("ui", fontPrefs.ui.familyName);
    if (fontPrefs.mono) applyFontVar("mono", fontPrefs.mono.familyName);
  }, [activeTheme]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist active theme ID
  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, activeThemeId);
    } catch {
      /* ignore */
    }
  }, [activeThemeId]);

  // ── Load custom font preferences on startup ──────────────────────────────

  useEffect(() => {
    const prefs = getStoredFontPrefs();
    if (!prefs.ui && !prefs.mono) return;

    (async () => {
      for (const target of ["ui", "mono"] as const) {
        const pref = prefs[target];
        if (!pref) continue;
        try {
          const dataUri = await invoke<string>("read_font_base64", {
            filename: pref.filename,
          });
          const fmt = pref.filename.endsWith(".woff2")
            ? "woff2"
            : pref.filename.endsWith(".otf")
              ? "opentype"
              : "truetype";
          const style = injectFontFace(pref.familyName, dataUri, fmt);
          fontStylesRef.current.set(pref.familyName, style);
          applyFontVar(target, pref.familyName);
        } catch {
          // Font file missing — clear this preference
          const updated = { ...getStoredFontPrefs(), [target]: null };
          setStoredFontPrefs(updated);
          setFontPrefs(updated);
        }
      }
    })();
  }, []);

  // ── Load custom themes list ────────────────────────────────────────────

  const loadCustomThemes = useCallback(async () => {
    try {
      const themes = await invoke<ThemeMetadata[]>("list_custom_themes");
      setCustomThemes(themes);
    } catch {
      setCustomThemes([]);
    }
  }, []);

  const loadCustomFonts = useCallback(async () => {
    try {
      const fonts = await invoke<FontInfo[]>("list_fonts");
      setCustomFonts(fonts);
    } catch {
      setCustomFonts([]);
    }
  }, []);

  // Load lists on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const themes = await invoke<ThemeMetadata[]>("list_custom_themes");
        if (!cancelled) setCustomThemes(themes);
      } catch {
        if (!cancelled) setCustomThemes([]);
      }
      try {
        const fonts = await invoke<FontInfo[]>("list_fonts");
        if (!cancelled) setCustomFonts(fonts);
      } catch {
        if (!cancelled) setCustomFonts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── setTheme ─────────────────────────────────────────────────────────────

  const setTheme = useCallback(async (themeId: string) => {
    // Try built-in first
    const builtin = BUILTIN_THEMES[themeId];
    if (builtin) {
      setActiveThemeId(themeId);
      setActiveTheme(builtin);
      return;
    }

    // Load custom theme from Rust backend
    try {
      const data = await invoke<{
        name: string;
        id: string;
        author: string;
        version: number;
        appearance: string;
        colors: ThemeDefinition["colors"];
        syntax?: ThemeDefinition["syntax"];
        fonts?: ThemeDefinition["fonts"];
      }>("load_theme", { themeId });

      const theme: ThemeDefinition = {
        name: data.name,
        id: data.id,
        author: data.author,
        version: data.version,
        appearance: data.appearance as "dark" | "light",
        colors: data.colors,
        syntax: data.syntax ?? undefined,
        fonts: data.fonts ?? undefined,
      };

      setActiveThemeId(themeId);
      setActiveTheme(theme);
    } catch {
      console.warn(`Theme "${themeId}" not found, falling back to default`);
      setActiveThemeId(DEFAULT_THEME_ID);
      setActiveTheme(BUILTIN_THEMES[DEFAULT_THEME_ID]);
    }
  }, []);

  // ── toggleTheme (backward-compat: cycles between dark and light) ─────────

  const toggleTheme = useCallback(() => {
    setTheme(activeTheme.appearance === "dark" ? "light" : "dark");
  }, [activeTheme.appearance, setTheme]);

  // ── importTheme ─────────────────────────────────────────────────────────

  const importTheme = useCallback(async () => {
    const file = await open({
      title: "Import Theme",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!file || typeof file !== "string") return;

    try {
      await invoke<string>("import_theme_file", { sourcePath: file });
      await loadCustomThemes();
    } catch (e) {
      console.error("Failed to import theme:", e);
      throw e;
    }
  }, [loadCustomThemes]);

  // ── deleteCustomTheme ──────────────────────────────────────────────────

  const deleteCustomTheme = useCallback(
    async (themeId: string) => {
      try {
        await invoke("delete_custom_theme", { themeId });

        // If the deleted theme was active, fall back to default
        if (themeId === activeThemeId) {
          setActiveThemeId(DEFAULT_THEME_ID);
          setActiveTheme(BUILTIN_THEMES[DEFAULT_THEME_ID]);
        }

        await loadCustomThemes();
      } catch (e) {
        console.error("Failed to delete theme:", e);
      }
    },
    [activeThemeId, loadCustomThemes],
  );

  // ── importFont ────────────────────────────────────────────────────────

  const importFont = useCallback(
    async (target: "ui" | "mono") => {
      const file = await open({
        title: `Import ${target === "ui" ? "UI" : "Editor"} Font`,
        filters: [{ name: "Font", extensions: ["ttf", "otf", "woff2"] }],
      });
      if (!file || typeof file !== "string") return;

      try {
        const info = await invoke<FontInfo>("import_font", { sourcePath: file });
        const dataUri = await invoke<string>("read_font_base64", {
          filename: info.filename,
        });

        // Remove old @font-face if any
        const oldPref = fontPrefs[target];
        if (oldPref) {
          removeFontFace(oldPref.familyName);
          fontStylesRef.current.delete(oldPref.familyName);
        }

        // Inject new @font-face
        const style = injectFontFace(info.family_name, dataUri, info.format);
        fontStylesRef.current.set(info.family_name, style);

        // Apply CSS variable
        applyFontVar(target, info.family_name);

        // Persist preference
        const updated: FontPreference = {
          ...fontPrefs,
          [target]: { filename: info.filename, familyName: info.family_name },
        };
        setFontPrefs(updated);
        setStoredFontPrefs(updated);

        await loadCustomFonts();
      } catch (e) {
        console.error("Failed to import font:", e);
        throw e;
      }
    },
    [fontPrefs, loadCustomFonts],
  );

  // ── resetFont ─────────────────────────────────────────────────────────

  const resetFont = useCallback(
    (target: "ui" | "mono") => {
      const pref = fontPrefs[target];
      if (pref) {
        removeFontFace(pref.familyName);
        fontStylesRef.current.delete(pref.familyName);
      }
      applyFontVar(target, null);

      const updated: FontPreference = { ...fontPrefs, [target]: null };
      setFontPrefs(updated);
      setStoredFontPrefs(updated);
    },
    [fontPrefs],
  );

  // ── Return ───────────────────────────────────────────────────────────────

  return {
    // Backward-compatible
    theme: activeTheme.appearance as Theme,
    toggleTheme,

    // New theme system
    activeThemeId,
    activeTheme,
    builtinThemes: BUILTIN_THEME_LIST,
    customThemes,
    customFonts,
    fontPrefs,
    setTheme,
    importTheme,
    deleteCustomTheme,
    importFont,
    resetFont,
  };
}
