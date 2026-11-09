import { Box } from "@mui/material";
import {
  DataGrid,
  type GridColDef,
  type GridColumnVisibilityModel,
  type GridFilterModel,
  type GridPaginationModel,
  type GridRowParams,
  type GridSortModel,
  type GridValidRowModel,
  useGridApiRef,
} from "@mui/x-data-grid";
import { frFR } from "@mui/x-data-grid/locales";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGridScrollRestore } from "../../core/hooks/useGridScrollRestore";
import { type ListParams, MAX_LIST_DEPTH, PAGE_SIZES } from "../../core/paging/listParams";
import { INSET_SURFACE } from "../../theme";
import { AppDataGridToolbar } from "./AppDataGridToolbar";
import { fromFilterModel, sameFilter, toFilterModel, toPaginationModel, toSortModel } from "./listGridModels";

/** A list whose paging, sort, filter and search the API applies; they live in the URL (useListParams). */
export interface ServerList {
  params: ListParams;
  rowCount: number;
  update: (changes: Partial<ListParams>, options: { replace: boolean }) => void;
  /**
   * The total as the footer shows it, for a list whose API stops counting past its depth ("10,000+", the customer
   * list: `formatListTotal`). Left out, the footer shows `rowCount` as a number.
   */
  totalLabel?: string;
  /**
   * The whole footer text, for a page that is not a slice of a counted list (close spellings after the exact matches,
   * ACME-120: "0 exact matches · 25 close spellings"). Left out, the footer is "1–25 of {total}".
   */
  footerLabel?: string | null;
}

interface AppDataGridProps<Row extends GridValidRowModel> {
  columns: GridColDef<Row>[];
  rows: readonly Row[];
  loading: boolean;
  /** Set for a list the API pages; left out, the grid sorts, filters and pages the rows it is given. */
  server?: ServerList;
  columnVisibilityModel: GridColumnVisibilityModel;
  onColumnVisibilityModelChange: (model: GridColumnVisibilityModel) => void;
  onRowClick?: (row: Row) => void;
  /** The list's own buttons, in the toolbar. */
  actions?: ReactNode;
  searchPlaceholder: string;
  noRowsLabel: string;
  testId: string;
}

/**
 * Every list in the app: the free MUI X data grid with one toolbar (columns, filter, actions, search), one sort and one
 * filter at a time, and the app's language. Server lists keep their state in the URL, so a refresh or a shared link
 * shows the same rows.
 */
export function AppDataGrid<Row extends GridValidRowModel>({
  columns,
  rows,
  loading,
  server,
  columnVisibilityModel,
  onColumnVisibilityModelChange,
  onRowClick,
  actions,
  searchPlaceholder,
  noRowsLabel,
  testId,
}: AppDataGridProps<Row>) {
  const { t, i18n } = useTranslation();
  // The rows scroll inside the grid: put them back where they were when this history entry is shown again (Back).
  const apiRef = useGridApiRef();
  useGridScrollRestore(apiRef, rows.length > 0);
  // The filter as the user edits it: an operator picked but no value typed yet is not in the URL, yet must stay in
  // the panel. Whenever the URL's filter or search changes (Back, a shared link), it starts again from the URL.
  const urlFilter = server ? toFilterModel(server.params, columns) : { items: [] };
  const urlFilterKey = JSON.stringify(urlFilter);
  const [editing, setEditing] = useState({ key: urlFilterKey, model: urlFilter });
  if (editing.key !== urlFilterKey) {
    setEditing({ key: urlFilterKey, model: urlFilter });
  }
  // Built again only when the sort changes: the grid takes a new sort model as a new sort and goes back to page 1.
  const sort = server?.params.sort ?? null;
  const direction = server?.params.direction ?? "asc";
  const sortModel = useMemo(() => toSortModel({ sort, direction }), [sort, direction]);

  const handlePaginationModelChange = (model: GridPaginationModel): void => {
    if (!server) {
      return;
    }
    if (model.pageSize !== server.params.pageSize) {
      server.update({ pageSize: model.pageSize, page: 1 }, { replace: false });
    } else if (model.page + 1 !== server.params.page) {
      server.update({ page: model.page + 1 }, { replace: false });
    }
  };

  const handleSortModelChange = (model: GridSortModel): void => {
    const first = model[0];
    server?.update({ sort: first?.field ?? null, direction: first?.sort ?? "asc", page: 1 }, { replace: false });
  };

  const handleFilterModelChange = (model: GridFilterModel): void => {
    setEditing({ key: urlFilterKey, model });
    if (!server) {
      return;
    }
    const { filter, search } = fromFilterModel(model);
    if (!sameFilter(filter, server.params.filter) || search !== server.params.search) {
      server.update({ filter, search, page: 1 }, { replace: true });
    }
  };

  const handleRowClick = (params: GridRowParams<Row>): void => {
    onRowClick?.(params.row);
  };

  return (
    <Box
      sx={{
        height: "calc(100vh - 190px)",
        minHeight: 420,
        bgcolor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 4,
        overflow: "hidden",
      }}
      data-testid={testId}
    >
      <DataGrid<Row>
        apiRef={apiRef}
        columns={columns}
        rows={rows}
        loading={loading}
        showToolbar
        slots={{ toolbar: AppDataGridToolbar }}
        slotProps={{ toolbar: { actions, searchPlaceholder }, loadingOverlay: { variant: "linear-progress" } }}
        localeText={{
          ...(i18n.language.startsWith("fr") ? frFR.components.MuiDataGrid.defaultProps.localeText : {}),
          noRowsLabel,
          noResultsOverlayLabel: noRowsLabel,
          // The grid's rowCount stops at the API's depth limit, so it cannot say how many rows there are: the footer says.
          ...(server
            ? {
                paginationDisplayedRows: ({ from, to }: { from: number; to: number }) => {
                  if (server.footerLabel) {
                    return server.footerLabel;
                  }
                  // Past the depth: a list that stops counting says "10,000+"; one that counts says its number.
                  const pastDepth = server.rowCount > MAX_LIST_DEPTH;
                  const key = pastDepth
                    ? server.totalLabel
                      ? "paging.limitedRows"
                      : "paging.cappedRows"
                    : "paging.rows";
                  return t(key, {
                    from: from.toLocaleString(i18n.language),
                    to: to.toLocaleString(i18n.language),
                    total: server.totalLabel ?? server.rowCount.toLocaleString(i18n.language),
                    max: MAX_LIST_DEPTH.toLocaleString(i18n.language),
                  });
                },
              }
            : {}),
        }}
        columnVisibilityModel={columnVisibilityModel}
        onColumnVisibilityModelChange={onColumnVisibilityModelChange}
        filterModel={editing.model}
        onFilterModelChange={handleFilterModelChange}
        filterDebounceMs={400}
        pageSizeOptions={PAGE_SIZES}
        onRowClick={onRowClick ? handleRowClick : undefined}
        disableRowSelectionOnClick
        rowHeight={48}
        columnHeaderHeight={44}
        sx={[GRID_SX, !onRowClick && { "& .MuiDataGrid-row": { cursor: "default" } }]}
        {...(server
          ? {
              paginationMode: "server",
              sortingMode: "server",
              filterMode: "server",
              // The pager stops at the last page the API allows; narrow the list with search or a filter to go further.
              rowCount: Math.min(server.rowCount, MAX_LIST_DEPTH),
              paginationModel: toPaginationModel(server.params),
              onPaginationModelChange: handlePaginationModelChange,
              sortModel,
              onSortModelChange: handleSortModelChange,
            }
          : { initialState: { pagination: { paginationModel: { pageSize: 25 } } } })}
      />
    </Box>
  );
}

// The IDS DMS grid: no outer border (the card has it), a tinted header row with small bold headings, one line between
// rows, no focus outline on a click (only for the keyboard).
const GRID_SX = {
  border: 0,
  "& .MuiDataGrid-toolbar": { gap: 1, px: 2, py: 1.5, minHeight: "auto", borderBottom: 1, borderColor: "divider" },
  "& .MuiDataGrid-columnHeader, & .MuiDataGrid-filler, & .MuiDataGrid-scrollbarFiller": { bgcolor: INSET_SURFACE },
  "& .MuiDataGrid-columnHeaderTitle": {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "text.secondary",
    letterSpacing: "0.04em",
  },
  "& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within": { outline: "none" },
  "& .MuiDataGrid-cell": {
    display: "flex",
    alignItems: "center",
    "&:focus, &:focus-within": { outline: "none" },
    "&:focus-visible": { outline: "1px solid", outlineColor: "primary.main", outlineOffset: "-1px" },
  },
  "& .MuiDataGrid-row": { cursor: "pointer" },
  // A list's first column, the record's name or number, reads as the link it is.
  "& .primary-link": { color: "primary.main", fontWeight: 600 },
  // A column of codes (part numbers, bins) sets cellClassName: 'monospace'.
  "& .monospace": { fontFamily: "monospace", fontWeight: 600 },
  "& .MuiDataGrid-footerContainer": { borderTop: 1, borderColor: "divider" },
  "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": {
    fontSize: "0.8rem",
    color: "text.secondary",
  },
  // A long footer ("1–25 of 24,214 (the list shows the first 10,000 …)") wraps instead of pushing the page buttons
  // out of the card at 1024 wide (ACME-124's verifier).
  "& .MuiTablePagination-root": { flex: 1, minWidth: 0 },
  "& .MuiTablePagination-toolbar": { flexWrap: "wrap", justifyContent: "flex-end", rowGap: 0.5 },
  "& .MuiTablePagination-spacer": { display: "none" },
  "& .MuiTablePagination-displayedRows": { flex: "1 1 12rem", minWidth: 0, whiteSpace: "normal", textAlign: "right" },
} as const;
