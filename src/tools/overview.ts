/**
 * Overview tools: get_tax_summary, get_refund_estimate
 */

import { z } from 'zod';
import { getPage, isSessionExpired, acquirePageLock, extractSidFromUrl } from '../browser/context.js';
import { navigateToSid, waitForPageReady, discoverSidMap } from '../browser/navigation.js';
import { filterPII } from '../security/pii-filter.js';
import { FALLBACK_SIDS } from '../types/sections.js';

export const getTaxSummarySchema = z.object({});

export async function getTaxSummary(): Promise<Record<string, unknown>> {
  const release = await acquirePageLock();
  try {
    if (await isSessionExpired()) {
      return { success: false, error: 'session_expired', action: 'Call authenticate to log in.' };
    }

    const page = await getPage();

    // Navigate to summary page
    try {
      await navigateToSid(FALLBACK_SIDS.summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'SESSION_EXPIRED') {
        return { success: false, error: 'session_expired', action: 'Call authenticate to log in.' };
      }
    }

    await waitForPageReady(page);

    // Extract summary data from the page
    const summary = await page.evaluate(() => {
      const getText = (selectors: string[]): string | null => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el?.textContent?.trim()) return el.textContent.trim();
        }
        return null;
      };

      const body = document.body.textContent ?? '';

      // Look for refund/owed amounts
      const refundMatch = body.match(/(?:refund|Refund)[:\s]*\$?([\d,]+\.?\d*)/);
      const owedMatch = body.match(/(?:owe|Owe|amount due|Amount Due)[:\s]*\$?([\d,]+\.?\d*)/);
      const agiMatch = body.match(/(?:AGI|adjusted gross income)[:\s]*\$?([\d,]+\.?\d*)/i);
      const statusMatch = body.match(/(?:filing status|Filing Status)[:\s]*(Single|Married|Head of Household|Qualifying)/i);

      // Look for completed sections
      const completedSections: string[] = [];
      const checkmarks = document.querySelectorAll('.complete, .completed, [class*="check"], .done');
      checkmarks.forEach(el => {
        const text = el.closest('tr, li, div')?.textContent?.trim();
        if (text) completedSections.push(text);
      });

      return {
        refundAmount: refundMatch ? refundMatch[1] : null,
        owedAmount: owedMatch ? owedMatch[1] : null,
        agi: agiMatch ? agiMatch[1] : null,
        filingStatus: statusMatch ? statusMatch[1] : null,
        completedSections,
      };
    });

    const amount = summary.refundAmount
      ? parseFloat(summary.refundAmount.replace(/,/g, ''))
      : summary.owedAmount
        ? parseFloat(summary.owedAmount.replace(/,/g, ''))
        : null;

    const refundOrOwed = summary.refundAmount ? 'refund' : summary.owedAmount ? 'owed' : 'unknown';

    return filterPII({
      success: true,
      refundOrOwed,
      amount,
      agi: summary.agi ? parseFloat(summary.agi.replace(/,/g, '')) : null,
      filingStatus: summary.filingStatus,
      sectionsComplete: summary.completedSections,
    });
  } finally {
    release();
  }
}

export const getRefundEstimateSchema = z.object({});

export async function getRefundEstimate(): Promise<Record<string, unknown>> {
  const release = await acquirePageLock();
  try {
    if (await isSessionExpired()) {
      return { success: false, error: 'session_expired', action: 'Call authenticate to log in.' };
    }

    const page = await getPage();

    // Try to read the refund estimate from the current page sidebar first
    // FreeTaxUSA often shows a running estimate in the sidebar
    const estimate = await page.evaluate(() => {
      const body = document.body.textContent ?? '';

      const federalRefundMatch = body.match(/(?:Federal\s+)?(?:Refund|refund)[:\s]*\$?([\d,]+\.?\d*)/i);
      const federalOwedMatch = body.match(/(?:Federal\s+)?(?:Amount\s+(?:Due|Owed)|owe)[:\s]*\$?([\d,]+\.?\d*)/i);
      const stateRefundMatch = body.match(/(?:State\s+)?(?:Refund|refund)[:\s]*\$?([\d,]+\.?\d*)/i);
      const stateOwedMatch = body.match(/(?:State\s+)?(?:Amount\s+(?:Due|Owed))[:\s]*\$?([\d,]+\.?\d*)/i);

      return {
        federalRefund: federalRefundMatch ? federalRefundMatch[1] : null,
        federalOwed: federalOwedMatch ? federalOwedMatch[1] : null,
        stateRefund: stateRefundMatch ? stateRefundMatch[1] : null,
        stateOwed: stateOwedMatch ? stateOwedMatch[1] : null,
      };
    });

    const parseAmount = (val: string | null): number | undefined =>
      val ? parseFloat(val.replace(/,/g, '')) : undefined;

    return filterPII({
      success: true,
      federalRefund: parseAmount(estimate.federalRefund),
      federalOwed: parseAmount(estimate.federalOwed),
      stateRefund: parseAmount(estimate.stateRefund),
      stateOwed: parseAmount(estimate.stateOwed),
    });
  } finally {
    release();
  }
}
