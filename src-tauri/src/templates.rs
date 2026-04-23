//! v0.3 Plan C — Project templates.
//!
//! Post-creation scaffolds applied to a fresh project. Each template
//! calls `project::add_node` in order to build a tree of starter docs.

use std::path::Path;

use crate::project::{self, ProjectManifest};

/// Apply the template's node scaffolding to the given (fresh) project.
/// Returns the final manifest with all scaffolded nodes.
pub fn apply_template(
    template_id: &str,
    project_path: &Path,
) -> Result<ProjectManifest, String> {
    let manifest = project::load_manifest(project_path)?;
    match template_id {
        "blank" => Ok(manifest),
        "novel" => apply_novel(project_path, manifest),
        "short-story" => apply_short_story(project_path, manifest),
        "game-narrative" => apply_game_narrative(project_path, manifest),
        "screenplay" => apply_screenplay(project_path, manifest),
        other => Err(format!("Unknown template: {other}")),
    }
}

/// Helper: add a child node under a given parent.
fn add(
    project_path: &Path,
    parent_id: &str,
    title: &str,
    doc_type: &str,
) -> Result<(String, ProjectManifest), String> {
    project::add_node(project_path, parent_id, title, doc_type)
}

fn apply_novel(
    project_path: &Path,
    manifest: ProjectManifest,
) -> Result<ProjectManifest, String> {
    let root = manifest.root;

    // 3 Parts, 3 Chapters each, 2 scenes per chapter.
    let part_titles = ["The Beginning", "The Middle", "The End"];
    for part_title in part_titles {
        let (part_id, _) = add(project_path, &root, part_title, "part")?;
        for chap in 1..=3 {
            let (chap_id, _) = add(project_path, &part_id, &format!("Chapter {chap}"), "chapter")?;
            for scene in 1..=2 {
                let (_sid, _) = add(
                    project_path,
                    &chap_id,
                    &format!("Scene {chap}.{scene}"),
                    "scene",
                )?;
            }
        }
    }
    // Planning side: 2 characters, 1 location.
    let (_c1, _) = add(project_path, &root, "Protagonist", "character")?;
    let (_c2, _) = add(project_path, &root, "Antagonist", "character")?;
    let (_l1, _) = add(project_path, &root, "Primary setting", "location")?;
    project::load_manifest(project_path)
}

fn apply_short_story(
    project_path: &Path,
    manifest: ProjectManifest,
) -> Result<ProjectManifest, String> {
    let root = manifest.root;
    for scene in 1..=5 {
        let (_id, _) = add(project_path, &root, &format!("Scene {scene}"), "scene")?;
    }
    let (_c1, _) = add(project_path, &root, "Protagonist", "character")?;
    let (_c2, _) = add(project_path, &root, "Antagonist", "character")?;
    project::load_manifest(project_path)
}

fn apply_game_narrative(
    project_path: &Path,
    manifest: ProjectManifest,
) -> Result<ProjectManifest, String> {
    let root = manifest.root;

    // Quests as Parts; each quest has a few scenes.
    let quests = ["Opening quest", "Main questline"];
    for q in quests {
        let (qid, _) = add(project_path, &root, q, "part")?;
        for scene in 1..=3 {
            let (_sid, _) = add(project_path, &qid, &format!("{q} — beat {scene}"), "scene")?;
        }
    }
    // Planning scaffolding.
    let (_c, _) = add(project_path, &root, "Player character", "character")?;
    let (_n, _) = add(project_path, &root, "Key NPC", "character")?;
    let (_l, _) = add(project_path, &root, "Starting location", "location")?;
    let (_i, _) = add(project_path, &root, "Quest item", "item")?;
    let (_lo, _) = add(project_path, &root, "World lore", "lore")?;
    project::load_manifest(project_path)
}

fn apply_screenplay(
    project_path: &Path,
    manifest: ProjectManifest,
) -> Result<ProjectManifest, String> {
    let root = manifest.root;

    // 3-act structure using Parts.
    let acts = ["Act I", "Act II", "Act III"];
    for act in acts {
        let (aid, _) = add(project_path, &root, act, "part")?;
        for scene in 1..=3 {
            let (_sid, _) = add(project_path, &aid, &format!("{act} — scene {scene}"), "scene")?;
        }
    }
    let (_c, _) = add(project_path, &root, "Lead", "character")?;
    let (_l, _) = add(project_path, &root, "Principal location", "location")?;
    project::load_manifest(project_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn blank_template_adds_no_nodes() {
        let dir = tempdir().unwrap();
        let (project_path, original) = project::create_project(dir.path(), "Test").unwrap();
        let after = apply_template("blank", &project_path).unwrap();
        assert_eq!(after.nodes.len(), original.nodes.len());
    }

    #[test]
    fn novel_template_adds_expected_counts() {
        let dir = tempdir().unwrap();
        let (project_path, _) = project::create_project(dir.path(), "Test").unwrap();
        let m = apply_template("novel", &project_path).unwrap();
        let count_by_type = |ty: &str| {
            m.nodes
                .values()
                .filter(|n| n.doc_type.as_deref() == Some(ty))
                .count()
        };
        assert_eq!(count_by_type("part"), 3);
        assert_eq!(count_by_type("chapter"), 9);
        assert_eq!(count_by_type("scene"), 18);
        assert_eq!(count_by_type("character"), 2);
        assert_eq!(count_by_type("location"), 1);
    }

    #[test]
    fn short_story_template_has_no_parts_or_chapters() {
        let dir = tempdir().unwrap();
        let (project_path, _) = project::create_project(dir.path(), "Test").unwrap();
        let m = apply_template("short-story", &project_path).unwrap();
        let count_by_type = |ty: &str| {
            m.nodes
                .values()
                .filter(|n| n.doc_type.as_deref() == Some(ty))
                .count()
        };
        assert_eq!(count_by_type("part"), 0);
        assert_eq!(count_by_type("chapter"), 0);
        assert_eq!(count_by_type("scene"), 5);
    }

    #[test]
    fn game_narrative_template_includes_lore_and_item() {
        let dir = tempdir().unwrap();
        let (project_path, _) = project::create_project(dir.path(), "Test").unwrap();
        let m = apply_template("game-narrative", &project_path).unwrap();
        let count_by_type = |ty: &str| {
            m.nodes
                .values()
                .filter(|n| n.doc_type.as_deref() == Some(ty))
                .count()
        };
        assert_eq!(count_by_type("part"), 2);
        assert_eq!(count_by_type("scene"), 6);
        assert_eq!(count_by_type("character"), 2);
        assert_eq!(count_by_type("lore"), 1);
        assert_eq!(count_by_type("item"), 1);
    }

    #[test]
    fn screenplay_template_has_three_acts() {
        let dir = tempdir().unwrap();
        let (project_path, _) = project::create_project(dir.path(), "Test").unwrap();
        let m = apply_template("screenplay", &project_path).unwrap();
        let count_by_type = |ty: &str| {
            m.nodes
                .values()
                .filter(|n| n.doc_type.as_deref() == Some(ty))
                .count()
        };
        assert_eq!(count_by_type("part"), 3);
        assert_eq!(count_by_type("scene"), 9);
    }

    #[test]
    fn apply_template_errors_on_unknown_id() {
        let dir = tempdir().unwrap();
        let (project_path, _) = project::create_project(dir.path(), "Test").unwrap();
        let result = apply_template("mystery", &project_path);
        assert!(result.is_err());
    }
}
