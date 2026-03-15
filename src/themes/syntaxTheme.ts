import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";
import type { ThemeSyntaxColors, ThemeColors } from "./themeTypes";

/**
 * Derive syntax colors from the base theme colors when no explicit
 * syntax block is provided in the theme definition.
 */
function deriveSyntaxColors(colors: ThemeColors): ThemeSyntaxColors {
  return {
    heading: colors["accent-h"],
    emphasis: colors["text-dim"],
    strong: colors.text,
    link: colors.accent,
    code: colors["text-dim"],
    quote: colors["text-dim"],
    list: colors.accent,
    meta: colors["text-dim"],
  };
}

/**
 * Build a CodeMirror syntax highlighting extension from theme syntax colors.
 * If no explicit syntax colors are given, they're derived from the base colors.
 */
export function createSyntaxHighlighting(
  syntax: ThemeSyntaxColors | undefined,
  colors: ThemeColors,
): Extension {
  const s = syntax ?? deriveSyntaxColors(colors);

  const style = HighlightStyle.define([
    { tag: tags.heading, color: s.heading, fontWeight: "bold" },
    { tag: tags.emphasis, color: s.emphasis, fontStyle: "italic" },
    { tag: tags.strong, color: s.strong, fontWeight: "bold" },
    { tag: tags.link, color: s.link },
    { tag: tags.url, color: s.link },
    { tag: [tags.monospace, tags.processingInstruction], color: s.code },
    { tag: tags.quote, color: s.quote, fontStyle: "italic" },
    { tag: [tags.list, tags.contentSeparator], color: s.list },
    { tag: tags.meta, color: s.meta },
    { tag: tags.strikethrough, textDecoration: "line-through" },
  ]);

  return syntaxHighlighting(style);
}
