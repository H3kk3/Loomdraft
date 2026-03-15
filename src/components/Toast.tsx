import { useEffect } from "react";
import { TOAST_DURATION_MS } from "../constants";

export interface ToastData {
  message: string;
  type: "success" | "error";
}

interface ToastProps {
  toast: ToastData;
  onDismiss: () => void;
  duration?: number;
}

export function Toast({ toast, onDismiss, duration = TOAST_DURATION_MS }: ToastProps) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(id);
  }, [onDismiss, duration]);

  return (
    <div className={`toast toast-${toast.type}`} onClick={onDismiss}>
      {toast.message}
    </div>
  );
}
