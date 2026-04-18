/**
 * Browser context manager.
 * Manages a singleton persistent Chromium browser context for session persistence.
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_USER_DATA_DIR = resolve(homedir(), '.freetaxusa-mcp', 'browser-profile');
const TAX_YEAR = process.env.FREETAXUSA_TAX_YEAR ?? '2025';

export const BASE_URL = `https://www.freetaxusa.com/taxes${TAX_YEAR}/taxcontrol`;
export const AUTH_URL = `https://auth.freetaxusa.com/?PRMPT&appYear=${TAX_YEAR}`;

let browserContext: BrowserContext | null = null;
let activePage: Page | null = null;

/**
 * Async mutex to prevent concurrent page operations.
 */
let mutexPromise: Promise<void> = Promise.resolve();
let mutexResolve: (() => void) | null = null;

export async function acquirePageLock(): Promise<() => void> {
  // Wait for any existing lock
  await mutexPromise;

  // Create new lock
  let resolve: () => void;
  mutexPromise = new Promise<void>(r => {
    resolve = r;
  });
  mutexResolve = resolve!;

  return () => {
    mutexResolve = null;
    resolve!();
  };
}

function ensureUserDataDir(): string {
  const dir = process.env.FREETAXUSA_USER_DATA_DIR
    ? resolve(process.env.FREETAXUSA_USER_DATA_DIR.replace('~', homedir()))
    : DEFAULT_USER_DATA_DIR;

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    chmodSync(dir, 0o700);
  }
  return dir;
}

export async function getBrowserContext(): Promise<BrowserContext> {
  if (browserContext) return browserContext;

  const userDataDir = ensureUserDataDir();
  const headless = process.env.FREETAXUSA_HEADLESS !== 'false';

  browserContext = await chromium.launchPersistentContext(userDataDir, {
    headless,
    viewport: { width: 1280, height: 800 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    ignoreHTTPSErrors: false,
    bypassCSP: false,
  });

  return browserContext;
}

export async function getPage(): Promise<Page> {
  const ctx = await getBrowserContext();
  if (activePage && !activePage.isClosed()) {
    return activePage;
  }
  const pages = ctx.pages();
  activePage = pages.length > 0 ? pages[0] : await ctx.newPage();
  return activePage;
}

/**
 * Check if the current page indicates an expired session.
 * Returns true if the user needs to re-authenticate.
 */
export async function isSessionExpired(): Promise<boolean> {
  const page = await getPage();
  let url = page.url();

  // If on about:blank (e.g. after MCP server restart with existing browser profile),
  // try navigating to BASE_URL to recover the session before declaring it expired.
  if (url === 'about:blank') {
    try {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
      url = page.url();
    } catch {
      // Navigation failed — treat as expired
      return true;
    }
  }

  return url.includes('auth.freetaxusa.com') || url.includes('/login');
}

/**
 * Extract the current SID from the page URL.
 */
export function extractSidFromUrl(url: string): number | null {
  const match = url.match(/[?&]sid=(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Shut down the browser context gracefully.
 */
export async function closeBrowser(): Promise<void> {
  if (browserContext) {
    await browserContext.close();
    browserContext = null;
    activePage = null;
  }
}
