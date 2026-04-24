import { useRef, useState, useEffect, memo } from "react";
import { Folder, ChevronRight, ChevronDown } from "lucide-react";
import type { ProjectManifest, ProjectMetadata } from "../types";
import { isManuscriptDocType, type DocCategory } from "../docTypes";
import { TREE_INDENT_PX } from "../constants";
import { DocTypeIcon } from "./Sidebar";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DropPos = "before" | "inside" | "after";

export interface DropTarget {
  overId: string;
  position: DropPos;
}

export interface TreeNodeProps {
  nodeId: string;
  manifest: ProjectManifest;
  metadata?: ProjectMetadata;
  selectedId: string | null;
  draggingId: string | null;
  dropTarget: DropTarget | null;
  renamingId: string | null;
  expandedNodes: Set<string>;
  visibleNodes: Set<string> | null;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onAddToRootSection: (category: DocCategory) => void;
  onContextMenu: (nodeId: string, x: number, y: number) => void;
  onDragStart: (nodeId: string, x: number, y: number) => void;
  onRenameCommit: (nodeId: string, newTitle: string) => void;
  onRenameCancel: () => void;
  onStartRename: (nodeId: string) => void;
  onToggleExpand: (nodeId: string) => void;
  depth: number;
}

// ── InlineRenameInput ─────────────────────────────────────────────────────────

function InlineRenameInput({
  initialTitle,
  onCommit,
  onCancel,
}: {
  initialTitle: string;
  onCommit: (newTitle: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialTitle);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== initialTitle) {
      onCommit(trimmed);
    } else {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      className="tree-rename-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
        e.stopPropagation();
      }}
      onBlur={commit}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

// ── TreeNode ──────────────────────────────────────────────────────────────────

export const TreeNode = memo(function TreeNode({
  nodeId,
  manifest,
  metadata,
  selectedId,
  draggingId,
  dropTarget,
  renamingId,
  expandedNodes,
  visibleNodes,
  onSelect,
  onAddChild,
  onAddToRootSection,
  onContextMenu,
  onDragStart,
  onRenameCommit,
  onRenameCancel,
  onStartRename,
  onToggleExpand,
  depth,
}: TreeNodeProps) {
  const node = manifest.nodes[nodeId];
  const rowRef = useRef<HTMLDivElement>(null);

  const isSelected = nodeId === selectedId;

  // Auto-scroll selected node into view
  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isSelected]);

  if (!node) return null;

  // If filtering is active and this node isn't visible, hide it
  if (visibleNodes && !visibleNodes.has(nodeId)) return null;

  const hasFile = !!node.file;
  const hasChildren = node.children.length > 0;
  const isRoot = nodeId === manifest.root;
  const isDragging = draggingId === nodeId;
  const isOver = dropTarget?.overId === nodeId;
  const dropPos = isOver ? dropTarget?.position : null;
  const isExpanded = expandedNodes.has(nodeId);

  const status = metadata?.[nodeId]?.status;
  const statusColor = status ? `var(--status-${status})` : "transparent";

  const rowClasses = [
    "tree-row",
    isSelected ? "selected" : "",
    !hasFile ? "folder" : "",
    isDragging ? "dragging" : "",
    isOver && dropPos === "inside" ? "drop-inside" : "",
    isOver && dropPos === "before" ? "drop-before" : "",
    isOver && dropPos === "after" ? "drop-after" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const manuscriptChildren = isRoot
    ? node.children.filter((childId) => isManuscriptDocType(manifest.doc_types, manifest.nodes[childId]?.doc_type))
    : [];
  const planningChildren = isRoot
    ? node.children.filter((childId) => !isManuscriptDocType(manifest.doc_types, manifest.nodes[childId]?.doc_type))
    : [];

  // Note: `metadata` is the full ProjectMetadata map. When any node's metadata
  // changes, the map reference changes and every TreeNode re-renders despite
  // memo(). Acceptable for v0.3 tree sizes; revisit if profiling shows hotspots.
  const childProps = {
    manifest,
    metadata,
    selectedId,
    draggingId,
    dropTarget,
    renamingId,
    expandedNodes,
    visibleNodes,
    onSelect,
    onAddChild,
    onAddToRootSection,
    onContextMenu,
    onDragStart,
    onRenameCommit,
    onRenameCancel,
    onStartRename,
    onToggleExpand,
    depth: depth + 1,
  };

  // Determine doc type label for badge
  const docTypeDef = node.doc_type
    ? manifest.doc_types.find((dt) => dt.id === node.doc_type)
    : null;

  return (
    <div className="tree-node" style={{ paddingLeft: depth * TREE_INDENT_PX }}>
      <div
        ref={rowRef}
        className={rowClasses}
        data-node-id={nodeId}
        style={{ boxShadow: `inset 3px 0 0 0 ${statusColor}` }}
        onPointerDown={(e) => {
          if (isRoot) return;
          if (e.button !== 0) return;
          if ((e.target as HTMLElement).closest("button")) return;
          onDragStart(nodeId, e.clientX, e.clientY);
        }}
        onMouseUp={(e) => {
          if (e.button !== 0) return;
          if ((e.target as HTMLElement).closest("button")) return;
          if (draggingId) return;
          if (hasFile) {
            onSelect(nodeId);
          } else if (!isRoot && hasChildren) {
            onToggleExpand(nodeId);
          }
        }}
        tabIndex={isRoot ? undefined : 0}
        onKeyDown={(e) => {
          if (isRoot) return;
          if (e.key === "F10" && e.shiftKey) {
            e.preventDefault();
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            onContextMenu(nodeId, rect.left + 20, rect.bottom);
          }
          if (e.key === "F2") {
            e.preventDefault();
            onStartRename(nodeId);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isRoot) return;
          onContextMenu(nodeId, e.clientX, e.clientY);
        }}
      >
        {/* Collapse chevron for non-root nodes with children */}
        {!isRoot && hasChildren && (
          <button
            className="tree-chevron"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(nodeId);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {isExpanded ? (
              <ChevronDown size={12} strokeWidth={2} />
            ) : (
              <ChevronRight size={12} strokeWidth={2} />
            )}
          </button>
        )}
        <span className="tree-icon">
          {hasFile ? (
            <DocTypeIcon docType={node.doc_type} docTypes={manifest.doc_types} />
          ) : (
            <Folder size={14} strokeWidth={1.75} />
          )}
        </span>
        {renamingId === nodeId ? (
          <InlineRenameInput
            initialTitle={node.title ?? nodeId}
            onCommit={(newTitle) => onRenameCommit(nodeId, newTitle)}
            onCancel={onRenameCancel}
          />
        ) : (
          <span className="tree-title">{node.title ?? nodeId}</span>
        )}
        {/* Doc type badge on hover */}
        {hasFile && docTypeDef && (
          <span className="tree-type-badge">{docTypeDef.label}</span>
        )}
        {!isRoot && (
          <button
            className="tree-add-btn"
            title="Add child"
            onClick={(e) => {
              e.stopPropagation();
              onAddChild(nodeId);
            }}
          >
            +
          </button>
        )}
      </div>
      {isRoot ? (
        <>
          <div className="tree-section-header">
            <div className="tree-section-label">Manuscript</div>
            <button
              className="tree-section-add-btn"
              title="Add manuscript document"
              onClick={() => onAddToRootSection("manuscript")}
            >
              +
            </button>
          </div>
          {manuscriptChildren.length > 0 ? (
            manuscriptChildren.map((childId) => (
              <TreeNode key={childId} nodeId={childId} {...childProps} />
            ))
          ) : (
            <div className="tree-empty-hint">Click + to add your first chapter</div>
          )}

          <div className="tree-section-divider" />
          <div className="tree-section-header">
            <div className="tree-section-label">Planning</div>
            <button
              className="tree-section-add-btn"
              title="Add planning document"
              onClick={() => onAddToRootSection("planning")}
            >
              +
            </button>
          </div>
          {planningChildren.length > 0 ? (
            planningChildren.map((childId) => (
              <TreeNode key={childId} nodeId={childId} {...childProps} />
            ))
          ) : (
            <div className="tree-empty-hint">Click + to add a character, location, or note</div>
          )}
        </>
      ) : (
        isExpanded &&
        node.children.map((childId) => <TreeNode key={childId} nodeId={childId} {...childProps} />)
      )}
    </div>
  );
});
