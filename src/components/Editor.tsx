import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { history, undo, redo, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { search, searchKeymap, openSearchPanel } from "@codemirror/search";
import type { DocumentContent, ProjectManifest, WordCountResult } from "../types";
import { Toolbar } from "./Toolbar";
import { ImagePreviewCard, type ActiveImage } from "./ImagePreviewCard";
import { VersionHistory } from "./VersionHistory";
import { parseHeadings } from "../utils/headings";
import { countWords, countChars } from "../utils/wordCount";
import { useCodeMirror, type CursorPosition } from "../editor/useCodeMirror";
import { loomdraftTheme, manuscriptTheme, misspelledStyle } from "../editor/theme";
import { spellCheckExtension } from "../editor/spellCheckExtension";
import { loomdraftKeymap } from "../editor/keymaps";
import {
  manifestFacet,
  projectPathFacet,
  onSelectNodeFacet,
  onImageClickFacet,
  onLinkHoverFacet,
  type HoveredLink,
} from "../editor/facets";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { wikiLinkExtension } from "../editor/wikiLinkExtension";
import { imageExtension } from "../editor/imageExtension";
import { ImageCache } from "../editor/imageCache";
import { typewriterExtension } from "../editor/typewriterExtension";
import { focusModeExtension } from "../editor/focusModeExtension";
import { createSyntaxHighlighting } from "../themes/syntaxTheme";
import type { ThemeDefinition } from "../themes/themeTypes";
import { AUTOSAVE_INTERVAL_MS, UNDO_GROUP_DELAY_MS } from "../constants";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EditorProps {
  doc: DocumentContent;
  onSave: (nodeId: string, content: string) => Promise<boolean>;
  manifest?: ProjectManifest;
  onSelectNode?: (id: string) => void;
  projectPath?: string;
  onDistractionFreeChange?: (enabled: boolean) => void;
  activeTheme?: ThemeDefinition;
}

// ── Editor ────────────────────────────────────────────────────────────────────

export function Editor({
  doc,
  onSave,
  manifest,
  onSelectNode,
  projectPath,
  onDistractionFreeChange,
  activeTheme,
}: EditorProps) {
  const [content, setContent] = useState(doc.content);
  const [activeImage, setActiveImage] = useState<ActiveImage | null>(null);
  const [dirty, setDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [typewriterMode, setTypewriterMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [distractionFree, setDistractionFree] = useState(false);
  const [softWrap, setSoftWrap] = useState(true);
  const [showOutline, setShowOutline] = useState(false);
  const [manuscriptWordCount, setManuscriptWordCount] = useState<{
    words: number;
    chars: number;
  } | null>(null);
  const [selectionText, setSelectionText] = useState("");
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [spellCheck, setSpellCheck] = useState(() => {
    try {
      return localStorage.getItem("loomdraft-spellcheck") === "true";
    } catch {
      return false;
    }
  });
  const [manuscriptMode, setManuscriptMode] = useState(() => {
    try {
      return localStorage.getItem("loomdraft-manuscript-mode") === "true";
    } catch {
      return false;
    }
  });
  const [hoveredLink, setHoveredLink] = useState<HoveredLink | null>(null);
  const [linkPreview, setLinkPreview] = useState<DocumentContent | null>(null);
  const [cursorPos, setCursorPos] = useState<CursorPosition>({ line: 1, col: 1 });
  const [wordGoal, setWordGoal] = useState<number | null>(() => {
    try {
      const stored = localStorage.getItem(`loomdraft-goal:${doc.id}`);
      return stored ? Number(stored) : null;
    } catch {
      return null;
    }
  });
  const [showGoalInput, setShowGoalInput] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const outlinePopoverRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef(doc.content);
  const dirtyRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);

  // ── Compartments for reconfigurable extensions ────────────────────────────
  const wrapCompartment = useRef(new Compartment());
  const manifestCompartment = useRef(new Compartment());
  const pathCompartment = useRef(new Compartment());
  const selectNodeCompartment = useRef(new Compartment());
  const imageClickCompartment = useRef(new Compartment());
  const typewriterCompartment = useRef(new Compartment());
  const focusModeCompartment = useRef(new Compartment());
  const spellCheckCompartment = useRef(new Compartment());
  const manuscriptCompartment = useRef(new Compartment());
  const linkHoverCompartment = useRef(new Compartment());
  const syntaxHighlightCompartment = useRef(new Compartment());
  const linkDismissTimer = useRef<number | null>(null);

  // ── Image cache ─────────────────────────────────────────────────────────
  const imageCacheRef = useRef<ImageCache | null>(null);
  if (!imageCacheRef.current && projectPath) {
    imageCacheRef.current = new ImageCache(projectPath);
  }

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    onDistractionFreeChange?.(distractionFree);
  }, [distractionFree, onDistractionFreeChange]);

  useEffect(() => {
    return () => onDistractionFreeChange?.(false);
  }, [onDistractionFreeChange]);

  // ── Save logic ──────────────────────────────────────────────────────────────
  const saveSnapshot = useCallback(
    async (nodeId: string, snapshot: string) => {
      const ok = await onSave(nodeId, snapshot);
      return ok;
    },
    [onSave],
  );

  const flushSave = useCallback(async () => {
    if (!dirtyRef.current) return;

    const nodeId = doc.id;
    const snapshot = contentRef.current;

    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      return;
    }

    saveInFlightRef.current = true;
    setIsSaving(true);

    try {
      const ok = await saveSnapshot(nodeId, snapshot);
      if (ok && doc.id === nodeId && contentRef.current === snapshot) {
        dirtyRef.current = false;
        setDirty(false);
        setLastSavedAt(new Date());
        if (projectPath) {
          invoke<WordCountResult>("get_manuscript_word_count", { projectPath })
            .then((r) => setManuscriptWordCount({ words: r.total_words, chars: r.total_chars }))
            .catch(() => {});
        }
      }
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);

      if (saveQueuedRef.current) {
        saveQueuedRef.current = false;
        if (dirtyRef.current) {
          void flushSave();
        }
      }
    }
  }, [doc.id, saveSnapshot, projectPath]);

  const handleSave = useCallback(() => {
    void flushSave();
  }, [flushSave]);

  // Save on doc switch or unmount
  useEffect(() => {
    const currentDocId = doc.id;
    return () => {
      if (!dirtyRef.current) return;
      const snapshot = contentRef.current;
      void saveSnapshot(currentDocId, snapshot);
    };
  }, [doc.id, saveSnapshot]);

  // Periodic autosave
  useEffect(() => {
    if (!dirty) return;
    const id = window.setInterval(() => {
      void flushSave();
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [dirty, flushSave]);

  // Cleanup
  useEffect(() => {
    return () => {
      saveQueuedRef.current = false;
    };
  }, []);

  // ── onChange from CodeMirror ────────────────────────────────────────────────
  const handleDocChanged = useCallback((newValue: string) => {
    setContent(newValue);
    setDirty(true);
  }, []);

  const handleSelectionChanged = useCallback((sel: string) => {
    setSelectionText(sel);
  }, []);

  const handleCursorChanged = useCallback((pos: CursorPosition) => {
    setCursorPos(pos);
  }, []);

  // ── Reset state when switching documents ─────────────────────────────────
  useEffect(() => {
    setContent(doc.content);
    setDirty(false);
    setShowOutline(false);
    setShowHistory(false);
    setLastSavedAt(null);
    setSelectionText("");
    setShowGoalInput(false);
    try {
      const stored = localStorage.getItem(`loomdraft-goal:${doc.id}`);
      setWordGoal(stored ? Number(stored) : null);
    } catch {
      setWordGoal(null);
    }
  }, [doc.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── CodeMirror extensions ──────────────────────────────────────────────────
  // Stable refs for keymap callbacks (avoids recreating extensions)
  const keymapCallbacksRef = useRef({
    onSave: handleSave,
    onToggleDistractionFree: () => setDistractionFree((v) => !v),
    onToggleOutline: () => setShowOutline((v) => !v),
    onToggleTypewriter: () => setTypewriterMode((v) => !v),
    onToggleFocusMode: () => setFocusMode((v) => !v),
    onToggleSoftWrap: () => setSoftWrap((v) => !v),
  });
  useEffect(() => {
    keymapCallbacksRef.current.onSave = handleSave;
  }, [handleSave]);

  const extensions = useMemo(() => {
    const exts = [
      loomdraftTheme,
      history({ newGroupDelay: UNDO_GROUP_DELAY_MS }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      search(),
      markdown(),
      placeholder("Start writing\u2026 Use [[Node Title]] to link to any document."),
      loomdraftKeymap({
        onSave: () => keymapCallbacksRef.current.onSave(),
        onToggleDistractionFree: () => keymapCallbacksRef.current.onToggleDistractionFree(),
        onToggleOutline: () => keymapCallbacksRef.current.onToggleOutline(),
        onToggleTypewriter: () => keymapCallbacksRef.current.onToggleTypewriter(),
        onToggleFocusMode: () => keymapCallbacksRef.current.onToggleFocusMode(),
        onToggleSoftWrap: () => keymapCallbacksRef.current.onToggleSoftWrap(),
      }),
      wrapCompartment.current.of(EditorView.lineWrapping),
      // Facets for wiki-links and images
      manifestCompartment.current.of(manifestFacet.of(manifest ?? null)),
      pathCompartment.current.of(projectPathFacet.of(projectPath ?? "")),
      selectNodeCompartment.current.of(onSelectNodeFacet.of(onSelectNode ?? null)),
      imageClickCompartment.current.of(onImageClickFacet.of(null)),
      linkHoverCompartment.current.of(onLinkHoverFacet.of(null)),
      // Wiki-link decorations + click handler + hover
      wikiLinkExtension(),
      // Typewriter and focus mode (initially off)
      typewriterCompartment.current.of([]),
      focusModeCompartment.current.of([]),
      // Spell-check (decoration-based with nspell dictionary)
      misspelledStyle,
      spellCheckCompartment.current.of(spellCheck ? spellCheckExtension() : []),
      // Manuscript mode (centered column, initially from localStorage)
      manuscriptCompartment.current.of(manuscriptMode ? manuscriptTheme : []),
      // Syntax highlighting from active theme
      syntaxHighlightCompartment.current.of(
        activeTheme ? createSyntaxHighlighting(activeTheme.syntax, activeTheme.colors) : [],
      ),
    ];
    // Image block widgets (only when project path is available)
    if (imageCacheRef.current) {
      exts.push(imageExtension(imageCacheRef.current));
    }
    return exts;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mount CodeMirror ──────────────────────────────────────────────────────
  const { viewRef } = useCodeMirror({
    containerRef: editorContainerRef,
    initialDoc: doc.content,
    docId: doc.id,
    extensions,
    onDocChanged: handleDocChanged,
    onSelectionChanged: handleSelectionChanged,
    onCursorChanged: handleCursorChanged,
  });

  // ── Soft wrap toggle ───────────────────────────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: wrapCompartment.current.reconfigure(softWrap ? EditorView.lineWrapping : []),
    });
  }, [softWrap, viewRef, doc.id]);

  // ── Reconfigure facets when props change ─────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: manifestCompartment.current.reconfigure(manifestFacet.of(manifest ?? null)),
    });
  }, [manifest, viewRef]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: selectNodeCompartment.current.reconfigure(
        onSelectNodeFacet.of(onSelectNode ?? null),
      ),
    });
  }, [onSelectNode, viewRef]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: imageClickCompartment.current.reconfigure(
        onImageClickFacet.of((img: ActiveImage) => setActiveImage(img)),
      ),
    });
  }, [viewRef, doc.id]);

  // ── Typewriter mode toggle ──────────────────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: typewriterCompartment.current.reconfigure(
        typewriterMode ? typewriterExtension() : [],
      ),
    });
  }, [typewriterMode, viewRef, doc.id]);

  // ── Focus mode toggle ────────────────────────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: focusModeCompartment.current.reconfigure(focusMode ? focusModeExtension() : []),
    });
  }, [focusMode, viewRef, doc.id]);

  // ── Spell-check toggle ─────────────────────────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: spellCheckCompartment.current.reconfigure(spellCheck ? spellCheckExtension() : []),
    });
    try {
      localStorage.setItem("loomdraft-spellcheck", String(spellCheck));
    } catch {
      /* noop */
    }
  }, [spellCheck, viewRef, doc.id]);

  // ── Manuscript mode toggle ──────────────────────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: manuscriptCompartment.current.reconfigure(manuscriptMode ? manuscriptTheme : []),
    });
    try {
      localStorage.setItem("loomdraft-manuscript-mode", String(manuscriptMode));
    } catch {
      /* noop */
    }
  }, [manuscriptMode, viewRef, doc.id]);

  // ── Syntax highlighting (reconfigure on theme change) ──────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !activeTheme) return;
    view.dispatch({
      effects: syntaxHighlightCompartment.current.reconfigure(
        createSyntaxHighlighting(activeTheme.syntax, activeTheme.colors),
      ),
    });
  }, [activeTheme, viewRef, doc.id]);

  // ── Link hover preview ─────────────────────────────────────────────────────
  const handleLinkHover = useCallback((link: HoveredLink | null) => {
    // Cancel any pending dismiss
    if (linkDismissTimer.current !== null) {
      window.clearTimeout(linkDismissTimer.current);
      linkDismissTimer.current = null;
    }

    if (link) {
      setHoveredLink(link);
    } else {
      // Delay dismiss so user can move to the card
      linkDismissTimer.current = window.setTimeout(() => {
        setHoveredLink(null);
        setLinkPreview(null);
        linkDismissTimer.current = null;
      }, 200);
    }
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: linkHoverCompartment.current.reconfigure(onLinkHoverFacet.of(handleLinkHover)),
    });
  }, [handleLinkHover, viewRef, doc.id]);

  // Fetch preview content when hovered link changes
  useEffect(() => {
    if (!hoveredLink || !projectPath) {
      setLinkPreview(null);
      return;
    }
    let cancelled = false;
    invoke<DocumentContent>("load_document", {
      projectPath,
      nodeId: hoveredLink.nodeId,
    })
      .then((doc) => {
        if (!cancelled) setLinkPreview(doc);
      })
      .catch(() => {
        if (!cancelled) setLinkPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [hoveredLink?.nodeId, projectPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up dismiss timer on unmount
  useEffect(() => {
    return () => {
      if (linkDismissTimer.current !== null) window.clearTimeout(linkDismissTimer.current);
    };
  }, []);

  // Reset link hover on doc switch
  useEffect(() => {
    if (linkDismissTimer.current !== null) {
      window.clearTimeout(linkDismissTimer.current);
      linkDismissTimer.current = null;
    }
    setHoveredLink(null);
    setLinkPreview(null);
  }, [doc.id]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const outlineEntries = useMemo(() => parseHeadings(content), [content]);
  const lastSavedLabel = lastSavedAt
    ? lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  // ── Word / character counts ─────────────────────────────────────────────
  const docWords = useMemo(() => countWords(content), [content]);
  const docChars = useMemo(() => countChars(content), [content]);
  const selWords = useMemo(() => (selectionText ? countWords(selectionText) : 0), [selectionText]);
  const selChars = useMemo(() => (selectionText ? countChars(selectionText) : 0), [selectionText]);
  const readingTime = useMemo(() => Math.max(1, Math.ceil(docWords / 250)), [docWords]);

  // Fetch manuscript-wide word count on doc load
  useEffect(() => {
    if (!projectPath) return;
    invoke<WordCountResult>("get_manuscript_word_count", { projectPath })
      .then((r) => setManuscriptWordCount({ words: r.total_words, chars: r.total_chars }))
      .catch(() => {});
  }, [doc.id, projectPath]);

  // ── Drag-and-drop image files ─────────────────────────────────────────────
  useEffect(() => {
    if (!projectPath) return;

    const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);
    let unlisten: (() => void) | null = null;

    getCurrentWebview()
      .onDragDropEvent(async (event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setIsDraggingOver(true);
        } else if (event.payload.type === "leave") {
          setIsDraggingOver(false);
        } else if (event.payload.type === "drop") {
          setIsDraggingOver(false);
          const paths = event.payload.paths;
          const imagePaths = paths.filter((p) => {
            const ext = p.split(".").pop()?.toLowerCase() ?? "";
            return IMAGE_EXTS.has(ext);
          });

          if (imagePaths.length === 0) return;

          const lines: string[] = [];
          for (const sourcePath of imagePaths) {
            try {
              const relativePath = await invoke<string>("import_image", {
                projectPath,
                sourcePath,
              });
              lines.push(`![](${relativePath})`);
            } catch (err) {
              console.warn("DnD image import failed:", err);
            }
          }

          if (lines.length === 0) return;

          const view = viewRef.current;
          if (!view) return;
          view.focus();
          const pos = view.state.selection.main.head;
          const doc = view.state.doc.toString();
          const before = doc.slice(0, pos);
          const after = doc.slice(pos);
          const needNewlineBefore = before.length > 0 && !before.endsWith("\n");
          const needNewlineAfter = after.length > 0 && !after.startsWith("\n");
          const insertion = `${needNewlineBefore ? "\n" : ""}${lines.join("\n")}${needNewlineAfter ? "\n" : ""}`;
          view.dispatch({ changes: { from: pos, insert: insertion } });
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
    };
  }, [projectPath, viewRef]);

  // ── Outline helpers ────────────────────────────────────────────────────────
  const jumpToHeading = useCallback(
    (offset: number) => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        selection: { anchor: offset },
        scrollIntoView: true,
      });
      view.focus();
    },
    [viewRef],
  );

  useEffect(() => {
    if (!showOutline) return;
    const onWindowMouseDown = (event: MouseEvent) => {
      if (!outlinePopoverRef.current?.contains(event.target as Node)) {
        setShowOutline(false);
      }
    };
    window.addEventListener("mousedown", onWindowMouseDown);
    return () => window.removeEventListener("mousedown", onWindowMouseDown);
  }, [showOutline]);

  // ── Undo/Redo wrappers for toolbar ─────────────────────────────────────────
  const handleUndo = useCallback(() => {
    const view = viewRef.current;
    if (view) undo(view);
  }, [viewRef]);

  const handleRedo = useCallback(() => {
    const view = viewRef.current;
    if (view) redo(view);
  }, [viewRef]);

  // ── Version history restore handler ─────────────────────────────────────────
  const handleHistoryRestore = useCallback(
    (restoredDoc: DocumentContent) => {
      setContent(restoredDoc.content);
      setDirty(false);
      setShowHistory(false);
      setLastSavedAt(new Date());
      // Push restored content into CodeMirror
      const view = viewRef.current;
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: restoredDoc.content },
        });
      }
    },
    [viewRef],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`editor${distractionFree ? " distraction-free" : ""}`}>
      {!distractionFree && (
        <div className="editor-header">
          <span className="editor-title">{doc.title}</span>
          <span className="editor-meta">
            {doc.doc_type} · {doc.file}
          </span>
          {isSaving && <span className="editor-meta editor-status">Saving…</span>}
          {!isSaving && lastSavedLabel && (
            <span className="editor-meta editor-status">Saved at {lastSavedLabel}</span>
          )}
          {projectPath && (
            <button
              className={`toolbar-btn${showHistory ? " active" : ""}`}
              onClick={() => setShowHistory((v) => !v)}
              data-tooltip="Version history"
            >
              History
            </button>
          )}
          <button className="save-btn" onClick={handleSave}>
            Save
          </button>
        </div>
      )}

      {!distractionFree && (
        <Toolbar
          viewRef={viewRef}
          canUndo={true}
          canRedo={true}
          manifest={manifest}
          projectPath={projectPath}
          onUndo={handleUndo}
          onRedo={handleRedo}
          showFind={false}
          softWrap={softWrap}
          showOutline={showOutline}
          outlineCount={outlineEntries.length}
          typewriterMode={typewriterMode}
          focusMode={focusMode}
          distractionFree={distractionFree}
          spellCheck={spellCheck}
          manuscriptMode={manuscriptMode}
          onToggleFind={() => {
            const view = viewRef.current;
            if (view) openSearchPanel(view);
          }}
          onToggleSoftWrap={() => setSoftWrap((v) => !v)}
          onToggleOutline={() => setShowOutline((v) => !v)}
          onToggleTypewriter={() => setTypewriterMode((v) => !v)}
          onToggleFocusMode={() => setFocusMode((v) => !v)}
          onToggleDistractionFree={() => setDistractionFree((v) => !v)}
          onToggleSpellCheck={() => setSpellCheck((v) => !v)}
          onToggleManuscriptMode={() => setManuscriptMode((v) => !v)}
        />
      )}

      {distractionFree && (
        <div className="df-controls">
          {isSaving && <span className="editor-meta editor-status">Saving…</span>}
          {!isSaving && lastSavedLabel && (
            <span className="editor-meta editor-status">Saved at {lastSavedLabel}</span>
          )}
          <button className="toolbar-btn" onClick={() => setShowOutline((v) => !v)}>
            Outline
          </button>
          <button
            className={`toolbar-btn${focusMode ? " active" : ""}`}
            onClick={() => setFocusMode((v) => !v)}
          >
            Focus
          </button>
          <button className="toolbar-btn" onClick={handleSave}>
            Save
          </button>
          <button className="toolbar-btn" onClick={() => setDistractionFree(false)}>
            Close distraction free
          </button>
        </div>
      )}

      <div className={`editor-shell${isDraggingOver ? " drag-over" : ""}`}>
        {showOutline && (
          <div className="outline-popover" ref={outlinePopoverRef}>
            <div className="outline-popover-title">Headings</div>
            <div className="outline-popover-list">
              {outlineEntries.length ? (
                outlineEntries.map((entry) => (
                  <button
                    key={`${entry.offset}-${entry.line}`}
                    className={`outline-item level-${entry.level}`}
                    onClick={() => jumpToHeading(entry.offset)}
                  >
                    <span className="outline-item-title">{entry.title}</span>
                    <span className="outline-item-line">L{entry.line}</span>
                  </button>
                ))
              ) : (
                <div className="outline-empty">No H1-H3 headings in this document</div>
              )}
            </div>
          </div>
        )}

        {showHistory && projectPath && (
          <VersionHistory
            projectPath={projectPath}
            nodeId={doc.id}
            onRestore={handleHistoryRestore}
            onClose={() => setShowHistory(false)}
          />
        )}

        <div ref={editorContainerRef} className="cm-editor-container" />
      </div>

      {/* Wiki-link hover preview card */}
      {hoveredLink && manifest && (
        <LinkPreviewCard
          hoveredLink={hoveredLink}
          manifest={manifest}
          preview={linkPreview}
          onGoto={(id) => {
            setHoveredLink(null);
            setLinkPreview(null);
            onSelectNode?.(id);
          }}
          onMouseEnter={() => {
            // Cancel dismiss timer when hovering the card
            if (linkDismissTimer.current !== null) {
              window.clearTimeout(linkDismissTimer.current);
              linkDismissTimer.current = null;
            }
          }}
          onMouseLeave={() => {
            setHoveredLink(null);
            setLinkPreview(null);
          }}
        />
      )}

      {/* Image preview card */}
      {activeImage && (
        <ImagePreviewCard
          dataUrl={imageCacheRef.current?.get(activeImage.relativePath)}
          image={activeImage}
          onResize={(width, height) => {
            const view = viewRef.current;
            if (!view) return;
            const doc = view.state.doc.toString();
            const escapedPath = activeImage.relativePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const re = new RegExp(`!\\[[^\\]|]*?(?:\\|\\d+x\\d+)?\\]\\(${escapedPath}\\)`);
            const match = re.exec(doc);
            if (!match) return;
            const newAlt = activeImage.alt || "";
            const sizeTag = width && height ? `|${width}x${height}` : "";
            const replacement = `![${newAlt}${sizeTag}](${activeImage.relativePath})`;
            view.dispatch({
              changes: {
                from: match.index,
                to: match.index + match[0].length,
                insert: replacement,
              },
            });
            setActiveImage((prev) => (prev ? { ...prev, width, height } : null));
          }}
          onClose={() => setActiveImage(null)}
        />
      )}

      {!distractionFree && (
        <div className="editor-status-bar">
          <span className="status-bar-left">
            {dirty && <span className="dirty-indicator" title="Unsaved changes" />}
            <span>
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
            <span className="status-sep" />
            {selectionText && (
              <>
                <span>
                  Sel: {selWords}w {selChars}c
                </span>
                <span className="status-sep" />
              </>
            )}
            <span>{docWords} words</span>
            <span>{docChars} chars</span>
            <span className="status-sep" />
            <span>{readingTime} min read</span>
          </span>
          <span className="status-bar-right">
            {wordGoal && (
              <>
                <span className="word-goal-progress">
                  <span
                    className="word-goal-bar"
                    style={{ width: `${Math.min(100, (docWords / wordGoal) * 100)}%` }}
                  />
                </span>
                <span className={docWords >= wordGoal ? "goal-reached" : ""}>
                  {docWords.toLocaleString()}/{wordGoal.toLocaleString()}
                </span>
              </>
            )}
            <button
              className="goal-btn"
              onClick={() => setShowGoalInput((v) => !v)}
              title="Set word count goal"
            >
              {wordGoal ? "Goal" : "Set goal"}
            </button>
            {showGoalInput && (
              <span className="goal-input-wrapper">
                <input
                  className="goal-input"
                  type="number"
                  min={0}
                  placeholder="Words…"
                  defaultValue={wordGoal ?? ""}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = Number((e.target as HTMLInputElement).value);
                      if (val > 0) {
                        setWordGoal(val);
                        try {
                          localStorage.setItem(`loomdraft-goal:${doc.id}`, String(val));
                        } catch {}
                      } else {
                        setWordGoal(null);
                        try {
                          localStorage.removeItem(`loomdraft-goal:${doc.id}`);
                        } catch {}
                      }
                      setShowGoalInput(false);
                    } else if (e.key === "Escape") {
                      setShowGoalInput(false);
                    }
                  }}
                  onBlur={() => setShowGoalInput(false)}
                />
              </span>
            )}
            {manuscriptWordCount && (
              <>
                <span className="status-sep" />
                <span>Manuscript: {manuscriptWordCount.words.toLocaleString()}w</span>
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
