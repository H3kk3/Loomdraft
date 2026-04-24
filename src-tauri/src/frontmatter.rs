// src-tauri/src/frontmatter.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Status {
    #[default]
    Draft,
    InRevision,
    Revised,
    Final,
    Stuck,
    Cut,
}

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

    // v0.3 additions
    #[serde(skip_serializing_if = "Option::is_none")]
    pub synopsis: Option<String>,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,

    #[serde(default)]
    pub status: Status,
}

pub fn parse_frontmatter(content: &str) -> Option<(DocumentFrontmatter, String)> {
    // Strip BOM
    let content = content.trim_start_matches('\u{feff}');
    let owned: String;
    // Normalise CRLF
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
    // body starts after "\n---\n" (5 chars)
    let body = rest[end + 5..].trim_start_matches('\n').to_string();

    let fm: DocumentFrontmatter = serde_yaml::from_str(yaml).ok()?;
    Some((fm, body))
}

pub fn write_frontmatter(fm: &DocumentFrontmatter, body: &str) -> Result<String, String> {
    let yaml = serde_yaml::to_string(fm)
        .map_err(|e| format!("Cannot serialize frontmatter: {e}"))?;
    Ok(format!("---\n{}---\n\n{}", yaml, body))
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
            synopsis: None,
            tags: Vec::new(),
            status: Status::default(),
        };
        let raw = write_frontmatter(&fm, "Body content").expect("should serialize");
        let (parsed, body) = parse_frontmatter(&raw).expect("should roundtrip");
        assert_eq!(parsed.id, "node-42");
        assert_eq!(parsed.doc_type, "scene");
        assert_eq!(parsed.title, "Roundtrip");
        assert_eq!(body, "Body content");
    }

    #[test]
    fn parse_frontmatter_defaults_missing_new_fields() {
        let input = "---\nid: n1\ntype: scene\ntitle: Old Doc\n---\n\nBody";
        let (fm, _body) = parse_frontmatter(input).expect("should parse");
        assert_eq!(fm.synopsis, None);
        assert_eq!(fm.tags, Vec::<String>::new());
        assert_eq!(fm.status, Status::Draft);
    }

    #[test]
    fn parse_frontmatter_reads_new_fields() {
        let input = "---\n\
id: n1\n\
type: scene\n\
title: New Doc\n\
synopsis: A dark confrontation at the crossroads.\n\
tags:\n  - subplot-a\n  - foreshadowing\n\
status: in-revision\n\
---\n\nBody";
        let (fm, _body) = parse_frontmatter(input).expect("should parse");
        assert_eq!(fm.synopsis.as_deref(), Some("A dark confrontation at the crossroads."));
        assert_eq!(fm.tags, vec!["subplot-a".to_string(), "foreshadowing".to_string()]);
        assert_eq!(fm.status, Status::InRevision);
    }

    #[test]
    fn write_frontmatter_roundtrips_new_fields() {
        let fm = DocumentFrontmatter {
            id: "n1".to_string(),
            doc_type: "scene".to_string(),
            title: "T".to_string(),
            created: None,
            modified: None,
            synopsis: Some("syn".to_string()),
            tags: vec!["a".to_string(), "b".to_string()],
            status: Status::Final,
        };
        let raw = write_frontmatter(&fm, "body").expect("serialize");
        let (parsed, _body) = parse_frontmatter(&raw).expect("parse");
        assert_eq!(parsed.synopsis.as_deref(), Some("syn"));
        assert_eq!(parsed.tags, vec!["a".to_string(), "b".to_string()]);
        assert_eq!(parsed.status, Status::Final);
    }

    /// Pair-locked test: if you change the `Status` variants or their serde representation,
    /// update the list here AND `STATUS_VALUES` in `src/types.ts`. Both sides must stay in sync.
    #[test]
    fn status_variants_serialize_to_expected_kebab_strings() {
        use serde_json;

        let cases = [
            (Status::Draft, "\"draft\""),
            (Status::InRevision, "\"in-revision\""),
            (Status::Revised, "\"revised\""),
            (Status::Final, "\"final\""),
            (Status::Stuck, "\"stuck\""),
            (Status::Cut, "\"cut\""),
        ];
        for (variant, expected) in cases {
            let serialized = serde_json::to_string(&variant).expect("serialize");
            assert_eq!(serialized, expected, "Status::{:?} should serialize as {}", variant, expected);
        }
        // Reject drift by count: if someone adds a new variant without updating this test,
        // they must also add it to the `cases` array above.
        // (This doesn't catch additions automatically — Rust doesn't have exhaustive-enum
        //  iteration by default — but the failing test in TS land will remind devs to update
        //  both lists when a new variant lands.)
    }
}
