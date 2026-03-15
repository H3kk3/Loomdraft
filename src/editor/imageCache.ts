import { invoke } from "@tauri-apps/api/core";
import { IMAGE_CACHE_MAX_ENTRIES } from "../constants";

/**
 * Manages loading and caching of image data URLs for inline display.
 * Notifies subscribers when images finish loading so decorations can rebuild.
 * Uses LRU eviction when cache exceeds MAX_CACHE_ENTRIES.
 */
export class ImageCache {
  private cache = new Map<string, string>();
  private loading = new Set<string>();
  private failed = new Set<string>();
  private listeners: Array<() => void> = [];

  constructor(private projectPath: string) {}

  /** Get a cached data URL, or undefined if not loaded yet */
  get(relativePath: string): string | undefined {
    const value = this.cache.get(relativePath);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(relativePath);
      this.cache.set(relativePath, value);
    }
    return value;
  }

  /** Start loading an image if not already cached, in-flight, or previously failed */
  load(relativePath: string): void {
    if (
      this.cache.has(relativePath) ||
      this.loading.has(relativePath) ||
      this.failed.has(relativePath)
    )
      return;
    this.loading.add(relativePath);

    invoke<string>("read_image_base64", {
      projectPath: this.projectPath,
      relativePath,
    })
      .then((dataUrl) => {
        this.loading.delete(relativePath);

        // LRU eviction: remove oldest entries if at capacity
        while (this.cache.size >= IMAGE_CACHE_MAX_ENTRIES) {
          const oldest = this.cache.keys().next().value;
          if (oldest !== undefined) {
            this.cache.delete(oldest);
          } else {
            break;
          }
        }

        this.cache.set(relativePath, dataUrl);
        this.notify();
      })
      .catch((err) => {
        console.warn(`[ImageCache] Failed to load image: ${relativePath}`, err);
        this.loading.delete(relativePath);
        this.failed.add(relativePath);
      });
  }

  /** Subscribe to cache updates. Returns unsubscribe function. */
  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  /** Clear all cached data (used when switching projects) */
  clear(): void {
    this.cache.clear();
    this.loading.clear();
    this.failed.clear();
  }

  private notify(): void {
    for (const fn of this.listeners) {
      fn();
    }
  }
}
