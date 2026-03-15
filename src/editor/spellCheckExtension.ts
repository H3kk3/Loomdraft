import {
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type ViewUpdate,
  EditorView,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

// ── Dictionary singleton ──────────────────────────────────────────────────────

// nspell uses CJS — we'll load it dynamically
let spellInstance: { correct: (word: string) => boolean } | null = null;
let dictionaryLoading = false;
let dictionaryLoaded = false;
const wordCache = new Map<string, boolean>();

// Set of syntax node types where we skip spell-checking.
// NOTE: Emphasis / StrongEmphasis are wrapper nodes — their *content*
// should still be checked, only the markers are skipped (via MARK_TYPES).
const SKIP_TYPES = new Set([
  "InlineCode",
  "CodeBlock",
  "FencedCode",
  "CodeText",
  "CodeInfo",
  "URL",
  "LinkLabel",
  "Image",
  "WikiLink",
  "HTMLTag",
  "HTMLBlock",
  "HardBreak",
  "ProcessingInstruction",
  "Comment",
]);

// These mark types we skip (just the delimiter chars, not their content)
const MARK_TYPES = new Set([
  "EmphasisMark",
  "HeaderMark",
  "QuoteMark",
  "ListMark",
  "CodeMark",
  "LinkMark",
  "ImageMark",
]);

async function loadDictionary(): Promise<void> {
  if (dictionaryLoaded || dictionaryLoading) return;
  dictionaryLoading = true;
  try {
    const [affResp, dicResp, nspellModule] = await Promise.all([
      fetch("/dictionaries/en.aff"),
      fetch("/dictionaries/en.dic"),
      import("nspell"),
    ]);
    if (!affResp.ok || !dicResp.ok) {
      throw new Error(
        `Failed to fetch dictionary files: aff=${affResp.status}, dic=${dicResp.status}`,
      );
    }
    const aff = await affResp.text();
    const dic = await dicResp.text();
    const NSpell = nspellModule.default as unknown as new (
      aff: string,
      dic: string,
    ) => { correct: (word: string) => boolean };
    spellInstance = new NSpell(aff, dic);
    dictionaryLoaded = true;
  } catch (err) {
    console.warn("Failed to load spell-check dictionary:", err);
  } finally {
    dictionaryLoading = false;
  }
}

// ── Word extraction ───────────────────────────────────────────────────────────

const WORD_RE = /[a-zA-Z']+/g;
const MIN_WORD_LEN = 2;

function isCorrect(word: string): boolean {
  if (!spellInstance) return true;

  // Ignore very short words and all-caps (likely abbreviations)
  if (word.length < MIN_WORD_LEN) return true;
  if (/^[A-Z]+$/.test(word)) return true;

  const lower = word.toLowerCase();
  const cached = wordCache.get(lower);
  if (cached !== undefined) return cached;

  const result = spellInstance.correct(word) || spellInstance.correct(lower);
  wordCache.set(lower, result);
  return result;
}

// ── ViewPlugin ────────────────────────────────────────────────────────────────

const misspelledDeco = Decoration.mark({ class: "cm-misspelled" });

/**
 * Spell-check ViewPlugin.
 * Scans visible ranges for words, checks against nspell dictionary,
 * and applies wavy underline decorations on misspelled words.
 * Skips markdown syntax nodes (code, links, etc.) via the syntax tree.
 */
export const spellCheckPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private checkTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(view: EditorView) {
      this.decorations = Decoration.none;
      if (!dictionaryLoaded) {
        loadDictionary().then(() => {
          // Force rebuild once dictionary is loaded
          this.decorations = this.buildDecorations(view);
          view.dispatch(); // trigger re-render
        });
      } else {
        this.decorations = this.buildDecorations(view);
      }
    }

    update(update: ViewUpdate) {
      if (!dictionaryLoaded) return;

      if (update.docChanged || update.viewportChanged) {
        // Debounce: rebuild decorations after 300ms of inactivity
        if (this.checkTimer !== null) clearTimeout(this.checkTimer);
        this.checkTimer = setTimeout(() => {
          this.decorations = this.buildDecorations(update.view);
          update.view.dispatch(); // trigger re-render
          this.checkTimer = null;
        }, 300);
      }
    }

    destroy() {
      if (this.checkTimer !== null) clearTimeout(this.checkTimer);
    }

    buildDecorations(view: EditorView): DecorationSet {
      if (!spellInstance) return Decoration.none;

      const builder = new RangeSetBuilder<Decoration>();
      const tree = syntaxTree(view.state);

      for (const { from, to } of view.visibleRanges) {
        const text = view.state.sliceDoc(from, to);
        WORD_RE.lastIndex = 0;

        let match;
        while ((match = WORD_RE.exec(text)) !== null) {
          const word = match[0];

          // Skip apostrophe-only or short fragments
          if (word.replace(/'/g, "").length < MIN_WORD_LEN) continue;

          const wordStart = from + match.index;
          const wordEnd = wordStart + word.length;

          // Check if this word is inside a syntax node we should skip
          let skip = false;
          tree.iterate({
            from: wordStart,
            to: wordEnd,
            enter(node) {
              if (SKIP_TYPES.has(node.name) || MARK_TYPES.has(node.name)) {
                skip = true;
                return false; // stop iterating
              }
            },
          });
          if (skip) continue;

          if (!isCorrect(word)) {
            builder.add(wordStart, wordEnd, misspelledDeco);
          }
        }
      }

      return builder.finish();
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

/** Returns the spell-check extension (ViewPlugin). */
export function spellCheckExtension() {
  return spellCheckPlugin;
}
