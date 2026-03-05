import { createContext } from 'react';
import { createContextualCan } from '@casl/react';
import { AppAbility, buildEmptyAbility } from './ability';

/**
 * React context that exposes the current user's CASL ability.
 * Consumed via the `<Can>` component or the `useAbility` hook.
 */
export const AbilityContext = createContext<AppAbility>(buildEmptyAbility());

/**
 * <Can> component bound to AbilityContext.
 *
 * Usage:
 *   <Can I="read" a="Staff">
 *     <StaffPage />
 *   </Can>
 */
export const Can = createContextualCan(AbilityContext.Consumer);
