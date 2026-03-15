use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const MANUSCRIPT_DOC_TYPES: [&str; 5] = ["part", "chapter", "scene", "interlude", "snippet"];

// ── Manifest types ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectManifest {
    pub version: u32,
    pub root: String,
    pub nodes: HashMap<String, ProjectNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectNode {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doc_type: Option<String>,
    pub children: Vec<String>,
}

// ── Frontmatter ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentFrontmatter {
    pub id: String,
    #[serde(rename = "type")]
    pub doc_type: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified: Option<String>,
}

// ── Result type returned to the frontend ─────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentContent {
    pub id: String,
    pub title: String,
    pub doc_type: String,
    pub content: String,
    pub file: String,
}

// ── Project creation ──────────────────────────────────────────────────────────

pub fn create_project(dir: &Path, name: &str) -> Result<(PathBuf, ProjectManifest), String> {
    let project_path = dir.join(name);

    if project_path.exists() {
        return Err(format!("'{}' already exists in that folder", name));
    }

    fs::create_dir_all(&project_path).map_err(|e| e.to_string())?;
    fs::create_dir_all(project_path.join("manuscript")).map_err(|e| e.to_string())?;
    fs::create_dir_all(project_path.join("kb")).map_err(|e| e.to_string())?;
    fs::create_dir_all(project_path.join("assets").join("images"))
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(project_path.join(".app")).map_err(|e| e.to_string())?;

    let mut nodes = HashMap::new();
    nodes.insert(
        "node_root".to_string(),
        ProjectNode {
            title: Some(name.to_string()),
            file: None,
            doc_type: None,
            children: vec![],
        },
    );

    let manifest = ProjectManifest {
        version: 1,
        root: "node_root".to_string(),
        nodes,
    };

    save_manifest(&project_path, &manifest)?;
    Ok((project_path, manifest))
}

// ── Manifest I/O ──────────────────────────────────────────────────────────────

pub fn load_manifest(project_path: &Path) -> Result<ProjectManifest, String> {
    let path = project_path.join("project.json");
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("Cannot read project.json: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("Malformed project.json: {e}"))
}

pub fn save_manifest(project_path: &Path, manifest: &ProjectManifest) -> Result<(), String> {
    let path = project_path.join("project.json");
    let tmp_path = project_path.join("project.json.tmp");
    let raw = serde_json::to_string_pretty(manifest)
        .map_err(|e| format!("Cannot serialize manifest: {e}"))?;
    fs::write(&tmp_path, &raw).map_err(|e| format!("Cannot write project.json.tmp: {e}"))?;
    fs::rename(&tmp_path, &path).map_err(|e| format!("Cannot finalize project.json: {e}"))
}

// ── Backup system ──────────────────────────────────────────────────────────────

const MAX_BACKUPS_PER_NODE: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupEntry {
    pub node_id: String,
    pub timestamp: String,
    pub size_bytes: u64,
    pub preview: String,
}

fn backup_dir(project_path: &Path, node_id: &str) -> PathBuf {
    project_path
        .join(".app")
        .join("backups")
        .join(node_id)
}

/// Create a backup of the current file before saving.
/// Returns Ok(()) even if the source file doesn't exist (nothing to back up).
pub fn create_backup(project_path: &Path, node_id: &str) -> Result<(), String> {
    let manifest = load_manifest(project_path)?;
    let node = match manifest.nodes.get(node_id) {
        Some(n) => n,
        None => return Ok(()), // no node → nothing to back up
    };
    let file_rel = match &node.file {
        Some(f) => f,
        None => return Ok(()),
    };

    let file_path = project_path.join(file_rel);
    if !file_path.exists() {
        return Ok(());
    }

    let dir = backup_dir(project_path, node_id);
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create backup dir: {e}"))?;

    let timestamp = Utc::now().format("%Y%m%dT%H%M%S%.3f").to_string();
    let backup_file = dir.join(format!("{timestamp}.md"));
    fs::copy(&file_path, &backup_file)
        .map_err(|e| format!("Cannot create backup: {e}"))?;

    // Prune old backups — keep only the newest MAX_BACKUPS_PER_NODE
    prune_backups(&dir)?;

    Ok(())
}

fn prune_backups(dir: &Path) -> Result<(), String> {
    let mut entries: Vec<_> = fs::read_dir(dir)
        .map_err(|e| format!("Cannot read backup dir: {e}"))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext == "md")
                .unwrap_or(false)
        })
        .collect();

    // Sort by name descending (timestamp-based names sort chronologically)
    entries.sort_by(|a, b| b.file_name().cmp(&a.file_name()));

    // Remove entries beyond the limit
    for entry in entries.iter().skip(MAX_BACKUPS_PER_NODE) {
        let _ = fs::remove_file(entry.path());
    }

    Ok(())
}

/// List all backups for a given node, newest first.
pub fn list_backups(project_path: &Path, node_id: &str) -> Result<Vec<BackupEntry>, String> {
    let dir = backup_dir(project_path, node_id);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries: Vec<BackupEntry> = Vec::new();

    for entry in fs::read_dir(&dir).map_err(|e| format!("Cannot read backup dir: {e}"))? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }

        let filename = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        let meta = fs::metadata(&path).ok();
        let size_bytes = meta.map(|m| m.len()).unwrap_or(0);

        // Read first ~200 chars of body for preview
        let preview = match fs::read_to_string(&path) {
            Ok(raw) => {
                let body = parse_frontmatter(&raw)
                    .map(|(_, body)| body)
                    .unwrap_or(raw);
                body.chars().take(200).collect::<String>()
            }
            Err(_) => String::new(),
        };

        entries.push(BackupEntry {
            node_id: node_id.to_string(),
            timestamp: filename,
            size_bytes,
            preview,
        });
    }

    // Sort newest first
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(entries)
}

/// Restore a backup by copying it back to the document's file location.
pub fn restore_backup(
    project_path: &Path,
    node_id: &str,
    timestamp: &str,
) -> Result<DocumentContent, String> {
    let dir = backup_dir(project_path, node_id);
    let backup_file = dir.join(format!("{timestamp}.md"));
    if !backup_file.exists() {
        return Err(format!("Backup not found: {timestamp}"));
    }

    let manifest = load_manifest(project_path)?;
    let node = manifest
        .nodes
        .get(node_id)
        .ok_or_else(|| format!("Node '{node_id}' not found"))?;
    let file_rel = node
        .file
        .as_ref()
        .ok_or_else(|| format!("Node '{node_id}' has no file"))?;

    let file_path = project_path.join(file_rel);

    // Back up the CURRENT version before restoring (so restore is reversible)
    if file_path.exists() {
        create_backup(project_path, node_id)?;
    }

    // Copy backup to the document file
    fs::copy(&backup_file, &file_path)
        .map_err(|e| format!("Cannot restore backup: {e}"))?;

    // Re-read and return the restored content
    load_document(project_path, node_id)
}

// ── Document I/O ──────────────────────────────────────────────────────────────

pub fn load_document(project_path: &Path, node_id: &str) -> Result<DocumentContent, String> {
    let manifest = load_manifest(project_path)?;

    let node = manifest
        .nodes
        .get(node_id)
        .ok_or_else(|| format!("Node '{node_id}' not found"))?;

    let file_rel = node
        .file
        .as_ref()
        .ok_or_else(|| format!("Node '{node_id}' has no file"))?;

    let file_path = project_path.join(file_rel);
    let raw = fs::read_to_string(&file_path)
        .map_err(|e| format!("Cannot read '{}': {e}", file_rel))?;

    let (fm, body) = parse_frontmatter(&raw)
        .ok_or_else(|| format!("Missing or malformed frontmatter in '{}'", file_rel))?;

    Ok(DocumentContent {
        id: fm.id,
        title: fm.title,
        doc_type: fm.doc_type,
        content: body,
        file: file_rel.clone(),
    })
}

pub fn save_document(
    project_path: &Path,
    node_id: &str,
    content: &str,
) -> Result<DocumentContent, String> {
    // Create a backup of the existing file before overwriting
    create_backup(project_path, node_id)?;

    let mut manifest = load_manifest(project_path)?;

    let node = manifest
        .nodes
        .get(node_id)
        .ok_or_else(|| format!("Node '{node_id}' not found"))?
        .clone();

    let file_rel = node
        .file
        .as_ref()
        .ok_or_else(|| format!("Node '{node_id}' has no file"))?
        .clone();

    let file_path = project_path.join(&file_rel);

    // Read existing frontmatter so we preserve created date and id
    let mut fm = if file_path.exists() {
        let raw = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
        parse_frontmatter(&raw)
            .map(|(f, _)| f)
            .unwrap_or_else(|| default_frontmatter(node_id, &node))
    } else {
        default_frontmatter(node_id, &node)
    };

    fm.modified = Some(Utc::now().to_rfc3339());

    let raw = write_frontmatter(&fm, content);
    let tmp_path = file_path.with_extension("md.tmp");
    fs::write(&tmp_path, &raw).map_err(|e| format!("Cannot write temp file: {e}"))?;
    fs::rename(&tmp_path, &file_path).map_err(|e| format!("Cannot finalize file: {e}"))?;

    // Keep manifest title in sync
    if let Some(n) = manifest.nodes.get_mut(node_id) {
        n.title = Some(fm.title.clone());
    }
    save_manifest(project_path, &manifest)?;

    Ok(DocumentContent {
        id: fm.id,
        title: fm.title,
        doc_type: fm.doc_type,
        content: content.to_string(),
        file: file_rel,
    })
}

// ── Node management ───────────────────────────────────────────────────────────

pub fn is_manuscript_doc_type(doc_type: &str) -> bool {
    MANUSCRIPT_DOC_TYPES.contains(&doc_type)
}

fn node_is_manuscript(manifest: &ProjectManifest, node_id: &str) -> Option<bool> {
    manifest
        .nodes
        .get(node_id)
        .and_then(|n| n.doc_type.as_deref())
        .map(is_manuscript_doc_type)
}

fn normalize_root_children_by_category(manifest: &mut ProjectManifest) {
    let root_id = manifest.root.clone();
    let root_children = manifest
        .nodes
        .get(&root_id)
        .map(|root| root.children.clone())
        .unwrap_or_default();

    let mut manuscript = Vec::new();
    let mut planning = Vec::new();
    for child_id in root_children {
        if node_is_manuscript(manifest, &child_id).unwrap_or(false) {
            manuscript.push(child_id);
        } else {
            planning.push(child_id);
        }
    }

    if let Some(root) = manifest.nodes.get_mut(&root_id) {
        root.children = manuscript.into_iter().chain(planning).collect();
    }
}

fn manuscript_child_count(manifest: &ProjectManifest, parent_id: &str) -> usize {
    manifest
        .nodes
        .get(parent_id)
        .map(|parent| {
            parent
                .children
                .iter()
                .filter(|child_id| node_is_manuscript(manifest, child_id).unwrap_or(false))
                .count()
        })
        .unwrap_or(0)
}

pub fn add_node(
    project_path: &Path,
    parent_id: &str,
    title: &str,
    doc_type: &str,
) -> Result<(String, ProjectManifest), String> {
    let mut manifest = load_manifest(project_path)?;

    if !manifest.nodes.contains_key(parent_id) {
        return Err(format!("Parent node '{parent_id}' not found"));
    }
    if let Some(parent_is_manuscript) = node_is_manuscript(&manifest, parent_id) {
        let child_is_manuscript = is_manuscript_doc_type(doc_type);
        if parent_is_manuscript != child_is_manuscript {
            return Err("Parent and child must both be manuscript or both be planning".to_string());
        }
    }

    let node_id = format!("node-{}", &Uuid::new_v4().to_string()[..8]);
    let dir = node_type_to_dir(doc_type);
    let prefix = node_type_to_prefix(doc_type);
    let slug = title_to_slug(title);

    // Resolve filename conflicts
    let filename = unique_filename(project_path.join(dir), &prefix, &slug);
    let file_rel = format!("{dir}/{filename}");

    // Write the initial markdown file
    let fm = DocumentFrontmatter {
        id: node_id.clone(),
        doc_type: doc_type.to_string(),
        title: title.to_string(),
        created: Some(Utc::now().to_rfc3339()),
        modified: None,
    };
    let raw = write_frontmatter(&fm, "");
    fs::write(project_path.join(&file_rel), raw)
        .map_err(|e| format!("Cannot create document file: {e}"))?;

    manifest.nodes.insert(
        node_id.clone(),
        ProjectNode {
            title: Some(title.to_string()),
            file: Some(file_rel),
            doc_type: Some(doc_type.to_string()),
            children: vec![],
        },
    );

    manifest
        .nodes
        .get_mut(parent_id)
        .ok_or_else(|| format!("Parent node '{parent_id}' disappeared unexpectedly"))?
        .children
        .push(node_id.clone());

    if parent_id == manifest.root {
        normalize_root_children_by_category(&mut manifest);
    }

    save_manifest(project_path, &manifest)?;
    Ok((node_id, manifest))
}

/// Returns node_id plus every descendant ID (iterative DFS, includes node_id itself).
fn collect_descendants(manifest: &ProjectManifest, node_id: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut stack = vec![node_id.to_string()];
    while let Some(current) = stack.pop() {
        if let Some(node) = manifest.nodes.get(&current) {
            for child in &node.children {
                stack.push(child.clone());
            }
        }
        result.push(current);
    }
    result
}

/// Returns true if candidate equals node_id or is any descendant of node_id.
fn is_ancestor_or_self(manifest: &ProjectManifest, node_id: &str, candidate: &str) -> bool {
    collect_descendants(manifest, node_id)
        .iter()
        .any(|id| id == candidate)
}

pub fn delete_node(
    project_path: &Path,
    node_id: &str,
) -> Result<(Vec<String>, ProjectManifest), String> {
    let mut manifest = load_manifest(project_path)?;

    if node_id == manifest.root {
        return Err("Cannot delete the root node".to_string());
    }
    if !manifest.nodes.contains_key(node_id) {
        return Err(format!("Node '{node_id}' not found"));
    }

    // 1. Collect node + all descendants
    let to_delete = collect_descendants(&manifest, node_id);

    // 2. Delete physical files for all collected IDs
    for id in &to_delete {
        if let Some(node) = manifest.nodes.get(id) {
            if let Some(file_rel) = &node.file {
                let p = project_path.join(file_rel);
                if p.exists() {
                    fs::remove_file(&p).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    // 3. Remove all collected IDs from the nodes map
    let to_delete_set: std::collections::HashSet<&str> =
        to_delete.iter().map(String::as_str).collect();
    manifest.nodes.retain(|id, _| !to_delete_set.contains(id.as_str()));

    // 4. Remove node_id from every surviving parent's children list
    //    (only node_id can appear in a surviving parent; descendants are only
    //     reachable through node_id so they never appear in other parents)
    for n in manifest.nodes.values_mut() {
        n.children.retain(|c| c != node_id);
    }

    save_manifest(project_path, &manifest)?;
    Ok((to_delete, manifest))
}

pub fn move_node(
    project_path: &Path,
    node_id: &str,
    new_parent_id: &str,
    position: usize,
) -> Result<ProjectManifest, String> {
    let mut manifest = load_manifest(project_path)?;

    if node_id == manifest.root {
        return Err("Cannot move the root node".to_string());
    }
    if !manifest.nodes.contains_key(node_id) {
        return Err(format!("Node '{node_id}' not found"));
    }
    if !manifest.nodes.contains_key(new_parent_id) {
        return Err(format!("New parent '{new_parent_id}' not found"));
    }
    if is_ancestor_or_self(&manifest, node_id, new_parent_id) {
        return Err("Cannot move a node into itself or one of its descendants".to_string());
    }
    if let (Some(node_is_manuscript), Some(parent_is_manuscript)) = (
        node_is_manuscript(&manifest, node_id),
        node_is_manuscript(&manifest, new_parent_id),
    ) {
        if node_is_manuscript != parent_is_manuscript {
            return Err("Parent and child must both be manuscript or both be planning".to_string());
        }
    }

    // Remove from current parent (O(n) scan — no parent pointer stored)
    for n in manifest.nodes.values_mut() {
        n.children.retain(|c| c != node_id);
    }

    // Keep root consistently grouped as manuscript first, planning second.
    normalize_root_children_by_category(&mut manifest);

    // Insert into new parent at clamped position
    let requested = position;
    let insert_pos = if new_parent_id == manifest.root {
        let root_len = manifest
            .nodes
            .get(new_parent_id)
            .map(|n| n.children.len())
            .unwrap_or(0);
        let manuscript_count = manuscript_child_count(&manifest, new_parent_id);
        let node_is_manuscript = node_is_manuscript(&manifest, node_id).unwrap_or(false);
        if node_is_manuscript {
            requested.min(manuscript_count)
        } else {
            requested.max(manuscript_count).min(root_len)
        }
    } else {
        let new_parent_len = manifest
            .nodes
            .get(new_parent_id)
            .map(|n| n.children.len())
            .unwrap_or(0);
        requested.min(new_parent_len)
    };

    let new_parent = manifest
        .nodes
        .get_mut(new_parent_id)
        .ok_or_else(|| format!("New parent '{new_parent_id}' disappeared unexpectedly"))?;
    new_parent.children.insert(insert_pos, node_id.to_string());

    if new_parent_id == manifest.root {
        normalize_root_children_by_category(&mut manifest);
    }

    save_manifest(project_path, &manifest)?;
    Ok(manifest)
}

pub fn rename_node(
    project_path: &Path,
    node_id: &str,
    new_title: &str,
) -> Result<ProjectManifest, String> {
    let mut manifest = load_manifest(project_path)?;

    let node = manifest
        .nodes
        .get_mut(node_id)
        .ok_or_else(|| format!("Node '{node_id}' not found"))?;

    node.title = Some(new_title.to_string());

    // Update title in the markdown frontmatter too
    if let Some(file_rel) = node.file.clone() {
        let file_path = project_path.join(&file_rel);
        if file_path.exists() {
            let raw = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
            if let Some((mut fm, body)) = parse_frontmatter(&raw) {
                fm.title = new_title.to_string();
                fm.modified = Some(Utc::now().to_rfc3339());
                fs::write(&file_path, write_frontmatter(&fm, &body))
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    save_manifest(project_path, &manifest)?;
    Ok(manifest)
}

// ── Wiki-link extraction ──────────────────────────────────────────────────────

/// Returns all `[[target]]` link targets found in `content`.
pub fn extract_wiki_links(content: &str) -> Vec<String> {
    let mut links = Vec::new();
    let bytes = content.as_bytes();
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] == b'[' && bytes[i + 1] == b'[' {
            i += 2;
            let start = i;
            while i + 1 < bytes.len() && !(bytes[i] == b']' && bytes[i + 1] == b']') {
                i += 1;
            }
            if i + 1 < bytes.len() {
                // Strip namespace prefix: [[char:aiko]] → "aiko" kept as-is (we store full ref)
                links.push(content[start..i].to_string());
                i += 2;
                continue;
            }
        }
        i += 1;
    }
    links
}

// ── Frontmatter helpers ───────────────────────────────────────────────────────

pub fn parse_frontmatter(content: &str) -> Option<(DocumentFrontmatter, String)> {
    // Strip BOM
    let content = content.trim_start_matches('\u{feff}');
    // Normalise CRLF
    let owned: String;
    let content = if content.contains('\r') {
        owned = content.replace("\r\n", "\n");
        &owned
    } else {
        content
    };

    if !content.starts_with("---\n") {
        return None;
    }

    let rest = &content[4..]; // skip opening "---\n"
    let end = rest.find("\n---\n")?;
    let yaml = &rest[..end];
    // body starts after "\n---\n" (5 chars)
    let body = rest[end + 5..].trim_start_matches('\n').to_string();

    let fm: DocumentFrontmatter = serde_yaml::from_str(yaml).ok()?;
    Some((fm, body))
}

pub fn write_frontmatter(fm: &DocumentFrontmatter, body: &str) -> String {
    // serde_yaml 0.9 to_string() outputs plain YAML with a trailing newline
    let yaml = serde_yaml::to_string(fm).unwrap_or_default();
    format!("---\n{}---\n\n{}", yaml, body)
}

// ── Private helpers ───────────────────────────────────────────────────────────

fn default_frontmatter(node_id: &str, node: &ProjectNode) -> DocumentFrontmatter {
    DocumentFrontmatter {
        id: node_id.to_string(),
        doc_type: node.doc_type.clone().unwrap_or_else(|| "chapter".to_string()),
        title: node.title.clone().unwrap_or_else(|| "Untitled".to_string()),
        created: Some(Utc::now().to_rfc3339()),
        modified: None,
    }
}

fn title_to_slug(title: &str) -> String {
    let s: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    s.split('-')
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn node_type_to_dir(doc_type: &str) -> &'static str {
    match doc_type {
        "part" | "chapter" | "scene" | "interlude" | "snippet" => "manuscript",
        _ => "kb",
    }
}

fn node_type_to_prefix(doc_type: &str) -> String {
    match doc_type {
        "part"         => "part--".to_string(),
        "chapter"      => "chap--".to_string(),
        "scene"        => "scene--".to_string(),
        "interlude"    => "interlude--".to_string(),
        "snippet"      => "snippet--".to_string(),
        "character"    => "char--".to_string(),
        "location"     => "loc--".to_string(),
        "item"         => "item--".to_string(),
        "organization" => "org--".to_string(),
        "event"        => "event--".to_string(),
        "lore"         => "lore--".to_string(),
        "outline"      => "outline--".to_string(),
        "research"     => "research--".to_string(),
        "note"         => "note--".to_string(),
        other          => format!("{other}--"),
    }
}

fn unique_filename(dir: PathBuf, prefix: &str, slug: &str) -> String {
    let base = format!("{prefix}{slug}");
    let candidate = format!("{base}.md");
    if !dir.join(&candidate).exists() {
        return candidate;
    }
    let mut n = 2u32;
    loop {
        let candidate = format!("{base}-{n}.md");
        if !dir.join(&candidate).exists() {
            return candidate;
        }
        n += 1;
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── parse_frontmatter ────────────────────────────────────────────────

    #[test]
    fn parse_frontmatter_basic() {
        let input = "---\nid: node-1\ntype: chapter\ntitle: My Chapter\n---\n\nHello world";
        let (fm, body) = parse_frontmatter(input).expect("should parse");
        assert_eq!(fm.id, "node-1");
        assert_eq!(fm.doc_type, "chapter");
        assert_eq!(fm.title, "My Chapter");
        assert_eq!(body, "Hello world");
    }

    #[test]
    fn parse_frontmatter_strips_bom() {
        let input = "\u{feff}---\nid: n1\ntype: scene\ntitle: BOM test\n---\n\nBody";
        let (fm, body) = parse_frontmatter(input).expect("should handle BOM");
        assert_eq!(fm.id, "n1");
        assert_eq!(body, "Body");
    }

    #[test]
    fn parse_frontmatter_normalizes_crlf() {
        let input = "---\r\nid: n1\r\ntype: chapter\r\ntitle: CRLF\r\n---\r\n\r\nBody text";
        let (fm, body) = parse_frontmatter(input).expect("should handle CRLF");
        assert_eq!(fm.title, "CRLF");
        assert_eq!(body, "Body text");
    }

    #[test]
    fn parse_frontmatter_returns_none_without_opening() {
        assert!(parse_frontmatter("no frontmatter here").is_none());
    }

    #[test]
    fn parse_frontmatter_returns_none_without_closing() {
        assert!(parse_frontmatter("---\nid: n1\ntype: chapter\ntitle: Oops").is_none());
    }

    #[test]
    fn parse_frontmatter_empty_body() {
        let input = "---\nid: n1\ntype: chapter\ntitle: Empty\n---\n";
        let (fm, body) = parse_frontmatter(input).expect("should parse");
        assert_eq!(fm.title, "Empty");
        assert_eq!(body, "");
    }

    // ── write_frontmatter ────────────────────────────────────────────────

    #[test]
    fn write_frontmatter_roundtrip() {
        let fm = DocumentFrontmatter {
            id: "node-42".to_string(),
            doc_type: "scene".to_string(),
            title: "Roundtrip".to_string(),
            created: None,
            modified: None,
        };
        let raw = write_frontmatter(&fm, "Body content");
        let (parsed, body) = parse_frontmatter(&raw).expect("should roundtrip");
        assert_eq!(parsed.id, "node-42");
        assert_eq!(parsed.doc_type, "scene");
        assert_eq!(parsed.title, "Roundtrip");
        assert_eq!(body, "Body content");
    }

    // ── extract_wiki_links ───────────────────────────────────────────────

    #[test]
    fn extract_wiki_links_basic() {
        let links = extract_wiki_links("Visit [[Aiko]] and [[Castle Ruins]] today.");
        assert_eq!(links, vec!["Aiko", "Castle Ruins"]);
    }

    #[test]
    fn extract_wiki_links_empty() {
        assert!(extract_wiki_links("No links here").is_empty());
    }

    #[test]
    fn extract_wiki_links_adjacent() {
        let links = extract_wiki_links("[[A]][[B]]");
        assert_eq!(links, vec!["A", "B"]);
    }

    #[test]
    fn extract_wiki_links_unclosed() {
        let links = extract_wiki_links("[[unclosed link");
        assert!(links.is_empty());
    }

    #[test]
    fn extract_wiki_links_with_namespace() {
        let links = extract_wiki_links("See [[char:Aiko]] for details");
        assert_eq!(links, vec!["char:Aiko"]);
    }

    // ── title_to_slug ────────────────────────────────────────────────────

    #[test]
    fn slug_basic() {
        assert_eq!(title_to_slug("My Chapter"), "my-chapter");
    }

    #[test]
    fn slug_special_chars() {
        assert_eq!(title_to_slug("Hello, World!"), "hello-world");
    }

    #[test]
    fn slug_multiple_separators() {
        assert_eq!(title_to_slug("A - B -- C"), "a-b-c");
    }

    #[test]
    fn slug_unicode() {
        // Unicode letters are alphanumeric → kept and lowercased
        assert_eq!(title_to_slug("Café & Résumé"), "café-résumé");
    }

    #[test]
    fn slug_numbers() {
        assert_eq!(title_to_slug("Chapter 1"), "chapter-1");
    }

    // ── node_type_to_dir ─────────────────────────────────────────────────

    #[test]
    fn dir_manuscript_types() {
        assert_eq!(node_type_to_dir("chapter"), "manuscript");
        assert_eq!(node_type_to_dir("scene"), "manuscript");
        assert_eq!(node_type_to_dir("part"), "manuscript");
    }

    #[test]
    fn dir_planning_types() {
        assert_eq!(node_type_to_dir("character"), "kb");
        assert_eq!(node_type_to_dir("note"), "kb");
        assert_eq!(node_type_to_dir("research"), "kb");
    }

    // ── node_type_to_prefix ──────────────────────────────────────────────

    #[test]
    fn prefix_known_types() {
        assert_eq!(node_type_to_prefix("chapter"), "chap--");
        assert_eq!(node_type_to_prefix("character"), "char--");
        assert_eq!(node_type_to_prefix("location"), "loc--");
    }

    #[test]
    fn prefix_unknown_type() {
        assert_eq!(node_type_to_prefix("custom"), "custom--");
    }

    // ── is_manuscript_doc_type ───────────────────────────────────────────

    #[test]
    fn is_manuscript_positive() {
        assert!(is_manuscript_doc_type("chapter"));
        assert!(is_manuscript_doc_type("scene"));
        assert!(is_manuscript_doc_type("part"));
    }

    #[test]
    fn is_manuscript_negative() {
        assert!(!is_manuscript_doc_type("character"));
        assert!(!is_manuscript_doc_type("note"));
        assert!(!is_manuscript_doc_type("unknown"));
    }

    // ── collect_descendants ──────────────────────────────────────────────

    #[test]
    fn collect_descendants_single_node() {
        let mut nodes = HashMap::new();
        nodes.insert("root".to_string(), ProjectNode {
            title: Some("Root".to_string()),
            file: None,
            doc_type: None,
            children: vec!["a".to_string()],
        });
        nodes.insert("a".to_string(), ProjectNode {
            title: Some("A".to_string()),
            file: None,
            doc_type: None,
            children: vec![],
        });
        let manifest = ProjectManifest { version: 1, root: "root".to_string(), nodes };

        let result = collect_descendants(&manifest, "a");
        assert_eq!(result, vec!["a"]);
    }

    #[test]
    fn collect_descendants_with_children() {
        let mut nodes = HashMap::new();
        nodes.insert("root".to_string(), ProjectNode {
            title: Some("Root".to_string()),
            file: None,
            doc_type: None,
            children: vec!["a".to_string()],
        });
        nodes.insert("a".to_string(), ProjectNode {
            title: Some("A".to_string()),
            file: None,
            doc_type: None,
            children: vec!["b".to_string(), "c".to_string()],
        });
        nodes.insert("b".to_string(), ProjectNode {
            title: Some("B".to_string()),
            file: None,
            doc_type: None,
            children: vec![],
        });
        nodes.insert("c".to_string(), ProjectNode {
            title: Some("C".to_string()),
            file: None,
            doc_type: None,
            children: vec![],
        });
        let manifest = ProjectManifest { version: 1, root: "root".to_string(), nodes };

        let mut result = collect_descendants(&manifest, "a");
        result.sort();
        assert_eq!(result, vec!["a", "b", "c"]);
    }

    // ── is_ancestor_or_self ──────────────────────────────────────────────

    #[test]
    fn ancestor_self() {
        let mut nodes = HashMap::new();
        nodes.insert("a".to_string(), ProjectNode {
            title: None, file: None, doc_type: None, children: vec![],
        });
        let manifest = ProjectManifest { version: 1, root: "a".to_string(), nodes };
        assert!(is_ancestor_or_self(&manifest, "a", "a"));
    }

    #[test]
    fn ancestor_not_related() {
        let mut nodes = HashMap::new();
        nodes.insert("a".to_string(), ProjectNode {
            title: None, file: None, doc_type: None, children: vec!["b".to_string()],
        });
        nodes.insert("b".to_string(), ProjectNode {
            title: None, file: None, doc_type: None, children: vec![],
        });
        nodes.insert("c".to_string(), ProjectNode {
            title: None, file: None, doc_type: None, children: vec![],
        });
        let manifest = ProjectManifest { version: 1, root: "a".to_string(), nodes };
        assert!(!is_ancestor_or_self(&manifest, "a", "c"));
    }

    // ── backup system ─────────────────────────────────────────────────────

    /// Helper: create a temporary project directory with a manifest and one document.
    fn setup_backup_project() -> (tempfile::TempDir, PathBuf) {
        let tmp = tempfile::tempdir().expect("tempdir");
        let project = tmp.path().to_path_buf();
        fs::create_dir_all(project.join("manuscript")).unwrap();
        fs::create_dir_all(project.join(".app")).unwrap();

        // Write a document file with frontmatter
        let fm = DocumentFrontmatter {
            id: "node-1".to_string(),
            doc_type: "chapter".to_string(),
            title: "Chapter One".to_string(),
            created: Some("2026-01-01T00:00:00Z".to_string()),
            modified: None,
        };
        let raw = write_frontmatter(&fm, "Original content");
        fs::write(project.join("manuscript/chap--one.md"), &raw).unwrap();

        // Write a manifest
        let mut nodes = HashMap::new();
        nodes.insert("node_root".to_string(), ProjectNode {
            title: Some("Test".to_string()),
            file: None,
            doc_type: None,
            children: vec!["node-1".to_string()],
        });
        nodes.insert("node-1".to_string(), ProjectNode {
            title: Some("Chapter One".to_string()),
            file: Some("manuscript/chap--one.md".to_string()),
            doc_type: Some("chapter".to_string()),
            children: vec![],
        });
        let manifest = ProjectManifest {
            version: 1,
            root: "node_root".to_string(),
            nodes,
        };
        save_manifest(&project, &manifest).unwrap();

        (tmp, project)
    }

    #[test]
    fn create_backup_creates_file() {
        let (_tmp, project) = setup_backup_project();
        create_backup(&project, "node-1").unwrap();
        let dir = backup_dir(&project, "node-1");
        let files: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert_eq!(files.len(), 1);
        assert!(files[0].path().extension().unwrap() == "md");
    }

    #[test]
    fn create_backup_noop_for_missing_node() {
        let (_tmp, project) = setup_backup_project();
        // Should not error for a node that doesn't exist
        let result = create_backup(&project, "nonexistent");
        assert!(result.is_ok());
    }

    #[test]
    fn list_backups_returns_entries() {
        let (_tmp, project) = setup_backup_project();
        create_backup(&project, "node-1").unwrap();
        let backups = list_backups(&project, "node-1").unwrap();
        assert_eq!(backups.len(), 1);
        assert_eq!(backups[0].node_id, "node-1");
        assert!(backups[0].size_bytes > 0);
        assert!(backups[0].preview.contains("Original content"));
    }

    #[test]
    fn list_backups_empty_for_no_backups() {
        let (_tmp, project) = setup_backup_project();
        let backups = list_backups(&project, "node-1").unwrap();
        assert!(backups.is_empty());
    }

    #[test]
    fn prune_backups_removes_oldest() {
        let (_tmp, project) = setup_backup_project();
        let dir = backup_dir(&project, "node-1");
        fs::create_dir_all(&dir).unwrap();

        // Create 25 fake backup files
        for i in 0..25 {
            let name = format!("20260101T{:02}0000.000.md", i);
            fs::write(dir.join(&name), format!("backup {i}")).unwrap();
        }

        prune_backups(&dir).unwrap();

        let remaining: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert_eq!(remaining.len(), MAX_BACKUPS_PER_NODE);
    }

    #[test]
    fn restore_backup_restores_content() {
        let (_tmp, project) = setup_backup_project();

        // Create a backup of the original
        create_backup(&project, "node-1").unwrap();
        let backups = list_backups(&project, "node-1").unwrap();
        let original_ts = backups[0].timestamp.clone();

        // Modify the document
        let fm = DocumentFrontmatter {
            id: "node-1".to_string(),
            doc_type: "chapter".to_string(),
            title: "Chapter One".to_string(),
            created: Some("2026-01-01T00:00:00Z".to_string()),
            modified: Some("2026-01-02T00:00:00Z".to_string()),
        };
        let new_raw = write_frontmatter(&fm, "Modified content");
        fs::write(project.join("manuscript/chap--one.md"), &new_raw).unwrap();

        // Restore the original backup
        let doc = restore_backup(&project, "node-1", &original_ts).unwrap();
        assert_eq!(doc.content, "Original content");
    }

    #[test]
    fn restore_backup_creates_safety_backup() {
        let (_tmp, project) = setup_backup_project();

        // Create initial backup
        create_backup(&project, "node-1").unwrap();
        let backups_before = list_backups(&project, "node-1").unwrap();
        assert_eq!(backups_before.len(), 1);
        let ts = backups_before[0].timestamp.clone();

        // Sleep to ensure a distinct millisecond timestamp for the safety backup
        std::thread::sleep(std::time::Duration::from_millis(5));

        // Restore — this should create a safety backup of current version
        // (so the list should have at least 2 entries after restore)
        let _ = restore_backup(&project, "node-1", &ts).unwrap();
        let backups_after = list_backups(&project, "node-1").unwrap();
        // Original backup + safety backup = at least 2
        assert!(backups_after.len() >= 2);
    }

    #[test]
    fn restore_backup_errors_for_bad_timestamp() {
        let (_tmp, project) = setup_backup_project();
        let result = restore_backup(&project, "node-1", "nonexistent");
        assert!(result.is_err());
    }
}
