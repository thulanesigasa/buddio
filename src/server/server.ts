import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { BrowserManager } from '../automation/browserManager.js';
import { DomScanner, ExtractedQuestion } from '../automation/domScanner.js';
import { ActionExecutor } from '../automation/actionExecutor.js';
import { DocumentIngestor } from '../knowledge/docIngestor.js';
import { KnowledgeRetriever } from '../knowledge/retriever.js';
import { QuestionSolver } from '../ai/solver.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Serve static client assets from public directory
const publicDir = fs.existsSync(path.resolve(process.cwd(), 'src/public'))
  ? path.resolve(process.cwd(), 'src/public')
  : path.resolve(__dirname, '../public');
app.use(express.static(publicDir));

// Automation Services
const browserManager = new BrowserManager({
  headless: process.env.HEADLESS === 'true',
  defaultUrl: process.env.LMS_URL || 'http://localhost:3000/mock-quiz',
  slowMo: Number(process.env.BROWSER_SLOWMO_MS) || 120,
});
const domScanner = new DomScanner();
const actionExecutor = new ActionExecutor();
const docIngestor = new DocumentIngestor();
const retriever = new KnowledgeRetriever();
const solver = new QuestionSolver();

// Ingest documents on startup
async function refreshKnowledgeBase() {
  const chunks = await docIngestor.ingestAllAsync();
  retriever.setChunks(chunks);
  console.log(`[Buddio Knowledge] Ingested ${chunks.length} chunks from course materials.`);
  return chunks;
}
refreshKnowledgeBase();

// Mock Quiz Route
app.get('/mock-quiz', (req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'mockQuiz.html'));
});

// Launch Browser & Navigate
app.post('/api/launch', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    const page = await browserManager.navigateTo(url);
    res.json({ success: true, url: page.url() });
  } catch (err: any) {
    console.error('[Buddio Launch Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Scan Active Page DOM
app.get('/api/scan', async (req: Request, res: Response) => {
  try {
    const page = browserManager.getPage();
    if (!page) {
      return res.status(400).json({
        success: false,
        error: 'No active browser session. Click "Launch Browser" first.',
      });
    }

    const scanData = await domScanner.scanPage(page);
    res.json({ success: true, data: scanData });
  } catch (err: any) {
    console.error('[Buddio Scan Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Solve Extracted Questions
app.post('/api/solve', async (req: Request, res: Response) => {
  try {
    const { questions } = req.body as { questions: ExtractedQuestion[] };
    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({ success: false, error: 'Invalid questions payload' });
    }

    const solutions = [];
    for (const q of questions) {
      // 1. Retrieve course knowledge relevant to this question prompt and choices
      const optionTexts = q.options.map((o) => o.text);
      const relevantChunks = retriever.search(q.prompt, optionTexts, 3);

      // 2. Solve question using AI reasoning + course material grounding
      const solution = await solver.solveQuestion(q, relevantChunks);
      solutions.push(solution);
    }

    res.json({ success: true, solutions });
  } catch (err: any) {
    console.error('[Buddio Solve Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Apply Choice in DOM
app.post('/api/apply-choice', async (req: Request, res: Response) => {
  try {
    const { selector, label, text } = req.body;
    const page = browserManager.getPage();
    if (!page) {
      return res.status(400).json({ success: false, error: 'Browser not active' });
    }

    let result;
    if (text !== undefined) {
      result = await actionExecutor.fillText(page, selector, text);
    } else {
      result = await actionExecutor.selectOption(page, selector, label);
    }

    res.json({ success: result.success, result });
  } catch (err: any) {
    console.error('[Buddio Apply Choice Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Navigate to Next Quiz Page
app.post('/api/next-page', async (req: Request, res: Response) => {
  try {
    const page = browserManager.getPage();
    if (!page) {
      return res.status(400).json({ success: false, error: 'Browser not active' });
    }

    const scan = await domScanner.scanPage(page);
    if (!scan.nextButtonSelector) {
      return res.status(400).json({ success: false, error: 'No next page button found on DOM' });
    }

    const result = await actionExecutor.advanceNextPage(page, scan.nextButtonSelector);
    res.json({ success: result.success, result });
  } catch (err: any) {
    console.error('[Buddio Next Page Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ingestion & Materials Info
app.get('/api/materials', async (req: Request, res: Response) => {
  const chunks = await docIngestor.ingestAllAsync();
  const summaryMap = new Map<string, number>();

  for (const c of chunks) {
    summaryMap.set(c.source, (summaryMap.get(c.source) || 0) + 1);
  }

  const documents = Array.from(summaryMap.entries()).map(([source, count]) => ({
    source,
    chunkCount: count,
  }));

  res.json({ success: true, totalChunks: chunks.length, documents });
});

app.listen(PORT, () => {
  console.log(`[Buddio Server] Online at http://localhost:${PORT}`);
  console.log(`[Buddio Mock Quiz] Available at http://localhost:${PORT}/mock-quiz`);
});
