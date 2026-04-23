//! v0.3 Plan B — Corkboard view data assembly.
//!
//! Provides `CorkboardCard` / `CorkboardData` types, `extract_synopsis`
//! fallback, and `collect_corkboard_data` which walks the manuscript
//! tree and computes per-card display data (synopsis, word count, etc.)
//! in one pass.

/// Extract a short synopsis from a document body by taking the first three
/// non-blank, non-heading, non-image lines and joining them with spaces.
///
/// Used as a fallback when the frontmatter has no explicit `synopsis:` field.
/// Returns an empty string if no eligible lines exist.
pub fn extract_synopsis(body: &str) -> String {
    let mut picked: Vec<&str> = Vec::new();
    for raw in body.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('#') {
            continue;
        }
        if line.starts_with("![") {
            continue;
        }
        if line == "---" || line == "***" || line == "___" {
            continue;
        }
        picked.push(line);
        if picked.len() == 3 {
            break;
        }
    }
    picked.join(" ")
}

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::frontmatter::{parse_frontmatter, Status};
use crate::project::ProjectManifest;

/// Per-document data for a corkboard card. The frontend combines this
/// with the manifest tree to render Part/Chapter groupings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorkboardCard {
    pub id: String,
    pub title: String,
    pub doc_type: String,
    pub synopsis: String,
    pub word_count: usize,
    pub status: Status,
    pub tags: Vec<String>,
}

/// Result of `collect_corkboard_data`. Keyed by node id so the
/// frontend can look up cards while walking the manifest tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorkboardData {
    pub cards: HashMap<String, CorkboardCard>,
}

/// Walk the project's manuscript nodes (documents with a `file`),
/// read each file, and produce a card for every non-Part / non-Chapter
/// manuscript document. Parts and Chapters become headers rendered by
/// the frontend from the manifest tree; they do not get cards.
pub fn collect_corkboard_data(
    project_path: &Path,
    manifest: &ProjectManifest,
) -> CorkboardData {
    let mut cards = HashMap::new();
    for (id, node) in &manifest.nodes {
        let Some(doc_type) = &node.doc_type else { continue };
        // Skip Parts and Chapters — they become headers.
        if doc_type == "part" || doc_type == "chapter" {
            continue;
        }
        // Only manuscript category nodes get cards.
        if !crate::project::is_manuscript_doc_type(&manifest.doc_types, doc_type) {
            continue;
        }
        let Some(file_rel) = &node.file else { continue };
        let full = project_path.join(file_rel);
        let raw = match fs::read_to_string(&full) {
            Ok(r) => r,
            Err(e) => {
                eprintln!(
                    "[warn] corkboard: could not read {} for node {id}: {e}",
                    full.display()
                );
                continue;
            }
        };
        let (fm, body) = match parse_frontmatter(&raw) {
            Some(t) => t,
            None => {
                eprintln!(
                    "[warn] corkboard: unparseable frontmatter in {} for node {id}",
                    full.display()
                );
                continue;
            }
        };
        let synopsis = match &fm.synopsis {
            Some(s) if !s.trim().is_empty() => s.trim().to_string(),
            _ => extract_synopsis(&body),
        };
        let word_count = body.split_whitespace().count();
        cards.insert(
            id.clone(),
            CorkboardCard {
                id: id.clone(),
                title: fm.title.clone(),
                doc_type: doc_type.clone(),
                synopsis,
                word_count,
                status: fm.status,
                tags: fm.tags.clone(),
            },
        );
    }
    CorkboardData { cards }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_synopsis_returns_empty_for_empty_body() {
        assert_eq!(extract_synopsis(""), "");
    }

    #[test]
    fn extract_synopsis_returns_empty_for_only_blank_lines() {
        assert_eq!(extract_synopsis("\n\n   \n\t\n"), "");
    }

    #[test]
    fn extract_synopsis_picks_first_three_non_blank_lines() {
        let body = "First line.\nSecond line.\nThird line.\nFourth line.";
        assert_eq!(
            extract_synopsis(body),
            "First line. Second line. Third line."
        );
    }

    #[test]
    fn extract_synopsis_skips_leading_blanks() {
        let body = "\n\nFirst.\nSecond.\nThird.";
        assert_eq!(extract_synopsis(body), "First. Second. Third.");
    }

    #[test]
    fn extract_synopsis_skips_headings() {
        let body = "# Chapter One\n\nReal prose here.\nMore prose.\nAnd more.";
        assert_eq!(extract_synopsis(body), "Real prose here. More prose. And more.");
    }

    #[test]
    fn extract_synopsis_skips_images() {
        let body = "![Hero portrait](assets/hero.png)\n\nShe stepped into the light.";
        assert_eq!(extract_synopsis(body), "She stepped into the light.");
    }

    #[test]
    fn extract_synopsis_skips_hr_markers() {
        let body = "---\n***\n___\n\nActual content.";
        assert_eq!(extract_synopsis(body), "Actual content.");
    }

    #[test]
    fn extract_synopsis_handles_fewer_than_three_lines() {
        let body = "Only one line.";
        assert_eq!(extract_synopsis(body), "Only one line.");
    }

    #[test]
    fn extract_synopsis_trims_each_picked_line() {
        let body = "   First.   \n   Second.\n   Third.";
        assert_eq!(extract_synopsis(body), "First. Second. Third.");
    }
}

#[cfg(test)]
mod data_tests {
    use super::*;
    use tempfile::tempdir;
    use std::collections::HashMap;

    fn write_doc(dir: &std::path::Path, rel: &str, content: &str) {
        let full = dir.join(rel);
        std::fs::create_dir_all(full.parent().unwrap()).unwrap();
        std::fs::write(full, content).unwrap();
    }

    #[test]
    fn collect_corkboard_data_builds_cards_for_scenes() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("manuscript")).unwrap();
        std::fs::create_dir_all(root.join("kb")).unwrap();

        write_doc(
            root,
            "manuscript/scene--a.md",
            "---\n\
id: scene_a\n\
type: scene\n\
title: A\n\
synopsis: Elena meets the stranger.\n\
tags:\n  - foreshadowing\n\
status: draft\n\
---\n\
\n\
Body with four words.",
        );
        write_doc(
            root,
            "manuscript/chap--1.md",
            "---\nid: chap_1\ntype: chapter\ntitle: One\n---\n\nChapter intro body.",
        );

        let mut nodes = HashMap::new();
        nodes.insert("scene_a".to_string(), crate::project::ProjectNode {
            title: Some("A".into()),
            file: Some("manuscript/scene--a.md".into()),
            doc_type: Some("scene".into()),
            children: vec![],
        });
        nodes.insert("chap_1".to_string(), crate::project::ProjectNode {
            title: Some("One".into()),
            file: Some("manuscript/chap--1.md".into()),
            doc_type: Some("chapter".into()),
            children: vec!["scene_a".to_string()],
        });

        let manifest = ProjectManifest {
            version: 1,
            root: "node_root".into(),
            nodes,
            doc_types: crate::project::default_doc_types(),
            tag_colors: Default::default(),
            status_colors: None,
        };

        let data = collect_corkboard_data(root, &manifest);

        // Chapter should NOT have a card (it's a header).
        assert!(data.cards.get("chap_1").is_none());

        // Scene should have a card with extracted data.
        let card = data.cards.get("scene_a").expect("scene card present");
        assert_eq!(card.id, "scene_a");
        assert_eq!(card.title, "A");
        assert_eq!(card.doc_type, "scene");
        assert_eq!(card.synopsis, "Elena meets the stranger.");
        assert_eq!(card.word_count, 4);
        assert_eq!(card.status, Status::Draft);
        assert_eq!(card.tags, vec!["foreshadowing".to_string()]);
    }

    #[test]
    fn collect_corkboard_data_falls_back_to_body_synopsis() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("manuscript")).unwrap();

        write_doc(
            root,
            "manuscript/scene--b.md",
            "---\nid: scene_b\ntype: scene\ntitle: B\n---\n\n# Heading\n\nThe storm broke at dawn.\nShe ran through the alley.",
        );

        let mut nodes = HashMap::new();
        nodes.insert("scene_b".to_string(), crate::project::ProjectNode {
            title: Some("B".into()),
            file: Some("manuscript/scene--b.md".into()),
            doc_type: Some("scene".into()),
            children: vec![],
        });
        let manifest = ProjectManifest {
            version: 1,
            root: "node_root".into(),
            nodes,
            doc_types: crate::project::default_doc_types(),
            tag_colors: Default::default(),
            status_colors: None,
        };

        let data = collect_corkboard_data(root, &manifest);
        let card = data.cards.get("scene_b").unwrap();
        assert_eq!(card.synopsis, "The storm broke at dawn. She ran through the alley.");
    }

    #[test]
    fn collect_corkboard_data_skips_planning_docs() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("kb")).unwrap();

        write_doc(
            root,
            "kb/char--hero.md",
            "---\nid: char_hero\ntype: character\ntitle: Hero\n---\n\nHero description.",
        );

        let mut nodes = HashMap::new();
        nodes.insert("char_hero".to_string(), crate::project::ProjectNode {
            title: Some("Hero".into()),
            file: Some("kb/char--hero.md".into()),
            doc_type: Some("character".into()),
            children: vec![],
        });
        let manifest = ProjectManifest {
            version: 1,
            root: "node_root".into(),
            nodes,
            doc_types: crate::project::default_doc_types(),
            tag_colors: Default::default(),
            status_colors: None,
        };

        let data = collect_corkboard_data(root, &manifest);
        assert!(data.cards.is_empty(), "planning docs should not produce cards");
    }

    #[test]
    fn collect_corkboard_data_handles_missing_file_gracefully() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("manuscript")).unwrap();
        // NOTE: intentionally do NOT create the file referenced below.

        let mut nodes = HashMap::new();
        nodes.insert("scene_missing".to_string(), crate::project::ProjectNode {
            title: Some("Missing".into()),
            file: Some("manuscript/scene--missing.md".into()),
            doc_type: Some("scene".into()),
            children: vec![],
        });
        let manifest = ProjectManifest {
            version: 1,
            root: "node_root".into(),
            nodes,
            doc_types: crate::project::default_doc_types(),
            tag_colors: Default::default(),
            status_colors: None,
        };

        let data = collect_corkboard_data(root, &manifest);
        assert!(data.cards.get("scene_missing").is_none(), "missing files are skipped, not crashed on");
    }
}
