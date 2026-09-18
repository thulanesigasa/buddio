import { Page } from 'playwright';

export interface QuestionOption {
  index: number;
  label: string; // e.g. "a.", "b.", or full text
  text: string;
  selector: string;
  inputType: 'radio' | 'checkbox' | 'text';
  checked: boolean;
}

export interface ExtractedQuestion {
  id: string;
  questionNumber: string;
  prompt: string;
  codeSnippet?: string;
  type: 'multichoice' | 'truefalse' | 'shortanswer' | 'unknown';
  options: QuestionOption[];
  containerSelector: string;
}

export interface PageScanResult {
  isQuizPage: boolean;
  isLoginPage: boolean;
  isSummaryPage: boolean;
  url: string;
  title: string;
  questions: ExtractedQuestion[];
  nextButtonSelector: string | null;
  finishButtonSelector: string | null;
}

export class DomScanner {
  /**
   * Evaluates the current page and extracts all quiz questions and navigational elements
   */
  public async scanPage(page: Page): Promise<PageScanResult> {
    const url = page.url();
    const title = await page.title();

    // Perform DOM evaluation inside browser context
    const scanData = await page.evaluate(() => {
      const url = window.location.href;
      const isLoginPage =
        !!document.querySelector('form#login, input#username, input#password') ||
        url.includes('/login/');

      const isSummaryPage =
        !!document.querySelector('.summary-table, .quizsummaryofattempt') ||
        document.body.innerText.includes('Summary of attempt');

      // Standard Moodle question containers are .que, but support generic fallback quiz classes
      const questionElements = Array.from(
        document.querySelectorAll('div.que, .quiz-question, .assessment-item, .question-card')
      );

      const isQuizPage = questionElements.length > 0 || url.includes('/attempt.php') || url.includes('quiz');

      const questions: any[] = [];

      questionElements.forEach((el, qIdx) => {
        // ID or class
        const elId = el.id || `question-${qIdx + 1}`;
        const numberEl = el.querySelector('.info .no, .qno, .question-number');
        const questionNumber = numberEl ? numberEl.textContent?.trim() || `${qIdx + 1}` : `${qIdx + 1}`;

        // Prompt text
        const promptEl = el.querySelector('.content .qtext, .question-text, .prompt');
        const prompt = promptEl ? (promptEl as HTMLElement).innerText.trim() : '';

        // Optional code block
        const codeEl = el.querySelector('pre, code');
        const codeSnippet = codeEl ? (codeEl as HTMLElement).innerText.trim() : undefined;

        // Determine question type
        let type: 'multichoice' | 'truefalse' | 'shortanswer' | 'unknown' = 'unknown';
        if (el.classList.contains('multichoice')) type = 'multichoice';
        else if (el.classList.contains('truefalse')) type = 'truefalse';
        else if (el.classList.contains('shortanswer')) type = 'shortanswer';
        else {
          if (el.querySelector('input[type="radio"]')) type = 'multichoice';
          else if (el.querySelector('input[type="text"]')) type = 'shortanswer';
        }

        const options: any[] = [];

        // Check for radio or checkbox answers
        const answerRows = el.querySelectorAll(
          '.answer > div, .answer > label, .answer li, .options-list > label, .option-row'
        );

        if (answerRows.length > 0) {
          answerRows.forEach((row, oIdx) => {
            const input = row.querySelector('input[type="radio"], input[type="checkbox"]') as HTMLInputElement | null;
            const labelText = (row as HTMLElement).innerText.trim();

            if (input) {
              const inputId = input.id;
              const selector = inputId ? `#${CSS.escape(inputId)}` : `#${elId} input[name="${input.name}"][value="${input.value}"]`;
              options.push({
                index: oIdx,
                label: String.fromCharCode(65 + oIdx), // A, B, C, D...
                text: labelText,
                selector,
                inputType: input.type,
                checked: input.checked,
              });
            }
          });
        } else {
          // Fallback: direct input search inside element
          const directInputs = el.querySelectorAll('input[type="radio"], input[type="checkbox"]');
          directInputs.forEach((inputEl, oIdx) => {
            const input = inputEl as HTMLInputElement;
            const label = el.querySelector(`label[for="${input.id}"]`);
            const text = label ? (label as HTMLElement).innerText.trim() : `Option ${oIdx + 1}`;
            options.push({
              index: oIdx,
              label: String.fromCharCode(65 + oIdx),
              text,
              selector: input.id ? `#${CSS.escape(input.id)}` : `input[name="${input.name}"]`,
              inputType: input.type,
              checked: input.checked,
            });
          });
        }

        // Fallback for shortanswer
        if (options.length === 0 && (type === 'shortanswer' || el.querySelector('input[type="text"]'))) {
          const textInput = el.querySelector('input[type="text"]') as HTMLInputElement | null;
          if (textInput) {
            options.push({
              index: 0,
              label: 'Text Answer',
              text: textInput.value || '',
              selector: textInput.id ? `#${CSS.escape(textInput.id)}` : `input[name="${textInput.name}"]`,
              inputType: 'text',
              checked: false,
            });
          }
        }

        questions.push({
          id: elId,
          questionNumber,
          prompt,
          codeSnippet,
          type,
          options,
          containerSelector: `#${elId}`,
        });
      });

      // Detect Next / Submit navigation buttons
      const nextBtn = document.querySelector(
        'input[type="submit"][name="next"], input[name="next"], #mod_quiz-next-nav, button.mod_quiz-next-nav, button[type="submit"], input[value="Next page"], input[value="Next"], .btn-next'
      ) as HTMLElement | null;

      let finishBtn = document.querySelector(
        'input[value="Finish attempt ..."], input[value*="Finish attempt"], .btn-finish, #mod_quiz-finish-nav'
      ) as HTMLElement | null;

      if (!finishBtn) {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        finishBtn = (buttons.find((b) => ((b as HTMLElement).innerText || (b as HTMLInputElement).value || '').includes('Finish attempt')) as HTMLElement) || null;
      }

      let nextButtonSelector: string | null = null;
      if (nextBtn) {
        if (nextBtn.id) nextButtonSelector = `#${CSS.escape(nextBtn.id)}`;
        else if (nextBtn.getAttribute('name')) nextButtonSelector = `input[name="${nextBtn.getAttribute('name')}"]`;
        else nextButtonSelector = 'input[type="submit"][name="next"], .btn-next, input[value="Next page"]';
      }

      let finishButtonSelector: string | null = null;
      if (finishBtn) {
        if (finishBtn.id) finishButtonSelector = `#${CSS.escape(finishBtn.id)}`;
        else finishButtonSelector = 'input[value*="Finish attempt"]';
      }

      return {
        isQuizPage,
        isLoginPage,
        isSummaryPage,
        questions,
        nextButtonSelector,
        finishButtonSelector,
      };
    });

    return {
      url,
      title,
      ...scanData,
    };
  }
}
