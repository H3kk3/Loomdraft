#![warn(clippy::all)]

mod corkboard;
mod db;
mod error;
mod export;
mod frontmatter;
mod metadata;
mod project;
mod theme;

use corkboard::CorkboardData;
use db::SearchResult;
use error::LoomdraftError;
use frontmatter::Status;
use metadata::NodeMetadata;
use project::{BackupEntry, DocTypeDefinition, DocumentContent, ProjectManifest};
use std::path::PathBuf;
use tauri::Manager;

type CmdResult<T> = Result<T, LoomdraftError>;

// ── Helpers ───────────────────────────────────────────────────────────────────

fn db_path(project_path: &str) -> PathBuf {
    PathBuf::from(project_path).join(".app").join("index.sqlite")
}

// ── Project commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn create_project(dir: String, name: String) -> CmdResult<(String, ProjectManifest)> {
    let (path, manifest) = project::create_project(&PathBuf::from(&dir), name.trim())?;

    // Bootstrap the SQLite index
    let path_str = path
        .to_str()
        .ok_or_else(|| LoomdraftError::Validation("Project path contains invalid characters".into()))?;
    let conn = db::open_db(&db_path(path_str))?;
    db::reindex(&conn, &path, &manifest)?;

    Ok((path.to_string_lossy().to_string(), manifest))
}

#[tauri::command]
fn open_project(path: String) -> CmdResult<ProjectManifest> {
    let project_path = PathBuf::from(&path);
    let manifest = project::load_manifest(&project_path)?;

    // Ensure DB is current
    let conn = db::open_db(&db_path(&path))?;
    db::reindex(&conn, &project_path, &manifest)?;

    Ok(manifest)
}

#[tauri::command]
fn get_project_tree(project_path: String) -> CmdResult<ProjectManifest> {
    Ok(project::load_manifest(&PathBuf::from(project_path))?)
}

// ── Document commands ─────────────────────────────────────────────────────────

#[tauri::command]
fn load_document(project_path: String, node_id: String) -> CmdResult<DocumentContent> {
    Ok(project::load_document(&PathBuf::from(project_path), &node_id)?)
}

#[tauri::command]
fn save_document(
    project_path: String,
    node_id: String,
    content: String,
) -> CmdResult<DocumentContent> {
    let path = PathBuf::from(&project_path);
    let doc = project::save_document(&path, &node_id, &content)?;

    // Update index (best-effort — don't fail the save)
    if let Ok(conn) = db::open_db(&db_path(&project_path)) {
        let links = project::extract_wiki_links(&content);
        if let Err(e) = db::index_document(
            &conn,
            &doc.id,
            &doc.doc_type,
            &doc.title,
            &doc.file,
            &content,
            None,
        ) {
            eprintln!("[warn] index update failed for {}: {e}", doc.id);
        }
        if let Err(e) = db::update_links(&conn, &doc.id, &links) {
            eprintln!("[warn] link index update failed for {}: {e}", doc.id);
        }
    }

    Ok(doc)
}

// ── Node management commands ──────────────────────────────────────────────────

#[tauri::command]
fn add_node(
    project_path: String,
    parent_id: String,
    title: String,
    doc_type: String,
) -> CmdResult<(String, ProjectManifest)> {
    let path = PathBuf::from(&project_path);
    let (node_id, manifest) = project::add_node(&path, &parent_id, &title, &doc_type)?;

    // Index the new (empty) document
    if let Ok(conn) = db::open_db(&db_path(&project_path)) {
        if let Some(node) = manifest.nodes.get(&node_id) {
            if let Some(file) = &node.file {
                if let Err(e) = db::index_document(
                    &conn, &node_id, &doc_type, &title, file, "", None,
                ) {
                    eprintln!("[warn] index failed for new node {node_id}: {e}");
                }
            }
        }
    }

    Ok((node_id, manifest))
}

#[tauri::command]
fn delete_node(project_path: String, node_id: String) -> CmdResult<ProjectManifest> {
    let (deleted_ids, manifest) =
        project::delete_node(&PathBuf::from(&project_path), &node_id)?;

    if let Ok(conn) = db::open_db(&db_path(&project_path)) {
        for id in &deleted_ids {
            if let Err(e) = db::remove_document(&conn, id) {
                eprintln!("[warn] index removal failed for {id}: {e}");
            }
        }
    }

    Ok(manifest)
}

#[tauri::command]
fn move_node(
    project_path: String,
    node_id: String,
    new_parent_id: String,
    position: usize,
) -> CmdResult<ProjectManifest> {
    Ok(project::move_node(
        &PathBuf::from(&project_path),
        &node_id,
        &new_parent_id,
        position,
    )?)
}

#[tauri::command]
fn rename_node(
    project_path: String,
    node_id: String,
    new_title: String,
) -> CmdResult<ProjectManifest> {
    Ok(project::rename_node(&PathBuf::from(&project_path), &node_id, &new_title)?)
}

// ── Metadata + color commands (v0.3) ─────────────────────────────────────────

#[tauri::command]
fn get_project_metadata(
    project_path: String,
) -> CmdResult<std::collections::HashMap<String, NodeMetadata>> {
    let path = PathBuf::from(&project_path);
    let manifest = project::load_manifest(&path)?;
    Ok(metadata::collect_project_metadata(&path, &manifest))
}

/// Update a document's metadata (synopsis, tags, status).
///
/// IPC boundary note: `clear_synopsis: Option<bool>` is intentional.
/// Tauri's default serde deserialization cannot distinguish an absent field
/// from an explicit `null`, so `synopsis: Option<String>` alone cannot express
/// "clear the existing synopsis" vs "leave it unchanged". The `clear_synopsis`
/// flag resolves that ambiguity — when true, synopsis is cleared; otherwise
/// `synopsis: Some(s)` sets it and `synopsis: None` leaves it unchanged.
///
/// From JavaScript, pass `clearSynopsis: true` (camelCase).
#[tauri::command]
fn update_node_metadata(
    project_path: String,
    node_id: String,
    synopsis: Option<String>,
    clear_synopsis: Option<bool>,
    tags: Option<Vec<String>>,
    status: Option<Status>,
) -> CmdResult<NodeMetadata> {
    let path = PathBuf::from(&project_path);
    let manifest = project::load_manifest(&path)?;
    Ok(metadata::update_node_metadata_on_disk(
        &path,
        &manifest,
        &node_id,
        synopsis,
        clear_synopsis.unwrap_or(false),
        tags,
        status,
    )?)
}

#[tauri::command]
fn set_tag_color(
    project_path: String,
    tag: String,
    color: Option<String>,
) -> CmdResult<ProjectManifest> {
    let path = PathBuf::from(&project_path);
    let mut manifest = project::load_manifest(&path)?;
    metadata::apply_tag_color(&path, &mut manifest, &tag, color)?;
    Ok(manifest)
}

#[tauri::command]
fn set_status_color(
    project_path: String,
    status: String,
    color: Option<String>,
) -> CmdResult<ProjectManifest> {
    let path = PathBuf::from(&project_path);
    let mut manifest = project::load_manifest(&path)?;
    metadata::apply_status_color(&path, &mut manifest, &status, color)?;
    Ok(manifest)
}

// ── Corkboard (v0.3 Plan B) ──────────────────────────────────────────────────

#[tauri::command]
fn get_corkboard_data(project_path: String) -> CmdResult<CorkboardData> {
    let path = PathBuf::from(&project_path);
    let manifest = project::load_manifest(&path)?;
    Ok(corkboard::collect_corkboard_data(&path, &manifest))
}

// ── Search & index commands ───────────────────────────────────────────────────

#[tauri::command]
fn search_documents(project_path: String, query: String) -> CmdResult<Vec<SearchResult>> {
    let conn = db::open_db(&db_path(&project_path))?;
    Ok(db::search(&conn, &query)?)
}

#[tauri::command]
fn get_backlinks(project_path: String, node_id: String) -> CmdResult<Vec<SearchResult>> {
    let conn = db::open_db(&db_path(&project_path))?;
    Ok(db::get_backlinks(&conn, &node_id)?)
}

#[tauri::command]
fn reindex_project(project_path: String) -> CmdResult<usize> {
    let path = PathBuf::from(&project_path);
    let manifest = project::load_manifest(&path)?;
    let conn = db::open_db(&db_path(&project_path))?;
    Ok(db::reindex(&conn, &path, &manifest)?)
}

// ── Doc type commands ─────────────────────────────────────────────────────────

#[tauri::command]
fn add_doc_type(
    project_path: String,
    doc_type: DocTypeDefinition,
) -> CmdResult<Vec<DocTypeDefinition>> {
    Ok(project::add_doc_type(&PathBuf::from(&project_path), doc_type)?)
}

#[tauri::command]
fn update_doc_type(
    project_path: String,
    doc_type: DocTypeDefinition,
) -> CmdResult<Vec<DocTypeDefinition>> {
    Ok(project::update_doc_type(&PathBuf::from(&project_path), doc_type)?)
}

#[tauri::command]
fn remove_doc_type(
    project_path: String,
    type_id: String,
) -> CmdResult<Vec<DocTypeDefinition>> {
    Ok(project::remove_doc_type(&PathBuf::from(&project_path), &type_id)?)
}

// ── Word count commands ──────────────────────────────────────────────────────

#[derive(serde::Serialize)]
struct WordCountResult {
    total_words: usize,
    total_chars: usize,
}

#[tauri::command]
fn get_manuscript_word_count(project_path: String) -> CmdResult<WordCountResult> {
    let path = PathBuf::from(&project_path);
    let manifest = project::load_manifest(&path)?;

    let mut total_words = 0usize;
    let mut total_chars = 0usize;

    for node in manifest.nodes.values() {
        let doc_type = match &node.doc_type {
            Some(dt) => dt.as_str(),
            None => continue,
        };
        if !project::is_manuscript_doc_type(&manifest.doc_types, doc_type) {
            continue;
        }
        let file_rel = match &node.file {
            Some(f) => f,
            None => continue,
        };

        let file_path = path.join(file_rel);
        let raw = match std::fs::read_to_string(&file_path) {
            Ok(s) => s,
            Err(_) => continue,
        };

        // Strip frontmatter to count only body text
        let body = match frontmatter::parse_frontmatter(&raw) {
            Some((_fm, body)) => body,
            None => raw,
        };

        let trimmed = body.trim();
        if !trimmed.is_empty() {
            total_words += trimmed.split_whitespace().count();
        }
        total_chars += trimmed.len();
    }

    Ok(WordCountResult {
        total_words,
        total_chars,
    })
}

// ── Image commands ───────────────────────────────────────────────────────────

/// Maximum allowed image file size: 20 MB.
const MAX_IMAGE_SIZE: u64 = 20 * 1024 * 1024;

#[tauri::command]
fn import_image(project_path: String, source_path: String) -> CmdResult<String> {
    let project = PathBuf::from(&project_path);
    let source = PathBuf::from(&source_path);

    if !source.exists() {
        return Err(LoomdraftError::Image(format!(
            "Source file not found: {source_path}"
        )));
    }

    // Validate file size
    let metadata = std::fs::metadata(&source)
        .map_err(|e| LoomdraftError::file_io("Cannot read image metadata", e))?;
    if metadata.len() > MAX_IMAGE_SIZE {
        return Err(LoomdraftError::Image(format!(
            "Image too large ({:.1} MB). Maximum allowed size is 20 MB.",
            metadata.len() as f64 / (1024.0 * 1024.0)
        )));
    }

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    if !["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].contains(&ext.as_str()) {
        return Err(LoomdraftError::Image(format!(
            "Unsupported image format: .{ext}"
        )));
    }

    let original_name = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image");
    let uuid_prefix = &uuid::Uuid::new_v4().to_string()[..8];
    let dest_filename = format!("{uuid_prefix}-{original_name}.{ext}");

    let dest_dir = project.join("assets").join("images");
    std::fs::create_dir_all(&dest_dir)
        .map_err(|e| LoomdraftError::file_io("Cannot create images directory", e))?;

    let dest_path = dest_dir.join(&dest_filename);
    std::fs::copy(&source, &dest_path)
        .map_err(|e| LoomdraftError::file_io("Failed to copy image", e))?;

    Ok(format!("assets/images/{dest_filename}"))
}

#[tauri::command]
fn read_image_base64(project_path: String, relative_path: String) -> CmdResult<String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let project = PathBuf::from(&project_path);
    let image_path = project.join(&relative_path);

    if !image_path.exists() {
        return Err(LoomdraftError::Image(format!(
            "Image not found: {relative_path}"
        )));
    }

    // Prevent path traversal: resolved path must stay within the project directory
    let canonical_image = image_path
        .canonicalize()
        .map_err(|e| LoomdraftError::file_io("Cannot resolve image path", e))?;
    let canonical_project = project
        .canonicalize()
        .map_err(|e| LoomdraftError::file_io("Cannot resolve project path", e))?;
    if !canonical_image.starts_with(&canonical_project) {
        return Err(LoomdraftError::Image(
            "Image path must be within the project directory".into(),
        ));
    }

    let ext = image_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        _ => "application/octet-stream",
    };

    let bytes = std::fs::read(&image_path)
        .map_err(|e| LoomdraftError::file_io("Cannot read image", e))?;
    let b64 = STANDARD.encode(&bytes);

    Ok(format!("data:{mime};base64,{b64}"))
}

// ── Backup commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn list_backups(project_path: String, node_id: String) -> CmdResult<Vec<BackupEntry>> {
    Ok(project::list_backups(&PathBuf::from(&project_path), &node_id)?)
}

#[tauri::command]
fn restore_backup(
    project_path: String,
    node_id: String,
    timestamp: String,
) -> CmdResult<DocumentContent> {
    let path = PathBuf::from(&project_path);
    let doc = project::restore_backup(&path, &node_id, &timestamp)?;

    // Re-index the restored content
    if let Ok(conn) = db::open_db(&db_path(&project_path)) {
        let links = project::extract_wiki_links(&doc.content);
        let _ = db::index_document(
            &conn,
            &doc.id,
            &doc.doc_type,
            &doc.title,
            &doc.file,
            &doc.content,
            None,
        );
        let _ = db::update_links(&conn, &doc.id, &links);
    }

    Ok(doc)
}

// ── Export commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn export_manuscript(
    project_path: String,
    format: String,
    output_path: String,
) -> CmdResult<export::ExportResult> {
    let path = PathBuf::from(&project_path);
    let manifest = project::load_manifest(&path)?;
    let segments = export::collect_manuscript_ordered(&manifest, &path);

    if segments.is_empty() {
        return Err(LoomdraftError::Export(
            "No manuscript documents to export".into(),
        ));
    }

    // Validate output directory exists
    if let Some(parent) = std::path::Path::new(&output_path).parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            return Err(LoomdraftError::Export(format!(
                "Output directory does not exist: {}",
                parent.display()
            )));
        }
    }

    // Get manuscript title for PDF
    let manuscript_title = manifest
        .nodes
        .get(&manifest.root)
        .and_then(|n| n.title.clone())
        .unwrap_or_else(|| "Manuscript".to_string());

    match format.as_str() {
        "md" => {
            let content = export::render_markdown(&segments);
            std::fs::write(&output_path, &content)
                .map_err(|e| LoomdraftError::file_io("Cannot write export file", e))?;
        }
        "html" => {
            let content = export::render_html(&segments, &path);
            std::fs::write(&output_path, &content)
                .map_err(|e| LoomdraftError::file_io("Cannot write export file", e))?;
        }
        "pdf" => {
            let bytes = export::render_pdf(&segments, &manuscript_title, &path)?;
            std::fs::write(&output_path, &bytes)
                .map_err(|e| LoomdraftError::file_io("Cannot write PDF", e))?;
        }
        _ => {
            return Err(LoomdraftError::Export(format!(
                "Unknown export format: {format}"
            )));
        }
    };

    let word_count: usize = segments
        .iter()
        .map(|s| s.body.split_whitespace().count())
        .sum();

    Ok(export::ExportResult {
        format,
        output_path,
        word_count,
        section_count: segments.len(),
    })
}

// ── Theme & font commands ────────────────────────────────────────────────────

#[tauri::command]
fn get_app_data_dir(app: tauri::AppHandle) -> CmdResult<String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| LoomdraftError::file_io("Failed to get app data dir", e))?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn list_custom_themes(app: tauri::AppHandle) -> CmdResult<Vec<theme::ThemeMetadata>> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| LoomdraftError::file_io("Failed to get app data dir", e))?;
    Ok(theme::list_custom_themes(&dir)?)
}

#[tauri::command]
fn load_theme(app: tauri::AppHandle, theme_id: String) -> CmdResult<theme::ThemeData> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| LoomdraftError::file_io("Failed to get app data dir", e))?;
    Ok(theme::load_theme(&dir, &theme_id)?)
}

#[tauri::command]
fn save_custom_theme(app: tauri::AppHandle, theme_json: String) -> CmdResult<String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| LoomdraftError::file_io("Failed to get app data dir", e))?;
    Ok(theme::save_custom_theme(&dir, &theme_json)?)
}

#[tauri::command]
fn import_theme_file(app: tauri::AppHandle, source_path: String) -> CmdResult<String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| LoomdraftError::file_io("Failed to get app data dir", e))?;
    Ok(theme::import_theme_file(&dir, &source_path)?)
}

#[tauri::command]
fn delete_custom_theme(app: tauri::AppHandle, theme_id: String) -> CmdResult<()> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| LoomdraftError::file_io("Failed to get app data dir", e))?;
    Ok(theme::delete_custom_theme(&dir, &theme_id)?)
}

#[tauri::command]
fn import_font(app: tauri::AppHandle, source_path: String) -> CmdResult<theme::FontInfo> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| LoomdraftError::file_io("Failed to get app data dir", e))?;
    Ok(theme::import_font(&dir, &source_path)?)
}

#[tauri::command]
fn list_fonts(app: tauri::AppHandle) -> CmdResult<Vec<theme::FontInfo>> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| LoomdraftError::file_io("Failed to get app data dir", e))?;
    Ok(theme::list_fonts(&dir)?)
}

#[tauri::command]
fn read_font_base64(app: tauri::AppHandle, filename: String) -> CmdResult<String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| LoomdraftError::file_io("Failed to get app data dir", e))?;
    Ok(theme::read_font_base64(&dir, &filename)?)
}

#[tauri::command]
fn delete_font(app: tauri::AppHandle, filename: String) -> CmdResult<()> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| LoomdraftError::file_io("Failed to get app data dir", e))?;
    Ok(theme::delete_font(&dir, &filename)?)
}

// ── App lifecycle ────────────────────────────────────────────────────────────

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

// ── App entry point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            create_project,
            open_project,
            get_project_tree,
            load_document,
            save_document,
            add_node,
            delete_node,
            rename_node,
            move_node,
            // Metadata + colors (v0.3)
            get_project_metadata,
            update_node_metadata,
            set_tag_color,
            set_status_color,
            // Corkboard (v0.3 Plan B)
            get_corkboard_data,
            search_documents,
            get_backlinks,
            reindex_project,
            get_manuscript_word_count,
            add_doc_type,
            update_doc_type,
            remove_doc_type,
            import_image,
            read_image_base64,
            export_manuscript,
            list_backups,
            restore_backup,
            // Theme & font commands
            get_app_data_dir,
            list_custom_themes,
            load_theme,
            save_custom_theme,
            import_theme_file,
            delete_custom_theme,
            import_font,
            list_fonts,
            read_font_base64,
            delete_font,
            quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
