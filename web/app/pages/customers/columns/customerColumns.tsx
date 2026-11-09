import type { GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import type { TFunction } from "i18next";
import { phoneFilterOperators, serverColumn } from "../../../components/data-grid/serverColumns";
import { formatPlainDate } from "../../../core/formatters/formatDate";
import { CustomerNameCell } from "../components/CustomerNameCell";
import { CustomerStatusChip } from "../components/CustomerStatusChip";
import { Typography } from "@mui/material";
import type { CustomerStatus } from "../types/customer";
import { type CustomerGridRow, isMatchRow, type MatchRow } from "./closeMatchRows";

const STATUSES: CustomerStatus[] = ["active", "prospect", "inactive"];

function renderStatus(params: GridRenderCellParams<CustomerGridRow>) {
  return isMatchRow(params.row) ? null : <CustomerStatusChip status={params.row.status} />;
}

/** The note and the "Did you mean" divider (ACME-120, design a.html): one cell across the grid. */
function MatchRowText({ row, labels }: { row: MatchRow; labels: MatchRowLabels }) {
  return row.kind === "divider" ? (
    <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>
      {labels.divider}
    </Typography>
  ) : (
    <Typography variant="body2" color="text.secondary">
      {labels.note}
    </Typography>
  );
}

/** The wording of the note and the divider, in the user's language. */
export interface MatchRowLabels {
  note: string;
  divider: string;
}

/**
 * The customer list's columns. Each field is one the API sorts and filters by (CUSTOMER_LIST_COLUMNS in
 * dealership-api), under the same name.
 */
export function customerColumns(
  t: TFunction<"customers">,
  language: string,
  labels: MatchRowLabels,
): GridColDef<CustomerGridRow>[] {
  const columns: GridColDef<CustomerGridRow>[] = [
    {
      field: "name",
      headerName: t("columns.name"),
      flex: 1.4,
      minWidth: 220,
      // The note and the divider span every column.
      colSpan: (_value: unknown, row: CustomerGridRow) => (isMatchRow(row) ? columns.length : 1),
      renderCell: (params: GridRenderCellParams<CustomerGridRow>) =>
        isMatchRow(params.row) ? (
          <MatchRowText row={params.row} labels={labels} />
        ) : (
          <CustomerNameCell customer={params.row} />
        ),
    },
    { field: "companyName", headerName: t("fields.companyName"), flex: 1, minWidth: 140 },
    { field: "email", headerName: t("fields.email"), flex: 1.2, minWidth: 180 },
    {
      field: "phone",
      headerName: t("fields.phone"),
      flex: 0.9,
      minWidth: 140,
      filterOperators: phoneFilterOperators(),
    },
    { field: "city", headerName: t("columns.city"), flex: 0.8, minWidth: 120 },
    {
      field: "status",
      headerName: t("columns.status"),
      type: "singleSelect",
      valueOptions: STATUSES.map((status) => ({ value: status, label: t(`status.${status}`) })),
      width: 120,
      renderCell: renderStatus,
    },
    {
      field: "lastContactDate",
      headerName: t("columns.lastContact"),
      type: "date",
      width: 140,
      // The grid filters a date column with Date objects; the API's YYYY-MM-DD is turned into one here.
      valueGetter: (value: string | null) => (value ? new Date(`${value}T00:00:00`) : null),
      valueFormatter: (_value: Date | null, row: CustomerGridRow) =>
        !isMatchRow(row) && row.lastContactDate ? formatPlainDate(row.lastContactDate, language) : "—",
    },
  ];
  return columns.map((column) => serverColumn<CustomerGridRow>(column));
}
