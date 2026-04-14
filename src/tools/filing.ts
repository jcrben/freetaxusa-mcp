/**
 * Filing tools: file_extension, get_form_status
 * Phase 3 - stubbed with TODO markers
 */

import { z } from 'zod';
import { filterPII } from '../security/pii-filter.js';

export const fileExtensionSchema = z.object({
  estimatedTaxLiability: z.number().optional().describe('Estimated total tax liability'),
  estimatedPayments: z.number().optional().describe('Estimated payments already made'),
});

export async function fileExtension(_input: z.infer<typeof fileExtensionSchema>): Promise<Record<string, unknown>> {
  // TODO: Phase 3 implementation
  // 1. Navigate to extension filing section
  // 2. Fill estimated tax liability and payments
  // 3. Submit Form 4868
  // 4. Capture confirmation number
  return filterPII({
    success: false,
    error: 'not_implemented',
    message: 'file_extension is planned for Phase 3. Visit freetaxusa.com/extensions directly for manual filing.',
  });
}

export const getFormStatusSchema = z.object({});

export async function getFormStatus(): Promise<Record<string, unknown>> {
  // TODO: Phase 3 implementation
  // 1. Navigate to summary/overview page
  // 2. Read section completion status from sidebar or summary table
  // 3. Count errors per section
  // 4. Return structured status for all sections
  return filterPII({
    success: false,
    error: 'not_implemented',
    message: 'get_form_status is planned for Phase 3. Use get_tax_summary for a partial overview.',
  });
}
