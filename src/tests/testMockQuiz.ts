import { chromium } from 'playwright';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { DomScanner } from '../automation/domScanner.js';
import { ActionExecutor } from '../automation/actionExecutor.js';
import { DocumentIngestor } from '../knowledge/docIngestor.js';
import { KnowledgeRetriever } from '../knowledge/retriever.js';
import { QuestionSolver } from '../ai/solver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMockQuizTest() {
  console.log('=== [Buddio Automated Verification Test] ===');

  // Start internal test server if needed
  const app = express();
  const publicDir = path.resolve(__dirname, '../public');
  app.use(express.static(publicDir));
  app.get('/mock-quiz', (req, res) => {
    res.sendFile(path.join(publicDir, 'mockQuiz.html'));
  });

  const testPort = 3001;
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(testPort, () => resolve()));
  console.log(`✓ Test server running on http://localhost:${testPort}/mock-quiz`);

  // 1. Ingest course notes
  console.log('[1/5] Ingesting course materials...');
  const ingestor = new DocumentIngestor();
  const chunks = ingestor.ingestAll();
  console.log(`✓ Loaded ${chunks.length} chunks from course materials.`);

  const retriever = new KnowledgeRetriever(chunks);
  const solver = new QuestionSolver();
  const domScanner = new DomScanner();
  const actionExecutor = new ActionExecutor();

  // 2. Launch Chromium
  console.log('[2/5] Launching Playwright browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // 3. Navigate to mock quiz
    console.log(`[3/5] Navigating to http://localhost:${testPort}/mock-quiz ...`);
    await page.goto(`http://localhost:${testPort}/mock-quiz`, { waitUntil: 'domcontentloaded' });

    // 4. Scan DOM
    console.log('[4/5] Scanning DOM for Moodle question blocks...');
    const scan = await domScanner.scanPage(page);
    console.log(`✓ Is quiz page: ${scan.isQuizPage}`);
    console.log(`✓ Questions detected: ${scan.questions.length}`);

    if (scan.questions.length !== 3) {
      throw new Error(`Expected 3 questions, found ${scan.questions.length}`);
    }

    // 5. Solve and apply answers
    console.log('[5/5] Solving questions and applying choices in DOM...');
    for (const q of scan.questions) {
      const optionTexts = q.options.map((o) => o.text);
      const relevant = retriever.search(q.prompt, optionTexts, 3);
      const solution = await solver.solveQuestion(q, relevant);

      console.log(`\n--------------------------------------------`);
      console.log(`Question ${q.questionNumber}: ${q.prompt}`);
      console.log(`Selected: Option ${solution.selectedOptionLabel} (${solution.selectedOptionText})`);
      console.log(`Confidence: ${solution.confidence}%`);
      console.log(`Reasoning: ${solution.reasoning}`);

      // Apply in DOM
      const actionResult = await actionExecutor.selectOption(page, solution.selectedSelector, solution.selectedOptionLabel);
      if (!actionResult.success) {
        throw new Error(`Failed to apply option for question ${q.questionNumber}: ${actionResult.details}`);
      }
      console.log(`✓ Applied in DOM: ${actionResult.details}`);
    }

    // Advance/Submit
    if (scan.nextButtonSelector) {
      console.log('\nSubmitting assessment via Next Button...');
      await actionExecutor.advanceNextPage(page, scan.nextButtonSelector);
      const bannerVisible = await page.isVisible('#submission-banner');
      console.log(`✓ Submission banner visible: ${bannerVisible}`);
      if (!bannerVisible) {
        throw new Error('Submission banner did not become visible after next page click');
      }
    }

    console.log('\n============================================');
    console.log('ALL VERIFICATION TESTS PASSED ACCURATELY!');
    console.log('============================================\n');
  } finally {
    await browser.close();
    server.close();
  }
}

runMockQuizTest().catch((err) => {
  console.error('\nVerification Test FAILED:', err);
  process.exit(1);
});
