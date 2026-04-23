use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Utc;
use comrak::{markdown_to_html, Options};
use printpdf::*;
use regex::Regex;
use std::fs;
use std::path::Path;
use std::sync::LazyLock;

// ── Cached regexes ──────────────────────────────────────────────────────────

static RE_WIKI_LINK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\[\[([^\]]+)\]\]").unwrap());
static RE_IMG_SIZE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"!\[([^\]|]*)\|\d+x\d+\]").unwrap());
static RE_IMG_TAG: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"<img\s+([^>]*?)src="(assets/images/[^"]+)"([^>]*?)>"#).unwrap());
static RE_IMG_MD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"!\[[^\]]*?\]\(([^)]+)\)").unwrap());
static RE_IMG_STRIP: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"!\[[^\]]*\]\([^)]*\)").unwrap());
static RE_LINK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\[([^\]]*)\]\([^)]*\)").unwrap());
static RE_BOLD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\*\*(.+?)\*\*").unwrap());
static RE_BOLD2: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"__(.+?)__").unwrap());
static RE_ITALIC: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\*(.+?)\*").unwrap());
static RE_ITALIC2: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?:^|\s)_(.+?)_(?:\s|$)").unwrap());
static RE_CODE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"`([^`]+)`").unwrap());
static RE_HEADING: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^#{1,6}\s+").unwrap());
static RE_HR: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^[-*_]{3,}\s*$").unwrap());

// Re-alias the image crate to avoid conflict with printpdf::image module.
use ::image as img_crate;

use crate::frontmatter::parse_frontmatter;
use crate::project::{is_manuscript_doc_type, DocTypeDefinition, ProjectManifest};

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct ManuscriptSegment {
    pub node_id: String, // v0.3 Plan C: used by read-through click-to-jump
    pub title: String,
    pub doc_type: String,
    pub body: String,
    pub heading_level: u8,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ExportResult {
    pub format: String,
    pub output_path: String,
    pub word_count: usize,
    pub section_count: usize,
}

// ── Manuscript assembly ──────────────────────────────────────────────────────

/// Walk the tree DFS in children-array order, collecting only manuscript-type
/// nodes. Strips frontmatter from each file and returns the ordered segments.
pub fn collect_manuscript_ordered(
    manifest: &ProjectManifest,
    project_path: &Path,
) -> Vec<ManuscriptSegment> {
    let mut segments = Vec::new();

    let root = match manifest.nodes.get(&manifest.root) {
        Some(r) => r,
        None => return segments,
    };

    // Root's children are already normalized: manuscript first, then planning.
    // We walk only manuscript-type nodes.
    for child_id in &root.children {
        collect_dfs(manifest, project_path, child_id, &mut segments);
    }

    segments
}

fn collect_dfs(
    manifest: &ProjectManifest,
    project_path: &Path,
    node_id: &str,
    segments: &mut Vec<ManuscriptSegment>,
) {
    let node = match manifest.nodes.get(node_id) {
        Some(n) => n,
        None => return,
    };

    let doc_type = match &node.doc_type {
        Some(dt) => dt.as_str(),
        None => return,
    };

    // Skip non-manuscript nodes entirely (planning section)
    if !is_manuscript_doc_type(&manifest.doc_types, doc_type) {
        return;
    }

    let title = node
        .title
        .clone()
        .unwrap_or_else(|| "Untitled".to_string());

    // Read the file and strip frontmatter
    if let Some(file_rel) = &node.file {
        let file_path = project_path.join(file_rel);
        if let Ok(raw) = fs::read_to_string(&file_path) {
            let body = match parse_frontmatter(&raw) {
                Some((_fm, body)) => body,
                None => raw,
            };

            let hl = lookup_heading_level(&manifest.doc_types, doc_type);
            segments.push(ManuscriptSegment {
                node_id: node_id.to_string(),
                title,
                doc_type: doc_type.to_string(),
                body: body.trim().to_string(),
                heading_level: hl,
            });
        }
        // If file missing, skip gracefully
    }

    // Recurse into children (nested chapters/scenes under parts, etc.)
    for child_id in &node.children {
        collect_dfs(manifest, project_path, child_id, segments);
    }
}

// ── Text pre-processing ─────────────────────────────────────────────────────

/// Strip [[wiki-links]] → plain text
fn strip_wiki_links(text: &str) -> String {
    RE_WIKI_LINK.replace_all(text, "$1").to_string()
}

/// Strip |WxH from image alt text so comrak sees standard markdown images.
/// `![alt|400x300](path)` → `![alt](path)`
fn strip_image_size_syntax(text: &str) -> String {
    RE_IMG_SIZE.replace_all(text, "![$1]").to_string()
}

// ── Heading level by doc type ────────────────────────────────────────────────

fn lookup_heading_level(doc_types: &[DocTypeDefinition], doc_type: &str) -> u8 {
    doc_types
        .iter()
        .find(|dt| dt.id == doc_type)
        .map(|dt| dt.heading_level)
        .unwrap_or(3)
}

fn heading_prefix_for_level(level: u8) -> &'static str {
    match level {
        1 => "#",
        2 => "##",
        _ => "###",
    }
}

/// Generate a URL-safe anchor slug from a title.
fn title_to_anchor(title: &str) -> String {
    title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

// ── TOC generation ───────────────────────────────────────────────────────────

struct TocEntry {
    title: String,
    anchor: String,
    level: u8,
}

fn build_toc(segments: &[ManuscriptSegment]) -> Vec<TocEntry> {
    let mut entries = Vec::new();
    let mut seen = std::collections::HashMap::<String, usize>::new();

    for seg in segments {
        let base = title_to_anchor(&seg.title);
        let count = seen.entry(base.clone()).or_insert(0);
        let anchor = if *count == 0 {
            base.clone()
        } else {
            format!("{}-{}", base, count)
        };
        *count += 1;

        entries.push(TocEntry {
            title: seg.title.clone(),
            anchor,
            level: seg.heading_level,
        });
    }
    entries
}

// ── Markdown export ──────────────────────────────────────────────────────────

pub fn render_markdown(segments: &[ManuscriptSegment]) -> String {
    let toc = build_toc(segments);

    // Build TOC as markdown link list
    let mut toc_lines: Vec<String> = vec!["## Table of Contents\n".to_string()];
    for entry in &toc {
        let indent = match entry.level {
            1 => "",
            2 => "  ",
            _ => "    ",
        };
        toc_lines.push(format!("{}- [{}](#{})", indent, entry.title, entry.anchor));
    }
    toc_lines.push(String::new()); // blank line after TOC

    // Build content sections
    let mut parts: Vec<String> = Vec::new();
    for (i, seg) in segments.iter().enumerate() {
        let prefix = heading_prefix_for_level(seg.heading_level);
        let heading = format!("{} {}", prefix, seg.title);

        // Add anchor target (GitHub-compatible — headings auto-generate anchors,
        // but we add explicit <a> for non-standard renderers)
        let anchor_tag = format!("<a id=\"{}\"></a>\n\n", toc[i].anchor);

        if seg.body.is_empty() {
            parts.push(format!("{}{}", anchor_tag, heading));
        } else {
            parts.push(format!("{}{}\n\n{}", anchor_tag, heading, seg.body));
        }
    }

    let toc_str = toc_lines.join("\n");
    let content = parts.join("\n\n");
    let md = format!("{}\n\n{}", toc_str, content);
    strip_wiki_links(&md)
}

// ── HTML export ──────────────────────────────────────────────────────────────

/// Render just the manuscript body HTML — headings + content, with `data-node-id`
/// attributes for click-to-jump. NO document wrapper, NO embedded `<style>`, NO
/// table-of-contents nav. This is what the in-app read-through view consumes;
/// `render_html` wraps this with a full HTML document + CSS + TOC for external
/// export.
pub fn render_html_body(segments: &[ManuscriptSegment], project_path: &Path) -> String {
    let toc = build_toc(segments);

    // 1. Build markdown with anchor IDs and data-node-id on headings.
    // We emit raw HTML headings (safe because options.render.unsafe_ = true)
    // so that data-node-id is preserved in the final HTML output.
    let mut parts: Vec<String> = Vec::new();
    for (i, seg) in segments.iter().enumerate() {
        let level = seg.heading_level;
        let anchor = format!("<a id=\"{}\"></a>", toc[i].anchor);
        let heading = format!(
            "{}\n\n<h{level} data-node-id=\"{node_id}\">{title}</h{level}>",
            anchor,
            level = level,
            node_id = html_escape(&seg.node_id),
            title = html_escape(&seg.title),
        );

        if seg.body.is_empty() {
            parts.push(heading);
        } else {
            parts.push(format!("{}\n\n{}", heading, seg.body));
        }
    }
    let md = parts.join("\n\n");

    // 2. Pre-process
    let md = strip_wiki_links(&md);
    let md = strip_image_size_syntax(&md);

    // 3. Convert to HTML via comrak
    let mut options = Options::default();
    options.extension.strikethrough = true;
    options.extension.table = true;
    options.extension.autolink = true;
    options.render.unsafe_ = true;

    let html_body = markdown_to_html(&md, &options);

    // 4. Embed images as base64 data URIs
    embed_images(&html_body, project_path)
}

pub fn render_html(segments: &[ManuscriptSegment], project_path: &Path) -> String {
    let toc = build_toc(segments);

    // Body content (headings + paragraphs + data-node-id attrs).
    let html_body = render_html_body(segments, project_path);

    // TOC nav HTML
    let toc_html = build_html_toc(&toc);

    // 7. Get project title from first segment or fallback
    let project_title = segments
        .first()
        .map(|s| s.title.as_str())
        .unwrap_or("Manuscript");

    // 8. Check for custom user template at .app/templates/export.html
    let template_path = project_path.join(".app").join("templates").join("export.html");
    if let Ok(custom_template) = fs::read_to_string(&template_path) {
        return apply_html_template(
            &custom_template,
            project_title,
            &toc_html,
            &html_body,
            segments,
        );
    }

    // 9. Wrap in built-in HTML document template
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} — Manuscript</title>
<style>
body {{
  font-family: "Georgia", "Times New Roman", "Palatino", serif;
  max-width: 42em;
  margin: 2em auto;
  padding: 0 1.5em;
  line-height: 1.8;
  color: #1a1a1a;
  font-size: 16px;
  background: #fff;
}}
h1, h2, h3 {{
  font-family: "Georgia", serif;
  margin-top: 2em;
  margin-bottom: 0.5em;
}}
h1 {{
  font-size: 2em;
  text-align: center;
  page-break-before: always;
  margin-top: 3em;
}}
h1:first-child {{
  page-break-before: avoid;
  margin-top: 1em;
}}
h2 {{
  font-size: 1.5em;
  page-break-before: always;
}}
h3 {{
  font-size: 1.17em;
  margin-top: 1.5em;
}}
p {{
  margin: 0.8em 0;
}}
blockquote {{
  margin: 1em 2em;
  font-style: italic;
  color: #555;
  border-left: 3px solid #ccc;
  padding-left: 1em;
}}
hr {{
  border: none;
  text-align: center;
  margin: 2em 0;
}}
hr::after {{
  content: "* \00a0 * \00a0 *";
  color: #888;
  font-size: 1.1em;
  letter-spacing: 0.2em;
}}
code {{
  font-family: "Menlo", "Consolas", monospace;
  font-size: 0.9em;
  background: #f5f5f5;
  padding: 0.15em 0.3em;
  border-radius: 3px;
}}
pre {{
  background: #f5f5f5;
  padding: 1em;
  border-radius: 4px;
  overflow-x: auto;
  line-height: 1.5;
}}
pre code {{
  background: none;
  padding: 0;
}}
img {{
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1em 0;
}}
table {{
  border-collapse: collapse;
  margin: 1em 0;
  width: 100%;
}}
th, td {{
  border: 1px solid #ddd;
  padding: 0.5em 0.75em;
  text-align: left;
}}
th {{
  background: #f5f5f5;
  font-weight: 600;
}}
em {{ font-style: italic; }}
strong {{ font-weight: bold; }}
nav.toc {{
  margin: 2em 0 3em;
  padding: 1.5em 2em;
  background: #f9f9f9;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
}}
nav.toc h2 {{
  margin: 0 0 0.8em;
  font-size: 1.2em;
  page-break-before: avoid;
}}
nav.toc ul {{
  list-style: none;
  padding: 0;
  margin: 0;
}}
nav.toc li {{
  margin: 0.2em 0;
  line-height: 1.6;
}}
nav.toc li.toc-h2 {{ padding-left: 1.2em; }}
nav.toc li.toc-h3 {{ padding-left: 2.4em; font-size: 0.95em; }}
nav.toc a {{
  color: #1a1a1a;
  text-decoration: none;
  border-bottom: 1px dotted #ccc;
}}
nav.toc a:hover {{
  color: #4a4adf;
  border-bottom-color: #4a4adf;
}}
@media print {{
  body {{
    max-width: none;
    margin: 0;
    padding: 0;
    font-size: 12pt;
    line-height: 1.6;
  }}
  h1 {{ page-break-before: always; }}
  h1:first-child {{ page-break-before: avoid; }}
  h2 {{ page-break-before: always; }}
  img {{ max-width: 80%; }}
}}
</style>
</head>
<body>
{toc}
{body}
</body>
</html>"#,
        title = html_escape(project_title),
        toc = toc_html,
        body = html_body,
    )
}

// ── Custom HTML template support ─────────────────────────────────────────────

/// Replace template placeholders in a user-provided HTML template.
///
/// Supported placeholders:
///   `{{title}}`         — project title (HTML-escaped)
///   `{{toc}}`           — table of contents HTML
///   `{{body}}`          — manuscript body HTML
///   `{{word_count}}`    — total word count
///   `{{section_count}}` — number of manuscript sections
///   `{{date}}`          — current date (YYYY-MM-DD)
fn apply_html_template(
    template: &str,
    title: &str,
    toc_html: &str,
    body_html: &str,
    segments: &[ManuscriptSegment],
) -> String {
    let word_count: usize = segments
        .iter()
        .map(|s| s.body.split_whitespace().count())
        .sum();
    let date = Utc::now().format("%Y-%m-%d").to_string();

    template
        .replace("{{title}}", &html_escape(title))
        .replace("{{toc}}", toc_html)
        .replace("{{body}}", body_html)
        .replace("{{word_count}}", &word_count.to_string())
        .replace("{{section_count}}", &segments.len().to_string())
        .replace("{{date}}", &date)
}

// ── HTML TOC builder ─────────────────────────────────────────────────────────

fn build_html_toc(entries: &[TocEntry]) -> String {
    if entries.is_empty() {
        return String::new();
    }
    let mut lines = vec![
        "<nav class=\"toc\">".to_string(),
        "<h2>Table of Contents</h2>".to_string(),
        "<ul>".to_string(),
    ];
    for entry in entries {
        let class = match entry.level {
            1 => "toc-h1",
            2 => "toc-h2",
            _ => "toc-h3",
        };
        lines.push(format!(
            "<li class=\"{}\"><a href=\"#{}\">{}</a></li>",
            class,
            html_escape(&entry.anchor),
            html_escape(&entry.title),
        ));
    }
    lines.push("</ul>".to_string());
    lines.push("</nav>".to_string());
    lines.join("\n")
}

// ── Image embedding ──────────────────────────────────────────────────────────

fn embed_images(html: &str, project_path: &Path) -> String {
    RE_IMG_TAG.replace_all(html, |caps: &regex::Captures| {
        let before = &caps[1];
        let rel_path = &caps[2];
        let after = &caps[3];

        let image_path = project_path.join(rel_path);
        if let Ok(bytes) = fs::read(&image_path) {
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
            let b64 = STANDARD.encode(&bytes);
            format!(
                r#"<img {}src="data:{};base64,{}"{}>"#,
                before, mime, b64, after
            )
        } else {
            // Image not found — insert placeholder
            format!("<em>[Image not found: {}]</em>", html_escape(rel_path))
        }
    })
    .to_string()
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

// ── PDF export ──────────────────────────────────────────────────────────────

// Page geometry (A4 in mm) — f32 for printpdf::Mm
const PAGE_W: f32 = 210.0;
const PAGE_H: f32 = 297.0;
const MARGIN_L: f32 = 25.0;
const MARGIN_R: f32 = 25.0;
const MARGIN_T: f32 = 30.0;
const MARGIN_B: f32 = 30.0;
const USABLE_W: f32 = PAGE_W - MARGIN_L - MARGIN_R; // 160mm

// Font sizes (pt)
const BODY_SIZE: f32 = 12.0;
const H1_SIZE: f32 = 22.0;
const H2_SIZE: f32 = 17.0;
const H3_SIZE: f32 = 14.0;

// Line height in mm for body text
const LINE_H: f32 = 5.0;

/// Tracks the current write position within the PDF document.
struct PdfWriter {
    doc: PdfDocumentReference,
    current_layer: PdfLayerReference,
    y: f32,
    font_regular: IndirectFontRef,
    font_bold: IndirectFontRef,
    font_italic: IndirectFontRef,
}

impl PdfWriter {
    fn new(title: &str) -> Result<Self, String> {
        let (doc, page, layer) =
            PdfDocument::new(title, Mm(PAGE_W), Mm(PAGE_H), "Layer 1");

        let font_regular = doc
            .add_builtin_font(BuiltinFont::TimesRoman)
            .map_err(|e| format!("Font error: {}", e))?;
        let font_bold = doc
            .add_builtin_font(BuiltinFont::TimesBold)
            .map_err(|e| format!("Font error: {}", e))?;
        let font_italic = doc
            .add_builtin_font(BuiltinFont::TimesItalic)
            .map_err(|e| format!("Font error: {}", e))?;

        let current_layer = doc.get_page(page).get_layer(layer);

        Ok(Self {
            doc,
            current_layer,
            y: PAGE_H - MARGIN_T,
            font_regular,
            font_bold,
            font_italic,
        })
    }

    fn new_page(&mut self) {
        let (page, layer) = self.doc.add_page(Mm(PAGE_W), Mm(PAGE_H), "Layer 1");
        self.current_layer = self.doc.get_page(page).get_layer(layer);
        self.y = PAGE_H - MARGIN_T;
    }

    /// Make sure at least `needed` mm of vertical space remain before the bottom margin.
    fn ensure_space(&mut self, needed: f32) {
        if self.y - needed < MARGIN_B {
            self.new_page();
        }
    }

    fn skip(&mut self, mm: f32) {
        self.y -= mm;
        if self.y < MARGIN_B {
            self.new_page();
        }
    }

    /// Write a single line at the current position.
    fn write_line(&mut self, text: &str, size: f32, font: &IndirectFontRef) {
        let line_h = size * 0.42; // approximate mm height
        self.ensure_space(line_h);
        self.current_layer
            .use_text(text, size, Mm(MARGIN_L), Mm(self.y), font);
        self.y -= line_h;
    }

    /// Write text centred horizontally.
    fn write_centered(&mut self, text: &str, size: f32, font: &IndirectFontRef) {
        let approx_width = text.len() as f32 * size * 0.25;
        let x = ((PAGE_W - approx_width) / 2.0).max(MARGIN_L);
        self.ensure_space(size * 0.42);
        self.current_layer
            .use_text(text, size, Mm(x), Mm(self.y), font);
        self.y -= size * 0.42;
    }

    /// Word-wrap and write a paragraph of body text.
    fn write_paragraph(&mut self, text: &str, size: f32, font: &IndirectFontRef) {
        let max_chars = estimate_chars_per_line(size);
        let lines = word_wrap(text, max_chars);
        for line in &lines {
            self.ensure_space(LINE_H);
            self.current_layer
                .use_text(line.as_str(), size, Mm(MARGIN_L), Mm(self.y), font);
            self.y -= LINE_H;
        }
    }

    /// Embed a raster image from disk into the PDF at the current position.
    fn write_image(&mut self, project_path: &Path, rel_path: &str) {
        let image_path = project_path.join(rel_path);
        let img: img_crate::DynamicImage = match img_crate::open(&image_path) {
            Ok(img) => img,
            Err(_) => return, // skip silently if image can't be loaded
        };

        let (px_w, px_h) = img_crate::GenericImageView::dimensions(&img);
        if px_w == 0 || px_h == 0 {
            return;
        }
        let (px_w_f, px_h_f) = (px_w as f32, px_h as f32);

        // Calculate DPI so the image fits within usable page width.
        // Don't upscale small images beyond 150 DPI.
        let natural_dpi: f32 = 150.0;
        let natural_w_mm = (px_w_f * 25.4) / natural_dpi;

        let mut dpi = if natural_w_mm > USABLE_W {
            (px_w_f * 25.4) / USABLE_W // scale down to fit
        } else {
            natural_dpi
        };

        let mut rendered_h = (px_h_f * 25.4) / dpi;

        // Cap height to 60% of usable page height so images don't dominate.
        let max_h = (PAGE_H - MARGIN_T - MARGIN_B) * 0.6;
        if rendered_h > max_h {
            dpi = (px_h_f * 25.4) / max_h;
            rendered_h = max_h;
        }

        // Page break if the image won't fit in remaining space.
        self.ensure_space(rendered_h + 5.0);

        // Decode to RGB8 raw pixels and build a PDF image object.
        let rgb = img.to_rgb8();
        let image_data = rgb.as_raw().to_vec();

        let xobj = ImageXObject {
            width: Px(px_w as usize),
            height: Px(px_h as usize),
            color_space: ColorSpace::Rgb,
            bits_per_component: ColorBits::Bit8,
            interpolate: true,
            image_data,
            image_filter: None,
            clipping_bbox: None,
            smask: None,
        };

        let pdf_image = Image::from(xobj);
        pdf_image.add_to_layer(
            self.current_layer.clone(),
            ImageTransform {
                translate_x: Some(Mm(MARGIN_L)),
                translate_y: Some(Mm(self.y - rendered_h)),
                dpi: Some(dpi),
                ..Default::default()
            },
        );

        self.y -= rendered_h + 4.0; // image height + gap
    }

    fn finish(self) -> Result<Vec<u8>, String> {
        self.doc
            .save_to_bytes()
            .map_err(|e| format!("PDF save error: {}", e))
    }
}

/// Estimate how many characters fit on one line for a given font size.
fn estimate_chars_per_line(font_size: f32) -> usize {
    // Times-Roman average character width ≈ 0.50 × font size (in pt).
    // 1 pt = 0.3528 mm.
    let avg_char_mm = 0.50 * font_size * 0.3528;
    (USABLE_W / avg_char_mm).floor() as usize
}

/// Simple greedy word-wrap.
fn word_wrap(text: &str, max_chars: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current = String::new();

    for word in text.split_whitespace() {
        if current.is_empty() {
            current = word.to_string();
        } else if current.len() + 1 + word.len() > max_chars {
            lines.push(current);
            current = word.to_string();
        } else {
            current.push(' ');
            current.push_str(word);
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    lines
}

// ── Content block parsing for PDF ───────────────────────────────────────────

/// A content block is either a run of text or an inline image reference.
enum ContentBlock {
    Text(String),
    Image { path: String },
}

/// Split a markdown body into an ordered sequence of text runs and image
/// references.  Images are detected by `![alt|WxH](path)` or `![alt](path)`.
fn parse_content_blocks(body: &str) -> Vec<ContentBlock> {
    let mut blocks = Vec::new();
    let mut last_end = 0;

    for cap in RE_IMG_MD.captures_iter(body) {
        let whole = cap.get(0).unwrap();

        // Text before this image
        let text_before = &body[last_end..whole.start()];
        if !text_before.trim().is_empty() {
            blocks.push(ContentBlock::Text(text_before.to_string()));
        }

        blocks.push(ContentBlock::Image {
            path: cap[1].to_string(),
        });
        last_end = whole.end();
    }

    // Remaining text after the last image (or entire body if no images)
    let remaining = &body[last_end..];
    if !remaining.trim().is_empty() {
        blocks.push(ContentBlock::Text(remaining.to_string()));
    }

    blocks
}

/// Strip inline markdown formatting so the PDF gets clean plain text.
fn strip_markdown_formatting(text: &str) -> String {
    let mut s = text.to_string();

    // Images: ![alt](src) → remove entirely
    s = RE_IMG_STRIP.replace_all(&s, "").to_string();
    // Links: [text](url) → text
    s = RE_LINK.replace_all(&s, "$1").to_string();
    // Bold **text** and __text__
    s = RE_BOLD.replace_all(&s, "$1").to_string();
    s = RE_BOLD2.replace_all(&s, "$1").to_string();
    // Italic *text* and _text_
    s = RE_ITALIC.replace_all(&s, "$1").to_string();
    s = RE_ITALIC2.replace_all(&s, " $1 ").to_string();
    // Inline code `text`
    s = RE_CODE.replace_all(&s, "$1").to_string();
    // Heading markers
    s = RE_HEADING.replace_all(&s, "").to_string();
    // Horizontal rules
    s = RE_HR.replace_all(&s, "").to_string();
    // Wiki-links [[target]] → target
    s = RE_WIKI_LINK.replace_all(&s, "$1").to_string();
    // Image size syntax (already handled by image strip, but just in case)
    s = RE_IMG_SIZE.replace_all(&s, "![$1]").to_string();

    s
}

/// Render manuscript segments into a PDF byte buffer.
pub fn render_pdf(
    segments: &[ManuscriptSegment],
    title: &str,
    project_path: &Path,
) -> Result<Vec<u8>, String> {
    let mut w = PdfWriter::new(title)?;

    // ── Title page ──────────────────────────────────────────────────────────

    w.y = PAGE_H / 2.0 + 10.0;
    w.write_centered(title, H1_SIZE, &w.font_bold.clone());
    w.skip(8.0);

    let section_summary = format!("{} sections", segments.len());
    w.write_centered(&section_summary, BODY_SIZE, &w.font_italic.clone());

    // ── Table of Contents page ──────────────────────────────────────────────

    let toc = build_toc(segments);
    if !toc.is_empty() {
        w.new_page();
        w.write_centered("Table of Contents", H2_SIZE, &w.font_bold.clone());
        w.skip(LINE_H * 2.0);

        let toc_size: f32 = 11.0;
        for entry in &toc {
            let indent = match entry.level {
                1 => 0.0,
                2 => 8.0,
                _ => 16.0,
            };
            let font = if entry.level == 1 {
                w.font_bold.clone()
            } else {
                w.font_regular.clone()
            };
            w.ensure_space(LINE_H);
            w.current_layer.use_text(
                &entry.title,
                toc_size,
                Mm(MARGIN_L + indent),
                Mm(w.y),
                &font,
            );
            w.y -= LINE_H;
        }
    }

    // ── Content pages ───────────────────────────────────────────────────────

    w.new_page();

    for (i, seg) in segments.iter().enumerate() {
        // Page break before H1/H2 headings (except the very first segment)
        if i > 0 && seg.heading_level <= 2 {
            w.new_page();
        } else if i > 0 {
            w.skip(LINE_H * 2.0);
        }

        // Section heading
        let (size, font) = match seg.heading_level {
            1 => (H1_SIZE, w.font_bold.clone()),
            2 => (H2_SIZE, w.font_bold.clone()),
            _ => (H3_SIZE, w.font_bold.clone()),
        };
        w.ensure_space(12.0);
        w.write_line(&seg.title, size, &font);
        w.skip(LINE_H);

        // Body: split into text runs and inline images
        let blocks = parse_content_blocks(&seg.body);
        for block in &blocks {
            match block {
                ContentBlock::Text(text) => {
                    let plain = strip_markdown_formatting(text);
                    for para_text in plain.split("\n\n") {
                        let trimmed = para_text.trim();
                        if trimmed.is_empty() {
                            continue;
                        }
                        w.write_paragraph(trimmed, BODY_SIZE, &w.font_regular.clone());
                        w.skip(LINE_H * 0.5);
                    }
                }
                ContentBlock::Image { path } => {
                    w.write_image(project_path, path);
                }
            }
        }
    }

    w.finish()
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── strip_wiki_links ─────────────────────────────────────────────────

    #[test]
    fn strip_wiki_links_basic() {
        assert_eq!(strip_wiki_links("See [[Aiko]] here"), "See Aiko here");
    }

    #[test]
    fn strip_wiki_links_multiple() {
        assert_eq!(
            strip_wiki_links("[[A]] and [[B]] and [[C]]"),
            "A and B and C"
        );
    }

    #[test]
    fn strip_wiki_links_no_links() {
        assert_eq!(strip_wiki_links("plain text"), "plain text");
    }

    #[test]
    fn strip_wiki_links_with_namespace() {
        assert_eq!(strip_wiki_links("[[char:Aiko]]"), "char:Aiko");
    }

    // ── strip_image_size_syntax ──────────────────────────────────────────

    #[test]
    fn strip_image_size_basic() {
        assert_eq!(
            strip_image_size_syntax("![photo|400x300](img.png)"),
            "![photo](img.png)"
        );
    }

    #[test]
    fn strip_image_size_no_alt() {
        assert_eq!(
            strip_image_size_syntax("![|800x600](img.png)"),
            "![](img.png)"
        );
    }

    #[test]
    fn strip_image_size_no_size() {
        let input = "![normal](img.png)";
        assert_eq!(strip_image_size_syntax(input), input);
    }

    // ── heading_prefix_for_level ────────────────────────────────────────

    #[test]
    fn heading_prefix_level_1() {
        assert_eq!(heading_prefix_for_level(1), "#");
    }

    #[test]
    fn heading_prefix_level_2() {
        assert_eq!(heading_prefix_for_level(2), "##");
    }

    #[test]
    fn heading_prefix_level_3() {
        assert_eq!(heading_prefix_for_level(3), "###");
    }

    // ── html_escape ──────────────────────────────────────────────────────

    #[test]
    fn html_escape_special_chars() {
        assert_eq!(html_escape("<script>alert('xss')</script>"),
            "&lt;script&gt;alert('xss')&lt;/script&gt;");
    }

    #[test]
    fn html_escape_ampersand() {
        assert_eq!(html_escape("A & B"), "A &amp; B");
    }

    #[test]
    fn html_escape_quotes() {
        assert_eq!(html_escape(r#"say "hello""#), "say &quot;hello&quot;");
    }

    #[test]
    fn html_escape_plain_text() {
        assert_eq!(html_escape("hello world"), "hello world");
    }

    // ── word_wrap ────────────────────────────────────────────────────────

    #[test]
    fn word_wrap_short_line() {
        let result = word_wrap("hello world", 20);
        assert_eq!(result, vec!["hello world"]);
    }

    #[test]
    fn word_wrap_wraps_at_limit() {
        let result = word_wrap("one two three four five", 10);
        assert_eq!(result, vec!["one two", "three four", "five"]);
    }

    #[test]
    fn word_wrap_empty() {
        let result = word_wrap("", 80);
        assert!(result.is_empty());
    }

    #[test]
    fn word_wrap_single_long_word() {
        let result = word_wrap("superlongword", 5);
        assert_eq!(result, vec!["superlongword"]);
    }

    // ── strip_markdown_formatting ────────────────────────────────────────

    #[test]
    fn strip_bold() {
        assert_eq!(strip_markdown_formatting("some **bold** text"), "some bold text");
    }

    #[test]
    fn strip_italic() {
        assert_eq!(strip_markdown_formatting("some *italic* text"), "some italic text");
    }

    #[test]
    fn strip_inline_code() {
        assert_eq!(strip_markdown_formatting("use `println!` here"), "use println! here");
    }

    #[test]
    fn strip_links() {
        assert_eq!(
            strip_markdown_formatting("visit [Google](https://google.com) now"),
            "visit Google now"
        );
    }

    #[test]
    fn strip_wiki_links_in_markdown() {
        assert_eq!(
            strip_markdown_formatting("see [[Aiko]] for details"),
            "see Aiko for details"
        );
    }

    #[test]
    fn strip_heading_markers() {
        assert_eq!(strip_markdown_formatting("## Chapter Title"), "Chapter Title");
    }

    // ── render_markdown ──────────────────────────────────────────────────

    #[test]
    fn render_markdown_basic() {
        let segments = vec![
            ManuscriptSegment {
                node_id: "node-1".to_string(),
                title: "Part One".to_string(),
                doc_type: "part".to_string(),
                body: "Opening paragraph.".to_string(),
                heading_level: 1,
            },
            ManuscriptSegment {
                node_id: "node-2".to_string(),
                title: "Chapter 1".to_string(),
                doc_type: "chapter".to_string(),
                body: "Chapter body with [[Aiko]].".to_string(),
                heading_level: 2,
            },
        ];
        let md = render_markdown(&segments);
        assert!(md.contains("# Part One"));
        assert!(md.contains("## Chapter 1"));
        // Wiki links should be stripped
        assert!(md.contains("Chapter body with Aiko."));
        assert!(!md.contains("[["));
    }

    #[test]
    fn render_markdown_empty_body() {
        let segments = vec![ManuscriptSegment {
            node_id: "node-empty".to_string(),
            title: "Empty".to_string(),
            doc_type: "scene".to_string(),
            body: String::new(),
            heading_level: 3,
        }];
        let md = render_markdown(&segments);
        assert!(md.contains("### Empty"));
    }

    // ── TOC ──────────────────────────────────────────────────────────────

    #[test]
    fn title_to_anchor_basic() {
        assert_eq!(title_to_anchor("Chapter 1"), "chapter-1");
        assert_eq!(title_to_anchor("Part One: The Beginning"), "part-one-the-beginning");
    }

    #[test]
    fn build_toc_generates_entries() {
        let segments = vec![
            ManuscriptSegment {
                node_id: "node-part".to_string(),
                title: "Part One".to_string(),
                doc_type: "part".to_string(),
                body: String::new(),
                heading_level: 1,
            },
            ManuscriptSegment {
                node_id: "node-chap".to_string(),
                title: "Chapter 1".to_string(),
                doc_type: "chapter".to_string(),
                body: String::new(),
                heading_level: 2,
            },
            ManuscriptSegment {
                node_id: "node-scene".to_string(),
                title: "Opening".to_string(),
                doc_type: "scene".to_string(),
                body: String::new(),
                heading_level: 3,
            },
        ];
        let toc = build_toc(&segments);
        assert_eq!(toc.len(), 3);
        assert_eq!(toc[0].level, 1);
        assert_eq!(toc[0].anchor, "part-one");
        assert_eq!(toc[1].level, 2);
        assert_eq!(toc[1].anchor, "chapter-1");
        assert_eq!(toc[2].level, 3);
    }

    #[test]
    fn build_toc_deduplicates_anchors() {
        let segments = vec![
            ManuscriptSegment {
                node_id: "node-c1".to_string(),
                title: "Chapter 1".to_string(),
                doc_type: "chapter".to_string(),
                body: String::new(),
                heading_level: 2,
            },
            ManuscriptSegment {
                node_id: "node-c2".to_string(),
                title: "Chapter 1".to_string(),
                doc_type: "chapter".to_string(),
                body: String::new(),
                heading_level: 2,
            },
        ];
        let toc = build_toc(&segments);
        assert_eq!(toc[0].anchor, "chapter-1");
        assert_eq!(toc[1].anchor, "chapter-1-1");
    }

    #[test]
    fn render_markdown_includes_toc() {
        let segments = vec![
            ManuscriptSegment {
                node_id: "node-toc-1".to_string(),
                title: "Part One".to_string(),
                doc_type: "part".to_string(),
                body: "text".to_string(),
                heading_level: 1,
            },
            ManuscriptSegment {
                node_id: "node-toc-2".to_string(),
                title: "Chapter 1".to_string(),
                doc_type: "chapter".to_string(),
                body: "text".to_string(),
                heading_level: 2,
            },
        ];
        let md = render_markdown(&segments);
        assert!(md.contains("## Table of Contents"));
        assert!(md.contains("[Part One](#part-one)"));
        assert!(md.contains("[Chapter 1](#chapter-1)"));
    }

    #[test]
    fn build_html_toc_generates_nav() {
        let toc = build_toc(&vec![
            ManuscriptSegment {
                node_id: "node-html-1".to_string(),
                title: "Part One".to_string(),
                doc_type: "part".to_string(),
                body: String::new(),
                heading_level: 1,
            },
            ManuscriptSegment {
                node_id: "node-html-2".to_string(),
                title: "Chapter 1".to_string(),
                doc_type: "chapter".to_string(),
                body: String::new(),
                heading_level: 2,
            },
        ]);
        let html = build_html_toc(&toc);
        assert!(html.contains("<nav class=\"toc\">"));
        assert!(html.contains("Table of Contents"));
        assert!(html.contains("toc-h1"));
        assert!(html.contains("toc-h2"));
        assert!(html.contains("href=\"#part-one\""));
    }
}
