# FNB App Academy & UJ Business School: Mobile & Software Engineering Course Notes

## Module 1: Mobile Application Architecture & Principles

### 1.1 Cross-Platform Development & Frameworks
- **React Native & Expo**: Enables building native Android and iOS applications from a single TypeScript codebase. Expo provides a managed workflow simplifying build pipelines and native device API access.
- **Rendering Architecture**: React Native translates JSX components into native UI views (e.g., `<View>` maps to `android.view.ViewGroup` on Android and `UIView` on iOS), rather than rendering inside a webview.
- **SafeAreaView**: Crucial for adapting layouts around hardware cutouts, dynamic islands, notches, and software navigation bars.
- **Platform Navigation Chrome**:
  - Android: Status bar 24px, App bar 56px, Navigation bar 56px + 48px gesture zone.
  - iOS: Status bar 54px, Navigation bar 96px, Tab bar 56px, Home indicator 34px.

### 1.2 The 60-30-10 Design Principle
- **60% Dominant Base**: Establishes the foundational canvas background (e.g., deep dark obsidian `#0B0F19` or clean surface `#F8FAFC`).
- **30% Structural Surface**: Cards, panels, sidebars, headers, and form containers (`#131B2E` or `#FFFFFF`).
- **10% Focused Accent**: Reserved strictly for interactive call-to-actions, active indicators, and brand focus elements (`#00A389` signature turquoise).
- **Rule**: Avoid rainbow ad-hoc status colors; preserve intentional visual hierarchy.

---

## Module 2: TypeScript & Modern JavaScript

### 2.1 Types vs Interfaces
- `interface` is open for declaration merging and ideal for defining object shapes and public APIs.
- `type` aliases can express unions (`string | number`), primitives, tuples, and mapped types.
- TypeScript enforces compile-time safety and prevents common runtime `undefined is not a function` exceptions.

### 2.2 Asynchronous Execution & Event Loop
- JavaScript runs on a single-threaded event loop with microtask (Promises, `process.nextTick`) and macrotask (`setTimeout`, `setInterval`, I/O) queues.
- `async/await` is syntactic sugar over Promises, providing synchronous-looking syntax while executing non-blockingly.
- Always handle rejection using `try...catch` blocks or chaining `.catch()`.

---

## Module 3: APIs, Networking & Security

### 3.1 HTTP Verbs & Idempotence
- **GET**: Safe and idempotent. Retrieves resources without server side-effects.
- **POST**: Non-idempotent. Creates new resources or triggers processing.
- **PUT**: Idempotent. Replaces the entire resource state at the target URI.
- **PATCH**: Non-idempotent (or idempotent depending on payload). Modifies a portion of the resource.
- **DELETE**: Idempotent. Removes the specified resource. Subsequent calls produce the same state (resource does not exist).

### 3.2 Authentication & Token Handling
- Bearer Tokens: Standardized via the `Authorization: Bearer <token>` header.
- JWT (JSON Web Token): Composed of three Base64URL-encoded parts: Header (algorithm & token type), Payload (claims), and Signature (HMAC or RSA verification).
- Never store sensitive secrets or raw passwords in local storage or client bundles.

---

## Module 4: Git Version Control & Engineering Workflows

### 4.1 Branching & Trunk-Based Development
- `main` or `trunk`: Primary stable production branch.
- Feature branches: Isolated branches (`feat/<feature-name>`) for implementing discrete capabilities.
- Pull Requests (PRs): Code review gate ensuring linting, automated unit tests, and security scans pass before merging into the main branch.

### 4.2 Git Commands Reference
- `git fetch`: Downloads commits, files, and refs from a remote repository into the local repository without altering working files.
- `git pull`: Executes `git fetch` followed immediately by `git merge` into the current working branch.
- `git rebase`: Re-applies commits on top of another base tip, producing a linear commit history.

---

## Module 5: UJ Moodle LMS Assessment Structures

### 5.1 Question Formats
- Multiple Choice (Single Answer): Rendered with radio buttons (`<input type="radio">`) under `.que.multichoice`.
- Multiple Choice (Multiple Answers): Rendered with checkboxes (`<input type="checkbox">`).
- True/False: Simplified two-option radio group under `.que.truefalse`.
- Short Answer: Free-text single-line or multi-line input box under `.que.shortanswer`.

### 5.2 Form Submission & Page Transitions
- In Moodle quizzes, navigation is typically managed by a form with an action button `<input type="submit" name="next" value="Next page">`.
- The final page contains a submit attempt confirmation button.
