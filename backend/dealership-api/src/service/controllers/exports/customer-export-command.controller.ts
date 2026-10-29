import {Body, Controller, Headers, HttpCode, HttpStatus, Inject, Post} from '@nestjs/common';
import {
  type IStartCustomerExportCommandHandler,
  START_CUSTOMER_EXPORT_COMMAND_HANDLER,
} from '#business-logic-abstractions/handlers/customers/export/start-customer-export.command-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {ExportJobResponseDto} from '#dto/exports/export-job-response.dto';
import {ExportRequestDto} from '#dto/exports/export-request.dto';
import {CurrentUser} from '../../authorization/current-user.decorator';
import {RequirePermission} from '../../authorization/require-permission.decorator';

/** Starts an export of the selected location's customer list; follow it with ExportController. */
@Controller('v1/customers/exports')
export class CustomerExportCommandController {
  private readonly _startCustomerExportCommandHandler: IStartCustomerExportCommandHandler;

  public constructor(
    @Inject(START_CUSTOMER_EXPORT_COMMAND_HANDLER)
    startCustomerExportCommandHandler: IStartCustomerExportCommandHandler,
  ) {
    this._startCustomerExportCommandHandler = startCustomerExportCommandHandler;
  }

  /** 202: the export runs in the background. Send an Idempotency-Key, so a retried request gets the same export. */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission('customers.read')
  public start(
    @CurrentUser() userContext: UserContext,
    @Body() request: ExportRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): ExportJobResponseDto {
    return this._startCustomerExportCommandHandler.execute(userContext, request, idempotencyKey ?? null);
  }
}
