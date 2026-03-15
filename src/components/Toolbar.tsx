import { Undo2, Redo2, Scissors, Copy, Clipboard, TextSelect, Search } from "lucide-react";
import type { EditorView } from "@codemirror/view";
import { selectAll } from "@codemirror/commands";
import type { ProjectManifest } from "../types";
import { keepFocus } from "./toolbarHelpers";
import { FormattingButtons } from "./FormattingButtons";
import { LinkPickerButton, ImageInsertButton } from "./InsertButtons";

// ── Toolbar ───────────────────────────────────────────────────────────────────

export interface ToolbarProps {
  viewRef: React.MutableRefObject<EditorView | null>;
  canUndo: boolean;
  canRedo: boolean;
  manifest?: ProjectManifest;
  projectPath?: string;
  onUndo: () => void;
  onRedo: () => void;
  showFind: boolean;
  onToggleFind: () => void;
  softWrap: boolean;
  showOutline: boolean;
  outlineCount: number;
  typewriterMode: boolean;
  focusMode: boolean;
  distractionFree: boolean;
  spellCheck: boolean;
  manuscriptMode: boolean;
  onToggleSoftWrap: () => void;
  onToggleOutline: () => void;
  onToggleTypewriter: () => void;
  onToggleFocusMode: () => void;
  onToggleDistractionFree: () => void;
  onToggleSpellCheck: () => void;
  onToggleManuscriptMode: () => void;
}

export function Toolbar({
  viewRef,
  canUndo,
  canRedo,
  manifest,
  projectPath,
  onUndo,
  onRedo,
  showFind,
  onToggleFind,
  softWrap,
  showOutline,
  outlineCount,
  typewriterMode,
  focusMode,
  distractionFree,
  spellCheck,
  manuscriptMode,
  onToggleSoftWrap,
  onToggleOutline,
  onToggleTypewriter,
  onToggleFocusMode,
  onToggleDistractionFree,
  onToggleSpellCheck,
  onToggleManuscriptMode,
}: ToolbarProps) {
  const view = () => viewRef.current;

  const handleCopy = async () => {
    const v = view();
    if (!v) return;
    const { from, to } = v.state.selection.main;
    if (from === to) return;
    const text = v.state.sliceDoc(from, to);
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.warn("Clipboard write failed", err);
    }
  };

  const handleCut = async () => {
    const v = view();
    if (!v) return;
    const { from, to } = v.state.selection.main;
    if (from === to) return;
    const text = v.state.sliceDoc(from, to);
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.warn("Clipboard write failed", err);
      return;
    }
    v.dispatch({
      changes: { from, to, insert: "" },
      selection: { anchor: from },
    });
  };

  const handlePaste = async () => {
    const v = view();
    if (!v) return;
    try {
      const text = await navigator.clipboard.readText();
      const { from, to } = v.state.selection.main;
      v.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      });
    } catch (err) {
      console.warn("Clipboard read failed", err);
    }
  };

  const handleSelectAll = () => {
    const v = view();
    if (!v) return;
    v.focus();
    selectAll(v);
  };

  return (
    <div className="editor-toolbar">
      {/* Undo / Redo */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          data-tooltip="Undo (Ctrl+Z)"
          disabled={!canUndo}
          onMouseDown={keepFocus}
          onClick={onUndo}
        >
          <Undo2 size={14} />
        </button>
        <button
          className="toolbar-btn"
          data-tooltip="Redo (Ctrl+Shift+Z)"
          disabled={!canRedo}
          onMouseDown={keepFocus}
          onClick={onRedo}
        >
          <Redo2 size={14} />
        </button>
      </div>

      <div className="toolbar-sep" />

      <FormattingButtons
        viewRef={viewRef}
        inlineExtra={<LinkPickerButton viewRef={viewRef} manifest={manifest} />}
        blockExtra={
          projectPath ? (
            <ImageInsertButton viewRef={viewRef} projectPath={projectPath} />
          ) : undefined
        }
      />

      <div className="toolbar-sep" />

      {/* Cut / Copy / Paste */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          data-tooltip="Cut (Ctrl+X)"
          onMouseDown={keepFocus}
          onClick={handleCut}
        >
          <Scissors size={14} />
        </button>
        <button
          className="toolbar-btn"
          data-tooltip="Copy (Ctrl+C)"
          onMouseDown={keepFocus}
          onClick={handleCopy}
        >
          <Copy size={14} />
        </button>
        <button
          className="toolbar-btn"
          data-tooltip="Paste (Ctrl+V)"
          onMouseDown={keepFocus}
          onClick={handlePaste}
        >
          <Clipboard size={14} />
        </button>
      </div>

      <div className="toolbar-sep" />

      {/* Select all */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          data-tooltip="Select all (Ctrl+A)"
          onMouseDown={keepFocus}
          onClick={handleSelectAll}
        >
          <TextSelect size={14} />
        </button>
      </div>

      <div className="toolbar-sep" />

      {/* Find / Replace */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn${showFind ? " active" : ""}`}
          data-tooltip="Find / Replace (Ctrl+F)"
          onMouseDown={keepFocus}
          onClick={onToggleFind}
        >
          <Search size={14} />
          <span className="toolbar-label">Find</span>
        </button>
      </div>

      <div className="toolbar-sep" />

      {/* Writing modes (ModeButtons) */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn${showOutline ? " active" : ""}`}
          data-tooltip="Outline navigator (Ctrl+Shift+O)"
          onMouseDown={keepFocus}
          onClick={onToggleOutline}
        >
          <span className="toolbar-label">Outline</span>
          <span className="toolbar-count">{outlineCount}</span>
        </button>
        <button
          className={`toolbar-btn${typewriterMode ? " active" : ""}`}
          data-tooltip="Typewriter mode (Ctrl+Alt+T)"
          onMouseDown={keepFocus}
          onClick={onToggleTypewriter}
        >
          <span className="toolbar-label">Typewriter</span>
        </button>
        <button
          className={`toolbar-btn${focusMode ? " active" : ""}`}
          data-tooltip="Focus mode (Ctrl+Alt+F)"
          onMouseDown={keepFocus}
          onClick={onToggleFocusMode}
        >
          <span className="toolbar-label">Focus</span>
        </button>
        <button
          className={`toolbar-btn${distractionFree ? " active" : ""}`}
          data-tooltip="Distraction-free mode (Ctrl+Shift+D)"
          onMouseDown={keepFocus}
          onClick={onToggleDistractionFree}
        >
          <span className="toolbar-label">Distraction-free</span>
        </button>
        <button
          className={`toolbar-btn${softWrap ? " active" : ""}`}
          data-tooltip="Soft wrap (Ctrl+Alt+W)"
          onMouseDown={keepFocus}
          onClick={onToggleSoftWrap}
        >
          <span className="toolbar-label">Wrap</span>
        </button>
        <button
          className={`toolbar-btn${manuscriptMode ? " active" : ""}`}
          data-tooltip="Manuscript mode — centered column"
          onMouseDown={keepFocus}
          onClick={onToggleManuscriptMode}
        >
          <span className="toolbar-label">Manuscript</span>
        </button>
        <button
          className={`toolbar-btn${spellCheck ? " active" : ""}`}
          data-tooltip="Spell check"
          onMouseDown={keepFocus}
          onClick={onToggleSpellCheck}
        >
          <span className="toolbar-label">Spell</span>
        </button>
      </div>
    </div>
  );
}
