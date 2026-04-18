# freetaxusa-mcp backlog

## Upstream PRs to submit

### 1. Fix login selector for username-based accounts

FreeTaxUSA uses a username field (`id="username"`, `type="text"`) rather than an email
field. The original selector only matched email inputs.

**Change:** `src/tools/session.ts` line ~27 — broaden locator to include `input[type="text"]`
and `input[id*="user"]`. Also relax the Zod schema to accept username strings (not just
email format).

**PR title:** `fix(auth): support username-based login (FreeTaxUSA uses id="username" not email input)`

---

### 2. Handle MFA method-selection screen

FreeTaxUSA shows a method-selection screen before the code entry field. The original code
jumped straight to looking for the code input, missing this step.

**Change:** `src/tools/session.ts` — after detecting the MFA URL, check for a visible
"Email" button/option and click it before waiting for the code input.

**PR title:** `fix(auth): click email MFA option before waiting for code input`

---

### 3. Fix get_tax_summary / get_refund_estimate session-killing navigation

Both tools call `navigateToSid(FALLBACK_SIDS.summary)` (sid=90) immediately after checking
session validity. Navigating to sid=90 causes a redirect to `auth.freetaxusa.com`, which
kills the session — leaving the browser in a logged-out state for all subsequent calls.

**Both tools are currently disabled in server.ts** (commented out) to prevent accidental use.

**Fix options:**
- Check current page URL and only navigate if already near the summary section
- Don't navigate at all — read the sidebar/running estimate from whatever page is open
- Navigate to a safe intermediate SID first and confirm session is still valid before jumping to 90

**Affects:** `src/tools/overview.ts`, `src/server.ts`

---

## How to submit

```bash
cd ~/code/freetaxusa-mcp
# Confirm changes are on jcrben fork
git log --oneline -5
# Open PR against upstream
gh pr create --repo schwarztim/freetaxusa-mcp \
  --title "fix(auth): support username login and email MFA method selection" \
  --body "..."
```
