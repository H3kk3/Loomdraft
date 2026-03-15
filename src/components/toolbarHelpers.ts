import type { EditorView } from "@codemirror/view";

export type ViewGetter = () => EditorView | null;

export const keepFocus = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.preventDefault();
};

export const applyTransform = (
  view: ViewGetter,
  transform: (ctx: { doc: string; from: number; to: number; selected: string }) => {
    replacement: string;
    selectFrom: number;
    selectTo: number;
  },
) => {
  const v = view();
  if (!v) return;
  v.focus();
  const { from, to } = v.state.selection.main;
  const doc = v.state.doc.toString();
  const selected = v.state.sliceDoc(from, to);
  const result = transform({ doc, from, to, selected });
  v.dispatch({
    changes: { from, to, insert: result.replacement },
    selection: { anchor: result.selectFrom, head: result.selectTo },
  });
};

export const wrapInline = (
  view: ViewGetter,
  prefix: string,
  suffix = prefix,
  fallback = "text",
) => {
  applyTransform(view, ({ from, to, selected }) => {
    if (from === to) {
      const insertion = `${prefix}${fallback}${suffix}`;
      const selStart = from + prefix.length;
      return { replacement: insertion, selectFrom: selStart, selectTo: selStart + fallback.length };
    }
    const replacement = prefix + selected + suffix;
    return {
      replacement,
      selectFrom: from + prefix.length,
      selectTo: from + prefix.length + selected.length,
    };
  });
};

export const transformSelectedLines = (view: ViewGetter, mapper: (lines: string[]) => string[]) => {
  const v = view();
  if (!v) return;
  v.focus();
  const doc = v.state.doc.toString();
  const { from, to } = v.state.selection.main;
  const lineStart = doc.lastIndexOf("\n", Math.max(0, from - 1)) + 1;
  const lineEndIdx = doc.indexOf("\n", to);
  const lineEnd = lineEndIdx === -1 ? doc.length : lineEndIdx;
  const selectedBlock = doc.slice(lineStart, lineEnd);
  const nextBlock = mapper(selectedBlock.split("\n")).join("\n");
  v.dispatch({
    changes: { from: lineStart, to: lineEnd, insert: nextBlock },
    selection: { anchor: lineStart, head: lineStart + nextBlock.length },
  });
};
