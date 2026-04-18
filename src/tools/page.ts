/**
 * Page tools: read_current_page, save_and_continue, navigate_section, screenshot
 */

import { z } from 'zod';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPage, isSessionExpired, extractSidFromUrl, acquirePageLock } from '../browser/context.js';
import { readFormFields, clickSaveAndContinue, getPageTitle, fillFieldByLabel, selectByLabel, clickRadioByLabel, setCheckbox } from '../browser/forms.js';
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
        .slice(0, 100); // cap to avoid flooding
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

    const page = await getPage();

    // FreeTaxUSA uses JavaScript-driven nav buttons (no href links).
    // When a section name is provided, try clicking the nav button first —
    // this avoids the server-side redirect that page.goto() triggers.
    if (input.section) {
      try {
        const sectionLower = input.section.toLowerCase();
        const navButton = page.locator('button').filter({ hasText: new RegExp(sectionLower, 'i') }).first();
        const found = await navButton.count().then(n => n > 0).catch(() => false);
        if (found) {
          await navButton.click();
          await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
          await waitForPageReady(page);
          const url = page.url();
          if (await isSessionExpired()) {
            return { success: false, error: 'session_expired', action: 'Call authenticate to log in.' };
          }
          const { extractSidFromUrl } = await import('../browser/context.js');
          const sid = extractSidFromUrl(url);
          const title = (await page.locator('h1').first().textContent().catch(() => null)) ?? await page.title();
          return filterPII({ success: true, navigated: true, currentPage: title, sid, url });
        }
      } catch {
        // fall through to SID-based navigation
      }
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

export const clickButtonSchema = z.object({
  text: z.string().describe('Visible text of the button or link to click (partial match, case-insensitive)'),
  index: z.coerce.number().optional().default(0).describe('0-based index when multiple elements match (default: 0 = first match)'),
});

export async function clickButton(input: z.infer<typeof clickButtonSchema>): Promise<Record<string, unknown>> {
  const release = await acquirePageLock();
  try {
    const page = await getPage();
    const textRe = new RegExp(input.text, 'i');
    const idx = input.index ?? 0;

    // FreeTaxUSA uses Bootstrap dropdown btn-group menus for actions like Start/Edit/Delete.
    // The visible "button" is a dropdown toggle (data-bs-toggle="dropdown"); the actual
    // navigation item is a sibling .dropdown-item <a> that is hidden until the dropdown opens.
    //
    // Strategy:
    // 1. Find matching dropdown toggles (buttons with data-bs-toggle="dropdown" + matching text).
    //    If the nth one exists, JS-click it to open the dropdown, then click the first
    //    .dropdown-item inside the same .btn-group that also matches the text.
    // 2. Fall back to finding regular (non-toggle) visible buttons/links and clicking them.

    const toggles = page.locator('button[data-bs-toggle="dropdown"]').filter({ hasText: textRe });
    const toggleCount = await toggles.count().catch(() => 0);

    if (toggleCount > idx) {
      const toggle = toggles.nth(idx);
      // Open the dropdown via JS click (bypasses any overlay interception)
      await toggle.evaluate((node: HTMLElement) => node.click());
      await page.waitForTimeout(300);

      // After opening, collect all newly-visible links/buttons for debugging
      // FreeTaxUSA may not use .dropdown-item class; search broadly
      const allItems = page.locator('.dropdown-menu:visible a:visible, .dropdown-menu:visible button:visible, a.dropdown-item:visible, button.dropdown-item:visible');
      const allItemTexts = await allItems.allTextContents().catch(() => [] as string[]);

      // Also grab the toggle button's aria/data context for debugging
      const toggleDebug = await toggle.evaluate((node: HTMLElement) => ({
        text: node.textContent?.trim(),
        class: node.className,
        dmwb: node.getAttribute('data-wmb'),
        parentHTML: node.parentElement?.outerHTML?.substring(0, 600),
      })).catch(() => null);

      // Find matching item
      const item = allItems.filter({ hasText: textRe }).first();
      const itemCount = await item.count().catch(() => 0);
      if (itemCount > 0) {
        try {
          await item.click({ timeout: 5_000 });
        } catch {
          await item.evaluate((node: HTMLElement) => node.click());
        }
      } else {
        // No matching item found — close dropdown and report what was available
        await page.keyboard.press('Escape');
        const url2 = page.url();
        const title2 = (await page.locator('h1').first().textContent().catch(() => null)) ?? await page.title();
        return filterPII({
          success: false,
          error: 'dropdown_item_not_found',
          message: `Opened dropdown toggle for "${input.text}" but found no matching item. Available items: ${JSON.stringify(allItemTexts)}. Toggle debug: ${JSON.stringify(toggleDebug)}`,
          currentPage: title2,
          sid: extractSidFromUrl(url2),
          url: url2,
        });
      }
    } else {
      // Regular button/link (not a dropdown toggle)
      const el = page.locator('button:visible, a:visible, input[type="submit"]:visible, input[type="button"]:visible')
        .filter({ hasText: textRe })
        .nth(idx);

      const found = await el.count().then(n => n > 0).catch(() => false);
      if (!found) {
        return { success: false, error: 'element_not_found', message: `No button/link with text matching "${input.text}"` };
      }

      try {
        await el.click({ timeout: 5_000 });
      } catch {
        await el.evaluate((node: HTMLElement) => node.click());
      }
    }

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await waitForPageReady(page);

    const url = page.url();
    const sid = extractSidFromUrl(url);
    const title = (await page.locator('h1').first().textContent().catch(() => null)) ?? await page.title();

    return filterPII({ success: true, clickedText: input.text, currentPage: title, sid, url });
  } finally {
    release();
  }
}

export const fillFieldSchema = z.object({
  label: z.string().describe('Accessible label of the field (partial match, case-insensitive)'),
  value: z.string().describe('Value to enter'),
  fieldType: z.enum(['text', 'select', 'radio', 'checkbox']).optional().default('text').describe('Field type (default: text)'),
  checked: z.coerce.boolean().optional().describe('For checkbox: true=check, false=uncheck'),
});

export async function fillField(input: z.infer<typeof fillFieldSchema>): Promise<Record<string, unknown>> {
  const release = await acquirePageLock();
  try {
    const page = await getPage();

    if (await isSessionExpired()) {
      return { success: false, error: 'session_expired', action: 'Call authenticate to log in.' };
    }

    let filled = false;
    switch (input.fieldType) {
      case 'select':
        filled = await selectByLabel(page, input.label, input.value);
        break;
      case 'radio':
        filled = await clickRadioByLabel(page, input.label);
        break;
      case 'checkbox':
        filled = await setCheckbox(page, input.label, input.checked ?? input.value === 'true');
        break;
      default:
        filled = await fillFieldByLabel(page, input.label, input.value);
    }

    if (!filled) {
      return { success: false, error: 'field_not_found', message: `No field matching label "${input.label}"` };
    }

    return { success: true, label: input.label, value: input.value };
  } finally {
    release();
  }
}

export const screenshotSchema = z.object({
  path: z.string().optional().describe('Output file path (default: /tmp/freetaxusa-screenshot.png)'),
  fullPage: z.coerce.boolean().optional().default(true).describe('Capture full scrollable page (default: true)'),
});

export async function screenshot(input: z.infer<typeof screenshotSchema>): Promise<Record<string, unknown>> {
  const release = await acquirePageLock();
  try {
    const page = await getPage();
    const outPath = input.path ?? join(tmpdir(), 'freetaxusa-screenshot.png');
    await page.screenshot({ path: outPath, fullPage: input.fullPage ?? true });
    return { success: true, path: outPath };
  } finally {
    release();
  }
}
