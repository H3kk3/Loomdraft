import {
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type ViewUpdate,
  EditorView,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

const dimmedLine = Decoration.line({ class: "cm-dimmed-line" });

/**
 * Focus mode: dims all lines except the one containing the cursor.
 * Uses line decorations with a CSS class for opacity.
 */
export function focusModeExtension() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.selectionSet || update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number;

        for (const { from, to } of view.visibleRanges) {
          const startLine = view.state.doc.lineAt(from).number;
          const endLine = view.state.doc.lineAt(to).number;
          for (let i = startLine; i <= endLine; i++) {
            if (i !== cursorLine) {
              const line = view.state.doc.line(i);
              builder.add(line.from, line.from, dimmedLine);
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
}
