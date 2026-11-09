import type { GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import type { TFunction } from "i18next";
import { serverColumn } from "../../../components/data-grid/serverColumns";
import { PartDescriptionCell } from "../components/PartDescriptionCell";
import { PartOnHandCell } from "../components/PartOnHandCell";
import { PartThumbnailCell } from "../components/PartThumbnailCell";
import { formatMoney } from "../../../core/formatters/formatMoney";
import type { PartListItem } from "../types/part";

function renderThumbnail(params: GridRenderCellParams<PartListItem>) {
  return <PartThumbnailCell part={params.row} />;
}

function renderDescription(params: GridRenderCellParams<PartListItem>) {
  return <PartDescriptionCell part={params.row} />;
}

function renderOnHand(params: GridRenderCellParams<PartListItem>) {
  return <PartOnHandCell part={params.row} />;
}

/**
 * The parts list's columns. Each sortable field is one the API sorts and filters by (STOCKED_PART_COLUMNS in
 * dealership-api), under the same name; the photo is neither.
 */
export function partColumns(t: TFunction<"parts">, language: string): GridColDef<PartListItem>[] {
  return [
    {
      field: "photo",
      headerName: "",
      width: 56,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: renderThumbnail,
    },
    { field: "partNumber", headerName: t("columns.partNumber"), width: 160, cellClassName: "monospace primary-link" },
    {
      field: "description",
      headerName: t("columns.description"),
      flex: 1,
      minWidth: 200,
      renderCell: renderDescription,
    },
    {
      field: "bin",
      headerName: t("columns.bin"),
      width: 110,
      cellClassName: "monospace",
      valueGetter: (_value: unknown, row: PartListItem) => row.inventory.binCode,
    },
    {
      field: "onHand",
      headerName: t("columns.onHand"),
      type: "number",
      width: 130,
      valueGetter: (_value: unknown, row: PartListItem) => row.inventory.quantityOnHand,
      renderCell: renderOnHand,
    },
    {
      field: "unitPriceCents",
      headerName: t("columns.unitPrice"),
      type: "number",
      width: 120,
      valueFormatter: (value: number) => formatMoney(value, language),
    },
    {
      // Worked out by the API for this location; it sorts and filters by neither.
      field: "stockValueCents",
      headerName: t("columns.stockValue"),
      type: "number",
      width: 140,
      sortable: false,
      filterable: false,
      valueFormatter: (value: number) => formatMoney(value, language),
    },
  ].map((column) => serverColumn<PartListItem>(column as GridColDef<PartListItem>));
}
