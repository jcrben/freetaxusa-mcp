/**
 * Page-context registry: maps FreeTaxUSA page titles / SIDs to the MCP tools
 * that are designed for that page.
 *
 * read_current_page includes a `suggestedTools` field so the operator always
 * knows which tool to reach for without guessing.
 */

interface PageContext {
  /** Regex tested against the page <h1> title (case-insensitive) */
  titlePattern?: RegExp;
  /** SID numbers this entry applies to (in addition to or instead of title) */
  sids?: number[];
  /** Ordered list of MCP tool names appropriate for this page */
  tools: string[];
  /** One-line description of what this page is */
  description: string;
}

const PAGE_CONTEXTS: PageContext[] = [
  // ── Auth ──────────────────────────────────────────────────────────────────
  {
    titlePattern: /sign in|log in|login/i,
    tools: ['authenticate'],
    description: 'FreeTaxUSA login page',
  },
  {
    titlePattern: /verification|mfa|enter.*code/i,
    tools: ['submit_mfa_code'],
    description: 'MFA / email verification page',
  },

  // ── Personal ──────────────────────────────────────────────────────────────
  {
    titlePattern: /personal information|taxpayer info/i,
    tools: ['fill_taxpayer_info', 'fill_field', 'save_and_continue'],
    description: 'Taxpayer personal info (name, SSN, DOB, address)',
  },
  {
    titlePattern: /filing status/i,
    tools: ['fill_filing_status', 'save_and_continue'],
    description: 'Filing status selection',
  },

  // ── Income: W-2 ───────────────────────────────────────────────────────────
  {
    titlePattern: /w-?2|wages.*salaries/i,
    tools: ['fill_w2_income', 'fill_field', 'save_and_continue'],
    description: 'W-2 wages and withholding',
  },

  // ── Income: Investments (list page) ───────────────────────────────────────
  {
    titlePattern: /investment.*savings.*account/i,
    sids: [18],
    tools: ['click_button', 'read_current_page', 'screenshot'],
    description: 'Investment & savings accounts list — use click_button("Add Investment") to add, or Edit/Delete existing entries',
  },

  // ── Income: Investment type selection ─────────────────────────────────────
  {
    titlePattern: /what type of investment/i,
    tools: ['fill_field', 'save_and_continue'],
    description: 'Investment type selector (radio tiles) — use fill_field(label="Dividends (1099-DIV)", fieldType="radio"), then save_and_continue. Options: "Interest (1099-INT)", "Dividends (1099-DIV)", "Stock Sales (1099-B)", "Crypto, NFT Sales (1099-DA)", "Other Sales"',
  },

  // ── Income: Investment account name ──────────────────────────────────────
  {
    titlePattern: /tell us about your investment account/i,
    tools: ['fill_field', 'save_and_continue'],
    description: 'Investment account institution name — fill_field(label="Financial Institution", value="PAYER NAME - ACCT#"), then save_and_continue',
  },

  // ── Income: 1099-DIV entry method ────────────────────────────────────────
  {
    titlePattern: /how do you want to enter your 1099-div/i,
    tools: ['fill_field', 'save_and_continue'],
    description: '1099-DIV entry method selector — use fill_field(label="Enter it manually", fieldType="radio"), then save_and_continue',
  },

  // ── Income: 1099-INT entry method ────────────────────────────────────────
  {
    titlePattern: /how do you want to enter your 1099-int/i,
    tools: ['fill_field', 'save_and_continue'],
    description: '1099-INT entry method selector — use fill_field(label="Enter it manually", fieldType="radio"), then save_and_continue',
  },

  // ── Income: 1099-DIV entry form ───────────────────────────────────────────
  {
    titlePattern: /enter the dividend info|dividend.*1099-div|1099-div.*dividend/i,
    tools: ['fill_field', 'save_and_continue'],
    description: '1099-DIV dividend entry form — fill Box 1a (ordinary), Box 1b (qualified), Box 5 (Section 199A), Box 7 (foreign tax paid), then save_and_continue',
  },

  // ── Income: 1099-INT entry form ───────────────────────────────────────────
  {
    titlePattern: /enter the interest info|interest.*1099-int|1099-int.*interest/i,
    tools: ['fill_field', 'save_and_continue'],
    description: '1099-INT interest entry form — fill Box 1 (interest), Box 3 (US savings bonds), Box 6 (foreign tax paid), then save_and_continue',
  },

  // ── Income: 1099-B stock sales ────────────────────────────────────────────
  {
    titlePattern: /stocks.*investments.*sold|summary.*stock.*sales|review.*stock.*sales/i,
    tools: ['fill_field', 'click_button', 'save_and_continue'],
    description: '1099-B stock/investment sales list or review form',
  },

  // ── Income: 1099-R workflow ───────────────────────────────────────────────
  {
    titlePattern: /your retirement income/i,
    tools: ['click_button', 'read_current_page'],
    description: '1099-R list page — click "Add a 1099-R" to add a new entry, or Edit/Delete existing ones',
  },
  {
    titlePattern: /what type of 1099-r/i,
    tools: ['fill_field', 'save_and_continue'],
    description: '1099-R type selection — default "Form 1099-R" is correct; just call save_and_continue',
  },
  {
    titlePattern: /how do you want to enter your 1099-r/i,
    tools: ['fill_field', 'click_button'],
    description: '1099-R entry method — fill_field(label="Enter it manually", fieldType="radio", fieldName="entry_method"), then click_button("Continue")',
  },
  {
    titlePattern: /enter the retirement info/i,
    tools: ['fill_1099_income', 'save_and_continue'],
    description: '1099-R data entry form — use fill_1099_income with all box values, then save_and_continue',
  },
  {
    titlePattern: /double-check your payer info/i,
    tools: ['save_and_continue'],
    description: '1099-R payer confirmation page — verify payer name and EIN match the form, then save_and_continue',
  },
  {
    titlePattern: /did you withdraw any contributions/i,
    tools: ['fill_field', 'save_and_continue'],
    description: 'IRA contribution withdrawal question — answer No unless you withdrew the 2025 contribution itself',
  },
  {
    titlePattern: /ira basis and value/i,
    tools: ['fill_field', 'save_and_continue'],
    description: 'Form 8606 inputs: prior basis (2024 and earlier), Dec 31 IRA value, and any Jan–Apr contributions for prior year',
  },
  {
    titlePattern: /ira deduction summary/i,
    tools: ['click_button', 'screenshot'],
    description: 'IRA deduction summary — review the calculated deduction, then click Continue',
  },

  // ── Income: Other 1099s ───────────────────────────────────────────────────
  {
    titlePattern: /1099-misc|1099-nec|self.?employ|freelance/i,
    tools: ['fill_1099_income', 'fill_field', 'save_and_continue'],
    description: '1099-MISC / 1099-NEC / self-employment income',
  },

  // ── Deductions ────────────────────────────────────────────────────────────
  {
    titlePattern: /deduction|itemize|standard deduction/i,
    tools: ['fill_deductions', 'fill_field', 'save_and_continue'],
    description: 'Deductions page (standard or itemized)',
  },

  // ── Review / Summary ──────────────────────────────────────────────────────
  {
    titlePattern: /review.*return|tax summary|refund estimate/i,
    tools: ['review_return', 'screenshot', 'read_current_page'],
    description: 'Return review / summary — DO NOT use file_extension or submit tools',
  },

  // ── Generic fallback ──────────────────────────────────────────────────────
  {
    titlePattern: /.*/,
    tools: ['read_current_page', 'fill_field', 'click_button', 'save_and_continue', 'screenshot'],
    description: 'Unknown page — use generic tools',
  },
];

/**
 * Given the current page title and optional SID, return the applicable tool list
 * and page description from the registry.
 */
export function getPageContext(title: string, sid: number | null): { tools: string[]; description: string } {
  for (const ctx of PAGE_CONTEXTS) {
    const sidMatch = ctx.sids && sid !== null && ctx.sids.includes(sid);
    const titleMatch = ctx.titlePattern && ctx.titlePattern.test(title);

    // SID match takes priority; title match is the usual path
    if (sidMatch || (titleMatch && !ctx.sids)) {
      return { tools: ctx.tools, description: ctx.description };
    }
  }
  // Fallback (last entry always matches, so this is unreachable)
  return { tools: ['read_current_page', 'fill_field', 'click_button', 'save_and_continue'], description: 'Unknown page' };
}
