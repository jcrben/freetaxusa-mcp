/**
 * Income tools: fill_w2_income, fill_1099_income
 * Phase 2 - stubbed with TODO markers
 */

import { z } from 'zod';
import { filterPII } from '../security/pii-filter.js';

export const fillW2IncomeSchema = z.object({
  employerEin: z.string().describe('Employer EIN (XX-XXXXXXX)'),
  employerName: z.string().describe('Employer name'),
  wages: z.number().describe('Wages, tips, other compensation (Box 1)'),
  federalWithheld: z.number().describe('Federal income tax withheld (Box 2)'),
  stateWithheld: z.number().optional().describe('State income tax withheld (Box 17)'),
  socialSecurityWages: z.number().optional().describe('Social security wages (Box 3)'),
  medicareWages: z.number().optional().describe('Medicare wages (Box 5)'),
  state: z.string().optional().describe('State code (Box 15)'),
  stateId: z.string().optional().describe("Employer's state ID (Box 15)"),
});

export async function fillW2Income(_input: z.infer<typeof fillW2IncomeSchema>): Promise<Record<string, unknown>> {
  // TODO: Phase 2 implementation
  // 1. Navigate to W-2 income section (discover SID for W-2 entry)
  // 2. Click "Add W-2" if not on entry form
  // 3. Fill employer EIN and name fields
  // 4. Fill wage boxes (1, 2, 3, 5, etc.)
  // 5. Fill state withholding if provided
  // 6. Save and check for validation errors
  return filterPII({
    success: false,
    error: 'not_implemented',
    message: 'fill_w2_income is planned for Phase 2. Use read_current_page and navigate_section to manually fill W-2 data.',
  });
}

export const fill1099IncomeSchema = z.object({
  type: z.enum(['1099-INT', '1099-DIV', '1099-MISC', '1099-NEC', '1099-R', '1099-G', '1099-SSA'])
    .describe('Type of 1099 form'),
  payerName: z.string().describe('Payer name'),
  payerEin: z.string().optional().describe('Payer EIN'),
  amount: z.number().describe('Primary amount'),
  federalWithheld: z.number().optional().describe('Federal income tax withheld'),
});

export async function fill1099Income(_input: z.infer<typeof fill1099IncomeSchema>): Promise<Record<string, unknown>> {
  // TODO: Phase 2 implementation
  // 1. Navigate to appropriate 1099 section based on type
  // 2. Click "Add [1099 type]" if not on entry form
  // 3. Fill payer info and amounts
  // 4. Save and check for validation errors
  return filterPII({
    success: false,
    error: 'not_implemented',
    message: 'fill_1099_income is planned for Phase 2. Use read_current_page and navigate_section to manually fill 1099 data.',
  });
}
