import type { DocumentContent, ProjectManifest } from "../types";
import type { HoveredLink } from "../editor/facets";
import { DocTypeIcon } from "./Sidebar";
import { LINK_PREVIEW_SNIPPET_MAX_CHARS } from "../constants";

export function LinkPreviewCard({
  hoveredLink,
  manifest,
  preview,
  onGoto,
  onMouseEnter,
  onMouseLeave,
}: {
  hoveredLink: HoveredLink;
  manifest: ProjectManifest;
  preview: DocumentContent | null;
  onGoto: (nodeId: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const node = manifest.nodes[hoveredLink.nodeId];
  if (!node) return null;

  // If the element was detached (CM rebuilt decorations), bail out
  if (!hoveredLink.element.isConnected) return null;

  // Compute rect fresh from the DOM element to handle scroll/reflow
  const rect = hoveredLink.element.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - 280);
  const belowSpace = window.innerHeight - rect.bottom;
  const top = belowSpace > 170 ? rect.bottom + 6 : Math.max(4, rect.top - 170);

  return (
    <div
      className="link-preview-card"
      style={{ position: "fixed", top, left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="lpc-header">
        <span className="lpc-icon">
          <DocTypeIcon docType={node.doc_type} docTypes={manifest.doc_types} />
        </span>
        <span className="lpc-title">{node.title ?? hoveredLink.nodeId}</span>
        <span className="lpc-type">{node.doc_type}</span>
      </div>
      <p className="lpc-snippet">
        {preview
          ? preview.content.trim().slice(0, LINK_PREVIEW_SNIPPET_MAX_CHARS) +
            (preview.content.length > LINK_PREVIEW_SNIPPET_MAX_CHARS ? "…" : "")
          : "Loading…"}
      </p>
      <button className="lpc-goto" onClick={() => onGoto(hoveredLink.nodeId)}>
        Open →
      </button>
    </div>
  );
}
