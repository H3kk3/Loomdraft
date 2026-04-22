use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

// ── Schema ────────────────────────────────────────────────────────────────────

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS documents (
    id       TEXT PRIMARY KEY,
    type     TEXT NOT NULL,
    title    TEXT NOT NULL,
    file     TEXT NOT NULL,
    modified TEXT
);

-- Full-text search table (standalone, not a content= table for simplicity)
CREATE VIRTUAL TABLE IF NOT EXISTS fts_index USING fts5(
    doc_id  UNINDEXED,
    title,
    body
);

-- Back-link graph
CREATE TABLE IF NOT EXISTS links (
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    PRIMARY KEY (source_id, target_id)
);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);
";

// ── Open / init ───────────────────────────────────────────────────────────────

pub fn open_db(db_path: &Path) -> SqlResult<Connection> {
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).ok();
    }
    let conn = Connection::open(db_path)?;
    conn.execute_batch(SCHEMA)?;
    Ok(conn)
}

// ── Indexing ──────────────────────────────────────────────────────────────────

pub fn index_document(
    conn: &Connection,
    id: &str,
    doc_type: &str,
    title: &str,
    file: &str,
    body: &str,
    modified: Option<&str>,
) -> SqlResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO documents (id, type, title, file, modified)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, doc_type, title, file, modified],
    )?;

    // Replace FTS entry
    conn.execute(
        "DELETE FROM fts_index WHERE doc_id = ?1",
        params![id],
    )?;
    conn.execute(
        "INSERT INTO fts_index(doc_id, title, body) VALUES (?1, ?2, ?3)",
        params![id, title, body],
    )?;

    Ok(())
}

pub fn remove_document(conn: &Connection, id: &str) -> SqlResult<()> {
    conn.execute("DELETE FROM documents WHERE id = ?1", params![id])?;
    conn.execute("DELETE FROM fts_index WHERE doc_id = ?1", params![id])?;
    conn.execute("DELETE FROM links WHERE source_id = ?1 OR target_id = ?1", params![id])?;
    Ok(())
}

// ── Link graph ────────────────────────────────────────────────────────────────

pub fn update_links(conn: &Connection, source_id: &str, targets: &[String]) -> SqlResult<()> {
    conn.execute("DELETE FROM links WHERE source_id = ?1", params![source_id])?;
    for target in targets {
        conn.execute(
            "INSERT OR IGNORE INTO links (source_id, target_id) VALUES (?1, ?2)",
            params![source_id, target],
        )?;
    }
    Ok(())
}

// ── Search ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub doc_type: String,
    pub file: String,
    pub snippet: Option<String>,
}

/// Sanitize a user query for FTS5 MATCH by quoting each token.
/// This prevents unbalanced quotes and FTS5 operators from crashing the query.
fn sanitize_fts5_query(query: &str) -> String {
    let tokens: Vec<String> = query
        .split_whitespace()
        .filter(|t| !t.is_empty())
        .map(|t| {
            let escaped = t.replace('"', "\"\"");
            format!("\"{escaped}\"")
        })
        .collect();
    if tokens.is_empty() {
        return String::new();
    }
    // Append * to last token for prefix matching
    let mut result = tokens.join(" ");
    result.push('*');
    result
}

pub fn search(conn: &Connection, query: &str) -> SqlResult<Vec<SearchResult>> {
    let fts_query = sanitize_fts5_query(query);
    if fts_query.is_empty() {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        "SELECT d.id, d.title, d.type, d.file,
                snippet(fts_index, 2, '[', ']', '…', 12)
         FROM fts_index
         JOIN documents d ON d.id = fts_index.doc_id
         WHERE fts_index MATCH ?1
         ORDER BY rank
         LIMIT 50",
    )?;

    let rows = stmt
        .query_map(params![fts_query], |row| {
            Ok(SearchResult {
                id: row.get(0)?,
                title: row.get(1)?,
                doc_type: row.get(2)?,
                file: row.get(3)?,
                snippet: row.get(4)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

pub fn get_backlinks(conn: &Connection, target_id: &str) -> SqlResult<Vec<SearchResult>> {
    let mut stmt = conn.prepare(
        "SELECT d.id, d.title, d.type, d.file, NULL
         FROM links l
         JOIN documents d ON d.id = l.source_id
         WHERE l.target_id = ?1",
    )?;

    let rows = stmt
        .query_map(params![target_id], |row| {
            Ok(SearchResult {
                id: row.get(0)?,
                title: row.get(1)?,
                doc_type: row.get(2)?,
                file: row.get(3)?,
                snippet: None,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

// ── Full reindex ──────────────────────────────────────────────────────────────

/// Wipes and rebuilds the entire index from the markdown files on disk.
/// Wrapped in a transaction so a partial failure doesn't leave empty tables.
pub fn reindex(
    conn: &Connection,
    project_path: &Path,
    manifest: &crate::project::ProjectManifest,
) -> Result<usize, String> {
    conn.execute_batch("BEGIN")
        .map_err(|e| e.to_string())?;

    let result = (|| -> Result<usize, String> {
        conn.execute_batch("DELETE FROM documents; DELETE FROM fts_index; DELETE FROM links;")
            .map_err(|e| e.to_string())?;

        let mut count = 0usize;

        for (node_id, node) in &manifest.nodes {
            let Some(file_rel) = &node.file else { continue };
            let file_path = project_path.join(file_rel);

            let Ok(raw) = std::fs::read_to_string(&file_path) else {
                continue;
            };

            let Some((fm, body)) = crate::frontmatter::parse_frontmatter(&raw) else {
                continue;
            };

            index_document(
                conn,
                node_id,
                &fm.doc_type,
                &fm.title,
                file_rel,
                &body,
                fm.modified.as_deref(),
            )
            .map_err(|e| e.to_string())?;

            let links = crate::project::extract_wiki_links(&body);
            update_links(conn, node_id, &links).map_err(|e| e.to_string())?;

            count += 1;
        }

        Ok(count)
    })();

    match &result {
        Ok(_) => { conn.execute_batch("COMMIT").map_err(|e| e.to_string())?; }
        Err(_) => { let _ = conn.execute_batch("ROLLBACK"); }
    }

    result
}
