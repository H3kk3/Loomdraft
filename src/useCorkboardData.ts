// src/useCorkboardData.ts

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CorkboardData } from "./types";

export interface CorkboardDataHandle {
  data: CorkboardData | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useCorkboardData(
  projectPath: string | null,
  enabled: boolean,
): CorkboardDataHandle {
  const [data, setData] = useState<CorkboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Monotonic counter that discards state writes from superseded reloads.
  // Same pattern as useProjectMetadata — prevents stale overwrites.
  const reloadGenRef = useRef(0);

  const reload = useCallback(async () => {
    if (!projectPath || !enabled) {
      // Bump the generation so any in-flight load's late setState is discarded,
      // and fully reset state to avoid a stuck `loading: true` or stale error.
      reloadGenRef.current += 1;
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    const gen = ++reloadGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const d = await invoke<CorkboardData>("get_corkboard_data", { projectPath });
      if (gen === reloadGenRef.current) setData(d);
    } catch (e) {
      if (gen === reloadGenRef.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (gen === reloadGenRef.current) setLoading(false);
    }
  }, [projectPath, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}
