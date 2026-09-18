# Buddio

[![Node.js Version](https://img.shields.io/badge/node-v24%2B-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Playwright](https://img.shields.io/badge/Playwright-1.50-2EAD33?style=flat-square&logo=playwright)](https://playwright.dev)
[![UJ LMS](https://img.shields.io/badge/LMS-Moodle%20UJ-F37021?style=flat-square)](https://lms.uj.ac.za)
[![Express](https://img.shields.io/badge/Server-Express%204.21-000000?style=flat-square&logo=express)](https://expressjs.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-00A389?style=flat-square)](LICENSE)

Buddio is an automated browser co-pilot and assessment solver designed for participants of the FNB App Academy and University of Johannesburg (UJ) Business School Skills Development Program on the Moodle LMS (`lms.uj.ac.za`).

Buddio integrates Playwright headed browser automation, live DOM question extraction, a local Retrieval-Augmented Generation (RAG) knowledge engine that scans course materials, and an intelligent answering core with real-time browser actuation.

---

## Core Capabilities

- **Headed Browser Automation**: Launches Chromium with persistent session state (`.browser_session`), allowing secure single login (SSO/Moodle authentication) while Buddio manages test navigation.
- **Dynamic Moodle DOM Parser**: Parses Moodle quiz containers (`.que.multichoice`, `.que.truefalse`, `.que.shortanswer`), capturing question prompts, code blocks, images, and labeled radio/checkbox options with precise selectors.
- **Course Material RAG Engine**: Indexes lecture notes, syllabus guides, and PDFs placed in `materials/` to supply verified contextual snippets to the answering engine.
- **Dual Operating Modes**:
  - **Co-Pilot Mode**: Inspects the question, retrieves knowledge, highlights recommended choices in the browser, displays reasoning on the dashboard, and waits for one-click user authorization.
  - **Autopilot Mode**: Sequentially answers questions and advances pages with configurable human-like interaction timing.
- **Built-in Mock LMS Testbed**: Includes a local mock Moodle quiz server (`/mock-quiz`) replicating authentic Moodle DOM markup for safe, risk-free validation before live testing.
- **60-30-10 Control Center**: Minimalist, dark-mode real-time web dashboard adhering strictly to the 60-30-10 color palette (`#0B0F19` / `#131B2E` / `#00A389`) with zero emojis and 100% SVG vectors from svgrepo.

---

## System Architecture

```
+-------------------------------------------------------------------------+
|                         Buddio Web Dashboard                            |
|             (Port 3000 | 60-30-10 Palette | SVG Controls)               |
+-------------------+--------------------------------+--------------------+
                    |                                |
                    v                                v
+------------------------------------+  +---------------------------------+
|         Express & WS Server        |  |    Course Material RAG Index    |
|   Automation API & Event Dispatch  |  |    (materials/ Notes & Guides)  |
+-------------------+----------------+  +----------------+----------------+
                    |                                    |
                    v                                    v
+------------------------------------+  +---------------------------------+
|     Playwright Browser Manager     |  |       AI Reasoning Engine       |
|    (Headed Chromium + Cookies)     |  |   (Context + Options -> Choice) |
+-------------------+----------------+  +----------------+----------------+
                    |                                    |
                    v                                    v
+------------------------------------+------------------------------------+
|               Target Moodle DOM / Local Mock Quiz DOM                   |
|         - Detect .que container                                         |
|         - Parse .qtext & .answer labels                                 |
|         - Execute selector click & next navigation                      |
+-------------------------------------------------------------------------+
```

---

## Directory & Component Breakdown

```
buddio/
|-- .env.example                # Sample environment configuration
|-- .gitignore                  # Git ignore rules for node_modules and session data
|-- package.json                # Project dependencies and operational scripts
|-- tsconfig.json               # TypeScript compiler configuration
|-- README.md                   # System documentation and operational guides
|-- materials/                  # Course documents, lecture notes, syllabus files
|   |-- .gitkeep
|   `-- sample_fnb_course_notes.md  # Comprehensive FNB App Academy reference notes
`-- src/
    |-- ai/                     # AI decision engine and prompt synthesizers
    |   `-- solver.ts           # Grounded multi-choice solver (Gemini, OpenAI, Heuristics)
    |-- automation/             # Playwright automation, DOM parsers, and clickers
    |   |-- actionExecutor.ts   # Form input filler, radio selector, visual highlighter
    |   |-- browserManager.ts   # Headed Chromium lifecycle with persistent profile
    |   `-- domScanner.ts       # Dynamic extractor for Moodle .que question DOM structures
    |-- knowledge/              # Text chunking, indexing, and retrieval pipeline
    |   |-- docIngestor.ts      # Markdown and text document parser with chunking
    |   `-- retriever.ts        # Fast lexical and semantic token overlap search engine
    |-- public/                 # Control dashboard UI and mock quiz assets
    |   |-- app.js              # Dashboard event controller and autopilot loop
    |   |-- index.css           # 60-30-10 dark mode design system (Vanilla CSS)
    |   |-- index.html          # Control center interface with SVGs (no emojis)
    |   `-- mockQuiz.html       # High-fidelity Moodle LMS quiz test fixture
    |-- server/                 # HTTP and WebSocket backend API
    |   `-- server.ts           # Express server coordinating automation and RAG
    `-- tests/                  # Automated validation scripts and test fixtures
        |-- .gitkeep
        `-- testMockQuiz.ts     # End-to-end integration test against local mock quiz
```

---

## Installation & Setup

### Prerequisites
- Node.js (version 20 or later)
- npm (version 10 or later)

### Steps
1. Clone repository:
   ```bash
   git clone https://github.com/thulanesigasa/buddio.git
   cd buddio
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Install Playwright browser binaries:
   ```bash
   npx playwright install chromium
   ```
4. Configure environment:
   ```bash
   cp .env.example .env
   ```
5. Start development server:
   ```bash
   npm run dev
   ```
6. Access the Buddio control dashboard at `http://localhost:3000`.

---

## Verification & Testing

Buddio includes an automated end-to-end integration test that boots against the internal mock Moodle quiz (`/mock-quiz`), inspects the DOM, cross-references course materials, and verifies that questions are answered correctly:

```bash
# In terminal 1: Start the Buddio server
npm run dev

# In terminal 2: Execute automated quiz test
npm run test:quiz
```

---

## Operational Workflow

1. **Ingest Notes**: Place course notes, slides, or transcripts in the `materials/` directory.
2. **Start Control Center**: Run `npm run dev` and navigate to `http://localhost:3000`.
3. **Launch Browser**: Click **Launch Browser** to spawn the headed Chromium instance.
4. **Log In to LMS**: In the browser window, sign into the UJ LMS portal (`lms.uj.ac.za`) and navigate to the assessment.
5. **Execute**: Toggle **Co-Pilot** (step-by-step review) or **Autopilot** (automated navigation).
