import { AbilityBuilder, PureAbility, AbilityClass } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { Action } from './actions.enum';
import { Subject } from './subjects';
import { UserPayload } from '../auth/interfaces/auth.interface';
import { RbacService } from '../rbac/rbac.service';

export type AppAbility = PureAbility<[Action, Subject]>;
export const AppAbility = PureAbility as AbilityClass<AppAbility>;

@Injectable()
export class CaslAbilityFactory {
  constructor(private readonly rbacService: RbacService) {}

  /**
   * Build ability dynamically from DB-stored permissions.
   * Falls back to hardcoded admin rule if DB has no data yet.
   */
  async createForUser(user: UserPayload): Promise<AppAbility> {
    const { can, cannot, build } = new AbilityBuilder(AppAbility);
    const roles = user.roles ?? [];

    if (roles.length === 0) return build();

    const rules = await this.rbacService.buildRulesForRoles(roles);

    if (rules.length === 0 && roles.includes('admin')) {
      // Fallback: if DB is empty but user is admin, grant full access
      can(Action.Manage, 'all');
      return build();
    }

    for (const rule of rules) {
      if (rule.inverted) {
        cannot(rule.action as Action, rule.subject as Subject);
      } else {
        can(rule.action as Action, rule.subject as Subject);
      }
    }

    return build();
  }
}
