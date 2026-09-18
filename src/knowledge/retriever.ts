import { DocumentChunk } from './docIngestor.js';

export interface RetrievalResult {
  chunk: DocumentChunk;
  score: number;
}

export class KnowledgeRetriever {
  private chunks: DocumentChunk[] = [];
  private tokenizedChunks: Map<string, Set<string>> = new Map();

  constructor(chunks: DocumentChunk[] = []) {
    this.setChunks(chunks);
  }

  public setChunks(chunks: DocumentChunk[]): void {
    this.chunks = chunks;
    this.tokenizedChunks.clear();

    for (const chunk of chunks) {
      const tokens = this.tokenize(`${chunk.heading} ${chunk.content}`);
      this.tokenizedChunks.set(chunk.id, new Set(tokens));
    }
  }

  /**
   * Retrieves the top N matching chunks for a question query and its answer choices
   */
  public search(query: string, options: string[] = [], topK: number = 3): RetrievalResult[] {
    if (this.chunks.length === 0) return [];

    const queryTokens = this.tokenize(`${query} ${options.join(' ')}`);
    const results: RetrievalResult[] = [];

    for (const chunk of this.chunks) {
      const chunkTokens = this.tokenizedChunks.get(chunk.id);
      if (!chunkTokens) continue;

      let matchScore = 0;

      // Calculate term overlap and phrase matching
      for (const token of queryTokens) {
        if (chunkTokens.has(token)) {
          // Weight longer/technical words more heavily than common short words
          const weight = token.length >= 6 ? 2.5 : token.length >= 4 ? 1.5 : 1.0;
          matchScore += weight;
        }
      }

      // Bonus if heading directly contains terms
      const headingLower = chunk.heading.toLowerCase();
      for (const token of queryTokens) {
        if (token.length > 3 && headingLower.includes(token)) {
          matchScore += 3.0;
        }
      }

      // Direct option phrase matches inside chunk content provide strong signals
      const contentLower = chunk.content.toLowerCase();
      for (const opt of options) {
        const cleanedOpt = opt.toLowerCase().trim();
        if (cleanedOpt.length > 4 && contentLower.includes(cleanedOpt)) {
          matchScore += 4.0;
        }
      }

      if (matchScore > 0) {
        results.push({ chunk, score: matchScore });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9_\-\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
  }
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'with', 'this', 'that', 'which', 'what',
  'when', 'where', 'from', 'have', 'has', 'been', 'were', 'will', 'would',
  'should', 'could', 'about', 'into', 'then', 'than', 'some', 'any', 'all'
]);
