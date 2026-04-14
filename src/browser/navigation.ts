/**
 * SID-based navigation and dynamic SID discovery.
 */

import { type Page } from 'playwright';
import { getPage, BASE_URL, extractSidFromUrl, isSessionExpired } from './context.js';
import { SidMap, FALLBACK_SIDS, normalizeSectionName } from '../types/sections.js';

let cachedSidMap: SidMap | null = null;

/**
 * Discover SID mappings from the navigation sidebar on the current page.
 * Scrapes links that contain ?sid=N patterns.
 */
export async function discoverSidMap(page: Page): Promise<SidMap> {
  if (cachedSidMap && Date.now() - cachedSidMap.discoveredAt < 300_000) {
    return cachedSidMap;
  }

  const sections = new Map<string, { name: string; sid: number; tab: string }>();
  const byName = new Map<string, number>();
  const bySid = new Map<number, string>();

  try {
    const links = await page.evaluate(() => {
      const results: Array<{ text: string; href: string }> = [];
      const anchors = document.querySelectorAll('a[href*="sid="]');
      anchors.forEach(a => {
        const text = (a as HTMLAnchorElement).textContent?.trim() ?? '';
        const href = (a as HTMLAnchorElement).getAttribute('href') ?? '';
        if (text && href) {
          results.push({ text, href });
        }
      });
      return results;
    });

    for (const link of links) {
      const sidMatch = link.href.match(/sid=(\d+)/);
      if (!sidMatch) continue;
      const sid = parseInt(sidMatch[1], 10);
      const name = link.text;
      const tab = categorizeSid(sid);

      const info = { name, sid, tab };
      sections.set(name.toLowerCase(), info);
      byName.set(name.toLowerCase(), sid);
      bySid.set(sid, name);
    }
  } catch {
    // Fall back to static map if discovery fails
  }

  cachedSidMap = { sections, byName, bySid, discoveredAt: Date.now() };
  return cachedSidMap;
}

function categorizeSid(sid: number): string {
  if (sid <= 10) return 'Start';
  if (sid <= 19) return 'Personal Information';
  if (sid <= 49) return 'Income';
  if (sid <= 79) return 'Deductions & Credits';
  if (sid <= 89) return 'Miscellaneous';
  if (sid <= 94) return 'Summary';
  if (sid <= 98) return 'State';
  return 'Filing';
}

/**
 * Resolve a section name or SID to a concrete SID number.
 */
export async function resolveSid(section?: string, sid?: number): Promise<number | null> {
  if (sid !== undefined) return sid;
  if (!section) return null;

  const page = await getPage();
  const sidMap = await discoverSidMap(page);

  // Try exact match first
  const lower = section.toLowerCase().trim();
  const found = sidMap.byName.get(lower);
  if (found !== undefined) return found;

  // Try normalized alias match
  const normalized = normalizeSectionName(section);
  if (normalized && FALLBACK_SIDS[normalized] !== undefined) {
    return FALLBACK_SIDS[normalized];
  }

  // Try partial match against discovered sections
  for (const [name, s] of sidMap.byName) {
    if (name.includes(lower) || lower.includes(name)) {
      return s;
    }
  }

  return null;
}

/**
 * Navigate to a specific SID page.
 * Returns the page title and actual SID after navigation.
 */
export async function navigateToSid(sid: number): Promise<{ title: string; sid: number; url: string }> {
  const page = await getPage();
  const url = `${BASE_URL}?sid=${sid}`;

  await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });

  // Check for session expiry after navigation
  if (await isSessionExpired()) {
    throw new Error('SESSION_EXPIRED');
  }

  // Check for state filing paywall
  const pageContent = await page.textContent('body');
  if (pageContent && (pageContent.includes('State Return') && pageContent.includes('$15.99'))) {
    throw new Error('STATE_PAYWALL: Navigation would trigger the $15.99 state filing purchase. Confirm before proceeding.');
  }

  const title = await page.title();
  const actualSid = extractSidFromUrl(page.url()) ?? sid;

  return { title, sid: actualSid, url: page.url() };
}

/**
 * Wait for the page to be fully loaded and stable.
 */
export async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
    // Fallback: just wait for DOM
  });
  // Brief pause for any JS rendering
  await page.waitForTimeout(500);
}

/**
 * Detect and handle unsaved changes dialog.
 */
export async function handleUnsavedChangesDialog(page: Page): Promise<void> {
  page.on('dialog', async dialog => {
    if (dialog.message().toLowerCase().includes('unsaved') ||
        dialog.message().toLowerCase().includes('leave')) {
      await dialog.accept();
    }
  });
}

/**
 * Clear the cached SID map (for testing or after session change).
 */
export function clearSidMapCache(): void {
  cachedSidMap = null;
}
