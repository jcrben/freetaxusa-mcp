/**
 * Tax data type definitions.
 */

export interface TaxpayerInfo {
  firstName: string;
  lastName: string;
  middleInitial?: string;
  suffix?: string;
  ssn: string;
  dob: string;
  occupation: string;
  address: {
    street: string;
    apt?: string;
    city: string;
    state: string;
    zip: string;
    zip4?: string;
  };
}

export type FilingStatus =
  | 'single'
  | 'married_joint'
  | 'married_separate'
  | 'head_of_household'
  | 'qualifying_widow';

export interface W2Data {
  employerEin: string;
  employerName: string;
  wages: number;
  federalWithheld: number;
  stateWithheld?: number;
  socialSecurityWages?: number;
  medicareWages?: number;
  state?: string;
  stateId?: string;
}

export interface Income1099Data {
  type: '1099-INT' | '1099-DIV' | '1099-MISC' | '1099-NEC' | '1099-R' | '1099-G' | '1099-SSA';
  payerName: string;
  payerEin?: string;
  amount: number;
  federalWithheld?: number;
}

export interface FormField {
  label: string;
  value: string;
  type: 'text' | 'select' | 'radio' | 'checkbox' | 'date' | 'currency' | 'ssn' | 'unknown';
  required: boolean;
  error?: string;
  options?: string[];
}

export interface PageState {
  pageTitle: string;
  sid: number | null;
  url: string;
  fields: FormField[];
}

export interface SessionStatus {
  active: boolean;
  taxYear: string | null;
  currentSection: string | null;
  currentSid: number | null;
}

export interface TaxSummary {
  refundOrOwed: 'refund' | 'owed' | 'zero' | 'unknown';
  amount: number | null;
  agi: number | null;
  filingStatus: string | null;
  sectionsComplete: string[];
}

export interface RefundEstimate {
  federalRefund?: number;
  federalOwed?: number;
  stateRefund?: number;
  stateOwed?: number;
}

export interface ToolResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}
