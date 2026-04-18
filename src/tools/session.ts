/**
 * Session tools: authenticate, submit_mfa_code, get_session_status
 */

import { z } from 'zod';
import { getPage, isSessionExpired, extractSidFromUrl, AUTH_URL, BASE_URL, acquirePageLock } from '../browser/context.js';
import { discoverSidMap, waitForPageReady } from '../browser/navigation.js';
import { filterPII } from '../security/pii-filter.js';
import type { SessionStatus } from '../types/tax.js';
import { getPageTitle } from '../browser/forms.js';

export const authenticateSchema = z.object({
  email: z.string().describe('FreeTaxUSA account username or email'),
  password: z.string().min(1).describe('FreeTaxUSA account password'),
});

export async function authenticate(input: z.infer<typeof authenticateSchema>): Promise<Record<string, unknown>> {
  const release = await acquirePageLock();
  try {
    const page = await getPage();

    await page.goto(AUTH_URL, { waitUntil: 'networkidle', timeout: 20_000 });
    await waitForPageReady(page);

    // Fill login form
    const emailField = page.getByLabel(/email|username/i).or(page.locator('input[type="email"], input[type="text"], input[name*="email"], input[name*="user"], input[id*="user"], input[id*="email"]')).first();
    await emailField.fill(input.email);

    const passwordField = page.getByLabel(/password/i).or(page.locator('input[type="password"]')).first();
    await passwordField.fill(input.password);

    // Click sign in
    const signInButton = page.getByRole('button', { name: /sign in|log in|continue/i }).first();
    await signInButton.click();

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await waitForPageReady(page);

    // Handle MFA method-selection screen if present
    const urlAfterLogin = page.url();
    if (urlAfterLogin.includes('mfa') || urlAfterLogin.includes('verify') || urlAfterLogin.includes('2fa') || urlAfterLogin.includes('EmailVerification')) {
      // FreeTaxUSA uses a visually-hidden radio + visible label pattern —
      // click the label (for="emailOption") rather than the hidden input.
      const emailLabel = page.locator('label[for="emailOption"], label:has-text("email")').first();
      const emailLabelVisible = await emailLabel.isVisible().catch(() => false);
      if (emailLabelVisible) {
        await emailLabel.click();
      } else {
        // Fall back: dispatchEvent on the hidden radio input
        const emailInput = page.locator('input[value="email"], input[id="emailOption"]').first();
        const emailInputExists = await emailInput.count().then(n => n > 0).catch(() => false);
        if (emailInputExists) {
          await emailInput.dispatchEvent('click');
        }
      }

      // Submit the method selection form
      const methodSubmit = page.getByRole('button', { name: /continue|submit|send/i }).first();
      const methodSubmitVisible = await methodSubmit.isVisible().catch(() => false);
      if (methodSubmitVisible) {
        await methodSubmit.click();
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
        await waitForPageReady(page);
      }

      return filterPII({
        authenticated: false,
        mfaRequired: true,
        currentUrl: page.url(),
        message: 'MFA code sent. Call submit_mfa_code with the code from your email.',
      });
    }

    // Check if we landed on the tax app
    const finalUrl = page.url();
    const authenticated = finalUrl.includes('freetaxusa.com') && !finalUrl.includes('auth.freetaxusa.com');

    if (authenticated) {
      await discoverSidMap(page);
    }

    const taxYear = process.env.FREETAXUSA_TAX_YEAR ?? '2025';

    return filterPII({
      authenticated,
      taxYear,
      currentUrl: finalUrl,
      message: authenticated ? 'Successfully authenticated.' : 'Authentication failed. Check credentials.',
    });
  } finally {
    release();
  }
}

export const submitMfaCodeSchema = z.object({
  code: z.string().min(1).describe('The MFA verification code from your email or authenticator app'),
});

export async function submitMfaCode(input: z.infer<typeof submitMfaCodeSchema>): Promise<Record<string, unknown>> {
  const release = await acquirePageLock();
  try {
    const page = await getPage();

    const currentUrl = page.url();
    const onCodePage = currentUrl.includes('EmailVerification') || currentUrl.includes('mfa') || currentUrl.includes('2fa') || currentUrl.includes('verify');

    if (!onCodePage) {
      return filterPII({
        success: false,
        currentUrl,
        message: 'Not on MFA code-entry page. Call authenticate first.',
      });
    }

    // Target the actual text input — avoid the FAQ help button that also matches aria-label containing "code"
    const mfaField = page.locator('input[type="text"], input[type="number"], input[type="tel"]').first();
    await mfaField.fill(input.code);

    const verifyButton = page.getByRole('button', { name: /verify|submit|continue/i }).first();
    await verifyButton.click();

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await waitForPageReady(page);

    const finalUrl = page.url();
    const authenticated = finalUrl.includes('freetaxusa.com') && !finalUrl.includes('auth.freetaxusa.com');

    if (authenticated) {
      await discoverSidMap(page);
    }

    const taxYear = process.env.FREETAXUSA_TAX_YEAR ?? '2025';

    return filterPII({
      authenticated,
      taxYear,
      currentUrl: finalUrl,
      message: authenticated ? 'Successfully authenticated.' : 'MFA verification failed. Code may be expired — call authenticate again.',
    });
  } finally {
    release();
  }
}

export const getSessionStatusSchema = z.object({});

export async function getSessionStatus(): Promise<Record<string, unknown>> {
  const release = await acquirePageLock();
  try {
    const page = await getPage();
    const url = page.url();
    const expired = await isSessionExpired();

    if (expired || url === 'about:blank') {
      return filterPII({
        active: false,
        taxYear: null,
        currentSection: null,
        currentSid: null,
        message: 'No active session. Call authenticate first.',
      } satisfies SessionStatus & { message: string });
    }

    const sid = extractSidFromUrl(url);
    const title = await getPageTitle(page);

    // Try to get section name from SID map
    const sidMap = await discoverSidMap(page);
    const sectionName = sid !== null ? (sidMap.bySid.get(sid) ?? null) : null;

    const taxYear = process.env.FREETAXUSA_TAX_YEAR ?? '2025';

    return filterPII({
      active: true,
      taxYear,
      currentSection: sectionName ?? title,
      currentSid: sid,
    } satisfies SessionStatus);
  } finally {
    release();
  }
}
