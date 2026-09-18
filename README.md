# Buddio

[![Node.js Version](https://img.shields.io/badge/node-v24%2B-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Playwright](https://img.shields.io/badge/Playwright-1.50-2EAD33?style=flat-square&logo=playwright)](https://playwright.dev)
[![UJ LMS](https://img.shields.io/badge/LMS-Moodle%20UJ-F37021?style=flat-square)](https://lms.uj.ac.za)
[![License: MIT](https://img.shields.io/badge/License-MIT-00A389?style=flat-square)](LICENSE)

Buddio is an automated browser co-pilot and assessment solver designed for participants of the FNB App Academy and University of Johannesburg (UJ) Business School Skills Development Program on the Moodle LMS (`lms.uj.ac.za`).

Buddio integrates Playwright headed browser automation, live DOM question extraction, a local Retrieval-Augmented Generation (RAG) knowledge engine that scans course materials, and an intelligent answering core with real-time browser actuation.

---

## Key Features

- **Headed Browser Automation**: Launches Chromium with persistent session state (`.browser_session`), allowing secure single login (SSO/Moodle authentication) while Buddio manages test navigation.
- **Dynamic Moodle DOM Parser**: Parses Moodle quiz containers (`.que.multichoice`, `.que.truefalse`, `.que.shortanswer`), capturing question prompts, code blocks, images, and labeled radio/checkbox options with precise selectors.
- **Course Material RAG Engine**: Indexes lecture notes, syllabus guides, and PDFs placed in `materials/` to supply verified contextual snippets to the answering engine.
- **Dual Operating Modes**:
  - **Co-Pilot Mode**: Inspects the question, retrieves knowledge, highlights recommended choices in the browser, displays reasoning on the dashboard, and waits for one-click user authorization.
  - **Autopilot Mode**: Sequentially answers questions and advances pages with configurable human-like interaction timing.
- **Built-in Mock LMS Testbed**: Includes a local mock Moodle quiz server (`/mock-quiz`) replicating authentic Moodle DOM markup for safe, risk-free validation before live testing.
- **60-30-10 Control Center**: Minimalist, dark-mode real-time web dashboard adhering strictly to the 60-30-10 color palette with zero emojis and 100% SVG vectors.

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

## Directory Structure

```
buddio/
|-- .gitignore                  # Git ignore rules for node_modules and session data
|-- package.json                # Project dependencies and operational scripts
|-- tsconfig.json               # TypeScript compiler configuration
|-- README.md                   # System documentation and operational guides
|-- materials/                  # Course documents, lecture notes, syllabus files
|   |-- .gitkeep
|   `-- sample_fnb_course_notes.md
`-- src/
    |-- ai/                     # AI decision engine and prompt synthesizers
    |   `-- solver.ts
    |-- automation/             # Playwright automation, DOM parsers, and clickers
    |   |-- actionExecutor.ts
    |   |-- browserManager.ts
    |   `-- domScanner.ts
    |-- knowledge/              # Text chunking, indexing, and retrieval pipeline
    |   |-- docIngestor.ts
    |   `-- retriever.ts
    |-- public/                 # Control dashboard UI and mock quiz assets
    |   |-- app.js
    |   |-- index.css
    |   |-- index.html
    |   `-- mockQuiz.html
    |-- server/                 # HTTP and WebSocket backend API
    |   `-- server.ts
    `-- tests/                  # Automated validation scripts and test fixtures
        |-- .gitkeep
        `-- testMockQuiz.ts
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

## Operational Guide

1. Place course notes, slides, or transcripts in the `materials/` directory.
2. Launch Buddio via `npm run dev`.
3. Open `http://localhost:3000` in your browser.
4. Click **Launch Browser** to open the headed Chromium instance.
5. In the headed window, sign into the UJ LMS portal (`lms.uj.ac.za`) and navigate to the assessment.
6. Toggle **Co-Pilot** or **Autopilot** mode in the Buddio dashboard.
7. Observe live question extraction, reference retrieval, and automated option selection.
