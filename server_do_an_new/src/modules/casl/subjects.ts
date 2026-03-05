/**
 * Subject strings used with CASL abilities.
 * We use plain strings (not classes) so the same definitions
 * can be shared with the admin-web front-end.
 */
export type Subject =
  | 'LoanProduct'
  | 'SavingsProduct'
  | 'DocumentType'
  | 'SyncDrift'
  | 'Customer'
  | 'Loan'
  | 'LoanDocument'
  | 'Kyc'
  | 'Staff'
  | 'Migration'
  | 'all'; // CASL wildcard
