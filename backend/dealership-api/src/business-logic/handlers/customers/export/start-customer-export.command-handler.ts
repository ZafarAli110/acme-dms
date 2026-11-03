import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type IClock } from "#business-logic-abstractions/time/clock.interface";
import type { IStartCustomerExportCommandHandler } from "#business-logic-abstractions/handlers/customers/export/start-customer-export.command-handler.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { ExportJobResponseDto } from "#dto/exports/export-job-response.dto";
import type { ExportRequestDto } from "#dto/exports/export-request.dto";
import { ExportQueue } from "../../../exports/export-queue";
import { customerExportSource } from "../../../exports/sources/customer-export-source";
import { requireLocation } from "../../../user-context/require-location";

/**
 * Starts an export of the customer list as the user sees it: every row its search and filter match at the selected
 * location, in its sort, with its visible columns in their order and under their headings. The request is checked
 * here and queued; an export worker writes the file.
 */
@Injectable()
export class StartCustomerExportCommandHandler implements IStartCustomerExportCommandHandler {
  // The queue class itself, not an interface from the abstractions: both live in business-logic, and the
  // abstractions are for crossing layers. Controllers reach the same queue through EXPORT_JOBS.
  private readonly _exportQueue: ExportQueue;
  private readonly _clock: IClock;

  public constructor(@Inject(ExportQueue) exportQueue: ExportQueue, @Inject(CLOCK) clock: IClock) {
    this._exportQueue = exportQueue;
    this._clock = clock;
  }

  public async executeAsync(
    userContext: UserContext,
    request: ExportRequestDto,
    idempotencyKey: string | null,
  ): Promise<ExportJobResponseDto> {
    const scope = { dealerId: userContext.dealerId, locationId: requireLocation(userContext) };
    // Built now only to refuse a column, sort or filter the list doesn't have (400) before anything is queued; the
    // worker builds it again from the stored request when it runs the export.
    const source = customerExportSource(scope, request, this._clock.now());
    return this._exportQueue.enqueueAsync(userContext, { kind: "customers", request, source }, idempotencyKey);
  }
}
