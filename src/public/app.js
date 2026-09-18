// Buddio Frontend Controller

let currentScanResult = null;
let currentSolutions = [];
let currentQuestionIndex = 0;
let isAutopilotActive = false;

// DOM Elements
const targetUrlInput = document.getElementById('target-url');
const btnLaunchBrowser = document.getElementById('btn-launch-browser');
const btnScan = document.getElementById('btn-scan');
const btnSolve = document.getElementById('btn-solve');
const btnFillChoice = document.getElementById('btn-fill-choice');
const btnNextPage = document.getElementById('btn-next-page');
const btnQuickUj = document.getElementById('btn-quick-uj');
const btnQuickMock = document.getElementById('btn-quick-mock');
const btnRefreshDocs = document.getElementById('btn-refresh-docs');
const btnPrevQ = document.getElementById('btn-prev-q');
const btnNextQ = document.getElementById('btn-next-q');
const modeCopilot = document.getElementById('mode-copilot');
const modeAutopilot = document.getElementById('mode-autopilot');
const logStream = document.getElementById('log-stream');
const docList = document.getElementById('doc-list');

// Question Display Elements
const qNumber = document.getElementById('q-number');
const qType = document.getElementById('q-type');
const qPrompt = document.getElementById('q-prompt');
const qCode = document.getElementById('q-code');
const optionsList = document.getElementById('options-list');
const solutionPanel = document.getElementById('solution-panel');
const solutionConfidence = document.getElementById('solution-confidence');
const solutionReasoning = document.getElementById('solution-reasoning');

function appendLog(action, message) {
  const time = new Date().toTimeString().split(' ')[0];
  const row = document.createElement('div');
  row.className = 'log-entry';
  row.innerHTML = `<span class="log-time">${time}</span><span class="log-action">${action}</span><span class="log-msg">${message}</span>`;
  logStream.appendChild(row);
  logStream.scrollTop = logStream.scrollHeight;
}

// Mode Selection
modeCopilot.addEventListener('click', () => {
  modeCopilot.classList.add('active');
  modeAutopilot.classList.remove('active');
  isAutopilotActive = false;
  appendLog('MODE', 'Switched to Co-Pilot mode (user review required).');
});

modeAutopilot.addEventListener('click', () => {
  modeAutopilot.classList.add('active');
  modeCopilot.classList.remove('active');
  isAutopilotActive = true;
  appendLog('MODE', 'Switched to Autopilot mode (continuous automated solving).');
  runAutopilotLoop();
});

// Quick URL Switches
btnQuickUj.addEventListener('click', () => {
  targetUrlInput.value = 'https://lms.uj.ac.za/login/index.php';
  appendLog('TARGET', 'URL set to UJ Moodle LMS.');
});

btnQuickMock.addEventListener('click', () => {
  targetUrlInput.value = 'http://localhost:3000/mock-quiz';
  appendLog('TARGET', 'URL set to Local Mock Quiz.');
});

// Launch Browser
btnLaunchBrowser.addEventListener('click', async () => {
  appendLog('BROWSER', 'Initiating Playwright headed browser...');
  try {
    const res = await fetch('/api/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrlInput.value }),
    });
    const data = await res.json();
    if (data.success) {
      appendLog('BROWSER', `Headed Chromium launched. Navigated to ${targetUrlInput.value}`);
      // Automatically scan after short delay
      setTimeout(scanDom, 1500);
    } else {
      appendLog('ERROR', data.error || 'Failed launching browser.');
    }
  } catch (err) {
    appendLog('ERROR', `Network error: ${err.message}`);
  }
});

// Scan DOM
async function scanDom() {
  appendLog('SCAN', 'Scanning active browser DOM for quiz questions...');
  try {
    const res = await fetch('/api/scan');
    const data = await res.json();
    if (data.success) {
      currentScanResult = data.data;
      const count = currentScanResult.questions?.length || 0;
      appendLog('SCAN', `Scan complete: detected ${count} question(s) on page.`);
      currentQuestionIndex = 0;
      renderCurrentQuestion();
      if (count > 0 && isAutopilotActive) {
        solveAndApply();
      }
    } else {
      appendLog('WARN', data.error || 'Could not scan page.');
    }
  } catch (err) {
    appendLog('ERROR', `Scan error: ${err.message}`);
  }
}
btnScan.addEventListener('click', scanDom);

// Render Current Question
function renderCurrentQuestion() {
  if (!currentScanResult || !currentScanResult.questions || currentScanResult.questions.length === 0) {
    qNumber.textContent = 'No active questions';
    qType.textContent = '';
    qPrompt.textContent = 'No questions detected on this page. Navigate to an assessment or click Scan DOM.';
    qCode.style.display = 'none';
    optionsList.innerHTML = '';
    solutionPanel.style.display = 'none';
    return;
  }

  const q = currentScanResult.questions[currentQuestionIndex];
  qNumber.textContent = `Question ${currentQuestionIndex + 1} of ${currentScanResult.questions.length}`;
  qType.textContent = `Type: ${q.type.toUpperCase()}`;
  qPrompt.textContent = q.prompt;

  if (q.codeSnippet) {
    qCode.style.display = 'block';
    qCode.textContent = q.codeSnippet;
  } else {
    qCode.style.display = 'none';
  }

  // Render options
  optionsList.innerHTML = '';
  const solution = currentSolutions.find((s) => s.questionId === q.id);

  q.options.forEach((opt) => {
    const isChosen = solution && solution.selectedOptionIndex === opt.index;
    const card = document.createElement('div');
    card.className = `option-card ${isChosen ? 'chosen' : ''}`;
    card.innerHTML = `
      <div class="option-badge">${opt.label}</div>
      <div class="option-label-text">${opt.text}</div>
    `;
    card.addEventListener('click', () => {
      applySpecificOption(opt.selector, opt.label);
    });
    optionsList.appendChild(card);
  });

  // Render solution panel if available
  if (solution) {
    solutionPanel.style.display = 'flex';
    solutionConfidence.textContent = `Confidence: ${solution.confidence}%`;
    solutionReasoning.textContent = solution.reasoning;
  } else {
    solutionPanel.style.display = 'none';
  }
}

// Next / Prev Questions in Inspector
btnPrevQ.addEventListener('click', () => {
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    renderCurrentQuestion();
  }
});

btnNextQ.addEventListener('click', () => {
  if (currentScanResult && currentQuestionIndex < currentScanResult.questions.length - 1) {
    currentQuestionIndex++;
    renderCurrentQuestion();
  }
});

// Solve Questions
async function solveQuestions() {
  if (!currentScanResult || !currentScanResult.questions || currentScanResult.questions.length === 0) {
    appendLog('WARN', 'Please scan the DOM first.');
    return;
  }

  appendLog('SOLVE', 'Querying course materials and reasoning engine...');
  try {
    const res = await fetch('/api/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: currentScanResult.questions }),
    });
    const data = await res.json();
    if (data.success) {
      currentSolutions = data.solutions;
      appendLog('SOLVE', `Generated solutions for ${currentSolutions.length} question(s).`);
      renderCurrentQuestion();
    }
  } catch (err) {
    appendLog('ERROR', `Solve error: ${err.message}`);
  }
}
btnSolve.addEventListener('click', solveQuestions);

// Apply Choice
async function applyCurrentChoice() {
  const q = currentScanResult?.questions?.[currentQuestionIndex];
  const solution = currentSolutions.find((s) => s.questionId === q?.id);
  if (!solution) {
    appendLog('WARN', 'No solution found for active question. Please solve first.');
    return;
  }

  appendLog('ACTION', `Applying Option ${solution.selectedOptionLabel} in DOM...`);
  try {
    const res = await fetch('/api/apply-choice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selector: solution.selectedSelector,
        label: solution.selectedOptionLabel,
      }),
    });
    const data = await res.json();
    if (data.success) {
      appendLog('ACTION', `Option ${solution.selectedOptionLabel} selected successfully.`);
    } else {
      appendLog('ERROR', data.error || 'Failed applying choice.');
    }
  } catch (err) {
    appendLog('ERROR', `Apply choice error: ${err.message}`);
  }
}
btnFillChoice.addEventListener('click', applyCurrentChoice);

async function applySpecificOption(selector, label) {
  appendLog('ACTION', `Manually applying Option ${label} in DOM...`);
  try {
    const res = await fetch('/api/apply-choice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector, label }),
    });
    const data = await res.json();
    if (data.success) {
      appendLog('ACTION', `Option ${label} checked in DOM.`);
    }
  } catch (err) {
    appendLog('ERROR', err.message);
  }
}

// Next Page Navigation
async function navigateNextPage() {
  appendLog('NAV', 'Navigating to next assessment page...');
  try {
    const res = await fetch('/api/next-page', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      appendLog('NAV', 'Page navigation confirmed. Re-scanning DOM...');
      setTimeout(scanDom, 1200);
    } else {
      appendLog('WARN', data.error || 'No next page button found.');
    }
  } catch (err) {
    appendLog('ERROR', `Navigation error: ${err.message}`);
  }
}
btnNextPage.addEventListener('click', navigateNextPage);

// Autopilot Automation Workflow
async function solveAndApply() {
  if (!isAutopilotActive) return;

  await solveQuestions();
  // Apply all solutions across page
  for (const sol of currentSolutions) {
    appendLog('AUTOPILOT', `Auto-filling Question ${sol.questionNumber} -> Option ${sol.selectedOptionLabel}`);
    await fetch('/api/apply-choice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selector: sol.selectedSelector,
        label: sol.selectedOptionLabel,
      }),
    });
    await new Promise((r) => setTimeout(r, 600));
  }

  // Human-like pause before advancing
  appendLog('AUTOPILOT', 'All questions answered on current page. Advancing in 2.5s...');
  setTimeout(async () => {
    if (isAutopilotActive) {
      await navigateNextPage();
    }
  }, 2500);
}

async function runAutopilotLoop() {
  if (!isAutopilotActive) return;
  await scanDom();
}

// Refresh Course Materials List
async function loadCourseDocs() {
  try {
    const res = await fetch('/api/materials');
    const data = await res.json();
    if (data.success) {
      docList.innerHTML = '';
      data.documents.forEach((doc) => {
        const item = document.createElement('div');
        item.className = 'doc-item';
        item.innerHTML = `
          <div class="doc-info">
            <svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
            <span class="doc-title">${doc.source}</span>
          </div>
          <span class="doc-chunks">${doc.chunkCount} chunks</span>
        `;
        docList.appendChild(item);
      });
      appendLog('DOCS', `Course knowledge index loaded: ${data.totalChunks} chunks.`);
    }
  } catch (err) {
    appendLog('WARN', `Could not fetch documents list: ${err.message}`);
  }
}
btnRefreshDocs.addEventListener('click', loadCourseDocs);

// Initial bootstrap
loadCourseDocs();
