import { useEffect, useRef } from "react";
import { Download, Trash2, X } from "lucide-react";
import type { ThemeMetadata, FontInfo, FontPreference } from "../themes/themeTypes";
import { BUILTIN_THEMES } from "../themes/builtinThemes";

interface ThemePickerProps {
  activeThemeId: string;
  builtinThemes: ThemeMetadata[];
  customThemes: ThemeMetadata[];
  customFonts: FontInfo[];
  fontPrefs: FontPreference;
  onSelectTheme: (themeId: string) => void;
  onImportTheme: () => void;
  onDeleteCustomTheme: (themeId: string) => void;
  onImportFont: (target: "ui" | "mono") => void;
  onResetFont: (target: "ui" | "mono") => void;
  onClose: () => void;
}

export function ThemePicker({
  activeThemeId,
  builtinThemes,
  customThemes,
  onSelectTheme,
  onImportTheme,
  onDeleteCustomTheme,
  onImportFont,
  onResetFont,
  fontPrefs,
  onClose,
}: ThemePickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay binding to avoid the click that opened the popover from closing it
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  /** Get the accent color for a theme (for the dot preview) */
  function accentForTheme(meta: ThemeMetadata): string {
    const builtin = BUILTIN_THEMES[meta.id];
    return builtin?.colors.accent ?? "var(--accent)";
  }

  const uiFontName = fontPrefs.ui?.familyName ?? "System Default";
  const monoFontName = fontPrefs.mono?.familyName ?? "System Default";

  return (
    <div ref={panelRef} className="theme-picker">
      {/* ── Built-in themes ─────────────────────────────────── */}
      <div className="theme-picker-section-label">Themes</div>
      <div className="theme-picker-list">
        {builtinThemes.map((t) => (
          <button
            key={t.id}
            className={`theme-picker-item${t.id === activeThemeId ? " active" : ""}`}
            onClick={() => onSelectTheme(t.id)}
          >
            <span className="theme-picker-dot" style={{ backgroundColor: accentForTheme(t) }} />
            <span className="theme-picker-name">{t.name}</span>
            <span className="theme-picker-appearance">{t.appearance}</span>
          </button>
        ))}
      </div>

      {/* ── Custom themes ───────────────────────────────────── */}
      {customThemes.length > 0 && (
        <>
          <div className="theme-picker-divider" />
          <div className="theme-picker-section-label">Custom</div>
          <div className="theme-picker-list">
            {customThemes.map((t) => (
              <button
                key={t.id}
                className={`theme-picker-item${t.id === activeThemeId ? " active" : ""}`}
                onClick={() => onSelectTheme(t.id)}
              >
                <span className="theme-picker-dot" style={{ backgroundColor: accentForTheme(t) }} />
                <span className="theme-picker-name">{t.name}</span>
                <button
                  className="theme-picker-delete"
                  title="Remove theme"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCustomTheme(t.id);
                  }}
                >
                  <Trash2 size={12} strokeWidth={1.75} />
                </button>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Import ──────────────────────────────────────────── */}
      <div className="theme-picker-divider" />
      <button className="theme-picker-import" onClick={onImportTheme}>
        <Download size={13} strokeWidth={1.75} />
        Import Theme…
      </button>

      {/* ── Font section ────────────────────────────────────── */}
      <div className="theme-picker-divider" />
      <div className="theme-picker-section-label">Fonts</div>
      <div className="theme-picker-fonts">
        <div className="theme-picker-font-row">
          <span className="theme-picker-font-label">UI</span>
          <span className="theme-picker-font-value">{uiFontName}</span>
          {fontPrefs.ui ? (
            <button
              className="theme-picker-font-change"
              onClick={() => onResetFont("ui")}
              title="Reset to system default"
            >
              <X size={11} strokeWidth={2} />
            </button>
          ) : null}
          <button className="theme-picker-font-change" onClick={() => onImportFont("ui")}>
            change
          </button>
        </div>
        <div className="theme-picker-font-row">
          <span className="theme-picker-font-label">Editor</span>
          <span className="theme-picker-font-value">{monoFontName}</span>
          {fontPrefs.mono ? (
            <button
              className="theme-picker-font-change"
              onClick={() => onResetFont("mono")}
              title="Reset to system default"
            >
              <X size={11} strokeWidth={2} />
            </button>
          ) : null}
          <button className="theme-picker-font-change" onClick={() => onImportFont("mono")}>
            change
          </button>
        </div>
      </div>
    </div>
  );
}
