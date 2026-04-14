/**
 * SID-based section mapping for FreeTaxUSA navigation.
 * SIDs are dynamically discovered from the nav sidebar, with fallback estimates.
 */

export interface SectionInfo {
  name: string;
  sid: number;
  tab: string;
}

export interface SidMap {
  sections: Map<string, SectionInfo>;
  byName: Map<string, number>;
  bySid: Map<number, string>;
  discoveredAt: number;
}

/** Known section name aliases for fuzzy matching */
export const SECTION_ALIASES: Record<string, string[]> = {
  'personal': ['personal info', 'personal information', 'taxpayer info', 'taxpayer information'],
  'filing_status': ['filing status', 'status'],
  'income': ['income', 'wages'],
  'w2': ['w-2', 'w2', 'wages'],
  '1099_int': ['1099-int', '1099 int', 'interest'],
  '1099_div': ['1099-div', '1099 div', 'dividends'],
  '1099_misc': ['1099-misc', '1099 misc'],
  '1099_nec': ['1099-nec', '1099 nec'],
  'deductions': ['deductions', 'deductions & credits', 'deductions and credits'],
  'summary': ['summary', 'review', 'tax summary'],
  'state': ['state', 'state return', 'state taxes'],
  'filing': ['filing', 'file', 'e-file', 'efile'],
};

/** Estimated SID ranges as fallback when discovery fails */
export const ESTIMATED_SID_RANGES: Record<string, [number, number]> = {
  'Sign In / Start': [1, 10],
  'Personal Information': [11, 19],
  'Income': [20, 49],
  'Deductions & Credits': [50, 79],
  'Miscellaneous': [80, 89],
  'Summary': [90, 94],
  'State': [95, 98],
  'Filing': [99, 105],
};

/** Fallback SID map for known pages */
export const FALLBACK_SIDS: Record<string, number> = {
  'taxpayer_info': 11,
  'filing_status': 12,
  'income': 20,
  'deductions': 50,
  'summary': 90,
  'state': 95,
  'filing': 99,
};

export function normalizeSectionName(input: string): string | undefined {
  const lower = input.toLowerCase().trim();
  for (const [key, aliases] of Object.entries(SECTION_ALIASES)) {
    if (key === lower || aliases.some(a => a === lower)) {
      return key;
    }
  }
  return undefined;
}
