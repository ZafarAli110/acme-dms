import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {ExportJobResponseDto} from '#dto/exports/export-job-response.dto';
import type {ExportRequestDto} from '#dto/exports/export-request.dto';

export interface IStartCustomerExportCommandHandler {
  /** `idempotencyKey`: the same key from the same user gets the same export back; a different request with it, 422. */
  execute(userContext: UserContext, request: ExportRequestDto, idempotencyKey: string | null): ExportJobResponseDto;
}

export const START_CUSTOMER_EXPORT_COMMAND_HANDLER = Symbol('IStartCustomerExportCommandHandler');
