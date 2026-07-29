import type { DocumentChunk, VectorEntry } from "./schema";

// ─── Cosine Similarity ──────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical direction).
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    );
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// ─── Vector Store ────────────────────────────────────────────────────────────

export interface SearchResult {
  chunk: DocumentChunk;
  score: number;
}

/**
 * In-memory vector store with brute-force cosine similarity search.
 *
 * Trade-off: O(n) search is fine for the scale of resume+JD documents
 * (~50–200 chunks). For production, swap with pgvector / Pinecone / Weaviate.
 */
export class VectorStore {
  private entries: VectorEntry[] = [];

  /** Add a chunk with its embedding vector. */
  add(chunk: DocumentChunk, embedding: number[]): void {
    this.entries.push({ chunk, embedding });
  }

  /** Add multiple entries at once. */
  addBatch(chunks: DocumentChunk[], embeddings: number[][]): void {
    if (chunks.length !== embeddings.length) {
      throw new Error("chunks and embeddings must have the same length");
    }
    for (let i = 0; i < chunks.length; i++) {
      this.entries.push({ chunk: chunks[i], embedding: embeddings[i] });
    }
  }

  /**
   * Search for the top-K most similar chunks to the query embedding.
   * Returns results sorted by descending similarity score.
   */
  search(queryEmbedding: number[], topK = 5): SearchResult[] {
    const scored = this.entries.map((entry) => ({
      chunk: entry.chunk,
      score: cosineSimilarity(queryEmbedding, entry.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /** Remove all entries for a specific document. */
  removeDocument(documentId: string): void {
    this.entries = this.entries.filter(
      (e) => e.chunk.documentId !== documentId
    );
  }

  /** Clear all entries. */
  clear(): void {
    this.entries = [];
  }

  /** Number of stored entries. */
  get size(): number {
    return this.entries.length;
  }
}
