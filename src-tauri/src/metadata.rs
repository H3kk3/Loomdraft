//! v0.3 metadata: per-document synopsis/tags/status and per-project color configuration.
//!
//! Extracted from `project.rs` as part of the Plan A cleanup pass.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::frontmatter::{parse_frontmatter, write_frontmatter, Status};
use crate::project::{atomic_write, save_manifest, ProjectManifest};

// ── Node metadata ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeMetadata {
    pub synopsis: Option<String>,
    pub tags: Vec<String>,
    pub status: Status,
}

impl Default for NodeMetadata {
    fn default() -> Self {
        Self {
            synopsis: None,
            tags: Vec::new(),
            status: Status::default(),
        }
    }
}

pub fn collect_project_metadata(
    project_path: &Path,
    manifest: &ProjectManifest,
) -> HashMap<String, NodeMetadata> {
    let mut out = HashMap::new();
    for (id, node) in &manifest.nodes {
        let Some(file_rel) = &node.file else { continue };
        let full = project_path.join(file_rel);
        let raw = match fs::read_to_string(&full) {
            Ok(raw) => raw,
            Err(e) => {
                eprintln!(
                    "[warn] metadata: could not read {} for node {id}: {e}",
                    full.display()
                );
                out.insert(id.clone(), NodeMetadata::default());
                continue;
            }
        };
        let (fm, _body) = match parse_frontmatter(&raw) {
            Some(t) => t,
            None => {
                eprintln!(
                    "[warn] metadata: unparseable frontmatter in {} for node {id}",
                    full.display()
                );
                out.insert(id.clone(), NodeMetadata::default());
                continue;
            }
        };
        out.insert(
            id.clone(),
            NodeMetadata {
                synopsis: fm.synopsis.clone(),
                tags: fm.tags.clone(),
                status: fm.status,
            },
        );
    }
    out
}

/// Updates the frontmatter of a single document in place.
///
/// Semantics (chosen to be compatible with default serde deserialization of Tauri command args,
/// which cannot distinguish an absent field from an explicit `null`):
/// - `tags: None` → leave tags unchanged. `tags: Some(vec![...])` → set to that list (pass `Some(vec![])` to clear).
/// - `status: None` → leave unchanged. `Some(s)` → set.
/// - Synopsis uses two parameters: `synopsis: Some(s)` sets to `s`; `clear_synopsis == true` clears it;
///   both absent = leave unchanged. (`clear_synopsis` wins if both are passed.)
pub fn update_node_metadata_on_disk(
    project_path: &Path,
    manifest: &ProjectManifest,
    node_id: &str,
    synopsis: Option<String>,
    clear_synopsis: bool,
    tags: Option<Vec<String>>,
    status: Option<Status>,
) -> Result<NodeMetadata, String> {
    let node = manifest
        .nodes
        .get(node_id)
        .ok_or_else(|| format!("Node '{node_id}' not found"))?;
    let file_rel = node
        .file
        .as_ref()
        .ok_or_else(|| format!("Node '{node_id}' has no associated file"))?;
    let full = project_path.join(file_rel);

    let raw = fs::read_to_string(&full).map_err(|e| format!("Cannot read {}: {e}", full.display()))?;
    let (mut fm, body) = parse_frontmatter(&raw)
        .ok_or_else(|| format!("Malformed frontmatter in {}", full.display()))?;

    if clear_synopsis {
        fm.synopsis = None;
    } else if let Some(new_syn) = synopsis {
        fm.synopsis = Some(new_syn);
    }
    if let Some(new_tags) = tags {
        fm.tags = new_tags;
    }
    if let Some(new_status) = status {
        fm.status = new_status;
    }
    fm.modified = Some(Utc::now().to_rfc3339());

    let out = write_frontmatter(&fm, &body)?;
    atomic_write(&full, &out)?;

    Ok(NodeMetadata {
        synopsis: fm.synopsis,
        tags: fm.tags,
        status: fm.status,
    })
}

// ── Per-project color maps ────────────────────────────────────────────────────

/// Validate that a string is a well-formed hex color: `#RGB`, `#RRGGBB`, or `#RRGGBBAA`.
fn validate_hex_color(s: &str) -> Result<(), String> {
    let bytes = s.as_bytes();
    if bytes.first() != Some(&b'#') {
        return Err(format!("Color must start with '#': got {s:?}"));
    }
    let hex = &bytes[1..];
    if !matches!(hex.len(), 3 | 6 | 8) {
        return Err(format!(
            "Color must be #RGB, #RRGGBB, or #RRGGBBAA: got {s:?} ({} hex chars)",
            hex.len()
        ));
    }
    for &c in hex {
        if !c.is_ascii_hexdigit() {
            return Err(format!("Color contains non-hex character: {s:?}"));
        }
    }
    Ok(())
}

pub fn apply_tag_color(
    project_path: &Path,
    manifest: &mut ProjectManifest,
    tag: &str,
    color: Option<String>,
) -> Result<(), String> {
    if let Some(ref c) = color {
        validate_hex_color(c)?;
    }
    match color {
        Some(c) => {
            manifest.tag_colors.insert(tag.to_string(), c);
        }
        None => {
            manifest.tag_colors.remove(tag);
        }
    }
    save_manifest(project_path, manifest)
}

pub fn apply_status_color(
    project_path: &Path,
    manifest: &mut ProjectManifest,
    status: &str,
    color: Option<String>,
) -> Result<(), String> {
    if let Some(ref c) = color {
        validate_hex_color(c)?;
    }
    let map = manifest.status_colors.get_or_insert_with(HashMap::new);
    match color {
        Some(c) => {
            map.insert(status.to_string(), c);
        }
        None => {
            map.remove(status);
            if map.is_empty() {
                manifest.status_colors = None;
            }
        }
    }
    save_manifest(project_path, manifest)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::{default_doc_types, ProjectNode};
    use tempfile::tempdir;

    fn write_doc(dir: &std::path::Path, rel: &str, content: &str) {
        let full = dir.join(rel);
        std::fs::create_dir_all(full.parent().unwrap()).unwrap();
        std::fs::write(full, content).unwrap();
    }

    #[test]
    fn collect_metadata_reads_synopsis_tags_status() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("manuscript")).unwrap();
        std::fs::create_dir_all(root.join("kb")).unwrap();

        write_doc(
            root,
            "manuscript/scene--a.md",
            "---\n\
id: node_a\n\
type: scene\n\
title: A\n\
synopsis: Elena meets the stranger.\n\
tags:\n  - foreshadowing\n\
status: draft\n\
---\n\nBody",
        );
        write_doc(
            root,
            "manuscript/scene--b.md",
            "---\nid: node_b\ntype: scene\ntitle: B\n---\n\nOld body",
        );

        let mut nodes = std::collections::HashMap::new();
        nodes.insert(
            "node_a".to_string(),
            ProjectNode {
                title: Some("A".into()),
                file: Some("manuscript/scene--a.md".into()),
                doc_type: Some("scene".into()),
                children: vec![],
            },
        );
        nodes.insert(
            "node_b".to_string(),
            ProjectNode {
                title: Some("B".into()),
                file: Some("manuscript/scene--b.md".into()),
                doc_type: Some("scene".into()),
                children: vec![],
            },
        );
        let manifest = ProjectManifest {
            version: 1,
            root: "node_root".into(),
            nodes,
            doc_types: default_doc_types(),
            tag_colors: Default::default(),
            status_colors: None,
        };

        let meta = collect_project_metadata(root, &manifest);
        let a = meta.get("node_a").expect("should have node_a");
        assert_eq!(a.synopsis.as_deref(), Some("Elena meets the stranger."));
        assert_eq!(a.tags, vec!["foreshadowing".to_string()]);
        assert_eq!(a.status, Status::Draft);

        let b = meta.get("node_b").expect("should have node_b");
        assert_eq!(b.synopsis, None);
        assert!(b.tags.is_empty());
        assert_eq!(b.status, Status::Draft); // default
    }

    #[test]
    fn update_metadata_writes_frontmatter() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("manuscript")).unwrap();
        std::fs::create_dir_all(root.join("kb")).unwrap();

        write_doc(
            root,
            "manuscript/scene--a.md",
            "---\nid: node_a\ntype: scene\ntitle: A\n---\n\nBody",
        );

        let mut nodes = std::collections::HashMap::new();
        nodes.insert(
            "node_a".to_string(),
            ProjectNode {
                title: Some("A".into()),
                file: Some("manuscript/scene--a.md".into()),
                doc_type: Some("scene".into()),
                children: vec![],
            },
        );
        let manifest = ProjectManifest {
            version: 1,
            root: "node_root".into(),
            nodes,
            doc_types: default_doc_types(),
            tag_colors: Default::default(),
            status_colors: None,
        };
        let _ = save_manifest(root, &manifest);

        let updated = update_node_metadata_on_disk(
            root,
            &manifest,
            "node_a",
            Some("The encounter".into()),
            false,
            Some(vec!["foreshadowing".into(), "subplot-a".into()]),
            Some(Status::InRevision),
        )
        .expect("should update");
        assert_eq!(updated.synopsis.as_deref(), Some("The encounter"));
        assert_eq!(updated.tags, vec!["foreshadowing".to_string(), "subplot-a".to_string()]);
        assert_eq!(updated.status, Status::InRevision);

        // File reads back with new frontmatter
        let raw = std::fs::read_to_string(root.join("manuscript/scene--a.md")).unwrap();
        let (fm, body) = parse_frontmatter(&raw).expect("parse");
        assert_eq!(fm.synopsis.as_deref(), Some("The encounter"));
        assert_eq!(fm.status, Status::InRevision);
        assert!(body.contains("Body"));
    }

    #[test]
    fn set_and_remove_tag_color_round_trip() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join(".app")).unwrap();

        let mut manifest = ProjectManifest {
            version: 1,
            root: "node_root".into(),
            nodes: HashMap::new(),
            doc_types: default_doc_types(),
            tag_colors: Default::default(),
            status_colors: None,
        };
        let _ = save_manifest(root, &manifest);

        apply_tag_color(root, &mut manifest, "subplot-a", Some("#4a90e2".into()))
            .expect("set");
        assert_eq!(manifest.tag_colors.get("subplot-a"), Some(&"#4a90e2".to_string()));

        apply_tag_color(root, &mut manifest, "subplot-a", None).expect("clear");
        assert!(manifest.tag_colors.get("subplot-a").is_none());
    }

    #[test]
    fn set_and_remove_status_color_round_trip() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join(".app")).unwrap();

        let mut manifest = ProjectManifest {
            version: 1,
            root: "node_root".into(),
            nodes: HashMap::new(),
            doc_types: default_doc_types(),
            tag_colors: Default::default(),
            status_colors: None,
        };
        let _ = save_manifest(root, &manifest);

        apply_status_color(root, &mut manifest, "draft", Some("#888888".into()))
            .expect("set");
        let map = manifest.status_colors.as_ref().expect("should be Some");
        assert_eq!(map.get("draft"), Some(&"#888888".to_string()));

        apply_status_color(root, &mut manifest, "draft", None).expect("clear");
        assert!(manifest.status_colors.is_none(), "should revert to None when last entry removed");
    }

    #[test]
    fn validate_hex_accepts_valid() {
        assert!(validate_hex_color("#abc").is_ok());
        assert!(validate_hex_color("#ABCDEF").is_ok());
        assert!(validate_hex_color("#FF00FF80").is_ok());
        assert!(validate_hex_color("#000").is_ok());
    }

    #[test]
    fn validate_hex_rejects_invalid() {
        assert!(validate_hex_color("").is_err());
        assert!(validate_hex_color("abc").is_err());   // missing #
        assert!(validate_hex_color("#ab").is_err());   // wrong length
        assert!(validate_hex_color("#abcde").is_err()); // wrong length
        assert!(validate_hex_color("#xyz").is_err());  // non-hex
        assert!(validate_hex_color("#ggggggg").is_err());
    }

    #[test]
    fn apply_tag_color_rejects_invalid_hex() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join(".app")).unwrap();
        let mut manifest = ProjectManifest {
            version: 1,
            root: "root".into(),
            nodes: std::collections::HashMap::new(),
            doc_types: default_doc_types(),
            tag_colors: Default::default(),
            status_colors: None,
        };
        let _ = save_manifest(root, &manifest);
        let result = apply_tag_color(root, &mut manifest, "foo", Some("not-a-color".into()));
        assert!(result.is_err());
        assert!(manifest.tag_colors.is_empty(), "rejected color should not be applied");
    }

    #[test]
    fn update_then_collect_reflects_changes() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("manuscript")).unwrap();
        std::fs::create_dir_all(root.join("kb")).unwrap();

        write_doc(
            root,
            "manuscript/scene--a.md",
            "---\nid: node_a\ntype: scene\ntitle: A\n---\n\nInitial body",
        );
        write_doc(
            root,
            "manuscript/scene--b.md",
            "---\nid: node_b\ntype: scene\ntitle: B\n---\n\nAnother scene",
        );

        let mut nodes = std::collections::HashMap::new();
        nodes.insert(
            "node_a".to_string(),
            crate::project::ProjectNode {
                title: Some("A".into()),
                file: Some("manuscript/scene--a.md".into()),
                doc_type: Some("scene".into()),
                children: vec![],
            },
        );
        nodes.insert(
            "node_b".to_string(),
            crate::project::ProjectNode {
                title: Some("B".into()),
                file: Some("manuscript/scene--b.md".into()),
                doc_type: Some("scene".into()),
                children: vec![],
            },
        );
        let manifest = ProjectManifest {
            version: 1,
            root: "node_root".into(),
            nodes,
            doc_types: crate::project::default_doc_types(),
            tag_colors: Default::default(),
            status_colors: None,
        };

        // Initial collect: both nodes at default status (Draft), no tags, no synopsis.
        let initial = collect_project_metadata(root, &manifest);
        assert_eq!(initial.get("node_a").unwrap().status, Status::Draft);
        assert_eq!(initial.get("node_a").unwrap().tags, Vec::<String>::new());
        assert_eq!(initial.get("node_a").unwrap().synopsis, None);

        // Mutate node_a: set synopsis, tags, and status.
        let updated_a = update_node_metadata_on_disk(
            root,
            &manifest,
            "node_a",
            Some("A confrontation at dawn.".into()),
            false,
            Some(vec!["subplot-a".into(), "foreshadowing".into()]),
            Some(Status::InRevision),
        )
        .expect("update should succeed");
        assert_eq!(updated_a.status, Status::InRevision);

        // Re-collect: node_a reflects the write, node_b is unchanged.
        let after = collect_project_metadata(root, &manifest);
        let a = after.get("node_a").unwrap();
        assert_eq!(a.synopsis.as_deref(), Some("A confrontation at dawn."));
        assert_eq!(a.tags, vec!["subplot-a".to_string(), "foreshadowing".to_string()]);
        assert_eq!(a.status, Status::InRevision);

        let b = after.get("node_b").unwrap();
        assert_eq!(b.synopsis, None);
        assert!(b.tags.is_empty());
        assert_eq!(b.status, Status::Draft);
    }
}
