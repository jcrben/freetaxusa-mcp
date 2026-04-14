/**
 * PII filter module.
 * Redacts SSNs, account numbers, and other PII from all tool outputs.
 * Applied to every string returned by any tool before reaching MCP transport.
 */

/** Matches SSN patterns: 123-45-6789, 123 45 6789, 123456789 */
const SSN_PATTERN = /\b(\d{3})[-\s]?(\d{2})[-\s]?(\d{4})\b/g;

/** Matches bank account numbers (8-17 digits) */
const ACCOUNT_PATTERN = /\b(\d{4})(\d{4,13})\b/g;

/** Matches EIN patterns: 12-3456789 */
const EIN_PATTERN = /\b(\d{2})-?(\d{7})\b/g;

/**
 * Redact SSNs to ***-**-NNNN format (last 4 visible).
 */
export function redactSSN(text: string): string {
  return text.replace(SSN_PATTERN, (_match, _g1, _g2, last4: string) => {
    return `***-**-${last4}`;
  });
}

/**
 * Redact bank account numbers to ****NNNN (last 4 visible).
 * Only applies to sequences of 8+ digits.
 */
export function redactAccountNumber(text: string): string {
  return text.replace(ACCOUNT_PATTERN, (_match, _prefix, rest: string) => {
    const full = _prefix + rest;
    if (full.length < 8) return full;
    return `****${full.slice(-4)}`;
  });
}

/**
 * Redact EINs to **-***NNNN format (last 4 visible).
 */
export function redactEIN(text: string): string {
  return text.replace(EIN_PATTERN, (_match, _prefix, suffix: string) => {
    return `**-***${suffix.slice(-4)}`;
  });
}

/**
 * Apply all PII redaction filters to a string.
 * Order matters: SSN first (most specific), then EIN, then account numbers.
 */
export function redactPII(text: string): string {
  let result = redactSSN(text);
  result = redactEIN(result);
  result = redactAccountNumber(result);
  return result;
}

/**
 * Deep-apply PII redaction to an object.
 * Recursively walks all string values and redacts PII.
 */
export function filterPII<T>(obj: T): T {
  if (typeof obj === 'string') {
    return redactPII(obj) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => filterPII(item)) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = filterPII(value);
    }
    return result as T;
  }
  return obj;
}
