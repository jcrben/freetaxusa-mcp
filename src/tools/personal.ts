/**
 * Personal info tools: fill_taxpayer_info, fill_filing_status
 */

import { z } from 'zod';
import { getPage, isSessionExpired, acquirePageLock } from '../browser/context.js';
import { navigateToSid, waitForPageReady } from '../browser/navigation.js';
import { fillFieldByLabel, selectByLabel, clickRadioByLabel, getValidationErrors } from '../browser/forms.js';
import { filterPII } from '../security/pii-filter.js';
import { FALLBACK_SIDS } from '../types/sections.js';

export const fillTaxpayerInfoSchema = z.object({
  firstName: z.string().min(1).describe('First name'),
  lastName: z.string().min(1).describe('Last name'),
  middleInitial: z.string().max(1).optional().describe('Middle initial'),
  suffix: z.string().optional().describe('Suffix (Jr, Sr, II-VI)'),
  ssn: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/).describe('Social Security Number (XXX-XX-XXXX)'),
  dob: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/).describe('Date of birth (MM/DD/YYYY)'),
  occupation: z.string().min(1).describe('Occupation'),
  address: z.object({
    street: z.string().min(1).describe('Street address'),
    apt: z.string().optional().describe('Apartment number'),
    city: z.string().min(1).describe('City'),
    state: z.string().length(2).describe('State code (e.g., PA)'),
    zip: z.string().regex(/^\d{5}$/).describe('ZIP code'),
    zip4: z.string().regex(/^\d{4}$/).optional().describe('ZIP+4'),
  }),
});

export async function fillTaxpayerInfo(input: z.infer<typeof fillTaxpayerInfoSchema>): Promise<Record<string, unknown>> {
  const release = await acquirePageLock();
  try {
    if (await isSessionExpired()) {
      return { success: false, error: 'session_expired', action: 'Call authenticate to log in.' };
    }

    const page = await getPage();

    // Navigate to taxpayer info page
    try {
      await navigateToSid(FALLBACK_SIDS.taxpayer_info);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'SESSION_EXPIRED') {
        return { success: false, error: 'session_expired', action: 'Call authenticate to log in.' };
      }
    }

    await waitForPageReady(page);

    const results: Record<string, boolean> = {};

    // Fill name fields
    results.firstName = await fillFieldByLabel(page, 'First Name', input.firstName);
    results.lastName = await fillFieldByLabel(page, 'Last Name', input.lastName);

    if (input.middleInitial) {
      results.middleInitial = await fillFieldByLabel(page, 'Middle Initial', input.middleInitial);
    }

    if (input.suffix) {
      results.suffix = await selectByLabel(page, 'Suffix', input.suffix);
    }

    // Fill SSN
    results.ssn = await fillFieldByLabel(page, 'SSN', input.ssn) ||
                  await fillFieldByLabel(page, 'Social Security', input.ssn);

    // Fill DOB
    results.dob = await fillFieldByLabel(page, 'Date of Birth', input.dob) ||
                  await fillFieldByLabel(page, 'DOB', input.dob) ||
                  await fillFieldByLabel(page, 'Birth', input.dob);

    // Fill occupation
    results.occupation = await fillFieldByLabel(page, 'Occupation', input.occupation);

    // Fill address
    results.street = await fillFieldByLabel(page, 'Street Address', input.address.street) ||
                     await fillFieldByLabel(page, 'Address', input.address.street);

    if (input.address.apt) {
      results.apt = await fillFieldByLabel(page, 'Apt', input.address.apt) ||
                    await fillFieldByLabel(page, 'Apartment', input.address.apt);
    }

    results.city = await fillFieldByLabel(page, 'City', input.address.city);
    results.state = await selectByLabel(page, 'State', input.address.state);
    results.zip = await fillFieldByLabel(page, 'Zip', input.address.zip) ||
                  await fillFieldByLabel(page, 'ZIP', input.address.zip);

    if (input.address.zip4) {
      results.zip4 = await fillFieldByLabel(page, 'ZIP+4', input.address.zip4) ||
                     await fillFieldByLabel(page, '+4', input.address.zip4);
    }

    const errors = await getValidationErrors(page);
    const allFilled = Object.values(results).every(v => v === true);

    return filterPII({
      success: allFilled && errors.length === 0,
      filled: results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } finally {
    release();
  }
}

export const fillFilingStatusSchema = z.object({
  status: z.enum(['single', 'married_joint', 'married_separate', 'head_of_household', 'qualifying_widow'])
    .describe('Filing status'),
});

const FILING_STATUS_LABELS: Record<string, string> = {
  'single': 'Single',
  'married_joint': 'Married filing jointly',
  'married_separate': 'Married filing separately',
  'head_of_household': 'Head of household',
  'qualifying_widow': 'Qualifying surviving spouse',
};

export async function fillFilingStatus(input: z.infer<typeof fillFilingStatusSchema>): Promise<Record<string, unknown>> {
  const release = await acquirePageLock();
  try {
    if (await isSessionExpired()) {
      return { success: false, error: 'session_expired', action: 'Call authenticate to log in.' };
    }

    const page = await getPage();

    // Navigate to filing status page (typically SID 12 or close to personal info)
    try {
      await navigateToSid(FALLBACK_SIDS.filing_status);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'SESSION_EXPIRED') {
        return { success: false, error: 'session_expired', action: 'Call authenticate to log in.' };
      }
    }

    await waitForPageReady(page);

    const label = FILING_STATUS_LABELS[input.status];
    const clicked = await clickRadioByLabel(page, label);

    if (!clicked) {
      // Try shorter labels
      const shortLabels: Record<string, string[]> = {
        'single': ['Single'],
        'married_joint': ['Married filing jointly', 'Married Filing Jointly', 'MFJ'],
        'married_separate': ['Married filing separately', 'Married Filing Separately', 'MFS'],
        'head_of_household': ['Head of household', 'Head of Household', 'HOH'],
        'qualifying_widow': ['Qualifying widow', 'Qualifying surviving spouse', 'QSS'],
      };
      let found = false;
      for (const alt of shortLabels[input.status] ?? []) {
        if (await clickRadioByLabel(page, alt)) {
          found = true;
          break;
        }
      }
      if (!found) {
        return filterPII({
          success: false,
          error: `Could not find radio button for filing status: ${label}`,
        });
      }
    }

    const errors = await getValidationErrors(page);

    return filterPII({
      success: errors.length === 0,
      filled: true,
      filingStatus: input.status,
      label,
      errors: errors.length > 0 ? errors : undefined,
    });
  } finally {
    release();
  }
}
