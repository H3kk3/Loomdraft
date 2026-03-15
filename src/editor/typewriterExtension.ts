import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

/**
 * Typewriter mode: scrolls the editor so the cursor line is always
 * vertically centered in the viewport.
 */
export function typewriterExtension(): Extension {
  return EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged) return;

    const view = update.view;
    const head = update.state.selection.main.head;
    const coords = view.coordsAtPos(head);
    if (!coords) return;

    const editorRect = view.scrollDOM.getBoundingClientRect();
    const cursorY = coords.top - editorRect.top + view.scrollDOM.scrollTop;
    const targetScroll = cursorY - editorRect.height / 2;

    if (Math.abs(view.scrollDOM.scrollTop - targetScroll) > 2) {
      view.scrollDOM.scrollTop = Math.max(0, targetScroll);
    }
  });
}
