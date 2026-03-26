import { useEffect, useRef, useState, useCallback } from "react";
import { TOAST_DURATION_MS } from "../constants";

export interface ToastData {
  id: number;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

const MAX_VISIBLE = 3;
let nextId = 1;

export function createToast(
  message: string,
  type: ToastData["type"] = "success",
): ToastData {
  return { id: nextId++, message, type };
}

// ── Single toast item ────────────────────────────────────────────────────────

function ToastItem({
  toast,
  onDismiss,
  duration = TOAST_DURATION_MS,
}: {
  toast: ToastData;
  onDismiss: (id: number) => void;
  duration?: number;
}) {
  const [dismissing, setDismissing] = useState(false);
  const timerRef = useRef<number | null>(null);

  const startTimer = useCallback(() => {
    timerRef.current = window.setTimeout(() => {
      setDismissing(true);
      window.setTimeout(() => onDismiss(toast.id), 250);
    }, duration);
  }, [duration, onDismiss, toast.id]);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    startTimer();
    return clearTimer;
  }, [startTimer]);

  const handleMouseEnter = () => clearTimer();
  const handleMouseLeave = () => startTimer();

  const handleClick = () => {
    setDismissing(true);
    window.setTimeout(() => onDismiss(toast.id), 250);
  };

  return (
    <div
      className={`toast toast-${toast.type}${dismissing ? " toast-out" : ""}`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {toast.message}
    </div>
  );
}

// ── Toast stack ──────────────────────────────────────────────────────────────

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastData[];
  onDismiss: (id: number) => void;
}) {
  const visible = toasts.slice(-MAX_VISIBLE);
  if (visible.length === 0) return null;

  return (
    <div className="toast-stack">
      {visible.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
