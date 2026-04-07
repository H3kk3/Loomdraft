import { useEffect, useRef } from "react";

const isMac = navigator.platform.toUpperCase().includes("MAC");
const mod = isMac ? "Cmd" : "Ctrl";

interface Shortcut {
  keys: string;
  label: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: `${mod}+P`, label: "Quick open" },
      { keys: `${mod}+Shift+F`, label: "Search documents" },
      { keys: `${mod}+Shift+E`, label: "Filter sidebar tree" },
      { keys: `${mod}+/`, label: "Keyboard shortcuts" },
    ],
  },
  {
    title: "Editor",
    shortcuts: [
      { keys: `${mod}+S`, label: "Save" },
      { keys: `${mod}+Z`, label: "Undo" },
      { keys: `${mod}+Shift+Z`, label: "Redo" },
      { keys: `${mod}+B`, label: "Bold" },
      { keys: `${mod}+I`, label: "Italic" },
      { keys: `${mod}+F`, label: "Find in document" },
    ],
  },
  {
    title: "Writing Modes",
    shortcuts: [
      { keys: `${mod}+Shift+D`, label: "Distraction-free mode" },
      { keys: `${mod}+Alt+T`, label: "Typewriter mode" },
      { keys: `${mod}+Alt+F`, label: "Focus mode" },
    ],
  },
  {
    title: "Tree",
    shortcuts: [
      { keys: "F2", label: "Rename selected node" },
      { keys: "Shift+F10", label: "Open context menu" },
    ],
  },
];

export function KeyboardShortcuts({
  onClose,
  onShowOnboarding,
}: {
  onClose: () => void;
  onShowOnboarding?: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="shortcuts-panel">
        <div className="shortcuts-header">
          <span className="shortcuts-title">Keyboard Shortcuts</span>
          <button className="shortcuts-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="shortcuts-body">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="shortcuts-group">
              <div className="shortcuts-group-title">{group.title}</div>
              {group.shortcuts.map((s) => (
                <div key={s.keys} className="shortcut-row">
                  <kbd>{s.keys}</kbd>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        {onShowOnboarding && (
          <button
            className="onboarding-retrigger"
            onClick={() => {
              onShowOnboarding();
              onClose();
            }}
          >
            Replay welcome tour
          </button>
        )}
      </div>
    </div>
  );
}
