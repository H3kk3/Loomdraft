import { keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

export interface KeymapCallbacks {
  onSave: () => void;
  onToggleDistractionFree: () => void;
  onToggleOutline: () => void;
  onToggleTypewriter: () => void;
  onToggleFocusMode: () => void;
  onToggleSoftWrap: () => void;
}

export function loomdraftKeymap(callbacks: KeymapCallbacks): Extension {
  return keymap.of([
    {
      key: "Mod-s",
      run: () => {
        callbacks.onSave();
        return true;
      },
    },
    {
      key: "Mod-Shift-d",
      run: () => {
        callbacks.onToggleDistractionFree();
        return true;
      },
    },
    {
      key: "Mod-Shift-o",
      run: () => {
        callbacks.onToggleOutline();
        return true;
      },
    },
    {
      key: "Mod-Alt-t",
      run: () => {
        callbacks.onToggleTypewriter();
        return true;
      },
    },
    {
      key: "Mod-Alt-f",
      run: () => {
        callbacks.onToggleFocusMode();
        return true;
      },
    },
    {
      key: "Mod-Alt-w",
      run: () => {
        callbacks.onToggleSoftWrap();
        return true;
      },
    },
  ]);
}
