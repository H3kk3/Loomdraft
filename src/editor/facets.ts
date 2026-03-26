import { Facet } from "@codemirror/state";
import type { ProjectManifest } from "../types";
import type { ActiveImage } from "../components/ImagePreviewCard";

/** Current project manifest — used by wiki-link extension to resolve links */
export const manifestFacet = Facet.define<ProjectManifest | null, ProjectManifest | null>({
  combine: (values) => values[values.length - 1] ?? null,
});

/** Current project path — used by image extension to load images */
export const projectPathFacet = Facet.define<string, string>({
  combine: (values) => values[values.length - 1] ?? "",
});

/** Callback when a wiki-link is clicked */
export const onSelectNodeFacet = Facet.define<
  ((id: string) => void) | null,
  ((id: string) => void) | null
>({
  combine: (values) => values[values.length - 1] ?? null,
});

/** Callback when an image is clicked (to open ImagePreviewCard) */
export const onImageClickFacet = Facet.define<
  ((image: ActiveImage) => void) | null,
  ((image: ActiveImage) => void) | null
>({
  combine: (values) => values[values.length - 1] ?? null,
});

/** Hovered wiki-link info (nodeId + position) */
export interface HoveredLink {
  nodeId: string;
  /** The DOM element for the wiki-link span — used to compute fresh position on render */
  element: Element;
}

/** Callback when a wiki-link is hovered (to show LinkPreviewCard) */
export const onLinkHoverFacet = Facet.define<
  ((link: HoveredLink | null) => void) | null,
  ((link: HoveredLink | null) => void) | null
>({
  combine: (values) => values[values.length - 1] ?? null,
});
