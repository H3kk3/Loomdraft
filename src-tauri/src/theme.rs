use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::error::LoomdraftError;

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeColors {
    pub bg: String,
    #[serde(rename = "bg-2")]
    pub bg_2: String,
    #[serde(rename = "bg-3")]
    pub bg_3: String,
    pub border: String,
    pub text: String,
    #[serde(rename = "text-dim")]
    pub text_dim: String,
    pub accent: String,
    #[serde(rename = "accent-h")]
    pub accent_h: String,
    #[serde(rename = "drop-line")]
    pub drop_line: String,
    pub danger: String,
    #[serde(default = "default_radius")]
    pub radius: String,
}

fn default_radius() -> String {
    "6px".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ThemeSyntax {
    pub heading: Option<String>,
    pub emphasis: Option<String>,
    pub strong: Option<String>,
    pub link: Option<String>,
    pub code: Option<String>,
    pub quote: Option<String>,
    pub list: Option<String>,
    pub meta: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ThemeFonts {
    pub ui: Option<String>,
    pub mono: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeData {
    pub name: String,
    pub id: String,
    #[serde(default = "default_author")]
    pub author: String,
    #[serde(default = "default_version")]
    pub version: u32,
    pub appearance: String,
    pub colors: ThemeColors,
    #[serde(default)]
    pub syntax: Option<ThemeSyntax>,
    #[serde(default)]
    pub fonts: Option<ThemeFonts>,
}

fn default_author() -> String {
    "Custom".to_string()
}
fn default_version() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeMetadata {
    pub name: String,
    pub id: String,
    pub appearance: String,
    pub author: String,
    #[serde(rename = "isBuiltin")]
    pub is_builtin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontInfo {
    pub filename: String,
    pub family_name: String,
    pub format: String,
}

// ── Path helpers ─────────────────────────────────────────────────────────────

fn themes_dir(app_data: &Path) -> PathBuf {
    app_data.join("themes")
}

fn fonts_dir(app_data: &Path) -> PathBuf {
    app_data.join("fonts")
}

// ── Theme operations ─────────────────────────────────────────────────────────

pub fn list_custom_themes(app_data: &Path) -> Result<Vec<ThemeMetadata>, LoomdraftError> {
    let dir = themes_dir(app_data);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut themes = Vec::new();
    for entry in fs::read_dir(&dir)
        .map_err(|e| LoomdraftError::file_io("Cannot read themes dir", e))?
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let data: ThemeData = match serde_json::from_str(&content) {
            Ok(d) => d,
            Err(_) => continue,
        };

        themes.push(ThemeMetadata {
            name: data.name,
            id: data.id,
            appearance: data.appearance,
            author: data.author,
            is_builtin: false,
        });
    }

    themes.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(themes)
}

pub fn load_theme(app_data: &Path, theme_id: &str) -> Result<ThemeData, LoomdraftError> {
    let file_path = themes_dir(app_data).join(format!("{theme_id}.json"));
    if !file_path.exists() {
        return Err(LoomdraftError::Validation(format!(
            "Theme '{theme_id}' not found"
        )));
    }

    let content = fs::read_to_string(&file_path)
        .map_err(|e| LoomdraftError::file_io("Cannot read theme file", e))?;
    let data: ThemeData = serde_json::from_str(&content)?;
    Ok(data)
}

pub fn save_custom_theme(
    app_data: &Path,
    theme_json: &str,
) -> Result<String, LoomdraftError> {
    // Validate JSON
    let data: ThemeData = serde_json::from_str(theme_json).map_err(|e| {
        LoomdraftError::Validation(format!("Invalid theme JSON: {e}"))
    })?;

    // Validate appearance
    if data.appearance != "dark" && data.appearance != "light" {
        return Err(LoomdraftError::Validation(
            "Theme 'appearance' must be \"dark\" or \"light\"".to_string(),
        ));
    }

    // Validate ID (alphanumeric + dashes)
    if data.id.is_empty()
        || !data
            .id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(LoomdraftError::Validation(
            "Theme 'id' must be non-empty and contain only letters, numbers, dashes, or underscores"
                .to_string(),
        ));
    }

    let dir = themes_dir(app_data);
    fs::create_dir_all(&dir)
        .map_err(|e| LoomdraftError::file_io("Cannot create themes dir", e))?;

    let file_path = dir.join(format!("{}.json", &data.id));
    fs::write(&file_path, theme_json)
        .map_err(|e| LoomdraftError::file_io("Cannot write theme file", e))?;

    Ok(data.id)
}

/// Import a theme from a file path on disk — reads, validates, and saves.
pub fn import_theme_file(
    app_data: &Path,
    source_path: &str,
) -> Result<String, LoomdraftError> {
    let content = fs::read_to_string(source_path)
        .map_err(|e| LoomdraftError::file_io("Cannot read theme file", e))?;
    save_custom_theme(app_data, &content)
}

pub fn delete_custom_theme(app_data: &Path, theme_id: &str) -> Result<(), LoomdraftError> {
    let file_path = themes_dir(app_data).join(format!("{theme_id}.json"));
    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| LoomdraftError::file_io("Cannot delete theme file", e))?;
    }
    Ok(())
}

// ── Font operations ──────────────────────────────────────────────────────────

fn font_format(ext: &str) -> &'static str {
    match ext {
        "woff2" => "woff2",
        "otf" => "opentype",
        "ttf" | _ => "truetype",
    }
}

fn family_name_from_filename(filename: &str) -> String {
    // Derive a readable family name from filename:
    // "JetBrainsMono-Regular.ttf" → "JetBrainsMono-Regular"
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);
    stem.to_string()
}

pub fn import_font(
    app_data: &Path,
    source_path: &str,
) -> Result<FontInfo, LoomdraftError> {
    let source = PathBuf::from(source_path);
    if !source.exists() {
        return Err(LoomdraftError::Validation(format!(
            "Font file not found: {source_path}"
        )));
    }

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("ttf")
        .to_lowercase();

    if !["ttf", "otf", "woff2"].contains(&ext.as_str()) {
        return Err(LoomdraftError::Validation(
            "Unsupported font format. Use .ttf, .otf, or .woff2".to_string(),
        ));
    }

    let filename = source
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| LoomdraftError::Validation("Invalid font filename".to_string()))?
        .to_string();

    let dir = fonts_dir(app_data);
    fs::create_dir_all(&dir)
        .map_err(|e| LoomdraftError::file_io("Cannot create fonts dir", e))?;

    let dest = dir.join(&filename);
    fs::copy(&source, &dest)
        .map_err(|e| LoomdraftError::file_io("Cannot copy font file", e))?;

    Ok(FontInfo {
        family_name: family_name_from_filename(&filename),
        filename,
        format: font_format(&ext).to_string(),
    })
}

pub fn list_fonts(app_data: &Path) -> Result<Vec<FontInfo>, LoomdraftError> {
    let dir = fonts_dir(app_data);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut fonts = Vec::new();
    for entry in fs::read_dir(&dir)
        .map_err(|e| LoomdraftError::file_io("Cannot read fonts dir", e))?
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        if !["ttf", "otf", "woff2"].contains(&ext.as_str()) {
            continue;
        }

        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        fonts.push(FontInfo {
            family_name: family_name_from_filename(&filename),
            filename,
            format: font_format(&ext).to_string(),
        });
    }

    fonts.sort_by(|a, b| a.family_name.cmp(&b.family_name));
    Ok(fonts)
}

pub fn read_font_base64(app_data: &Path, filename: &str) -> Result<String, LoomdraftError> {
    let file_path = fonts_dir(app_data).join(filename);
    if !file_path.exists() {
        return Err(LoomdraftError::Validation(format!(
            "Font file not found: {filename}"
        )));
    }

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("ttf")
        .to_lowercase();

    let mime = match ext.as_str() {
        "woff2" => "font/woff2",
        "otf" => "font/otf",
        _ => "font/ttf",
    };

    let data = fs::read(&file_path)
        .map_err(|e| LoomdraftError::file_io("Cannot read font file", e))?;
    let b64 = BASE64.encode(&data);

    Ok(format!("data:{mime};base64,{b64}"))
}

pub fn delete_font(app_data: &Path, filename: &str) -> Result<(), LoomdraftError> {
    let file_path = fonts_dir(app_data).join(filename);
    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| LoomdraftError::file_io("Cannot delete font file", e))?;
    }
    Ok(())
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn tmp() -> (TempDir, PathBuf) {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_path_buf();
        (dir, path)
    }

    #[test]
    fn list_custom_themes_empty() {
        let (_tmp, app_data) = tmp();
        let themes = list_custom_themes(&app_data).unwrap();
        assert!(themes.is_empty());
    }

    #[test]
    fn save_and_list_theme() {
        let (_tmp, app_data) = tmp();
        let json = r##"{
            "name": "Test Theme",
            "id": "test-theme",
            "appearance": "dark",
            "colors": {
                "bg": "#000", "bg-2": "#111", "bg-3": "#222",
                "border": "#333", "text": "#fff", "text-dim": "#888",
                "accent": "#f00", "accent-h": "#f55",
                "drop-line": "#aaa", "danger": "#f00"
            }
        }"##;

        let id = save_custom_theme(&app_data, json).unwrap();
        assert_eq!(id, "test-theme");

        let themes = list_custom_themes(&app_data).unwrap();
        assert_eq!(themes.len(), 1);
        assert_eq!(themes[0].name, "Test Theme");
        assert!(!themes[0].is_builtin);
    }

    #[test]
    fn load_saved_theme() {
        let (_tmp, app_data) = tmp();
        let json = r##"{
            "name": "My Theme",
            "id": "my-theme",
            "appearance": "light",
            "colors": {
                "bg": "#fff", "bg-2": "#eee", "bg-3": "#ddd",
                "border": "#ccc", "text": "#000", "text-dim": "#666",
                "accent": "#00f", "accent-h": "#55f",
                "drop-line": "#888", "danger": "#f00"
            }
        }"##;

        save_custom_theme(&app_data, json).unwrap();
        let data = load_theme(&app_data, "my-theme").unwrap();
        assert_eq!(data.name, "My Theme");
        assert_eq!(data.appearance, "light");
        assert_eq!(data.colors.bg, "#fff");
    }

    #[test]
    fn delete_theme() {
        let (_tmp, app_data) = tmp();
        let json = r##"{
            "name": "Temp",
            "id": "temp",
            "appearance": "dark",
            "colors": {
                "bg": "#000", "bg-2": "#111", "bg-3": "#222",
                "border": "#333", "text": "#fff", "text-dim": "#888",
                "accent": "#f00", "accent-h": "#f55",
                "drop-line": "#aaa", "danger": "#f00"
            }
        }"##;
        save_custom_theme(&app_data, json).unwrap();
        assert_eq!(list_custom_themes(&app_data).unwrap().len(), 1);

        delete_custom_theme(&app_data, "temp").unwrap();
        assert!(list_custom_themes(&app_data).unwrap().is_empty());
    }

    #[test]
    fn invalid_theme_json_rejected() {
        let (_tmp, app_data) = tmp();
        let result = save_custom_theme(&app_data, "not json");
        assert!(result.is_err());
    }

    #[test]
    fn invalid_appearance_rejected() {
        let (_tmp, app_data) = tmp();
        let json = r##"{
            "name": "Bad",
            "id": "bad",
            "appearance": "neon",
            "colors": {
                "bg": "#000", "bg-2": "#111", "bg-3": "#222",
                "border": "#333", "text": "#fff", "text-dim": "#888",
                "accent": "#f00", "accent-h": "#f55",
                "drop-line": "#aaa", "danger": "#f00"
            }
        }"##;
        let result = save_custom_theme(&app_data, json);
        assert!(result.is_err());
    }

    #[test]
    fn list_fonts_empty() {
        let (_tmp, app_data) = tmp();
        let fonts = list_fonts(&app_data).unwrap();
        assert!(fonts.is_empty());
    }

    #[test]
    fn import_and_list_font() {
        let (_tmp, app_data) = tmp();
        // Create a dummy font file
        let src_dir = app_data.join("source");
        fs::create_dir_all(&src_dir).unwrap();
        let src_file = src_dir.join("TestFont.ttf");
        fs::write(&src_file, b"dummy font data").unwrap();

        let info = import_font(&app_data, src_file.to_str().unwrap()).unwrap();
        assert_eq!(info.filename, "TestFont.ttf");
        assert_eq!(info.family_name, "TestFont");
        assert_eq!(info.format, "truetype");

        let fonts = list_fonts(&app_data).unwrap();
        assert_eq!(fonts.len(), 1);
    }

    #[test]
    fn read_font_base64_returns_data_uri() {
        let (_tmp, app_data) = tmp();
        let src_dir = app_data.join("source");
        fs::create_dir_all(&src_dir).unwrap();
        let src_file = src_dir.join("MyFont.woff2");
        fs::write(&src_file, b"woff2 data").unwrap();

        import_font(&app_data, src_file.to_str().unwrap()).unwrap();
        let data_uri = read_font_base64(&app_data, "MyFont.woff2").unwrap();
        assert!(data_uri.starts_with("data:font/woff2;base64,"));
    }

    #[test]
    fn delete_font_works() {
        let (_tmp, app_data) = tmp();
        let src_dir = app_data.join("source");
        fs::create_dir_all(&src_dir).unwrap();
        let src_file = src_dir.join("DelFont.otf");
        fs::write(&src_file, b"otf data").unwrap();

        import_font(&app_data, src_file.to_str().unwrap()).unwrap();
        assert_eq!(list_fonts(&app_data).unwrap().len(), 1);

        delete_font(&app_data, "DelFont.otf").unwrap();
        assert!(list_fonts(&app_data).unwrap().is_empty());
    }

    #[test]
    fn import_theme_file_reads_and_saves() {
        let (_tmp, app_data) = tmp();
        let src_dir = app_data.join("source");
        fs::create_dir_all(&src_dir).unwrap();
        let src_file = src_dir.join("my-theme.json");
        fs::write(
            &src_file,
            r##"{
                "name": "File Theme",
                "id": "file-theme",
                "appearance": "dark",
                "colors": {
                    "bg": "#000", "bg-2": "#111", "bg-3": "#222",
                    "border": "#333", "text": "#fff", "text-dim": "#888",
                    "accent": "#f00", "accent-h": "#f55",
                    "drop-line": "#aaa", "danger": "#f00"
                }
            }"##,
        )
        .unwrap();

        let id = import_theme_file(&app_data, src_file.to_str().unwrap()).unwrap();
        assert_eq!(id, "file-theme");

        let themes = list_custom_themes(&app_data).unwrap();
        assert_eq!(themes.len(), 1);
        assert_eq!(themes[0].name, "File Theme");
    }

    #[test]
    fn import_theme_file_rejects_invalid_json() {
        let (_tmp, app_data) = tmp();
        let src_dir = app_data.join("source");
        fs::create_dir_all(&src_dir).unwrap();
        let src_file = src_dir.join("bad.json");
        fs::write(&src_file, "not valid json").unwrap();

        let result = import_theme_file(&app_data, src_file.to_str().unwrap());
        assert!(result.is_err());
    }
}
