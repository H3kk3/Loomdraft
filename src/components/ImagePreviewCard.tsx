import { useState, useEffect, useRef } from "react";

// ── ImagePreviewCard ─────────────────────────────────────────────────────────

export interface ActiveImage {
  relativePath: string;
  alt: string;
  width?: number;
  height?: number;
  rect: DOMRect;
}

export function ImagePreviewCard({
  dataUrl,
  image,
  onResize,
  onClose,
}: {
  dataUrl: string | undefined;
  image: ActiveImage;
  onResize: (width: number | undefined, height: number | undefined) => void;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [widthInput, setWidthInput] = useState(image.width?.toString() ?? "");
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  // Close on click outside
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!cardRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Positioning: below thumbnail if space, above otherwise
  const cardWidth = 500;
  const left = Math.min(image.rect.left, window.innerWidth - cardWidth - 16);
  const belowSpace = window.innerHeight - image.rect.bottom;
  const top = belowSpace > 340 ? image.rect.bottom + 6 : Math.max(8, image.rect.top - 340);

  const handleNaturalSize = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  };

  const applyWidth = (w: number | undefined) => {
    if (!w || !naturalSize || naturalSize.w === 0) {
      onResize(undefined, undefined);
      setWidthInput("");
      return;
    }
    const aspect = naturalSize.h / naturalSize.w;
    const h = Math.round(w * aspect);
    onResize(w, h);
    setWidthInput(w.toString());
  };

  const handleWidthSubmit = () => {
    const val = parseInt(widthInput);
    if (!val || val < 10) {
      applyWidth(undefined);
    } else {
      applyWidth(val);
    }
  };

  const displayWidth = image.width ?? naturalSize?.w;
  const displayHeight = image.height ?? naturalSize?.h;

  return (
    <div className="image-preview-card" ref={cardRef} style={{ position: "fixed", top, left }}>
      {dataUrl ? (
        <img
          className="ipc-image"
          src={dataUrl}
          alt={image.alt || "Preview"}
          onLoad={handleNaturalSize}
        />
      ) : (
        <div className="ipc-loading">Loading image…</div>
      )}

      {image.alt && <div className="ipc-alt">{image.alt}</div>}

      <div className="ipc-info">
        {displayWidth && displayHeight && (
          <span>
            {displayWidth} × {displayHeight}px
          </span>
        )}
        {naturalSize && (
          <span>
            Original: {naturalSize.w} × {naturalSize.h}
          </span>
        )}
      </div>

      <div className="ipc-resize-row">
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Width:</span>
        <input
          className="ipc-size-input"
          type="number"
          min={10}
          value={widthInput}
          placeholder="auto"
          onChange={(e) => setWidthInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleWidthSubmit();
          }}
          onBlur={handleWidthSubmit}
        />
        <div className="ipc-size-presets">
          <button className="ipc-size-btn" onClick={() => applyWidth(200)}>
            S
          </button>
          <button className="ipc-size-btn" onClick={() => applyWidth(400)}>
            M
          </button>
          <button className="ipc-size-btn" onClick={() => applyWidth(800)}>
            L
          </button>
          <button className="ipc-size-btn" onClick={() => applyWidth(undefined)}>
            Auto
          </button>
        </div>
      </div>
    </div>
  );
}
