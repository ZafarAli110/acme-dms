import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {PartCreateRequestDto} from '#dto/parts/part-create-request.dto';
import type {PartResponseDto} from '#dto/parts/part-response.dto';

export interface ICreatePartCommandHandler {
  executeAsync(userContext: UserContext, request: PartCreateRequestDto): Promise<PartResponseDto>;
}

export const CREATE_PART_COMMAND_HANDLER = Symbol('ICreatePartCommandHandler');
