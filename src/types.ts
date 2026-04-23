// Mirror of Rust structs in src-tauri/src/project.rs, frontmatter.rs, and db.rs

export const STATUS_VALUES = [
  "draft",
  "in-revision",
  "revised",
  "final",
  "stuck",
  "cut",
] as const;

export type Status = (typeof STATUS_VALUES)[number];

export interface ProjectNode {
  title?: string;
  file?: string;
  doc_type?: string;
  children: string[];
}

export interface DocTypeDefinition {
  id: string;
  label: string;
  category: "manuscript" | "planning";
  icon: string;
  heading_level: number;
  builtin: boolean;
}

export interface ProjectManifest {
  version: number;
  root: string;
  nodes: Record<string, ProjectNode>;
  doc_types: DocTypeDefinition[];
  // Omitted when empty (serde skip_serializing_if = "HashMap::is_empty")
  tag_colors?: Record<string, string>;
  // Omitted when None (serde skip_serializing_if = "Option::is_none"); never null
  status_colors?: Record<string, string>;
}

export interface DocumentContent {
  id: string;
  title: string;
  doc_type: string;
  content: string;
  file: string;
}

export interface NodeMetadata {
  synopsis: string | null;
  tags: string[];
  status: Status;
}

export type ProjectMetadata = Record<string, NodeMetadata>;

export interface SearchResult {
  id: string;
  title: string;
  doc_type: string;
  file: string;
  snippet?: string;
}

export interface WordCountResult {
  total_words: number;
  total_chars: number;
}

export interface ExportResult {
  format: string;
  output_path: string;
  word_count: number;
  section_count: number;
}

export interface BackupEntry {
  node_id: string;
  timestamp: string;
  size_bytes: number;
  preview: string;
}

export type DocType = string;

// v0.3 Plan B — Corkboard

export interface CorkboardCard {
  id: string;
  title: string;
  doc_type: string;
  synopsis: string;
  word_count: number;
  status: Status;
  tags: string[];
}

export interface CorkboardData {
  cards: Record<string, CorkboardCard>;
}
