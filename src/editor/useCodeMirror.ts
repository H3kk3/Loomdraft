import { useRef, useEffect, useCallback } from "react";
import { EditorView } from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";

export interface CursorPosition {
  line: number;
  col: number;
}

export interface UseCodeMirrorOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  initialDoc: string;
  docId: string;
  extensions: Extension[];
  onDocChanged: (doc: string) => void;
  onSelectionChanged: (selectedText: string) => void;
  onCursorChanged?: (pos: CursorPosition) => void;
}

export function useCodeMirror({
  containerRef,
  initialDoc,
  docId,
  extensions,
  onDocChanged,
  onSelectionChanged,
  onCursorChanged,
}: UseCodeMirrorOptions) {
  const viewRef = useRef<EditorView | null>(null);
  const callbacksRef = useRef({ onDocChanged, onSelectionChanged, onCursorChanged });

  // Keep callback refs fresh without recreating extensions
  useEffect(() => {
    callbacksRef.current = { onDocChanged, onSelectionChanged, onCursorChanged };
  }, [onDocChanged, onSelectionChanged, onCursorChanged]);

  // Shared listener factory — avoids duplicating the listener logic
  const makeUpdateListener = useCallback(
    () =>
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          callbacksRef.current.onDocChanged(update.state.doc.toString());
        }
        if (update.selectionSet) {
          const { from, to } = update.state.selection.main;
          const sel = from !== to ? update.state.sliceDoc(from, to) : "";
          callbacksRef.current.onSelectionChanged(sel);
        }
        if (update.selectionSet || update.docChanged) {
          const head = update.state.selection.main.head;
          const line = update.state.doc.lineAt(head);
          callbacksRef.current.onCursorChanged?.({
            line: line.number,
            col: head - line.from + 1,
          });
        }
      }),
    [],
  );

  // Create/destroy the EditorView
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const state = EditorState.create({
      doc: initialDoc,
      extensions: [...extensions, makeUpdateListener()],
    });

    const view = new EditorView({ state, parent: container });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only create/destroy on mount/unmount — doc switching is handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset state when document changes (new doc.id)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const newState = EditorState.create({
      doc: initialDoc,
      extensions: [...extensions, makeUpdateListener()],
    });
    view.setState(newState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  // Utility: dispatch a text insertion at cursor
  const insertAtCursor = useCallback((text: string) => {
    const view = viewRef.current;
    if (!view) return;
    const pos = view.state.selection.main.head;
    view.dispatch({ changes: { from: pos, insert: text } });
    view.focus();
  }, []);

  return { viewRef, insertAtCursor };
}
