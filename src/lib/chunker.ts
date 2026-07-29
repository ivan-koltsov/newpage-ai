import type { DocumentChunk } from "./schema";

// ─── Configuration ───────────────────────────────────────────────────────────

export interface ChunkOptions {
  /** Maximum characters per chunk (default: 500). */
  chunkSize: number;
  /** Overlap between consecutive chunks (default: 100). */
  chunkOverlap: number;
}

const DEFAULT_OPTIONS: ChunkOptions = {
  chunkSize: 500,
  chunkOverlap: 100,
};

// ─── Splitter Hierarchy ──────────────────────────────────────────────────────

/**
 * Separators tried in order — prefer splitting on paragraph breaks, then
 * sentence boundaries, then word boundaries.
 */
const SEPARATORS = ["\n\n", "\n", ". ", ", ", " "];

/**
 * Recursively split text using a hierarchy of separators.
 * Falls back to coarser splits when finer ones produce chunks above the limit.
 */
function recursiveSplit(text: string, maxLen: number, sepIdx = 0): string[] {
  if (text.length <= maxLen) return [text];

  const sep = SEPARATORS[sepIdx];
  if (sepIdx >= SEPARATORS.length) {
    // Hard split at maxLen as last resort
    const parts: string[] = [];
    for (let i = 0; i < text.length; i += maxLen) {
      parts.push(text.slice(i, i + maxLen));
    }
    return parts;
  }

  const segments = text.split(sep);
  const result: string[] = [];
  let buffer = "";

  for (const segment of segments) {
    const candidate = buffer ? buffer + sep + segment : segment;

    if (candidate.length <= maxLen) {
      buffer = candidate;
    } else {
      if (buffer) result.push(buffer);
      // If this segment alone exceeds maxLen, recurse with the next separator
      if (segment.length > maxLen) {
        result.push(...recursiveSplit(segment, maxLen, sepIdx + 1));
        buffer = "";
      } else {
        buffer = segment;
      }
    }
  }
  if (buffer) result.push(buffer);

  return result;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Split a document into overlapping chunks tagged with metadata.
 *
 * @param text       - The full document text.
 * @param source     - Whether this is a "resume" or "job" document.
 * @param documentId - Unique identifier for the source document.
 * @param options    - Chunking parameters.
 * @returns Array of `DocumentChunk` objects ready for embedding.
 */
export function chunkText(
  text: string,
  source: "resume" | "job",
  documentId: string,
  options?: Partial<ChunkOptions>
): DocumentChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const rawChunks = recursiveSplit(text, opts.chunkSize);

  // Apply overlap — prepend the tail of the previous chunk to the current one
  const chunks: DocumentChunk[] = [];
  for (let i = 0; i < rawChunks.length; i++) {
    let chunkText = rawChunks[i];

    if (i > 0 && opts.chunkOverlap > 0) {
      const prev = rawChunks[i - 1];
      const overlap = prev.slice(-opts.chunkOverlap);
      chunkText = overlap + chunkText;
    }

    chunks.push({
      id: `${documentId}-chunk-${i}`,
      text: chunkText.trim(),
      source,
      documentId,
      chunkIndex: i,
    });
  }

  return chunks;
}
