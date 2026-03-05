/**
 * Shared CASL definitions for the admin-web frontend.
 *
 * Action & Subject mirror the backend enum/types so the rules
 * returned by GET /admin/me/permissions can be fed directly
 * into a PureAbility instance.
 */
import { PureAbility, AbilityBuilder, RawRuleOf } from '@casl/ability';

// ── Actions ──
export enum Action {
  Manage = 'manage',
  Create = 'create',
  Read = 'read',
  Update = 'update',
  Delete = 'delete',
  Approve = 'approve',
  Disburse = 'disburse',
}

// ── Subjects ──
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
  | 'all';

export type AppAbility = PureAbility<[Action, Subject]>;

/**
 * Build a PureAbility from the rules array the backend sends.
 */
export function buildAbilityFromRules(rules: RawRuleOf<AppAbility>[]): AppAbility {
  return new PureAbility<[Action, Subject]>(rules);
}

/**
 * Create a local ability by role (used as fallback when the
 * /me/permissions endpoint hasn't replied yet, or at login time
 * before we have the rules from the server).
 */
export function buildAbilityForRole(roles: string[]): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(PureAbility as any);

  if (roles.includes('admin')) {
    can(Action.Manage, 'all');
  } else if (roles.includes('staff')) {
    // Loan Products — read only
    can(Action.Read, 'LoanProduct');

    // Savings Products — read only
    can(Action.Read, 'SavingsProduct');

    // Document Types — read only
    can(Action.Read, 'DocumentType');

    // Customers
    can(Action.Read, 'Customer');

    // KYC
    can(Action.Read, 'Kyc');
    can(Action.Approve, 'Kyc');
    can(Action.Create, 'Kyc');
    can(Action.Update, 'Kyc');

    // Loans
    can(Action.Read, 'Loan');
    can(Action.Approve, 'Loan');
    can(Action.Disburse, 'Loan');

    // Loan Documents
    can(Action.Read, 'LoanDocument');
    can(Action.Approve, 'LoanDocument');
    can(Action.Update, 'LoanDocument');

    // Staff — no access
    cannot(Action.Manage, 'Staff');

    // SyncDrift — no access
    cannot(Action.Manage, 'SyncDrift');

    // Migration — no access
    cannot(Action.Manage, 'Migration');
  }

  return build();
}

/**
 * Empty ability (no permissions) — used before login.
 */
export function buildEmptyAbility(): AppAbility {
  return new PureAbility<[Action, Subject]>([]);
}
