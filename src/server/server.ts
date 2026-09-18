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

// Autopilot State Machine
let isAutopilotEnabled = false;
let autopilotState = 'IDLE'; // 'IDLE' | 'WAITING_FOR_LOGIN' | 'WAITING_FOR_QUIZ' | 'SOLVING_PAGE' | 'COMPLETED'
let autopilotStatusMessage = 'System ready. Launch browser to start.';
let autopilotSolvingLock = false;

async function checkAutopilotCycle() {
  if (!isAutopilotEnabled || autopilotSolvingLock) return;

  const page = browserManager.getPage();
  if (!page || page.isClosed()) {
    isAutopilotEnabled = false;
    autopilotState = 'IDLE';
    autopilotStatusMessage = 'Browser is closed. Click "Launch Browser" to begin.';
    return;
  }

  try {
    const scan = await domScanner.scanPage(page);

    // 1. Detect UJ LMS Login Page
    if (scan.isLoginPage) {
      autopilotState = 'WAITING_FOR_LOGIN';
      autopilotStatusMessage = 'UJ LMS Login screen detected. Please enter your student login details in the browser...';
      return;
    }

    // 2. Detect Assessment Attempt Summary / Submission Page
    if (scan.isSummaryPage) {
      autopilotState = 'COMPLETED';
      autopilotStatusMessage = 'Summary of attempt reached! All questions answered.';
      return;
    }

    // 3. Detect Assessment Quiz Page with Questions
    if (scan.isQuizPage && scan.questions.length > 0) {
      autopilotSolvingLock = true;
      autopilotState = 'SOLVING_PAGE';
      autopilotStatusMessage = `Assessment detected (${scan.questions.length} questions)! Automatically analyzing and answering...`;

      for (let i = 0; i < scan.questions.length; i++) {
        if (!isAutopilotEnabled) break;
        const q = scan.questions[i];
        const optionTexts = q.options.map((o) => o.text);
        const relevantChunks = retriever.search(q.prompt, optionTexts, 3);
        const solution = await solver.solveQuestion(q, relevantChunks);

        autopilotStatusMessage = `Auto-filling Question ${q.questionNumber}: selecting Option ${solution.selectedOptionLabel} (${solution.confidence}% confidence)...`;
        await actionExecutor.selectOption(page, solution.selectedSelector, solution.selectedOptionLabel);
        await new Promise((r) => setTimeout(r, 1200)); // Natural pacing
      }

      // Check if next button exists
      if (isAutopilotEnabled && scan.nextButtonSelector) {
        autopilotStatusMessage = 'Page completed. Advancing to next assessment page in 2s...';
        await new Promise((r) => setTimeout(r, 2000));
        await actionExecutor.advanceNextPage(page, scan.nextButtonSelector);
        autopilotStatusMessage = 'Navigated to next page. Scanning new questions...';
        await new Promise((r) => setTimeout(r, 2000));
      } else if (!scan.nextButtonSelector) {
        autopilotState = 'COMPLETED';
        autopilotStatusMessage = 'Assessment questions completed!';
      }

      autopilotSolvingLock = false;
      return;
    }

    // 4. Authenticated, waiting for student to navigate into course assessment
    autopilotState = 'WAITING_FOR_QUIZ';
    autopilotStatusMessage = 'Authenticated! Navigate to your module assessment in the browser. Buddio will take over automatically once the quiz loads.';
  } catch (err: any) {
    autopilotSolvingLock = false;
    console.warn('[Autopilot Watcher]', err.message);
  }
}

// Background watcher interval every 2 seconds
setInterval(checkAutopilotCycle, 2000);

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

// Autopilot Control Endpoints
app.get('/api/autopilot/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    enabled: isAutopilotEnabled,
    state: autopilotState,
    message: autopilotStatusMessage,
  });
});

app.post('/api/autopilot/toggle', async (req: Request, res: Response) => {
  const { enabled } = req.body;
  isAutopilotEnabled = typeof enabled === 'boolean' ? enabled : !isAutopilotEnabled;

  if (isAutopilotEnabled) {
    autopilotStatusMessage = 'Autopilot activated. Monitoring browser state...';
    // Run an immediate check
    checkAutopilotCycle().catch(() => {});
  } else {
    autopilotState = 'IDLE';
    autopilotStatusMessage = 'Autopilot paused.';
  }

  res.json({
    success: true,
    enabled: isAutopilotEnabled,
    state: autopilotState,
    message: autopilotStatusMessage,
  });
});

app.listen(PORT, () => {
  console.log(`[Buddio Server] Online at http://localhost:${PORT}`);
  console.log(`[Buddio Mock Quiz] Available at http://localhost:${PORT}/mock-quiz`);
});
