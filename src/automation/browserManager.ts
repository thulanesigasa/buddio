import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';

export interface BrowserConfig {
  headless?: boolean;
  userDataDir?: string;
  defaultUrl?: string;
  slowMo?: number;
}

export class BrowserManager {
  private context: BrowserContext | null = null;
  private activePage: Page | null = null;
  private config: BrowserConfig;

  constructor(config: BrowserConfig = {}) {
    this.config = {
      headless: config.headless ?? false,
      userDataDir: config.userDataDir || path.resolve(process.cwd(), '.browser_session'),
      defaultUrl: config.defaultUrl || 'https://lms.uj.ac.za/login/index.php',
      slowMo: config.slowMo ?? 100,
    };
  }

  /**
   * Launches headed Chromium with persistent context to retain login cookies and session tokens
   */
  public async launch(): Promise<Page> {
    if (this.activePage && !this.activePage.isClosed()) {
      return this.activePage;
    }

    if (!fs.existsSync(this.config.userDataDir!)) {
      fs.mkdirSync(this.config.userDataDir!, { recursive: true });
    }

    this.context = await chromium.launchPersistentContext(this.config.userDataDir!, {
      headless: this.config.headless,
      slowMo: this.config.slowMo,
      viewport: { width: 1280, height: 850 },
      args: [
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const pages = this.context.pages();
    this.activePage = pages.length > 0 ? pages[0] : await this.context.newPage();

    return this.activePage;
  }

  /**
   * Navigates to a specified URL (UJ LMS or mock test)
   */
  public async navigateTo(url?: string): Promise<Page> {
    const page = await this.launch();
    const targetUrl = url || this.config.defaultUrl!;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return page;
  }

  public getPage(): Page | null {
    return this.activePage && !this.activePage.isClosed() ? this.activePage : null;
  }

  public async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.activePage = null;
    }
  }

  public isRunning(): boolean {
    return !!(this.activePage && !this.activePage.isClosed());
  }
}
