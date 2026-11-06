import { localized } from "#i18n/messages";
import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { and, count, eq } from "drizzle-orm";
import type { ExportRequestDto } from "#dto/exports/export-request.dto";
import { customers } from "#persistence/schema/customers";
import { CUSTOMER_EXPORT_COLUMNS } from "../../handlers/customers/export/customer-export-columns";
import {
  customerListOrderBy,
  customerListWhere,
} from "../../handlers/customers/get-list/get-customer-list.query-handler";
import type { ExportScope, ExportSource } from "../export-source";

/**
 * The customer list's export, as the user saw the list: every row its search and filter match at the location, in its
 * sort, with the visible columns in their order and under their headings. The start handler builds it to refuse a bad
 * request before anything is queued; the export worker builds it again from the stored row, so the same request
 * always reads the same rows.
 */
export function customerExportSource(
  scope: ExportScope,
  request: ExportRequestDto,
  requestedAt: Temporal.Instant,
): ExportSource {
  const fields = request.columns.map((column) => column.field);
  if (new Set(fields).size !== fields.length) {
    throw new BadRequestException(localized("exports.duplicateColumn"));
  }
  const columns = request.columns.map((column) => {
    const definition = CUSTOMER_EXPORT_COLUMNS[column.field];
    if (!definition) {
      throw new BadRequestException(
        localized("exports.columnNotExportable", {
          field: column.field,
          fields: Object.keys(CUSTOMER_EXPORT_COLUMNS).join(", "),
        }),
      );
    }
    return { ...definition, field: column.field, header: column.header ?? definition.header };
  });
  // Built now, so a sort or filter the list doesn't have is refused before the export is queued.
  // The worker reads as the table owner, outside a request, so row-level security does not apply: the dealer and the
  // location are named here.
  const where = and(
    eq(customers.dealerId, scope.dealerId),
    eq(customers.locationId, scope.locationId),
    customerListWhere(request),
  );
  const orderBy = customerListOrderBy(request);

  return {
    fileName: `customers-${requestedAt.toZonedDateTimeISO("UTC").toPlainDate().toString()}.xlsx`,
    sheetName: "Customers",
    columns: columns.map(({ header, kind, width }) => ({ header, kind, width })),
    countAsync: async (db) => (await db.select({ total: count() }).from(customers).where(where))[0]?.total ?? 0,
    rowsQuery: (db) =>
      db
        .select(Object.fromEntries(columns.map((column) => [column.field, column.source])))
        .from(customers)
        .where(where)
        .orderBy(...orderBy)
        .toSQL(),
    fingerprint: createHash("sha256")
      .update(
        JSON.stringify({
          columns: request.columns,
          search: request.search ?? null,
          sort: [request.sort ?? null, request.direction ?? "asc"],
          filter: [request.filterField ?? null, request.filterOperator ?? null, request.filterValue ?? null],
        }),
      )
      .digest("hex"),
  };
}
