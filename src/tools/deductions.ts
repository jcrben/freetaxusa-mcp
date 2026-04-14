/**
 * Deductions tool: fill_deductions
 * Phase 3 - stubbed with TODO markers
 */

import { z } from 'zod';
import { filterPII } from '../security/pii-filter.js';

export const fillDeductionsSchema = z.object({
  type: z.enum(['standard', 'itemized']).describe('Deduction type'),
  items: z.array(z.object({
    category: z.string().describe('Deduction category (e.g., medical, taxes, interest, charity)'),
    description: z.string().describe('Description'),
    amount: z.number().describe('Amount'),
  })).optional().describe('Itemized deduction items (required if type is "itemized")'),
});

export async function fillDeductions(_input: z.infer<typeof fillDeductionsSchema>): Promise<Record<string, unknown>> {
  // TODO: Phase 3 implementation
  // 1. Navigate to deductions section
  // 2. Select standard vs itemized
  // 3. If itemized, fill each category page
  // 4. Save and check for validation errors
  return filterPII({
    success: false,
    error: 'not_implemented',
    message: 'fill_deductions is planned for Phase 3. Use read_current_page and navigate_section to manually enter deductions.',
  });
}
