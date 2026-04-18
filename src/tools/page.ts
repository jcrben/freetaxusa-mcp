/**
 * Page tools: read_current_page, save_and_continue, navigate_section
 */

import { z } from 'zod';
import { getPage, isSessionExpired, extractSidFromUrl, acquirePageLock } from '../browser/context.js';
import { readFormFields, clickSaveAndContinue, getPageTitle } from '../browser/forms.js';
import { resolveSid, navigateToSid, waitForPageReady } from '../browser/navigation.js';
import { filterPII } from '../security/pii-filter.js';

export const readCurrentPageSchema = z.object({});

export async function readCurrentPage(): Promise<Record<string, unknown>> {
  const release = await acquirePageLock();
  try {
    const page = await getPage();

    if (await isSessionExpired()) {
      return { success: false, error: 'session_expired', action: 'Call authenticate to log in.' };
    }

    const title = await getPageTitle(page);
    const url = page.url();
    const sid = extractSidFromUrl(url);
    const fields = await readFormFields(page);

    // Also capture visible buttons and navigation links so Claude can
    // understand what actions are available on the current page.
    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll<HTMLElement>('button, input[type="submit"], input[type="button"], a[href]'))
        .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (el as HTMLElement).offsetParent !== null;
        })
        .map(el => ({
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim() ?? (el as HTMLInputElement).value ?? '',
          href: (el as HTMLAnchorElement).href ?? null,
        }))
        .filter(b => b.text.length > 0)
        .slice(0, 30); // cap to avoid flooding
    });

    return filterPII({
      success: true,
      pageTitle: title,
      sid,
      url,
      fields,
      buttons,
    });
  } finally {
    release();
  }
}

export const saveAndContinueSchema = z.object({});

export async function saveAndContinue(): Promise<Record<string, unknown>> {
  const release = await acquirePageLock();
  try {
    const page = await getPage();

    if (await isSessionExpired()) {
      return { success: false, error: 'session_expired', action: 'Call authenticate to log in.' };
    }

    const errors = await clickSaveAndContinue(page);

    await waitForPageReady(page);
    const newTitle = await getPageTitle(page);
    const newUrl = page.url();
    const newSid = extractSidFromUrl(newUrl);

    if (errors.length > 0) {
      return filterPII({
        success: false,
        errors,
        currentPage: newTitle,
        currentSid: newSid,
      });
    }

    return filterPII({
      success: true,
      nextPage: newTitle,
      nextSid: newSid,
    });
  } finally {
    release();
  }
}

export const navigateSectionSchema = z.object({
  section: z.string().optional().describe('Section name (e.g., "income", "deductions", "personal info")'),
  sid: z.coerce.number().optional().describe('Direct SID number to navigate to'),
}).refine(data => data.section || data.sid !== undefined, {
  message: 'Either section name or sid must be provided',
});

export async function navigateSection(input: { section?: string; sid?: number }): Promise<Record<string, unknown>> {
  const release = await acquirePageLock();
  try {
    if (await isSessionExpired()) {
      return { success: false, error: 'session_expired', action: 'Call authenticate to log in.' };
    }

    const targetSid = await resolveSid(input.section, input.sid);
    if (targetSid === null) {
      return {
        success: false,
        error: 'section_not_found',
        message: `Could not resolve section "${input.section}" to a SID. Try using a direct SID number.`,
      };
    }

    try {
      const result = await navigateToSid(targetSid);
      return filterPII({
        success: true,
        navigated: true,
        currentPage: result.title,
        sid: result.sid,
        url: result.url,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'SESSION_EXPIRED') {
        return { success: false, error: 'session_expired', action: 'Call authenticate to log in.' };
      }
      if (message.startsWith('STATE_PAYWALL')) {
        return { success: false, error: 'state_paywall', message };
      }
      return filterPII({ success: false, error: 'navigation_failed', message });
    }
  } finally {
    release();
  }
}
