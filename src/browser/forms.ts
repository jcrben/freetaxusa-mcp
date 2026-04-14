/**
 * Form reading and filling via DOM inspection with accessible labels.
 * Uses Playwright's locator API with role/label targeting for resilience.
 */

import { type Page } from 'playwright';
import { type FormField } from '../types/tax.js';

/**
 * Read all form fields on the current page by querying input elements
 * and resolving their accessible labels from the DOM.
 */
export async function readFormFields(page: Page): Promise<FormField[]> {
  return page.evaluate(() => {
    const fields: Array<{
      label: string;
      value: string;
      type: string;
      required: boolean;
      options?: string[];
    }> = [];

    function getLabelForElement(el: HTMLElement): string {
      // Check aria-label
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel;

      // Check associated <label> via id
      const id = el.getAttribute('id');
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label?.textContent?.trim()) return label.textContent.trim();
      }

      // Check wrapping <label>
      const parentLabel = el.closest('label');
      if (parentLabel?.textContent?.trim()) return parentLabel.textContent.trim();

      // Check aria-labelledby
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl?.textContent?.trim()) return labelEl.textContent.trim();
      }

      // Fallback: name or placeholder
      return el.getAttribute('name') || el.getAttribute('placeholder') || '';
    }

    // Text inputs, textareas
    const textInputs = document.querySelectorAll<HTMLInputElement>(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="password"], input:not([type]), textarea'
    );
    for (const el of textInputs) {
      if (el.offsetParent === null) continue; // skip hidden
      fields.push({
        label: getLabelForElement(el),
        value: el.value ?? '',
        type: el.type === 'number' ? 'currency' : 'text',
        required: el.required,
      });
    }

    // Select dropdowns
    const selects = document.querySelectorAll<HTMLSelectElement>('select');
    for (const el of selects) {
      if (el.offsetParent === null) continue;
      const options = Array.from(el.options).map(o => o.text);
      fields.push({
        label: getLabelForElement(el),
        value: el.options[el.selectedIndex]?.text ?? '',
        type: 'select',
        required: el.required,
        options,
      });
    }

    // Radio buttons (group by name)
    const radioGroups = new Map<string, { label: string; value: string; options: string[] }>();
    const radios = document.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    for (const el of radios) {
      if (el.offsetParent === null) continue;
      const name = el.getAttribute('name') ?? '';
      if (!radioGroups.has(name)) {
        radioGroups.set(name, { label: '', value: '', options: [] });
      }
      const group = radioGroups.get(name)!;
      const optLabel = getLabelForElement(el);
      group.options.push(optLabel);
      if (el.checked) {
        group.value = optLabel;
        group.label = name;
      }
    }
    for (const [name, group] of radioGroups) {
      fields.push({
        label: group.label || name,
        value: group.value,
        type: 'radio',
        required: false,
        options: group.options,
      });
    }

    // Checkboxes
    const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    for (const el of checkboxes) {
      if (el.offsetParent === null) continue;
      fields.push({
        label: getLabelForElement(el),
        value: el.checked ? 'checked' : '',
        type: 'checkbox',
        required: el.required,
      });
    }

    return fields;
  }) as Promise<FormField[]>;
}

/**
 * Fill a text field by its accessible label.
 */
export async function fillFieldByLabel(page: Page, label: string, value: string): Promise<boolean> {
  try {
    const field = page.getByLabel(label, { exact: false });
    await field.waitFor({ state: 'visible', timeout: 5_000 });
    await field.clear();
    await field.fill(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Select a dropdown option by label.
 */
export async function selectByLabel(page: Page, label: string, optionText: string): Promise<boolean> {
  try {
    const select = page.getByLabel(label, { exact: false });
    await select.selectOption({ label: optionText });
    return true;
  } catch {
    try {
      const select = page.getByLabel(label, { exact: false });
      await select.selectOption({ value: optionText });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Click a radio button by its label text.
 */
export async function clickRadioByLabel(page: Page, label: string): Promise<boolean> {
  try {
    const radio = page.getByRole('radio', { name: label });
    await radio.check();
    return true;
  } catch {
    try {
      const labelEl = page.getByText(label, { exact: false });
      await labelEl.click();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Check or uncheck a checkbox by label.
 */
export async function setCheckbox(page: Page, label: string, checked: boolean): Promise<boolean> {
  try {
    const cb = page.getByRole('checkbox', { name: label });
    if (checked) {
      await cb.check();
    } else {
      await cb.uncheck();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Click the "Save and Continue" button on the current page.
 * Returns any validation errors found after submission.
 */
export async function clickSaveAndContinue(page: Page): Promise<string[]> {
  try {
    const saveButton =
      page.getByRole('button', { name: /save and continue/i }) ??
      page.getByRole('button', { name: /continue/i });

    await saveButton.click();
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(500);
  } catch {
    try {
      await page.locator('input[type="submit"][value*="Continue"], button[type="submit"]').first().click();
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    } catch {
      return ['Could not find Save and Continue button'];
    }
  }

  return await getValidationErrors(page);
}

/**
 * Extract validation errors from the current page.
 */
export async function getValidationErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];

  try {
    const errorElements = await page.locator('.error, .err, [class*="error"], [role="alert"]').all();
    for (const el of errorElements) {
      const text = await el.textContent();
      if (text?.trim()) {
        errors.push(text.trim());
      }
    }
  } catch {
    // No errors found
  }

  return errors;
}

/**
 * Get the page title from the heading or document title.
 */
export async function getPageTitle(page: Page): Promise<string> {
  try {
    const h1 = await page.locator('h1').first().textContent();
    if (h1?.trim()) return h1.trim();
  } catch {
    // fall through
  }
  return await page.title();
}
