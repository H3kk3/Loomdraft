// src-tauri/src/frontmatter.rs

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::project::ProjectNode;

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

pub fn parse_frontmatter(content: &str) -> Option<(DocumentFrontmatter, String)> {
    let content = content.trim_start_matches('\u{feff}');
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

    let rest = &content[4..];
    let end = rest.find("\n---\n")?;
    let yaml = &rest[..end];
    let body = rest[end + 5..].trim_start_matches('\n').to_string();

    let fm: DocumentFrontmatter = serde_yaml::from_str(yaml).ok()?;
    Some((fm, body))
}

pub fn write_frontmatter(fm: &DocumentFrontmatter, body: &str) -> Result<String, String> {
    let yaml = serde_yaml::to_string(fm)
        .map_err(|e| format!("Cannot serialize frontmatter: {e}"))?;
    Ok(format!("---\n{}---\n\n{}", yaml, body))
}

pub(crate) fn default_frontmatter(node_id: &str, node: &ProjectNode) -> DocumentFrontmatter {
    DocumentFrontmatter {
        id: node_id.to_string(),
        doc_type: node.doc_type.clone().unwrap_or_else(|| "chapter".to_string()),
        title: node.title.clone().unwrap_or_else(|| "Untitled".to_string()),
        created: Some(Utc::now().to_rfc3339()),
        modified: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn write_frontmatter_roundtrip() {
        let fm = DocumentFrontmatter {
            id: "node-42".to_string(),
            doc_type: "scene".to_string(),
            title: "Roundtrip".to_string(),
            created: None,
            modified: None,
        };
        let raw = write_frontmatter(&fm, "Body content").expect("should serialize");
        let (parsed, body) = parse_frontmatter(&raw).expect("should roundtrip");
        assert_eq!(parsed.id, "node-42");
        assert_eq!(parsed.doc_type, "scene");
        assert_eq!(parsed.title, "Roundtrip");
        assert_eq!(body, "Body content");
    }
}
