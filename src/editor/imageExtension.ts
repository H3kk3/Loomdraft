import {
  Decoration,
  WidgetType,
  type DecorationSet,
  EditorView,
  ViewPlugin,
} from "@codemirror/view";
import {
  type EditorState,
  type Extension,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { onImageClickFacet } from "./facets";
import type { ImageCache } from "./imageCache";

// ── Image markdown parsing ──────────────────────────────────────────────────

const IMAGE_LINE_RE = /^(!\[([^\]|]*?)(?:\|(\d+)x(\d+))?\]\(([^)]+)\))\s*$/;

interface ImageInfo {
  fullMatch: string;
  alt: string;
  width?: number;
  height?: number;
  relativePath: string;
  lineFrom: number;
  lineTo: number;
}

/** Scan all document lines for image-only lines */
function findImageLines(state: EditorState): ImageInfo[] {
  const images: ImageInfo[] = [];
  const doc = state.doc;
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const m = line.text.match(IMAGE_LINE_RE);
    if (m) {
      images.push({
        fullMatch: m[1],
        alt: m[2],
        width: m[3] ? parseInt(m[3]) : undefined,
        height: m[4] ? parseInt(m[4]) : undefined,
        relativePath: m[5],
        lineFrom: line.from,
        lineTo: line.to,
      });
    }
  }
  return images;
}

// ── Image Widget ────────────────────────────────────────────────────────────

class ImageWidget extends WidgetType {
  constructor(
    readonly relativePath: string,
    readonly alt: string,
    readonly width: number | undefined,
    readonly height: number | undefined,
    readonly dataUrl: string | undefined,
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-image-block";

    if (this.dataUrl) {
      const img = document.createElement("img");
      img.src = this.dataUrl;
      img.alt = this.alt || "image";
      img.className = "image-thumbnail";
      img.draggable = false;
      wrapper.appendChild(img);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "image-placeholder";
      placeholder.textContent = "Loading image\u2026";
      wrapper.appendChild(placeholder);
    }

    wrapper.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const onImageClick = view.state.facet(onImageClickFacet);
      if (onImageClick) {
        onImageClick({
          relativePath: this.relativePath,
          alt: this.alt,
          width: this.width,
          height: this.height,
          rect: wrapper.getBoundingClientRect(),
        });
      }
    });

    return wrapper;
  }

  eq(other: ImageWidget): boolean {
    return (
      this.relativePath === other.relativePath &&
      this.alt === other.alt &&
      this.width === other.width &&
      this.height === other.height &&
      this.dataUrl === other.dataUrl
    );
  }

  ignoreEvent(): boolean {
    return true; // Widget handles its own events
  }
}

// ── StateEffect to trigger rebuild when images finish loading ────────────────

const imageCacheUpdated = StateEffect.define<null>();

// ── Build decorations from document state + cache ────────────────────────────

function buildDecorations(state: EditorState, cache: ImageCache): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const images = findImageLines(state);

  for (const img of images) {
    // Trigger lazy loading
    cache.load(img.relativePath);

    const dataUrl = cache.get(img.relativePath);
    const widget = new ImageWidget(img.relativePath, img.alt, img.width, img.height, dataUrl);

    builder.add(
      img.lineFrom,
      img.lineTo,
      Decoration.replace({
        widget,
        block: true,
      }),
    );
  }

  return builder.finish();
}

// ── Image Extension ──────────────────────────────────────────────────────────

/**
 * Creates an image block extension that replaces image markdown lines with
 * rendered image widgets. Uses a StateField (required for block decorations)
 * and a ViewPlugin that subscribes to ImageCache for lazy-load updates.
 */
export function imageExtension(cache: ImageCache): Extension {
  // StateField holds the decorations — required for block-level replacements
  const imageField = StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, cache);
    },
    update(decos, tr) {
      if (tr.docChanged || tr.effects.some((e) => e.is(imageCacheUpdated))) {
        return buildDecorations(tr.state, cache);
      }
      return decos;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  // ViewPlugin subscribes to the ImageCache and dispatches an effect
  // to trigger StateField rebuild when images finish loading
  const cacheListener = ViewPlugin.define((view) => {
    const unsubscribe = cache.subscribe(() => {
      view.dispatch({ effects: imageCacheUpdated.of(null) });
    });
    return {
      destroy() {
        unsubscribe();
      },
    };
  });

  return [imageField, cacheListener];
}
