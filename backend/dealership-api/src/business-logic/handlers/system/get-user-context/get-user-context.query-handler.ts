import {Injectable} from '@nestjs/common';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {IGetUserContextQueryHandler} from '#business-logic-abstractions/handlers/system/get-user-context/get-user-context.query-handler.interface';
import type {UserContextResponseDto} from '#dto/system/user-context-response.dto';

/** Echoes who the API thinks is calling. Handy for checking tokens, locations and permissions end to end. */
@Injectable()
export class GetUserContextQueryHandler implements IGetUserContextQueryHandler {
  public async executeAsync(userContext: UserContext): Promise<UserContextResponseDto> {
    return {
      userId: userContext.userId,
      locationId: userContext.locationId,
      permissions: userContext.permissions,
    };
  }
}
