/**
 * Shared CASL definitions for the admin-web frontend.
 *
 * Action & Subject mirror the backend enum/types so the rules
 * returned by GET /admin/me/permissions can be fed directly
 * into a PureAbility instance.
 */
import { PureAbility, AbilityBuilder, RawRuleOf } from "@casl/ability";

// ── Actions ──
export enum Action {
  Manage = "manage",
  Create = "create",
  Read = "read",
  Update = "update",
  Delete = "delete",
  Approve = "approve",
  Disburse = "disburse",
  Reject = "reject",
}

// ── Subjects ──
export type Subject =
  | "LoanProduct"
  | "SavingsProduct"
  | "DocumentType"
  | "SyncDrift"
  | "Customer"
  | "Loan"
  | "LoanDocument"
  | "Kyc"
  | "Staff"
  | "Migration"
  | "LoanApplication"
  | "all";
export type AppAbility = PureAbility<[Action, Subject]>;

/**
 * Build a PureAbility from the rules array the backend sends.
 */
export function buildAbilityFromRules(
  rules: RawRuleOf<AppAbility>[],
): AppAbility {
  return new PureAbility<[Action, Subject]>(rules);
}

/**
 * Create a local ability by role (used as **initial fallback** at login
 * before we fetch the real rules from /admin/me/permissions).
 * Admin gets full access; everybody else gets nothing until the server
 * responds with the actual rule set.
 */
export function buildAbilityForRole(roles: string[]): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(PureAbility as any);

  if (roles.includes("admin")) {
    can(Action.Manage, "all");
  }
  // For any other role, return empty ability — the real permissions
  // will be loaded from the server via /admin/me/permissions

  return build();
}

/**
 * Empty ability (no permissions) — used before login.
 */
export function buildEmptyAbility(): AppAbility {
  return new PureAbility<[Action, Subject]>([]);
}
