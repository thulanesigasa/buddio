import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let pdfParse: any = null;
try {
  pdfParse = require('pdf-parse');
} catch {}

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
   * Reads all documents in the materials directory (including PDFs, MD, TXT, HTML, JSON)
   */
  public async ingestAllAsync(): Promise<DocumentChunk[]> {
    if (!fs.existsSync(this.materialsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.materialsDir);
    const chunks: DocumentChunk[] = [];

    for (const file of files) {
      const fullPath = path.join(this.materialsDir, file);
      const stat = fs.statSync(fullPath);

      if (!stat.isFile()) continue;

      const lower = file.toLowerCase();

      // Handle PDFs
      if (lower.endsWith('.pdf') && pdfParse) {
        try {
          const PDFParseClass = typeof pdfParse === 'function' ? pdfParse : (pdfParse.PDFParse || pdfParse);
          const parser = new PDFParseClass({ url: fullPath });
          await parser.load();
          const parsed = await parser.getText();
          const rawText = typeof parsed === 'string' ? parsed : (parsed?.text || '');
          const pdfChunks = this.splitContentIntoChunks(file, rawText);
          chunks.push(...pdfChunks);
          continue;
        } catch (err: any) {
          console.warn(`[Buddio Ingestor] Error reading PDF ${file}:`, err.message);
        }
      }

      // Handle Markdown, TXT, JSON, HTML
      if (
        lower.endsWith('.md') ||
        lower.endsWith('.txt') ||
        lower.endsWith('.json') ||
        lower.endsWith('.html') ||
        lower.endsWith('.htm')
      ) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const fileChunks = this.splitContentIntoChunks(file, content);
          chunks.push(...fileChunks);
        } catch (err: any) {
          console.warn(`[Buddio Ingestor] Error reading text file ${file}:`, err.message);
        }
      }
    }

    return chunks;
  }

  /**
   * Synchronous fallback for text/markdown files
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

      if (stat.isFile()) {
        const lower = file.toLowerCase();
        if (
          lower.endsWith('.md') ||
          lower.endsWith('.txt') ||
          lower.endsWith('.json') ||
          lower.endsWith('.html')
        ) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const fileChunks = this.splitContentIntoChunks(file, content);
          chunks.push(...fileChunks);
        }
      }
    }

    return chunks;
  }

  /**
   * Splits markdown or text content by sections/headings/paragraphs
   */
  private splitContentIntoChunks(fileName: string, content: string): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const lines = content.split(/\r?\n/);
    let currentHeading = fileName;
    let currentLines: string[] = [];
    let chunkIndex = 1;

    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('#') ||
        trimmed.startsWith('## ') ||
        trimmed.startsWith('### ') ||
        trimmed.match(/^(module|chapter|unit|section|topic)\s+\d+/i)
      ) {
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
        currentHeading = trimmed.replace(/^#+\s*/, '').trim();
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
