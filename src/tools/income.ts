/**
 * Income tools: fill_w2_income, fill_1099_income
 */

import { z } from 'zod';
import { getPage, isSessionExpired, acquirePageLock } from '../browser/context.js';
import { clickSaveAndContinue, getPageTitle } from '../browser/forms.js';
import { waitForPageReady } from '../browser/navigation.js';
import { extractSidFromUrl } from '../browser/context.js';
import { filterPII } from '../security/pii-filter.js';

export const fillW2IncomeSchema = z.object({
  employerEin: z.string().describe('Employer EIN (XX-XXXXXXX)'),
  employerName: z.string().describe('Employer name'),
  wages: z.coerce.number().describe('Wages, tips, other compensation (Box 1)'),
  federalWithheld: z.coerce.number().describe('Federal income tax withheld (Box 2)'),
  stateWithheld: z.coerce.number().optional().describe('State income tax withheld (Box 17)'),
  socialSecurityWages: z.coerce.number().optional().describe('Social security wages (Box 3)'),
  medicareWages: z.coerce.number().optional().describe('Medicare wages (Box 5)'),
  state: z.string().optional().describe('State code (Box 15)'),
  stateId: z.string().optional().describe("Employer's state ID (Box 15)"),
});

export async function fillW2Income(_input: z.infer<typeof fillW2IncomeSchema>): Promise<Record<string, unknown>> {
  return filterPII({
    success: false,
    error: 'not_implemented',
    message: 'fill_w2_income is not yet implemented. Use read_current_page and fill_field to manually fill W-2 data.',
  });
}

export const fill1099IncomeSchema = z.object({
  // Payer info
  payerName: z.string().describe('Payer name as shown on the 1099-R'),
  payerAddress: z.string().optional().describe('Payer street address'),
  payerCity: z.string().optional().describe('Payer city'),
  payerState: z.string().optional().describe('Payer state code (2-letter, e.g. NM)'),
  payerZip: z.string().optional().describe('Payer ZIP code (5 digits)'),
  payerZipPlus: z.string().optional().describe('Payer ZIP+4'),
  payerEin: z.string().optional().describe('Payer EIN (XX-XXXXXXX)'),
  accountNumber: z.string().optional().describe('Account number shown on the 1099-R'),

  // Boxes
  box1Gross: z.coerce.number().describe('Box 1: Gross distribution'),
  box2aTaxable: z.coerce.number().optional().describe('Box 2a: Taxable amount (omit if taxable amount not determined)'),
  taxableAmountNotDetermined: z.boolean().optional().default(false).describe('Box 2b: Check if "Taxable amount not determined" is checked on the form'),
  totalDistribution: z.boolean().optional().default(false).describe('Box 2b: Check if "Total distribution" is checked on the form'),
  box4FederalWithheld: z.coerce.number().optional().describe('Box 4: Federal income tax withheld'),

  // Distribution code and type
  distributionCode: z.string().describe('Box 7: Distribution code (1, 2, G, J, etc.)'),
  isIraSepSimple: z.boolean().optional().default(false).describe('Box 7: Check the IRA/SEP/SIMPLE box if marked on the form'),

  // State
  stateWithheld: z.coerce.number().optional().describe('Box 14: State income tax withheld'),
  stateName: z.string().optional().describe('Box 15: State code (e.g. CA)'),
  statePayerId: z.string().optional().describe('Box 15: State/Payer state number (strip leading "CA-" prefix)'),
  stateDistribution: z.coerce.number().optional().describe('Box 16: State distribution amount'),
});

/**
 * Fill the 1099-R entry form using the known field names discovered via DOM inspection.
 * Must be called when the browser is already on the "Enter the retirement info from your 1099-R" page.
 *
 * Suggested workflow:
 *   1. Navigate to retirement income section (Income > Retirement Income)
 *   2. Click "Add a 1099-R"
 *   3. Select "Form 1099-R" type and save
 *   4. Select "Enter it manually" and continue
 *   5. Call fill_1099_income with form data
 *   6. Review the payer confirmation page and save again
 */
export async function fill1099Income(input: z.infer<typeof fill1099IncomeSchema>): Promise<Record<string, unknown>> {
  const release = await acquirePageLock();
  try {
    const page = await getPage();

    if (await isSessionExpired()) {
      return { success: false, error: 'session_expired', action: 'Call authenticate to log in.' };
    }

    // Fill all fields via page.evaluate using the known field names
    const result = await page.evaluate((data) => {
      const errors: string[] = [];

      function setField(name: string, value: string | boolean, isCheck = false): void {
        const el = document.querySelector<HTMLElement>(`[name="${name}"]`);
        if (!el) { errors.push(`field not found: ${name}`); return; }

        if (el.tagName === 'SELECT') {
          (el as HTMLSelectElement).value = value as string;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (isCheck) {
          (el as HTMLInputElement).checked = value as boolean;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          (el as HTMLInputElement).value = value as string;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // Payer info — append account number to name for easy identification in the list
      const nameWithAcct = data.accountNumber
        ? `${data.payerName} ${data.accountNumber}`
        : data.payerName;
      if (nameWithAcct) setField('pay_name', nameWithAcct);
      if (data.payerAddress) setField('pay_address', data.payerAddress);
      if (data.payerCity) setField('pay_city', data.payerCity);
      if (data.payerState) setField('pay_state', data.payerState);
      if (data.payerZip) setField('pay_zip', data.payerZip);
      if (data.payerZipPlus) setField('pay_zip_plus', data.payerZipPlus);
      if (data.payerEin) setField('pay_id_e-EIN', data.payerEin);
      if (data.accountNumber) setField('acct_number', data.accountNumber);

      // Boxes
      setField('gross_dist-CURRENCY', String(data.box1Gross));
      if (data.box2aTaxable !== undefined && data.box2aTaxable !== null) {
        setField('taxable_dist-CURRENCY', String(data.box2aTaxable));
      }
      setField('is_not_determined', !!data.taxableAmountNotDetermined, true);
      setField('is_total_dist', !!data.totalDistribution, true);
      if (data.box4FederalWithheld !== undefined && data.box4FederalWithheld !== null) {
        setField('fed_tax-CURRENCY', String(data.box4FederalWithheld));
      }

      // Distribution code and IRA flag
      setField('dist_code', data.distributionCode);
      setField('is_ira_sep', !!data.isIraSepSimple, true);

      // State
      if (data.stateWithheld !== undefined && data.stateWithheld !== null) {
        setField('state_tax-CURRENCY', String(data.stateWithheld));
      }
      if (data.stateName) setField('state_name', data.stateName);
      if (data.statePayerId) setField('state_pay_id_e', data.statePayerId);
      if (data.stateDistribution !== undefined && data.stateDistribution !== null) {
        setField('temp_state_dist-CURRENCY', String(data.stateDistribution));
      }

      return { errors };
    }, input);

    if (result.errors.length > 0) {
      return filterPII({ success: false, warnings: result.errors, message: 'Some fields could not be set — check page state' });
    }

    return filterPII({
      success: true,
      message: 'Form filled. Call save_and_continue to submit, then confirm payer info on the next page.',
      suggestion: 'After saving, FreeTaxUSA shows a "Let\'s double-check your payer info" confirmation — call save_and_continue again to proceed.',
    });
  } finally {
    release();
  }
}
