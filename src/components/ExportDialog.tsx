import { useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export type ExportFormat = "md" | "html" | "pdf";

interface ExportDialogProps {
  projectTitle: string;
  onExport: (format: ExportFormat) => void;
  onCancel: () => void;
}

// ── Format options ───────────────────────────────────────────────────────────

const FORMAT_OPTIONS: { value: ExportFormat; label: string; desc: string }[] = [
  {
    value: "md",
    label: "Markdown (.md)",
    desc: "Single file, editable in any text editor",
  },
  {
    value: "html",
    label: "HTML (.html)",
    desc: "Self-contained, styled for reading in a browser",
  },
  {
    value: "pdf",
    label: "PDF (.pdf)",
    desc: "Print-ready document with serif typography",
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export function ExportDialog({ projectTitle, onExport, onCancel }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("md");

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>Export "{projectTitle}"</h3>

        <div className="export-format-options">
          {FORMAT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`export-format-option${format === opt.value ? " selected" : ""}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") onExport(format);
                if (e.key === "Escape") onCancel();
              }}
            >
              <input
                type="radio"
                name="export-format"
                value={opt.value}
                checked={format === opt.value}
                onChange={() => setFormat(opt.value)}
              />
              <div>
                <div className="export-format-label">{opt.label}</div>
                <div className="export-format-desc">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>

        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={() => onExport(format)}>
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
