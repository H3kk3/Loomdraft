import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  FolderTree,
  AlignCenter,
  Eye,
  Maximize,
  Search,
  FileText,
  Palette,
} from "lucide-react";
import logoUrl from "../assets/logo.png";

const TOTAL_STEPS = 8;
const EXIT_DURATION = 400;

const isMac = navigator.platform.toUpperCase().includes("MAC");
const mod = isMac ? "Cmd" : "Ctrl";

// ── Step Components ──────────────────────────────────────────────────────────

function StepWelcome() {
  return (
    <div className="onboarding-step onboarding-reveal">
      <img
        src={logoUrl}
        className="onboarding-logo"
        alt="Loomdraft"
        draggable={false}
      />
      <h1 className="onboarding-title">Welcome to Loomdraft</h1>
      <p className="onboarding-subtitle">
        A distraction-free writing app, built for your desktop.
        <br />
        Let us show you around.
      </p>
    </div>
  );
}

function StepOrganize() {
  return (
    <div className="onboarding-step onboarding-reveal">
      <h2 className="onboarding-title">Your Manuscript, Organized</h2>
      <p className="onboarding-body">
        Structure your novel as a tree. Separate your manuscript from planning
        materials, drag nodes to reorder, and keep everything at your fingertips.
      </p>
      <div className="onboarding-tree">
        <div className="onboarding-tree-branch">
          <div className="onboarding-tree-label">Manuscript</div>
          <div className="onboarding-tree-node">
            <BookOpen className="node-icon" size={14} />
            Part One
          </div>
          <div className="onboarding-tree-node indent-1">
            <FileText className="node-icon" size={14} />
            Chapter 1
          </div>
          <div className="onboarding-tree-node indent-2">
            <FileText className="node-icon" size={14} />
            Opening Scene
          </div>
        </div>
        <div className="onboarding-tree-branch">
          <div className="onboarding-tree-label">Planning</div>
          <div className="onboarding-tree-node">
            <FolderTree className="node-icon" size={14} />
            Characters
          </div>
          <div className="onboarding-tree-node">
            <FolderTree className="node-icon" size={14} />
            Locations
          </div>
          <div className="onboarding-tree-node">
            <FolderTree className="node-icon" size={14} />
            Lore
          </div>
        </div>
      </div>
    </div>
  );
}

function StepEditor() {
  return (
    <div className="onboarding-step onboarding-reveal">
      <h2 className="onboarding-title">Write in Markdown</h2>
      <p className="onboarding-body">
        A fast, modern editor with live formatting. Your work is saved
        automatically — just write.
      </p>
      <div className="onboarding-mock-editor">
        <div className="mock-heading"># The journey begins</div>
        <div>
          She stepped through the{" "}
          <span className="mock-bold">**ancient gate**</span>, its stones
          humming with <span className="mock-italic">*forgotten magic*</span>.
          The map had led her to{" "}
          <span className="mock-link">[[The Silver Archive]]</span>, a place
          she&apos;d only read about.
          <span className="mock-cursor" />
        </div>
      </div>
      <div className="onboarding-stat-pills">
        <div className="onboarding-stat-pill">
          <span className="pill-dot" />
          Auto-saves every 10s
        </div>
        <div className="onboarding-stat-pill">
          <span className="pill-dot" />
          Live word count
        </div>
        <div className="onboarding-stat-pill">
          <span className="pill-dot" />
          Reading time
        </div>
      </div>
    </div>
  );
}

function StepWikiLinks() {
  return (
    <div className="onboarding-step onboarding-reveal">
      <h2 className="onboarding-title">Connect Your World</h2>
      <p className="onboarding-body">
        Link documents with wiki-links. Click to navigate, hover to preview.
        Backlinks are tracked automatically.
      </p>
      <div className="onboarding-wikilink-demo">
        <div className="onboarding-wikilink-text">
          She met{" "}
          <span className="wiki-link-example">[[Eleanor Blackwood]]</span> at
          the crossroads.
        </div>
        <div className="onboarding-preview-card">
          <div className="preview-type">Character</div>
          <div className="preview-title">Eleanor Blackwood</div>
          <div className="preview-snippet">
            A cartographer and former university lecturer who vanished during an
            expedition to the northern mountains three years ago...
          </div>
        </div>
      </div>
    </div>
  );
}

function StepModes() {
  return (
    <div className="onboarding-step onboarding-reveal">
      <h2 className="onboarding-title">Find Your Flow</h2>
      <p className="onboarding-body">
        Three writing modes to match how you work best.
      </p>
      <div className="onboarding-modes">
        <div className="onboarding-mode-card">
          <AlignCenter className="mode-icon" size={28} />
          <span className="mode-name">Typewriter</span>
          <span className="mode-desc">Keeps your cursor centered on screen</span>
          <div className="mode-mini-preview typewriter">
            <div className="mini-line" style={{ width: "70%" }} />
            <div className="mini-line" style={{ width: "85%" }} />
            <div className="mini-line" style={{ width: "60%" }} />
            <div className="mini-line" style={{ width: "90%" }} />
            <div className="mini-line" style={{ width: "45%" }} />
          </div>
          <span className="onboarding-shortcut-badge">{mod}+Alt+T</span>
        </div>
        <div className="onboarding-mode-card">
          <Eye className="mode-icon" size={28} />
          <span className="mode-name">Focus</span>
          <span className="mode-desc">Dims everything but your current line</span>
          <div className="mode-mini-preview focus">
            <div className="mini-line" style={{ width: "70%" }} />
            <div className="mini-line" style={{ width: "85%" }} />
            <div className="mini-line" style={{ width: "60%" }} />
            <div className="mini-line" style={{ width: "90%" }} />
            <div className="mini-line" style={{ width: "45%" }} />
          </div>
          <span className="onboarding-shortcut-badge">{mod}+Alt+F</span>
        </div>
        <div className="onboarding-mode-card">
          <Maximize className="mode-icon" size={28} />
          <span className="mode-name">Distraction-free</span>
          <span className="mode-desc">Full screen, nothing but your words</span>
          <div className="mode-mini-preview distraction-free">
            <div className="mini-line" style={{ width: "70%" }} />
            <div className="mini-line" style={{ width: "85%" }} />
            <div className="mini-line" style={{ width: "60%" }} />
            <div className="mini-line" style={{ width: "90%" }} />
            <div className="mini-line" style={{ width: "45%" }} />
          </div>
          <span className="onboarding-shortcut-badge">{mod}+Shift+D</span>
        </div>
      </div>
    </div>
  );
}

function StepFeatures() {
  return (
    <div className="onboarding-step onboarding-reveal">
      <h2 className="onboarding-title">Search, Export & Themes</h2>
      <div className="onboarding-features">
        <div className="onboarding-feature-row">
          <Search className="feature-icon" size={24} />
          <div className="feature-text">
            <div className="feature-name">Quick Open & Search</div>
            <div className="feature-desc">
              {mod}+P to jump to any document. {mod}+Shift+F to search across
              your entire project.
            </div>
          </div>
        </div>
        <div className="onboarding-feature-row">
          <FileText className="feature-icon" size={24} />
          <div className="feature-text">
            <div className="feature-name">Export</div>
            <div className="feature-desc">
              Publish your manuscript as Markdown, HTML, or a print-ready PDF.
            </div>
          </div>
        </div>
        <div className="onboarding-feature-row">
          <Palette className="feature-icon" size={24} />
          <div className="feature-text">
            <div className="feature-name">Themes</div>
            <div className="feature-desc">
              7 built-in themes — or import your own. Switch anytime from the
              sidebar.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepShortcuts() {
  const shortcuts = [
    { label: "Save", keys: `${mod}+S` },
    { label: "Quick Open", keys: `${mod}+P` },
    { label: "Search", keys: `${mod}+Shift+F` },
    { label: "Distraction-free", keys: `${mod}+Shift+D` },
    { label: "Typewriter", keys: `${mod}+Alt+T` },
    { label: "All shortcuts", keys: `${mod}+/` },
  ];

  return (
    <div className="onboarding-step onboarding-reveal">
      <h2 className="onboarding-title">Essential Shortcuts</h2>
      <p className="onboarding-body">
        The keyboard shortcuts you&apos;ll use most often.
      </p>
      <div className="onboarding-shortcuts-grid">
        {shortcuts.map((s) => (
          <div key={s.label} className="onboarding-shortcut-item">
            <span className="shortcut-label">{s.label}</span>
            <span className="shortcut-keys">{s.keys}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepFinal() {
  return (
    <div className="onboarding-step onboarding-reveal">
      <div className="onboarding-final-title">You&apos;re ready to write.</div>
      <p className="onboarding-final-note">
        You can revisit this tour anytime from the keyboard shortcuts panel (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
          {mod}+/
        </span>
        ).
      </p>
    </div>
  );
}

const STEPS = [
  StepWelcome,
  StepOrganize,
  StepEditor,
  StepWikiLinks,
  StepModes,
  StepFeatures,
  StepShortcuts,
  StepFinal,
];

// ── Main Component ───────────────────────────────────────────────────────────

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [displayedStep, setDisplayedStep] = useState(0);
  const [exiting, setExiting] = useState(false);
  const exitTimeout = useRef<number | null>(null);

  const goTo = useCallback(
    (target: number) => {
      if (exiting) return;
      if (target < 0 || target >= TOTAL_STEPS) return;
      setExiting(true);
      exitTimeout.current = window.setTimeout(() => {
        setDisplayedStep(target);
        setStep(target);
        setExiting(false);
      }, EXIT_DURATION);
    },
    [exiting],
  );

  const next = useCallback(() => {
    if (step === TOTAL_STEPS - 1) {
      onComplete();
    } else {
      goTo(step + 1);
    }
  }, [step, goTo, onComplete]);

  const back = useCallback(() => {
    goTo(step - 1);
  }, [step, goTo]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onComplete();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [next, back, onComplete]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (exitTimeout.current !== null) clearTimeout(exitTimeout.current);
    };
  }, []);

  const StepContent = STEPS[displayedStep];

  return (
    <div className="onboarding-backdrop">
      <div className="onboarding-grain" />
      <button className="onboarding-skip" onClick={onComplete}>
        Skip
      </button>
      <div className="onboarding-container">
        <div key={displayedStep} className={exiting ? "exiting" : ""}>
          <StepContent />
        </div>

        {/* Navigation */}
        <div className="onboarding-nav">
          {step > 0 && (
            <button className="nav-back" onClick={back} disabled={exiting}>
              Back
            </button>
          )}
          <button
            className="primary nav-next"
            onClick={next}
            disabled={exiting}
          >
            {step === 0
              ? "Begin Tour"
              : step === TOTAL_STEPS - 1
                ? "Start Writing"
                : "Next"}
          </button>
        </div>

        {/* Step dots */}
        <div className="onboarding-dots">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`onboarding-dot${i === step ? " active" : ""}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
