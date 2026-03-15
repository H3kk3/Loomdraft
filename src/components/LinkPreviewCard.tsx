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

  const left = Math.min(hoveredLink.rect.left, window.innerWidth - 280);
  const belowSpace = window.innerHeight - hoveredLink.rect.bottom;
  const top = belowSpace > 170 ? hoveredLink.rect.bottom + 6 : hoveredLink.rect.top - 170;

  return (
    <div
      className="link-preview-card"
      style={{ position: "fixed", top, left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="lpc-header">
        <span className="lpc-icon">
          <DocTypeIcon docType={node.doc_type} />
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
