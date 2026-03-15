import {
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type ViewUpdate,
  EditorView,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { manifestFacet, onSelectNodeFacet, onLinkHoverFacet } from "./facets";
import { findNodeByTitle } from "../utils/manifest";

const WIKI_RE = /\[\[([^\]]+)\]\]/g;

/**
 * ViewPlugin that highlights [[wiki-links]] with mark decorations.
 * Uses manifestFacet to determine if each link is resolved or unresolved.
 */
const wikiLinkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.startState.facet(manifestFacet) !== update.state.facet(manifestFacet)
      ) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const manifest = view.state.facet(manifestFacet);

      for (const { from, to } of view.visibleRanges) {
        const text = view.state.sliceDoc(from, to);
        WIKI_RE.lastIndex = 0;
        let match;
        while ((match = WIKI_RE.exec(text)) !== null) {
          const start = from + match.index;
          const end = start + match[0].length;
          const ref = match[1];
          const nodeId = manifest ? findNodeByTitle(manifest, ref) : undefined;
          const cls = nodeId ? "wiki-link resolved" : "wiki-link unresolved";
          builder.add(start, end, Decoration.mark({ class: cls }));
        }
      }

      return builder.finish();
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

/**
 * Click handler: navigate when clicking on a resolved wiki-link
 */
const wikiLinkClickHandler = EditorView.domEventHandlers({
  click(event, view) {
    const target = event.target as HTMLElement;
    const link = target.closest(".wiki-link.resolved");
    if (!link) return false;

    // Find the position in the document
    const pos = view.posAtDOM(link);
    const doc = view.state.doc.toString();

    // Extract the link text at this position
    const match = doc.slice(pos).match(/^\[\[([^\]]+)\]\]/);
    if (!match) return false;

    const ref = match[1];
    const manifest = view.state.facet(manifestFacet);
    if (!manifest) return false;

    const nodeId = findNodeByTitle(manifest, ref);
    if (!nodeId) return false;

    const onSelectNode = view.state.facet(onSelectNodeFacet);
    if (onSelectNode) {
      event.preventDefault();
      event.stopPropagation();
      onSelectNode(nodeId);
      return true;
    }
    return false;
  },
});

/**
 * Helper: resolve a wiki-link DOM element to a nodeId.
 */
function resolveWikiLink(el: Element, view: EditorView): string | null {
  const pos = view.posAtDOM(el);
  const doc = view.state.doc.toString();
  const match = doc.slice(pos).match(/^\[\[([^\]]+)\]\]/);
  if (!match) return null;

  const ref = match[1];
  const manifest = view.state.facet(manifestFacet);
  if (!manifest) return null;

  return findNodeByTitle(manifest, ref) ?? null;
}

/**
 * Hover handler: show preview card when hovering on a resolved wiki-link.
 */
const wikiLinkHoverHandler = EditorView.domEventHandlers({
  mouseover(event, view) {
    const target = (event.target as HTMLElement).closest(".wiki-link.resolved");
    if (!target) return false;

    const nodeId = resolveWikiLink(target, view);
    if (!nodeId) return false;

    const rect = target.getBoundingClientRect();
    const onHover = view.state.facet(onLinkHoverFacet);
    if (onHover) onHover({ nodeId, rect });
    return false;
  },

  mouseout(event, view) {
    const target = event.target as HTMLElement;
    const related = event.relatedTarget as HTMLElement | null;

    // Don't close if moving to the preview card itself
    if (related?.closest(".link-preview-card")) return false;

    if (target.closest(".wiki-link")) {
      const onHover = view.state.facet(onLinkHoverFacet);
      if (onHover) onHover(null);
    }
    return false;
  },
});

/** Combined wiki-link extension: decorations + click handling + hover */
export function wikiLinkExtension() {
  return [wikiLinkPlugin, wikiLinkClickHandler, wikiLinkHoverHandler];
}
