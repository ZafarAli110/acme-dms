import {SetMetadata} from '@nestjs/common';

export const IS_PUBLIC = 'acme:is-public';

/** Marks an endpoint that needs no access token (health checks only). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
