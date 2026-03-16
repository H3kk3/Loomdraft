import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { ProjectManifest, DocumentContent, ExportResult } from "./types";
import { Sidebar } from "./components/Sidebar";
import { Editor } from "./components/Editor";
import { NewProjectDialog, AddNodeDialog } from "./components/Dialogs";
import { ExportDialog, type ExportFormat } from "./components/ExportDialog";
import { SearchPanel } from "./components/SearchPanel";
import { QuickOpen } from "./components/QuickOpen";
import { Toast, type ToastData } from "./components/Toast";
import { DocTypeSettings } from "./components/DocTypeSettings";
import { useTheme } from "./useTheme";
import {
  getManuscriptDocTypes,
  getPlanningDocTypes,
  getAllowedChildDocTypes,
  type DocCategory,
} from "./docTypes";
import { MAX_RECENT_PROJECTS } from "./constants";
import "./App.css";

// ── Breadcrumb helper ────────────────────────────────────────────────────────

function buildBreadcrumb(
  manifest: ProjectManifest,
  nodeId: string,
): { id: string; title: string }[] {
  const crumbs: { id: string; title: string }[] = [];
  let current: string | null = nodeId;
  while (current && current !== manifest.root) {
    const node = manifest.nodes[current];
    if (node) {
      crumbs.unshift({ id: current, title: node.title ?? current });
    }
    // Find parent
    let parent: string | null = null;
    for (const [id, n] of Object.entries(manifest.nodes)) {
      if (n.children.includes(current)) {
        parent = id;
        break;
      }
    }
    current = parent;
  }
  return crumbs;
}

// ── Recent projects ──────────────────────────────────────────────────────────

const RECENT_KEY = "loomdraft:recent_projects";

function getRecentProjects(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addRecentProject(path: string): void {
  const recent = getRecentProjects().filter((p) => p !== path);
  recent.unshift(path);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_PROJECTS)));
}

// ── Welcome screen ────────────────────────────────────────────────────────────

function Welcome({
  onNew,
  onOpen,
  onOpenRecent,
  error,
  activeThemeId,
  builtinThemes,
  onSetTheme,
}: {
  onNew: () => void;
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  error: string | null;
  activeThemeId: string;
  builtinThemes: import("./themes/themeTypes").ThemeMetadata[];
  onSetTheme: (id: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const recent = getRecentProjects();

  // Cycle to next built-in theme on click, or open picker on long-press
  const cycleTheme = () => {
    const ids = builtinThemes.map((t) => t.id);
    const idx = ids.indexOf(activeThemeId);
    const nextId = ids[(idx + 1) % ids.length];
    onSetTheme(nextId);
  };

  return (
    <div className="welcome">
      <div className="welcome-theme-area">
        <button
          className="welcome-theme-btn"
          onClick={cycleTheme}
          onContextMenu={(e) => {
            e.preventDefault();
            setShowPicker((v) => !v);
          }}
          title="Click to cycle themes · Right-click to browse"
        >
          🎨
        </button>
        {showPicker && (
          <div className="welcome-theme-picker">
            {builtinThemes.map((t) => (
              <button
                key={t.id}
                className={`welcome-theme-option${t.id === activeThemeId ? " active" : ""}`}
                onClick={() => {
                  onSetTheme(t.id);
                  setShowPicker(false);
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <h1 className="welcome-title">Loomdraft</h1>
      <p className="welcome-sub">A writing app for your desktop</p>
      <div className="welcome-actions">
        <button className="primary large" onClick={onNew}>
          New Project
        </button>
        <button className="large" onClick={onOpen}>
          Open Project
        </button>
      </div>
      {recent.length > 0 && (
        <div className="recent-projects">
          <div className="recent-label">Recent</div>
          {recent.map((path) => (
            <button
              key={path}
              className="recent-item"
              onClick={() => onOpenRecent(path)}
              title={path}
            >
              {path.split("/").pop() || path}
              <span className="recent-path">{path}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="error-msg">{error}</p>}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  type AddTarget = { parentId: string; category?: DocCategory };

  const {
    theme,
    toggleTheme,
    activeThemeId,
    activeTheme,
    builtinThemes,
    customThemes,
    customFonts,
    fontPrefs,
    setTheme: setThemeById,
    importTheme,
    deleteCustomTheme,
    importFont,
    resetFont,
  } = useTheme();
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ProjectManifest | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingUnder, setAddingUnder] = useState<AddTarget | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editorDistractionFree, setEditorDistractionFree] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [showDocTypeSettings, setShowDocTypeSettings] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  const projectPathRef = useRef<string | null>(null);

  const showToast = useCallback((message: string, type: ToastData["type"] = "success") => {
    setToast({ message, type });
  }, []);

  // ── Theme/font operations with toast notifications ──────────────────────
  const handleImportTheme = useCallback(async () => {
    try {
      await importTheme();
      showToast("Theme imported");
    } catch (e) {
      showToast(String(e), "error");
    }
  }, [importTheme, showToast]);

  const handleImportFont = useCallback(
    async (target: "ui" | "mono") => {
      try {
        await importFont(target);
        showToast(`${target === "ui" ? "UI" : "Editor"} font updated`);
      } catch (e) {
        showToast(String(e), "error");
      }
    },
    [importFont, showToast],
  );

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    projectPathRef.current = projectPath;
  }, [projectPath]);

  // ── Global keyboard shortcuts ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        if (projectPath) setShowSearch((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        if (projectPath && manifest) setShowQuickOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [projectPath, manifest]);

  // ── Auto-save on window close ──────────────────────────────────────────
  // The Editor component handles save-on-unmount, but we also hook the Tauri
  // close event to ensure React's unmount cycle completes before the window
  // is destroyed.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested(async (event) => {
        // Prevent immediate close — give React a tick to unmount and flush
        event.preventDefault();
        // Small delay to let Editor's cleanup effect fire
        await new Promise((r) => setTimeout(r, 150));
        await getCurrentWindow().destroy();
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, []);

  // ── Project actions ──────────────────────────────────────────────────────

  const handleNewProjectConfirm = async (dir: string, name: string) => {
    setShowNewProject(false);
    setLoading(true);
    try {
      const [path, mf] = await invoke<[string, ProjectManifest]>("create_project", { dir, name });
      setProjectPath(path);
      setManifest(mf);
      setSelectedNodeId(null);
      setDocument(null);
      addRecentProject(path);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const openProjectByPath = async (dir: string) => {
    setError(null);
    setLoading(true);
    try {
      const mf = await invoke<ProjectManifest>("open_project", { path: dir });
      setProjectPath(dir);
      setManifest(mf);
      setSelectedNodeId(null);
      setDocument(null);
      addRecentProject(dir);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProject = async () => {
    setError(null);
    const dir = await open({ directory: true, title: "Open project folder" });
    if (!dir || typeof dir !== "string") return;
    await openProjectByPath(dir);
  };

  const handleCloseProject = () => {
    setProjectPath(null);
    setManifest(null);
    setDocument(null);
    setSelectedNodeId(null);
    setEditorDistractionFree(false);
  };

  // ── Document actions ─────────────────────────────────────────────────────

  const handleSelectNode = async (nodeId: string) => {
    if (!projectPath) return;
    setSelectedNodeId(nodeId);
    setError(null);
    try {
      const doc = await invoke<DocumentContent>("load_document", { projectPath, nodeId });
      setDocument(doc);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleSaveDocument = async (nodeId: string, content: string): Promise<boolean> => {
    const currentProjectPath = projectPathRef.current;
    if (!currentProjectPath) return false;

    try {
      const doc = await invoke<DocumentContent>("save_document", {
        projectPath: currentProjectPath,
        nodeId,
        content,
      });

      // Ignore stale async save responses if user already navigated away.
      if (selectedNodeIdRef.current === nodeId) {
        setDocument(doc);
      }
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  };

  // ── Node management ──────────────────────────────────────────────────────

  const handleAddConfirm = async (title: string, docType: string) => {
    if (!projectPath || !addingUnder || !manifest) return;
    const target = addingUnder;
    setAddingUnder(null);

    const dt = manifest.doc_types;
    const parentDocType = manifest.nodes[target.parentId]?.doc_type;
    const allowedDocTypes =
      target.category === "manuscript"
        ? getManuscriptDocTypes(dt)
        : target.category === "planning"
          ? getPlanningDocTypes(dt)
          : getAllowedChildDocTypes(dt, parentDocType);
    if (!allowedDocTypes.some((d) => d.id === docType)) {
      setError(`Cannot create a ${docType} document under this parent`);
      return;
    }

    try {
      const [nodeId, mf] = await invoke<[string, ProjectManifest]>("add_node", {
        projectPath,
        parentId: target.parentId,
        title,
        docType,
      });
      setManifest(mf);
      await handleSelectNode(nodeId);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    if (!projectPath) return;
    try {
      const mf = await invoke<ProjectManifest>("delete_node", { projectPath, nodeId });
      setManifest(mf);
      if (selectedNodeId && !mf.nodes[selectedNodeId]) {
        setSelectedNodeId(null);
        setDocument(null);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRenameNode = async (nodeId: string, newTitle: string) => {
    if (!projectPath) return;
    try {
      const mf = await invoke<ProjectManifest>("rename_node", {
        projectPath,
        nodeId,
        newTitle,
      });
      setManifest(mf);
    } catch (e) {
      setError(String(e));
    }
  };

  // Sidebar computes newParentId and numeric position; App just calls the IPC.
  // move_node already returns the updated manifest — use it directly instead
  // of a redundant get_project_tree round-trip.
  const handleMoveNode = async (draggingId: string, newParentId: string, position: number) => {
    if (!projectPath) return;
    try {
      const refreshed = await invoke<ProjectManifest>("move_node", {
        projectPath,
        nodeId: draggingId,
        newParentId,
        position,
      });
      setManifest(refreshed);
    } catch (e) {
      setError(`Move failed: ${String(e)}`);
    }
  };

  // ── Export ─────────────────────────────────────────────────────────────

  const handleExportManuscript = async (format: ExportFormat) => {
    setShowExportDialog(false);
    if (!projectPath) return;

    const extMap: Record<ExportFormat, { ext: string; name: string }> = {
      md: { ext: "md", name: "Markdown" },
      html: { ext: "html", name: "HTML" },
      pdf: { ext: "pdf", name: "PDF" },
    };
    const { ext, name: filterName } = extMap[format];
    const projectTitle = manifest?.nodes[manifest.root]?.title ?? "manuscript";
    const defaultName = `${projectTitle}.${ext}`;

    try {
      const outputPath = await save({
        title: "Export Manuscript",
        defaultPath: defaultName,
        filters: [{ name: filterName, extensions: [ext] }],
      });
      if (!outputPath) return; // user cancelled

      setExporting(true);
      try {
        const result = await invoke<ExportResult>("export_manuscript", {
          projectPath,
          format,
          outputPath,
        });

        const fileName = result.output_path.split("/").pop() ?? result.output_path;
        showToast(
          `Exported ${result.section_count} section${result.section_count !== 1 ? "s" : ""} · ${result.word_count.toLocaleString()} words → ${fileName}`,
        );
      } finally {
        setExporting(false);
      }
    } catch (e) {
      showToast(String(e), "error");
      setExporting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="loading">
        <span>Loading…</span>
      </div>
    );
  }

  if (!projectPath || !manifest) {
    return (
      <>
        <Welcome
          onNew={() => {
            setError(null);
            setShowNewProject(true);
          }}
          onOpen={handleOpenProject}
          onOpenRecent={openProjectByPath}
          error={error}
          activeThemeId={activeThemeId}
          builtinThemes={builtinThemes}
          onSetTheme={setThemeById}
        />
        {showNewProject && (
          <NewProjectDialog
            onConfirm={handleNewProjectConfirm}
            onCancel={() => setShowNewProject(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className={`layout${editorDistractionFree ? " focus-layout" : ""}`}>
      {!editorDistractionFree && (
        <Sidebar
          manifest={manifest}
          selectedId={selectedNodeId}
          onSelectNode={handleSelectNode}
          onAddChild={(parentId, category) => setAddingUnder({ parentId, category })}
          onMoveNode={handleMoveNode}
          onDeleteNode={handleDeleteNode}
          onRenameNode={handleRenameNode}
          onExport={() => setShowExportDialog(true)}
          onClose={handleCloseProject}
          onSearch={() => setShowSearch(true)}
          onDocTypeSettings={() => setShowDocTypeSettings(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
          activeThemeId={activeThemeId}
          builtinThemes={builtinThemes}
          customThemes={customThemes}
          onSetTheme={setThemeById}
          onImportTheme={handleImportTheme}
          onDeleteCustomTheme={deleteCustomTheme}
          customFonts={customFonts}
          fontPrefs={fontPrefs}
          onImportFont={handleImportFont}
          onResetFont={resetFont}
        />
      )}

      <main className="main">
        {document && selectedNodeId && !editorDistractionFree && (
          <div className="breadcrumb">
            {buildBreadcrumb(manifest, selectedNodeId).map((crumb, i, arr) => (
              <span key={crumb.id}>
                <button
                  className={`breadcrumb-item${i === arr.length - 1 ? " current" : ""}`}
                  onClick={() => handleSelectNode(crumb.id)}
                >
                  {crumb.title}
                </button>
                {i < arr.length - 1 && <span className="breadcrumb-sep">/</span>}
              </span>
            ))}
          </div>
        )}
        {document ? (
          <Editor
            doc={document}
            onSave={handleSaveDocument}
            manifest={manifest}
            onSelectNode={handleSelectNode}
            projectPath={projectPath ?? undefined}
            onDistractionFreeChange={setEditorDistractionFree}
            activeTheme={activeTheme}
          />
        ) : (
          <div className="empty-state">
            <div className="empty-state-content">
              <p className="empty-state-title">No document selected</p>
              <p className="empty-state-subtitle">
                Select a document from the sidebar, or add one with +
              </p>
              <div className="empty-state-shortcuts">
                <div className="shortcut-row">
                  <kbd>Ctrl+P</kbd>
                  <span>Quick open</span>
                </div>
                <div className="shortcut-row">
                  <kbd>Ctrl+Shift+F</kbd>
                  <span>Search documents</span>
                </div>
                <div className="shortcut-row">
                  <kbd>Ctrl+Shift+D</kbd>
                  <span>Distraction-free mode</span>
                </div>
                <div className="shortcut-row">
                  <kbd>Ctrl+Alt+T</kbd>
                  <span>Typewriter mode</span>
                </div>
                <div className="shortcut-row">
                  <kbd>Ctrl+Alt+F</kbd>
                  <span>Focus mode</span>
                </div>
              </div>
            </div>
          </div>
        )}
        {error && <div className="error-banner">{error}</div>}
      </main>

      {addingUnder && manifest.nodes[addingUnder.parentId] && (
        <AddNodeDialog
          parentTitle={
            addingUnder.parentId === manifest.root && addingUnder.category
              ? addingUnder.category === "manuscript"
                ? "Manuscript"
                : "Planning"
              : (manifest.nodes[addingUnder.parentId].title ?? addingUnder.parentId)
          }
          allowedDocTypes={
            addingUnder.category === "manuscript"
              ? getManuscriptDocTypes(manifest.doc_types)
              : addingUnder.category === "planning"
                ? getPlanningDocTypes(manifest.doc_types)
                : getAllowedChildDocTypes(manifest.doc_types, manifest.nodes[addingUnder.parentId].doc_type)
          }
          onConfirm={handleAddConfirm}
          onCancel={() => setAddingUnder(null)}
        />
      )}

      {showExportDialog && (
        <ExportDialog
          projectTitle={manifest.nodes[manifest.root]?.title ?? "Manuscript"}
          onExport={handleExportManuscript}
          onCancel={() => setShowExportDialog(false)}
        />
      )}

      {exporting && (
        <div className="dialog-backdrop">
          <div className="export-loading">
            <div className="export-spinner" />
            <span>Exporting manuscript…</span>
          </div>
        </div>
      )}

      {showSearch && projectPath && (
        <SearchPanel
          projectPath={projectPath}
          docTypes={manifest?.doc_types ?? []}
          onSelectNode={handleSelectNode}
          onClose={() => setShowSearch(false)}
        />
      )}

      {showQuickOpen && manifest && (
        <QuickOpen
          manifest={manifest}
          onSelectNode={handleSelectNode}
          onClose={() => setShowQuickOpen(false)}
        />
      )}

      {showDocTypeSettings && manifest && projectPath && (
        <DocTypeSettings
          projectPath={projectPath}
          docTypes={manifest.doc_types}
          nodeCounts={(() => {
            const counts: Record<string, number> = {};
            for (const node of Object.values(manifest.nodes)) {
              if (node.doc_type) counts[node.doc_type] = (counts[node.doc_type] ?? 0) + 1;
            }
            return counts;
          })()}
          onUpdated={(docTypes) => {
            setManifest((m) => (m ? { ...m, doc_types: docTypes } : m));
          }}
          onClose={() => setShowDocTypeSettings(false)}
        />
      )}

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
