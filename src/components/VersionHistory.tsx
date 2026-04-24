import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { History, RotateCcw } from "lucide-react";
import type { BackupEntry, DocumentContent, SnapshotEntry } from "../types";

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
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinNamingFor, setPinNamingFor] = useState<string | null>(null);
  const [pinNameDraft, setPinNameDraft] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bs, ss] = await Promise.all([
        invoke<BackupEntry[]>("list_backups", { projectPath, nodeId }),
        invoke<SnapshotEntry[]>("list_snapshots", { projectPath, nodeId }),
      ]);
      setBackups(bs);
      setSnapshots(ss);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [projectPath, nodeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const handlePin = useCallback(
    async (timestamp: string, name: string) => {
      try {
        const entry = await invoke<SnapshotEntry>("pin_snapshot", {
          projectPath,
          nodeId,
          timestamp,
          name,
        });
        setSnapshots((prev) => [entry, ...prev]);
        setPinNamingFor(null);
        setPinNameDraft("");
      } catch (err) {
        setError(String(err));
      }
    },
    [projectPath, nodeId],
  );

  const handleUnpin = useCallback(
    async (snapshot: SnapshotEntry) => {
      try {
        await invoke("unpin_snapshot", {
          projectPath,
          nodeId,
          snapshotTimestamp: snapshot.timestamp,
        });
        setSnapshots((prev) => prev.filter((s) => s.timestamp !== snapshot.timestamp));
      } catch (err) {
        setError(String(err));
      }
    },
    [projectPath, nodeId],
  );

  const handleRestoreSnapshot = useCallback(
    async (snapshot: SnapshotEntry) => {
      setRestoring(snapshot.timestamp);
      setError(null);
      try {
        const doc = await invoke<DocumentContent>("restore_snapshot", {
          projectPath,
          nodeId,
          snapshotTimestamp: snapshot.timestamp,
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
        {loading && <div className="vh-empty">Loading…</div>}

        {!loading && error && <div className="vh-error">{error}</div>}

        {/* Snapshots section */}
        {!loading && snapshots.length > 0 && (
          <div className="vh-section">
            <h4 className="vh-section-title">Snapshots</h4>
            {snapshots.map((s) => (
              <div key={s.timestamp} className="vh-entry vh-entry--snapshot">
                <div className="vh-entry-header">
                  <span className="vh-entry-time">📌 {s.name}</span>
                  <span className="vh-entry-size">{formatSize(s.size_bytes)}</span>
                </div>
                <div className="vh-entry-subtime">{formatTimestamp(s.timestamp)}</div>
                {s.preview && <div className="vh-entry-preview">{s.preview}</div>}
                <div className="vh-entry-actions">
                  <button
                    className="vh-restore-btn"
                    disabled={restoring !== null}
                    onClick={() => handleRestoreSnapshot(s)}
                  >
                    <RotateCcw size={12} />
                    {restoring === s.timestamp ? "Restoring…" : "Restore"}
                  </button>
                  <button
                    className="vh-restore-btn"
                    disabled={restoring !== null}
                    onClick={() => handleUnpin(s)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Backups section */}
        {!loading && (backups.length > 0 || snapshots.length > 0) && (
          <h4 className="vh-section-title">Backups</h4>
        )}

        {!loading && !error && backups.length === 0 && snapshots.length === 0 && (
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
              <div className="vh-entry-actions">
                <button
                  className="vh-restore-btn"
                  disabled={restoring !== null}
                  onClick={() => handleRestore(b.timestamp)}
                >
                  <RotateCcw size={12} />
                  {restoring === b.timestamp ? "Restoring…" : "Restore"}
                </button>
                <button
                  className="vh-restore-btn"
                  disabled={restoring !== null || pinNamingFor !== null}
                  onClick={() => {
                    setPinNamingFor(b.timestamp);
                    setPinNameDraft("");
                  }}
                >
                  Pin…
                </button>
              </div>
              {pinNamingFor === b.timestamp && (
                <div className="vh-pin-form">
                  <input
                    type="text"
                    className="vh-pin-input"
                    placeholder="Name this snapshot"
                    value={pinNameDraft}
                    onChange={(e) => setPinNameDraft(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && pinNameDraft.trim()) {
                        void handlePin(pinNamingFor, pinNameDraft.trim());
                      }
                      if (e.key === "Escape") {
                        setPinNamingFor(null);
                        setPinNameDraft("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="vh-restore-btn"
                    disabled={!pinNameDraft.trim()}
                    onClick={() => void handlePin(pinNamingFor, pinNameDraft.trim())}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="vh-restore-btn"
                    onClick={() => {
                      setPinNamingFor(null);
                      setPinNameDraft("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
