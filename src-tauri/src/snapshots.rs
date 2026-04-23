//! v0.3 Plan C — Named snapshots (pinned + user-labeled backups).
//!
//! Extends the existing `.app/backups/{node-id}/` layout with a `snapshots/`
//! subfolder that holds copies of auto-backups that survive the 20-item cull.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::project::{self, atomic_write, create_backup, DocumentContent};

/// Metadata for a single named snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotEntry {
    pub node_id: String,
    pub timestamp: String,
    pub name: String,
    pub size_bytes: u64,
    pub preview: String,
}

/// On-disk sidecar JSON.
#[derive(Debug, Serialize, Deserialize)]
struct SnapshotSidecar {
    name: String,
}

fn snapshots_dir(project_path: &Path, node_id: &str) -> PathBuf {
    project_path.join(".app").join("backups").join(node_id).join("snapshots")
}

fn auto_backup_path(project_path: &Path, node_id: &str, timestamp: &str) -> PathBuf {
    project_path
        .join(".app")
        .join("backups")
        .join(node_id)
        .join(format!("{timestamp}.md"))
}

fn snapshot_md_path(project_path: &Path, node_id: &str, timestamp: &str) -> PathBuf {
    snapshots_dir(project_path, node_id).join(format!("{timestamp}.md"))
}

fn snapshot_json_path(project_path: &Path, node_id: &str, timestamp: &str) -> PathBuf {
    snapshots_dir(project_path, node_id).join(format!("{timestamp}.json"))
}

/// Pin an existing auto-backup as a named snapshot. Returns the new `SnapshotEntry`.
///
/// The auto-backup file is COPIED (not moved) so the existing 20-item cull pool
/// continues to hold it until displacement; after that, the snapshots/ copy is
/// the only remaining record.
pub fn pin_snapshot(
    project_path: &Path,
    node_id: &str,
    timestamp: &str,
    name: &str,
) -> Result<SnapshotEntry, String> {
    let source = auto_backup_path(project_path, node_id, timestamp);
    if !source.exists() {
        return Err(format!(
            "Auto-backup '{timestamp}' not found for node '{node_id}'"
        ));
    }
    let dir = snapshots_dir(project_path, node_id);
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create snapshots dir: {e}"))?;

    let md_target = snapshot_md_path(project_path, node_id, timestamp);
    fs::copy(&source, &md_target).map_err(|e| format!("Cannot copy snapshot: {e}"))?;

    let sidecar = SnapshotSidecar { name: name.to_string() };
    let sidecar_json =
        serde_json::to_string_pretty(&sidecar).map_err(|e| format!("Serialize sidecar: {e}"))?;
    let json_target = snapshot_json_path(project_path, node_id, timestamp);
    atomic_write(&json_target, &sidecar_json)?;

    let content = fs::read_to_string(&md_target).map_err(|e| format!("Read snapshot: {e}"))?;
    let meta = fs::metadata(&md_target).map_err(|e| format!("Stat snapshot: {e}"))?;
    Ok(SnapshotEntry {
        node_id: node_id.to_string(),
        timestamp: timestamp.to_string(),
        name: name.to_string(),
        size_bytes: meta.len(),
        preview: preview_of(&content),
    })
}

/// Remove a snapshot. Both the .md and the .json sidecar are deleted.
pub fn unpin_snapshot(
    project_path: &Path,
    node_id: &str,
    snapshot_timestamp: &str,
) -> Result<(), String> {
    let md = snapshot_md_path(project_path, node_id, snapshot_timestamp);
    let json = snapshot_json_path(project_path, node_id, snapshot_timestamp);
    if md.exists() {
        fs::remove_file(&md).map_err(|e| format!("Remove snapshot md: {e}"))?;
    }
    if json.exists() {
        fs::remove_file(&json).map_err(|e| format!("Remove snapshot json: {e}"))?;
    }
    Ok(())
}

/// List all snapshots for a node, newest first.
pub fn list_snapshots(
    project_path: &Path,
    node_id: &str,
) -> Result<Vec<SnapshotEntry>, String> {
    let dir = snapshots_dir(project_path, node_id);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("Read snapshots dir: {e}"))? {
        let entry = entry.map_err(|e| format!("Read snapshot entry: {e}"))?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        let timestamp = match path.file_stem().and_then(|s| s.to_str()) {
            Some(t) => t.to_string(),
            None => continue,
        };
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let meta = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let name = match fs::read_to_string(snapshot_json_path(project_path, node_id, &timestamp)) {
            Ok(raw) => serde_json::from_str::<SnapshotSidecar>(&raw)
                .map(|s| s.name)
                .unwrap_or_else(|_| timestamp.clone()),
            Err(_) => timestamp.clone(),
        };
        entries.push(SnapshotEntry {
            node_id: node_id.to_string(),
            timestamp,
            name,
            size_bytes: meta.len(),
            preview: preview_of(&content),
        });
    }
    // Newest first — timestamps sort lexicographically because they are ISO8601.
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(entries)
}

/// Restore a snapshot into the live document file, first taking an auto-backup
/// of the current state (same safety-net behavior as `project::restore_backup`).
pub fn restore_snapshot(
    project_path: &Path,
    node_id: &str,
    snapshot_timestamp: &str,
) -> Result<DocumentContent, String> {
    let md = snapshot_md_path(project_path, node_id, snapshot_timestamp);
    if !md.exists() {
        return Err(format!(
            "Snapshot '{snapshot_timestamp}' not found for node '{node_id}'"
        ));
    }
    // Safety backup of current state before overwriting.
    create_backup(project_path, node_id)?;

    let snapshot_content =
        fs::read_to_string(&md).map_err(|e| format!("Read snapshot: {e}"))?;
    let manifest = project::load_manifest(project_path)?;
    let node = manifest
        .nodes
        .get(node_id)
        .ok_or_else(|| format!("Node '{node_id}' not found"))?;
    let file_rel = node
        .file
        .as_ref()
        .ok_or_else(|| format!("Node '{node_id}' has no associated file"))?;
    let full = project_path.join(file_rel);
    atomic_write(&full, &snapshot_content)?;

    project::load_document(project_path, node_id)
}

fn preview_of(content: &str) -> String {
    let body = match crate::frontmatter::parse_frontmatter(content) {
        Some((_, body)) => body,
        None => content.to_string(),
    };
    let stripped: String = body.chars().take(120).collect();
    stripped.replace('\n', " ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::tempdir;

    fn setup_project(dir: &Path) -> crate::project::ProjectManifest {
        std::fs::create_dir_all(dir.join("manuscript")).unwrap();
        std::fs::create_dir_all(dir.join("kb")).unwrap();
        std::fs::create_dir_all(dir.join(".app").join("backups")).unwrap();

        std::fs::write(
            dir.join("manuscript").join("scene--a.md"),
            "---\nid: node_a\ntype: scene\ntitle: A\n---\n\nOriginal body.",
        )
        .unwrap();

        let mut nodes = HashMap::new();
        nodes.insert(
            "node_a".to_string(),
            crate::project::ProjectNode {
                title: Some("A".into()),
                file: Some("manuscript/scene--a.md".into()),
                doc_type: Some("scene".into()),
                children: vec![],
            },
        );
        let manifest = crate::project::ProjectManifest {
            version: 1,
            root: "node_root".into(),
            nodes,
            doc_types: crate::project::default_doc_types(),
            tag_colors: Default::default(),
            status_colors: None,
        };
        crate::project::save_manifest(dir, &manifest).unwrap();
        manifest
    }

    #[test]
    fn pin_snapshot_copies_auto_backup_and_writes_sidecar() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        setup_project(root);
        create_backup(root, "node_a").unwrap();
        let backups = crate::project::list_backups(root, "node_a").unwrap();
        assert_eq!(backups.len(), 1);
        let ts = &backups[0].timestamp;

        let entry = pin_snapshot(root, "node_a", ts, "before rewrite").expect("pin");
        assert_eq!(entry.node_id, "node_a");
        assert_eq!(entry.timestamp, *ts);
        assert_eq!(entry.name, "before rewrite");
        assert!(entry.size_bytes > 0);

        assert!(snapshot_md_path(root, "node_a", ts).exists());
        assert!(snapshot_json_path(root, "node_a", ts).exists());
    }

    #[test]
    fn pin_snapshot_fails_when_auto_backup_missing() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        setup_project(root);
        let result = pin_snapshot(root, "node_a", "20260101T000000.000", "x");
        assert!(result.is_err());
    }

    #[test]
    fn list_snapshots_returns_pinned_entries() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        setup_project(root);
        create_backup(root, "node_a").unwrap();
        let ts = crate::project::list_backups(root, "node_a")
            .unwrap()
            .pop()
            .unwrap()
            .timestamp;
        pin_snapshot(root, "node_a", &ts, "milestone").unwrap();

        let snapshots = list_snapshots(root, "node_a").expect("list");
        assert_eq!(snapshots.len(), 1);
        assert_eq!(snapshots[0].name, "milestone");
    }

    #[test]
    fn list_snapshots_empty_when_no_pins() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        setup_project(root);
        let snapshots = list_snapshots(root, "node_a").expect("list empty");
        assert!(snapshots.is_empty());
    }

    #[test]
    fn unpin_snapshot_removes_files() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        setup_project(root);
        create_backup(root, "node_a").unwrap();
        let ts = crate::project::list_backups(root, "node_a")
            .unwrap()
            .pop()
            .unwrap()
            .timestamp;
        pin_snapshot(root, "node_a", &ts, "m").unwrap();

        unpin_snapshot(root, "node_a", &ts).expect("unpin");
        assert!(!snapshot_md_path(root, "node_a", &ts).exists());
        assert!(!snapshot_json_path(root, "node_a", &ts).exists());
        assert!(list_snapshots(root, "node_a").unwrap().is_empty());
    }

    #[test]
    fn restore_snapshot_overwrites_current_file_with_safety_backup() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        setup_project(root);

        create_backup(root, "node_a").unwrap();
        let ts = crate::project::list_backups(root, "node_a")
            .unwrap()
            .pop()
            .unwrap()
            .timestamp;
        pin_snapshot(root, "node_a", &ts, "original").unwrap();

        std::fs::write(
            root.join("manuscript").join("scene--a.md"),
            "---\nid: node_a\ntype: scene\ntitle: A\n---\n\nChanged body.",
        )
        .unwrap();

        let doc = restore_snapshot(root, "node_a", &ts).expect("restore");
        assert!(doc.content.contains("Original body."));

        let backups = crate::project::list_backups(root, "node_a").unwrap();
        assert!(backups.len() >= 2, "safety backup should exist after restore");
    }
}
