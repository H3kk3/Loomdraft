#![allow(dead_code)]

use std::fmt;

/// Structured error type for all Loomdraft backend operations.
///
/// Replaces `Result<T, String>` across the codebase, enabling pattern matching
/// and consistent error messages for the frontend.
#[derive(Debug)]
pub enum LoomdraftError {
    /// Filesystem read/write/rename/delete failure.
    FileIO { context: String, source: String },
    /// Node ID not found in the project manifest.
    NodeNotFound(String),
    /// project.json or frontmatter parsing failure.
    Malformed { context: String, source: String },
    /// Business-rule validation (e.g. type constraints, root deletion).
    Validation(String),
    /// SQLite / FTS5 index error.
    Database(String),
    /// Export-specific failure (PDF rendering, unknown format, etc.).
    Export(String),
    /// Image import/read failure.
    Image(String),
}

impl fmt::Display for LoomdraftError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::FileIO { context, source } => write!(f, "{context}: {source}"),
            Self::NodeNotFound(id) => write!(f, "Node '{id}' not found"),
            Self::Malformed { context, source } => write!(f, "{context}: {source}"),
            Self::Validation(msg) => write!(f, "{msg}"),
            Self::Database(msg) => write!(f, "Database error: {msg}"),
            Self::Export(msg) => write!(f, "{msg}"),
            Self::Image(msg) => write!(f, "{msg}"),
        }
    }
}

impl std::error::Error for LoomdraftError {}

// Tauri 2 serializes command errors to send to the frontend.
impl serde::Serialize for LoomdraftError {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

// ── Convenience constructors ─────────────────────────────────────────────────

impl LoomdraftError {
    pub fn file_io(context: impl Into<String>, source: impl fmt::Display) -> Self {
        Self::FileIO {
            context: context.into(),
            source: source.to_string(),
        }
    }

    pub fn malformed(context: impl Into<String>, source: impl fmt::Display) -> Self {
        Self::Malformed {
            context: context.into(),
            source: source.to_string(),
        }
    }
}

// ── From impls ───────────────────────────────────────────────────────────────

impl From<std::io::Error> for LoomdraftError {
    fn from(e: std::io::Error) -> Self {
        Self::FileIO {
            context: "IO error".into(),
            source: e.to_string(),
        }
    }
}

impl From<serde_json::Error> for LoomdraftError {
    fn from(e: serde_json::Error) -> Self {
        Self::Malformed {
            context: "JSON error".into(),
            source: e.to_string(),
        }
    }
}

impl From<rusqlite::Error> for LoomdraftError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Database(e.to_string())
    }
}

// ── Bridge for gradual migration ─────────────────────────────────────────────

/// Allows internal modules still returning `Result<T, String>` to work
/// seamlessly with commands that return `error::Result<T>`.
impl From<String> for LoomdraftError {
    fn from(msg: String) -> Self {
        Self::Validation(msg)
    }
}

/// Shorthand result type used throughout the backend.
pub type Result<T> = std::result::Result<T, LoomdraftError>;
