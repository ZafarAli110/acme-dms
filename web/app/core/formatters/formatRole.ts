import type {TFunction} from 'i18next';
import type common from '../../locales/en/common.json';

type Role = keyof typeof common.roles;

/** A role's name for display ("Service advisor"). Roles are for display only; check permissions with `can()`. */
export function formatRole(t: TFunction<'common'>, role: string): string {
  return role in ROLE_KEYS ? t(`roles.${role as Role}`) : role;
}

const ROLE_KEYS: Record<Role, true> = {
  DealerAdmin: true,
  ServiceManager: true,
  ServiceAdvisor: true,
  Technician: true,
  PartsManager: true,
  PartsClerk: true,
  Sales: true,
};
