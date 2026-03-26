// Mirror of Rust structs in src-tauri/src/project.rs and db.rs

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
}

export interface DocumentContent {
  id: string;
  title: string;
  doc_type: string;
  content: string;
  file: string;
}

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
