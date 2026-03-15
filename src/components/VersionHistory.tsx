import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { History, RotateCcw } from "lucide-react";
import type { BackupEntry, DocumentContent } from "../types";

interface VersionHistoryProps {
  projectPath: string;
  nodeId: string;
  onRestore: (doc: DocumentContent) => void;
  onClose: () => void;
}

function formatTimestamp(ts: string): string {
  // Parse "20260302T143012.456" → readable date
  const match = ts.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!match) return ts;
  const [, year, month, day, hour, min, sec] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(min),
    Number(sec),
  );
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VersionHistory({ projectPath, nodeId, onRestore, onClose }: VersionHistoryProps) {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entries = await invoke<BackupEntry[]>("list_backups", {
        projectPath,
        nodeId,
      });
      setBackups(entries);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [projectPath, nodeId]);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  const handleRestore = useCallback(
    async (timestamp: string) => {
      setRestoring(timestamp);
      setError(null);
      try {
        const doc = await invoke<DocumentContent>("restore_backup", {
          projectPath,
          nodeId,
          timestamp,
        });
        onRestore(doc);
      } catch (err) {
        setError(String(err));
      } finally {
        setRestoring(null);
      }
    },
    [projectPath, nodeId, onRestore],
  );

  return (
    <div className="version-history">
      <div className="vh-header">
        <History size={14} />
        <span className="vh-title">Version History</span>
        <button className="vh-close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="vh-list">
        {loading && <div className="vh-empty">Loading backups…</div>}

        {!loading && error && <div className="vh-error">{error}</div>}

        {!loading && !error && backups.length === 0 && (
          <div className="vh-empty">
            No backups yet. Backups are created automatically each time you save.
          </div>
        )}

        {!loading &&
          backups.map((b) => (
            <div key={b.timestamp} className="vh-entry">
              <div className="vh-entry-header">
                <span className="vh-entry-time">{formatTimestamp(b.timestamp)}</span>
                <span className="vh-entry-size">{formatSize(b.size_bytes)}</span>
              </div>
              {b.preview && <div className="vh-entry-preview">{b.preview}</div>}
              <button
                className="vh-restore-btn"
                disabled={restoring !== null}
                onClick={() => handleRestore(b.timestamp)}
              >
                <RotateCcw size={12} />
                {restoring === b.timestamp ? "Restoring…" : "Restore"}
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
