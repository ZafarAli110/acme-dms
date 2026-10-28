import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {BinCreateRequestDto} from '#dto/bins/bin-create-request.dto';
import type {BinResponseDto} from '#dto/bins/bin-response.dto';

export interface ICreateBinCommandHandler {
  executeAsync(userContext: UserContext, request: BinCreateRequestDto): Promise<BinResponseDto>;
}

export const CREATE_BIN_COMMAND_HANDLER = Symbol('ICreateBinCommandHandler');
