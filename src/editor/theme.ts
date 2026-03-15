import { EditorView } from "@codemirror/view";

/** Manuscript mode: constrains content to a centered column for a Word-like feel.
 *  CM's .cm-scroller uses `display: flex !important; align-items: flex-start !important`,
 *  so we cannot override alignment there. Instead we center .cm-content via auto margins. */
export const manuscriptTheme = EditorView.theme({
  ".cm-content": {
    maxWidth: "700px",
    marginLeft: "auto",
    marginRight: "auto",
  },
});

/** Misspelled-word underline (used by spellCheckExtension) */
export const misspelledStyle = EditorView.theme({
  ".cm-misspelled": {
    textDecoration: "underline wavy red",
    textDecorationSkipInk: "none",
    textUnderlineOffset: "3px",
  },
});

export const loomdraftTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--bg)",
    color: "var(--text)",
    fontFamily: "var(--font-mono)",
    fontSize: "14px",
    height: "100%",
  },
  ".cm-content": {
    padding: "24px 48px",
    lineHeight: "1.75",
    caretColor: "var(--text)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--text)",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent) 30%, transparent)",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--font-mono)",
    fontSize: "14px",
    lineHeight: "1.75",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-placeholder": {
    color: "var(--text-dim)",
    fontStyle: "italic",
  },
  /* Search panel styling */
  ".cm-panels": {
    backgroundColor: "var(--bg-2)",
    color: "var(--text)",
    borderBottom: "1px solid var(--border)",
  },
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid var(--border)",
  },
  ".cm-search label": {
    color: "var(--text-dim)",
    fontSize: "12px",
  },
  ".cm-textfield": {
    backgroundColor: "var(--bg)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "3px 6px",
    fontSize: "13px",
    fontFamily: "var(--font)",
  },
  ".cm-textfield:focus": {
    borderColor: "var(--accent)",
    outline: "none",
  },
  ".cm-button": {
    backgroundColor: "var(--bg-3)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "3px 8px",
    fontSize: "12px",
    cursor: "pointer",
  },
  ".cm-button:hover": {
    borderColor: "var(--accent)",
  },
  ".cm-search .cm-button[name=close]": {
    color: "var(--text-dim)",
  },
  /* Selection match highlighting */
  ".cm-selectionMatch": {
    backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)",
  },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in srgb, var(--accent) 25%, transparent)",
    borderRadius: "2px",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, var(--accent) 50%, transparent)",
  },
});
