import { useRef, useState, useEffect, useCallback, useMemo, memo } from "react";
import {
  Library,
  BookOpen,
  Film,
  Pause,
  Scissors,
  User,
  MapPin,
  Sword,
  Building2,
  CalendarDays,
  ScrollText,
  ListTree,
  Microscope,
  StickyNote,
  FileText,
  Download,
  Palette,
  Search,
  Crown,
  Shield,
  Globe,
  Heart,
  Star,
  Flag,
  Feather,
  Flame,
  Lightbulb,
  Music,
  Puzzle,
  Skull,
  Target,
  Wand,
  Sparkles,
  Gem,
  Bookmark,
  Compass,
  Eye,
  Pen,
  Settings,
  ChevronsDownUp,
  ChevronsUpDown,
  type LucideIcon,
} from "lucide-react";
import type { Theme } from "../useTheme";
import type { ThemeMetadata, FontInfo, FontPreference } from "../themes/themeTypes";
import { ThemePicker } from "./ThemePicker";
import { parseFilterQuery, matchesFilter } from "../utils/filter";
import { STATUS_VALUES } from "../types";
import type { ProjectManifest, DocTypeDefinition, ProjectMetadata } from "../types";
import type { ProjectMetadataHandle } from "../useProjectMetadata";
import type { DocCategory } from "../docTypes";
import { DRAG_THRESHOLD_PX } from "../constants";
import { TreeNode, type DropTarget, type DropPos } from "./TreeNode";
import { ContextMenu } from "./ContextMenu";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { mod } from "../utils/platform";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DragState {
  nodeId: string;
  startX: number;
  startY: number;
  active: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findParent(manifest: ProjectManifest, nodeId: string): string | null {
  for (const [id, node] of Object.entries(manifest.nodes)) {
    if (node.children.includes(nodeId)) return id;
  }
  return null;
}

/** Compute which nodes should be visible given a filter query.
 *  Returns null if no filter is active, or a Set of visible node IDs
 *  (matching nodes + all their ancestors up to root).
 *
 *  Supports prefixed tokens (`type:scene`, `status:draft`, `tag:foreshadowing`)
 *  combined with free text that matches the node title. See `utils/filter.ts`. */
function computeVisibleNodes(
  manifest: ProjectManifest,
  query: string,
  metadata: ProjectMetadata,
): Set<string> | null {
  if (!query.trim()) return null;
  const filter = parseFilterQuery(query);

  // Build parent index once: O(N) where N = total nodes. Replaces O(N²) ancestor walks.
  const parentIndex = new Map<string, string>();
  for (const [parentId, node] of Object.entries(manifest.nodes)) {
    for (const childId of node.children) {
      parentIndex.set(childId, parentId);
    }
  }

  const visible = new Set<string>();
  for (const [id, node] of Object.entries(manifest.nodes)) {
    const title = node.title ?? id;
    const docType = node.doc_type ?? "";
    const meta = metadata[id] ?? { synopsis: null, tags: [], status: STATUS_VALUES[0] };
    const matchable = { title, doc_type: docType };
    if (matchesFilter(filter, matchable, meta)) {
      visible.add(id);
      let current: string | undefined = parentIndex.get(id);
      while (current !== undefined) {
        visible.add(current);
        current = parentIndex.get(current);
      }
    }
  }
  return visible;
}

// ── Icon map ──────────────────────────────────────────────────────────────────

export const ICON_MAP: Record<string, LucideIcon> = {
  Library, BookOpen, Film, Pause, Scissors, User, MapPin, Sword, Building2,
  CalendarDays, ScrollText, ListTree, Microscope, StickyNote, FileText,
  Crown, Shield, Globe, Heart, Star, Flag, Feather, Flame, Lightbulb,
  Music, Puzzle, Skull, Target, Wand, Sparkles, Gem, Bookmark, Compass,
  Eye, Pen,
};

// ── DocTypeIcon ───────────────────────────────────────────────────────────────

export const DocTypeIcon = memo(function DocTypeIcon({
  docType,
  docTypes,
}: {
  docType?: string;
  docTypes?: DocTypeDefinition[];
}) {
  const props = { size: 14, strokeWidth: 1.75 };
  if (docType && docTypes) {
    const def = docTypes.find((dt) => dt.id === docType);
    if (def) {
      const Icon = ICON_MAP[def.icon];
      if (Icon) return <Icon {...props} />;
    }
  }
  return <FileText {...props} />;
});

// ── Sidebar ───────────────────────────────────────────────────────────────────

export interface SidebarProps {
  manifest: ProjectManifest;
  selectedId: string | null;
  onSelectNode: (id: string) => void;
  onAddChild: (parentId: string, category?: DocCategory) => void;
  onMoveNode: (draggingId: string, newParentId: string, position: number) => void;
  onDeleteNode: (nodeId: string) => void;
  onRenameNode: (nodeId: string, newTitle: string) => void;
  onExport: () => void;
  onClose: () => void;
  onSearch: () => void;
  onDocTypeSettings: () => void;
  onEnterReadThrough: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  // Extended theme system
  activeThemeId: string;
  builtinThemes: ThemeMetadata[];
  customThemes: ThemeMetadata[];
  onSetTheme: (id: string) => void;
  onImportTheme: () => void;
  onDeleteCustomTheme: (id: string) => void;
  customFonts: FontInfo[];
  fontPrefs: FontPreference;
  onImportFont: (target: "ui" | "mono") => void;
  onResetFont: (target: "ui" | "mono") => void;
  // Provides project metadata (status, tags, synopsis) for filtering + future consumers (tree status strip, context menus).
  metadataHandle?: ProjectMetadataHandle;
  // Tag editor
  onToast?: (message: string, type: "success" | "error") => void;
  onEditTags?: (nodeId: string) => void;
}

export function Sidebar({
  manifest,
  selectedId,
  onSelectNode,
  onAddChild,
  onMoveNode,
  onDeleteNode,
  onRenameNode,
  onExport,
  onClose,
  onSearch,
  onDocTypeSettings,
  onEnterReadThrough,
  theme: _theme,
  onToggleTheme: _onToggleTheme,
  activeThemeId,
  builtinThemes,
  customThemes,
  onSetTheme,
  onImportTheme,
  onDeleteCustomTheme,
  customFonts,
  fontPrefs,
  onImportFont,
  onResetFont,
  metadataHandle,
  onToast,
  onEditTags,
}: SidebarProps) {
  const rootNode = manifest.nodes[manifest.root];

  // ── Expand/collapse state ──────────────────────────────────────────────────

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    // Default: all nodes expanded
    const all = new Set<string>();
    for (const id of Object.keys(manifest.nodes)) {
      all.add(id);
    }
    return all;
  });

  // When manifest changes (new nodes added), ensure new nodes are expanded
  useEffect(() => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of Object.keys(manifest.nodes)) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [manifest]);

  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedNodes(new Set(Object.keys(manifest.nodes)));
  }, [manifest]);

  const handleCollapseAll = useCallback(() => {
    // Keep root expanded
    setExpandedNodes(new Set([manifest.root]));
  }, [manifest.root]);

  // ── Tree filter ────────────────────────────────────────────────────────────

  const [treeFilter, setTreeFilter] = useState("");
  const filterInputRef = useRef<HTMLInputElement>(null);

  const visibleNodes = useMemo(
    () => computeVisibleNodes(manifest, treeFilter, metadataHandle?.metadata ?? {}),
    [manifest, treeFilter, metadataHandle?.metadata],
  );

  // Ctrl+Shift+E to focus filter
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "e") {
        e.preventDefault();
        filterInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Pointer-event drag system ──────────────────────────────────────────────

  const dragRef = useRef<DragState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);

  useEffect(() => {
    dropTargetRef.current = dropTarget;
  }, [dropTarget]);

  const handleDragStart = useCallback((nodeId: string, x: number, y: number) => {
    dragRef.current = { nodeId, startX: x, startY: y, active: false };
  }, []);

  const handleTreeDrop = (srcId: string, targetId: string, pos: DropPos) => {
    let newParentId: string;
    let newPosition: number;

    if (pos === "inside") {
      newParentId = targetId;
      newPosition = manifest.nodes[targetId]?.children.length ?? 0;
    } else {
      const parentId = findParent(manifest, targetId);
      if (!parentId) return;
      newParentId = parentId;
      const siblings = manifest.nodes[parentId].children;
      const targetIdx = siblings.indexOf(targetId);
      newPosition = pos === "before" ? targetIdx : targetIdx + 1;

      if (findParent(manifest, srcId) === newParentId) {
        const oldIdx = siblings.indexOf(srcId);
        if (oldIdx !== -1 && oldIdx < newPosition) newPosition -= 1;
      }
    }

    onMoveNode(srcId, newParentId, newPosition);
  };

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (!drag.active) {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
        drag.active = true;
        document.body.classList.add("dragging-active");
        window.getSelection()?.removeAllRanges();
        setDraggingId(drag.nodeId);
      }

      const els = document.elementsFromPoint(e.clientX, e.clientY);
      const rowEl = els.find(
        (el) => el instanceof HTMLElement && el.classList.contains("tree-row"),
      ) as HTMLElement | undefined;

      if (!rowEl) {
        setDropTarget(null);
        return;
      }

      const targetId = rowEl.dataset.nodeId;
      if (!targetId || targetId === drag.nodeId) {
        setDropTarget(null);
        return;
      }

      const rect = rowEl.getBoundingClientRect();
      let pos: DropPos;
      if (targetId === manifest.root) {
        pos = "inside";
      } else if (e.clientY < rect.top + rect.height / 2) {
        pos = "before";
      } else {
        pos = e.clientX > rect.left + rect.width / 2 ? "inside" : "after";
      }

      setDropTarget((prev) =>
        prev?.overId === targetId && prev.position === pos
          ? prev
          : { overId: targetId, position: pos },
      );
    };

    const onPointerUp = (_e: PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      document.body.classList.remove("dragging-active");

      if (!drag?.active) {
        setDraggingId(null);
        setDropTarget(null);
        return;
      }

      const target = dropTargetRef.current;
      if (target && target.overId !== drag.nodeId) {
        handleTreeDrop(drag.nodeId, target.overId, target.position);
      }

      setDraggingId(null);
      setDropTarget(null);
    };

    const onSelectStart = (e: Event) => {
      if (dragRef.current?.active) e.preventDefault();
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("selectstart", onSelectStart);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("selectstart", onSelectStart);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, onMoveNode]);

  // ── Theme picker ────────────────────────────────────────────────────────────

  const [showThemePicker, setShowThemePicker] = useState(false);
  const themeBtnRef = useRef<HTMLButtonElement>(null);

  // ── Context menu & delete ──────────────────────────────────────────────────

  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // ── Stable callback refs for TreeNode (prevent memo-busting) ─────────────

  const handleAddChild = useCallback((parentId: string) => onAddChild(parentId), [onAddChild]);
  const handleAddToRootSection = useCallback(
    (category: DocCategory) => onAddChild(manifest.root, category),
    [onAddChild, manifest.root],
  );
  const handleContextMenu = useCallback(
    (id: string, x: number, y: number) => setContextMenu({ nodeId: id, x, y }),
    [],
  );
  const handleRenameCommit = useCallback(
    (id: string, title: string) => {
      setRenamingId(null);
      onRenameNode(id, title);
    },
    [onRenameNode],
  );
  const handleRenameCancel = useCallback(() => setRenamingId(null), []);
  const handleStartRename = useCallback((id: string) => setRenamingId(id), []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="project-name">{rootNode?.title ?? "Project"}</span>
        <div style={{ display: "flex", gap: "2px" }}>
          <button className="icon-btn" title={`Search (${mod}+Shift+F)`} onClick={onSearch}>
            <Search size={15} strokeWidth={1.75} />
          </button>
          <button
            ref={themeBtnRef}
            className="icon-btn"
            title="Themes"
            onClick={() => setShowThemePicker((v) => !v)}
          >
            <Palette size={15} strokeWidth={1.75} />
          </button>
          <button className="icon-btn" title="Document types" onClick={onDocTypeSettings}>
            <Settings size={15} strokeWidth={1.75} />
          </button>
          <button className="icon-btn" title="Export manuscript" onClick={onExport}>
            <Download size={15} strokeWidth={1.75} />
          </button>
          <button
            className="icon-btn"
            title={`Read through manuscript (${mod}+Shift+R)`}
            onClick={onEnterReadThrough}
          >
            <BookOpen size={15} strokeWidth={1.75} />
          </button>
          <button className="icon-btn" title="Close project" onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      {showThemePicker && (
        <ThemePicker
          activeThemeId={activeThemeId}
          builtinThemes={builtinThemes}
          customThemes={customThemes}
          customFonts={customFonts}
          fontPrefs={fontPrefs}
          onSelectTheme={(id) => {
            onSetTheme(id);
          }}
          onImportTheme={onImportTheme}
          onDeleteCustomTheme={onDeleteCustomTheme}
          onImportFont={onImportFont}
          onResetFont={onResetFont}
          onClose={() => setShowThemePicker(false)}
        />
      )}

      {/* Tree filter & expand controls */}
      <div className="tree-controls">
        <input
          ref={filterInputRef}
          className="tree-filter-input"
          type="text"
          placeholder="Filter nodes…"
          value={treeFilter}
          onChange={(e) => setTreeFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setTreeFilter("");
              filterInputRef.current?.blur();
            }
          }}
        />
        <button
          className="icon-btn tree-expand-btn"
          title="Expand all"
          onClick={handleExpandAll}
        >
          <ChevronsUpDown size={14} strokeWidth={1.75} />
        </button>
        <button
          className="icon-btn tree-expand-btn"
          title="Collapse all"
          onClick={handleCollapseAll}
        >
          <ChevronsDownUp size={14} strokeWidth={1.75} />
        </button>
      </div>

      <div className="tree">
        <TreeNode
          nodeId={manifest.root}
          manifest={manifest}
          metadata={metadataHandle?.metadata}
          selectedId={selectedId}
          draggingId={draggingId}
          dropTarget={dropTarget}
          renamingId={renamingId}
          expandedNodes={expandedNodes}
          visibleNodes={visibleNodes}
          onSelect={onSelectNode}
          onAddChild={handleAddChild}
          onAddToRootSection={handleAddToRootSection}
          onContextMenu={handleContextMenu}
          onDragStart={handleDragStart}
          onRenameCommit={handleRenameCommit}
          onRenameCancel={handleRenameCancel}
          onStartRename={handleStartRename}
          onToggleExpand={handleToggleExpand}
          depth={0}
        />
      </div>

      {contextMenu && (
        <ContextMenu
          nodeId={contextMenu.nodeId}
          x={contextMenu.x}
          y={contextMenu.y}
          isRoot={contextMenu.nodeId === manifest.root}
          onAddChild={(id) => {
            setContextMenu(null);
            onAddChild(id);
          }}
          onRename={(id) => {
            setContextMenu(null);
            setRenamingId(id);
          }}
          onDelete={(id) => {
            setContextMenu(null);
            setDeleteTarget(id);
          }}
          onClose={() => setContextMenu(null)}
          currentStatus={metadataHandle?.metadata[contextMenu.nodeId]?.status}
          onSetStatus={
            metadataHandle
              ? async (id, status) => {
                  try {
                    await metadataHandle.updateNode(id, { status });
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    console.error(`Failed to set status for ${id}:`, err);
                    onToast?.(`Failed to set status: ${msg}`, "error");
                  }
                }
              : undefined
          }
          onEditTags={metadataHandle ? onEditTags : undefined}
        />
      )}

      {deleteTarget && manifest.nodes[deleteTarget] && (
        <DeleteConfirmDialog
          nodeId={deleteTarget}
          manifest={manifest}
          onConfirm={(id) => {
            setDeleteTarget(null);
            onDeleteNode(id);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

    </aside>
  );
}
