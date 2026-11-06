import type { ExportKind } from "#dto/exports/export-job-response.dto";
import type { ExportRequestDto } from "#dto/exports/export-request.dto";
import type { ExportScope, ExportSource } from "./export-source";
import { customerExportSource } from "./sources/customer-export-source";

/** Builds one list's export from its stored request; throws a 400 for a request the list cannot export. */
export type ExportSourceBuilder = (
  scope: ExportScope,
  request: ExportRequestDto,
  requestedAt: Temporal.Instant,
) => ExportSource;

/**
 * Every list that can be exported, by the `kind` stored on its job. A start handler builds its source to check the
 * request; the worker looks the builder up here to run a job it claimed. A new export adds one line.
 */
export const EXPORT_SOURCES: Readonly<Record<ExportKind, ExportSourceBuilder>> = {
  customers: customerExportSource,
};
