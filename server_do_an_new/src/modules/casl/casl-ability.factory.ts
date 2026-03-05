import { AbilityBuilder, PureAbility, AbilityClass } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { Action } from './actions.enum';
import { Subject } from './subjects';
import { UserPayload } from '../auth/interfaces/auth.interface';

export type AppAbility = PureAbility<[Action, Subject]>;
export const AppAbility = PureAbility as AbilityClass<AppAbility>;

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: UserPayload): AppAbility {
    const { can, cannot, build } = new AbilityBuilder(AppAbility);
    const roles = user.roles ?? [];

    if (roles.includes('admin')) {
      // Admin — full access to everything
      can(Action.Manage, 'all');
    } else if (roles.includes('staff')) {
      // ── Loan Products: read-only ──
      can(Action.Read, 'LoanProduct');

      // ── Savings Products: read-only ──
      can(Action.Read, 'SavingsProduct');

      // ── Customers: read + approve KYC ──
      can(Action.Read, 'Customer');
      can(Action.Read, 'Kyc');
      can(Action.Approve, 'Kyc');
      can(Action.Create, 'Kyc'); // OCR + save KYC for user
      can(Action.Update, 'Kyc'); // reject KYC

      // ── Loans: read + approve + disburse ──
      can(Action.Read, 'Loan');
      can(Action.Approve, 'Loan');
      can(Action.Disburse, 'Loan');

      // ── Loan Documents: read + approve/reject ──
      can(Action.Read, 'LoanDocument');
      can(Action.Approve, 'LoanDocument');
      can(Action.Update, 'LoanDocument'); // reject

      // ── Document Types: read-only ──
      can(Action.Read, 'DocumentType');

      // ── Staff: NO access ──
      cannot(Action.Manage, 'Staff');

      // ── SyncDrift: NO access ──
      cannot(Action.Manage, 'SyncDrift');

      // ── Migration: NO access ──
      cannot(Action.Manage, 'Migration');
    }
    // any other role gets zero permissions (build() returns empty ability)

    return build();
  }
}
