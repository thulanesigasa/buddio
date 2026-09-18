import fs from 'fs';
import path from 'path';

export interface DocumentChunk {
  id: string;
  source: string;
  heading: string;
  content: string;
}

export class DocumentIngestor {
  private materialsDir: string;

  constructor(materialsDir?: string) {
    this.materialsDir = materialsDir || path.resolve(process.cwd(), 'materials');
  }

  /**
   * Reads all documents in the materials directory and splits them into logical chunks
   */
  public ingestAll(): DocumentChunk[] {
    if (!fs.existsSync(this.materialsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.materialsDir);
    const chunks: DocumentChunk[] = [];

    for (const file of files) {
      const fullPath = path.join(this.materialsDir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isFile() && (file.endsWith('.md') || file.endsWith('.txt') || file.endsWith('.json'))) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const fileChunks = this.splitContentIntoChunks(file, content);
        chunks.push(...fileChunks);
      }
    }

    return chunks;
  }

  /**
   * Splits markdown or text content by sections/headings
   */
  private splitContentIntoChunks(fileName: string, content: string): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const lines = content.split(/\r?\n/);
    let currentHeading = fileName;
    let currentLines: string[] = [];
    let chunkIndex = 1;

    for (const line of lines) {
      if (line.startsWith('#') || line.startsWith('## ') || line.startsWith('### ')) {
        if (currentLines.length > 0) {
          const text = currentLines.join('\n').trim();
          if (text.length > 20) {
            chunks.push({
              id: `${fileName}-chunk-${chunkIndex++}`,
              source: fileName,
              heading: currentHeading,
              content: text,
            });
          }
          currentLines = [];
        }
        currentHeading = line.replace(/^#+\s*/, '').trim();
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0) {
      const text = currentLines.join('\n').trim();
      if (text.length > 20) {
        chunks.push({
          id: `${fileName}-chunk-${chunkIndex++}`,
          source: fileName,
          heading: currentHeading,
          content: text,
        });
      }
    }

    return chunks;
  }

  /**
   * Ingest ad-hoc plain text directly
   */
  public ingestRawText(sourceName: string, text: string): DocumentChunk[] {
    return this.splitContentIntoChunks(sourceName, text);
  }
}
