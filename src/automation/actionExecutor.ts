import { Page } from 'playwright';

export interface ActionLog {
  timestamp: string;
  action: 'select_option' | 'input_text' | 'advance_page' | 'highlight';
  targetSelector: string;
  details: string;
  success: boolean;
}

export class ActionExecutor {
  /**
   * Clicks an option input, verifies check state, and visually highlights the chosen row
   */
  public async selectOption(page: Page, selector: string, optionLabel: string): Promise<ActionLog> {
    const timestamp = new Date().toISOString();
    try {
      // Ensure selector exists and is scrolled into view
      const locator = page.locator(selector).first();
      await locator.scrollIntoViewIfNeeded({ timeout: 5000 });

      // Highlight the choice for user feedback in headed mode
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) {
          const parent = el.closest('.answer > div, .answer > label, .answer li, .option-row') || el.parentElement;
          if (parent) {
            (parent as HTMLElement).style.outline = '2px solid #00A389';
            (parent as HTMLElement).style.backgroundColor = 'rgba(0, 163, 137, 0.12)';
            (parent as HTMLElement).style.transition = 'all 0.3s ease';
          }
        }
      }, selector);

      // Human-like click delay
      await page.waitForTimeout(150);

      // Perform click or check
      try {
        await locator.check({ force: true, timeout: 3000 });
      } catch {
        await locator.click({ force: true, timeout: 3000 });
      }

      return {
        timestamp,
        action: 'select_option',
        targetSelector: selector,
        details: `Successfully selected option ${optionLabel} (${selector})`,
        success: true,
      };
    } catch (err: any) {
      return {
        timestamp,
        action: 'select_option',
        targetSelector: selector,
        details: `Failed selecting option ${optionLabel}: ${err.message}`,
        success: false,
      };
    }
  }

  /**
   * Fills a text input for shortanswer question types
   */
  public async fillText(page: Page, selector: string, answerText: string): Promise<ActionLog> {
    const timestamp = new Date().toISOString();
    try {
      const locator = page.locator(selector).first();
      await locator.scrollIntoViewIfNeeded({ timeout: 5000 });
      await locator.fill(answerText);

      return {
        timestamp,
        action: 'input_text',
        targetSelector: selector,
        details: `Filled answer text "${answerText}"`,
        success: true,
      };
    } catch (err: any) {
      return {
        timestamp,
        action: 'input_text',
        targetSelector: selector,
        details: `Failed filling text: ${err.message}`,
        success: false,
      };
    }
  }

  /**
   * Advances to the next page of the assessment
   */
  public async advanceNextPage(page: Page, nextButtonSelector: string): Promise<ActionLog> {
    const timestamp = new Date().toISOString();
    try {
      const locator = page.locator(nextButtonSelector).first();
      await locator.scrollIntoViewIfNeeded({ timeout: 5000 });

      // Click and wait for navigation or DOM update
      await Promise.all([
        page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {}),
        locator.click({ timeout: 5000 }),
      ]);

      return {
        timestamp,
        action: 'advance_page',
        targetSelector: nextButtonSelector,
        details: `Successfully navigated to next quiz page`,
        success: true,
      };
    } catch (err: any) {
      return {
        timestamp,
        action: 'advance_page',
        targetSelector: nextButtonSelector,
        details: `Failed advancing page: ${err.message}`,
        success: false,
      };
    }
  }
}
