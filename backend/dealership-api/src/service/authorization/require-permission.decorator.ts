import {SetMetadata} from '@nestjs/common';

export const REQUIRED_PERMISSION = 'acme:required-permission';

/**
 * The permission the user must hold at the location selected in `x-location-id`.
 * Check permissions, never role names: roles change, permissions are the contract.
 */
export const RequirePermission = (permission: string): MethodDecorator => SetMetadata(REQUIRED_PERMISSION, permission);
