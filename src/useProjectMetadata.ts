import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { STATUS_VALUES, type NodeMetadata, type ProjectMetadata, type Status } from "./types";

interface UpdateArgs {
  synopsis?: string | null;    // undefined = unchanged; null = clear; string = set
  tags?: string[];              // undefined = unchanged; [] = clear; list = set
  status?: Status;              // undefined = unchanged
}

export interface ProjectMetadataHandle {
  metadata: ProjectMetadata;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  updateNode: (nodeId: string, args: UpdateArgs) => Promise<NodeMetadata>;
  setLocalForNode: (nodeId: string, patch: Partial<NodeMetadata>) => void;
}

export function useProjectMetadata(projectPath: string | null): ProjectMetadataHandle {
  const [metadata, setMetadata] = useState<ProjectMetadata>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Monotonic counter that lets us discard state writes from superseded reloads.
  // Fixes a race where two concurrent reload()s could cause stale data to land last.
  const reloadGenRef = useRef(0);

  const reload = useCallback(async () => {
    if (!projectPath) {
      // Bump the generation so any in-flight load's late setState is discarded,
      // and fully reset state to avoid a stuck `loading: true` or stale error.
      reloadGenRef.current += 1;
      setMetadata({});
      setLoading(false);
      setError(null);
      return;
    }
    const gen = ++reloadGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const m = await invoke<ProjectMetadata>("get_project_metadata", {
        projectPath,
      });
      if (gen === reloadGenRef.current) setMetadata(m);
    } catch (e) {
      if (gen === reloadGenRef.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (gen === reloadGenRef.current) setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateNode = useCallback(
    async (nodeId: string, args: UpdateArgs): Promise<NodeMetadata> => {
      if (!projectPath) throw new Error("No project open");
      // Synopsis encoding:
      //   undefined → omit (leave unchanged)
      //   null      → send clearSynopsis: true (explicit clear)
      //   string    → send synopsis: <string> (set)
      const payload: Record<string, unknown> = {
        projectPath,
        nodeId,
      };
      if (args.synopsis === null) {
        payload.clearSynopsis = true;
      } else if (typeof args.synopsis === "string") {
        payload.synopsis = args.synopsis;
      }
      if (args.tags !== undefined) payload.tags = args.tags;
      if (args.status !== undefined) payload.status = args.status;

      const updated = await invoke<NodeMetadata>("update_node_metadata", payload);
      setMetadata((prev) => ({ ...prev, [nodeId]: updated }));
      return updated;
    },
    [projectPath],
  );

  const setLocalForNode = useCallback(
    (nodeId: string, patch: Partial<NodeMetadata>) => {
      setMetadata((prev) => ({
        ...prev,
        [nodeId]: {
          synopsis: patch.synopsis ?? prev[nodeId]?.synopsis ?? null,
          tags: patch.tags ?? prev[nodeId]?.tags ?? [],
          status: patch.status ?? prev[nodeId]?.status ?? STATUS_VALUES[0],
        },
      }));
    },
    [],
  );

  return { metadata, loading, error, reload, updateNode, setLocalForNode };
}
