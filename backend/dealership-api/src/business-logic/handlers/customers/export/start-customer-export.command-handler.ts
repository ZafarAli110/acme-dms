import {createHash} from 'node:crypto';
import {BadRequestException, Inject, Injectable} from '@nestjs/common';
import {count} from 'drizzle-orm';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import type {IStartCustomerExportCommandHandler} from '#business-logic-abstractions/handlers/customers/export/start-customer-export.command-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {ExportJobResponseDto} from '#dto/exports/export-job-response.dto';
import type {ExportRequestDto} from '#dto/exports/export-request.dto';
import {customers} from '#persistence/schema/index';
import {ExportJobRunner} from '../../../exports/export-job-runner';
import type {ExportSource} from '../../../exports/export-source';
import {requireLocation} from '../../../user-context/require-location';
import {customerListOrderBy, customerListWhere} from '../get-list/get-customer-list.query-handler';
import {CUSTOMER_EXPORT_COLUMNS} from './customer-export-columns';

/**
 * Starts an export of the customer list as the user sees it: every row its search and filter match at the selected
 * location, in its sort, with its visible columns in their order and under their headings.
 */
@Injectable()
export class StartCustomerExportCommandHandler implements IStartCustomerExportCommandHandler {
  private readonly _exportJobRunner: ExportJobRunner;
  private readonly _clock: IClock;

  public constructor(@Inject(ExportJobRunner) exportJobRunner: ExportJobRunner, @Inject(CLOCK) clock: IClock) {
    this._exportJobRunner = exportJobRunner;
    this._clock = clock;
  }

  public execute(
    userContext: UserContext,
    request: ExportRequestDto,
    idempotencyKey: string | null,
  ): ExportJobResponseDto {
    const locationId = requireLocation(userContext);
    const fields = request.columns.map((column) => column.field);
    if (new Set(fields).size !== fields.length) {
      throw new BadRequestException('Each column can be in the file once.');
    }
    const columns = request.columns.map((column) => {
      const definition = CUSTOMER_EXPORT_COLUMNS[column.field];
      if (!definition) {
        throw new BadRequestException(
          `"${column.field}" cannot be exported. It can be: ${Object.keys(CUSTOMER_EXPORT_COLUMNS).join(', ')}.`,
        );
      }
      return {...definition, field: column.field, header: column.header};
    });
    // Built here, so a sort or filter the list doesn't have is refused now, not after the export has started.
    const where = customerListWhere(locationId, request);
    const orderBy = customerListOrderBy(request);

    const source: ExportSource = {
      fileName: `customers-${this._clock.now().toZonedDateTimeISO('UTC').toPlainDate().toString()}.xlsx`,
      sheetName: 'Customers',
      columns: columns.map(({header, kind, width}) => ({header, kind, width})),
      countAsync: async (db) => (await db.select({total: count()}).from(customers).where(where))[0]?.total ?? 0,
      rowsQuery: (db) =>
        db
          .select(Object.fromEntries(columns.map((column) => [column.field, column.source])))
          .from(customers)
          .where(where)
          .orderBy(...orderBy)
          .toSQL(),
      fingerprint: createHash('sha256')
        .update(
          JSON.stringify({
            columns: request.columns,
            search: request.search ?? null,
            sort: [request.sort ?? null, request.direction ?? 'asc'],
            filter: [request.filterField ?? null, request.filterOperator ?? null, request.filterValue ?? null],
          }),
        )
        .digest('hex'),
    };
    return this._exportJobRunner.start(userContext, source, idempotencyKey);
  }
}
