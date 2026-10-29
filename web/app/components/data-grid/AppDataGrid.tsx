import {Box} from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  type GridColumnVisibilityModel,
  type GridFilterModel,
  type GridPaginationModel,
  type GridRowParams,
  type GridSortModel,
  type GridValidRowModel,
} from '@mui/x-data-grid';
import {frFR} from '@mui/x-data-grid/locales';
import {type ReactNode, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {type ListParams, PAGE_SIZES} from '../../core/paging/listParams';
import {INSET_SURFACE} from '../../theme';
import {AppDataGridToolbar} from './AppDataGridToolbar';
import {fromFilterModel, sameFilter, toFilterModel, toPaginationModel, toSortModel} from './listGridModels';

/** A list whose paging, sort, filter and search the API applies; they live in the URL (useListParams). */
export interface ServerList {
  params: ListParams;
  rowCount: number;
  update: (changes: Partial<ListParams>, options: {replace: boolean}) => void;
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
  const {i18n} = useTranslation();
  // The filter as the user edits it: an operator picked but no value typed yet is not in the URL, yet must stay in
  // the panel. Whenever the URL's filter or search changes (Back, a shared link), it starts again from the URL.
  const urlFilter = server ? toFilterModel(server.params, columns) : {items: []};
  const urlFilterKey = JSON.stringify(urlFilter);
  const [editing, setEditing] = useState({key: urlFilterKey, model: urlFilter});
  if (editing.key !== urlFilterKey) {
    setEditing({key: urlFilterKey, model: urlFilter});
  }

  const handlePaginationModelChange = (model: GridPaginationModel): void => {
    if (!server) {
      return;
    }
    if (model.pageSize !== server.params.pageSize) {
      server.update({pageSize: model.pageSize, page: 1}, {replace: false});
    } else if (model.page + 1 !== server.params.page) {
      server.update({page: model.page + 1}, {replace: false});
    }
  };

  const handleSortModelChange = (model: GridSortModel): void => {
    const first = model[0];
    server?.update({sort: first?.field ?? null, direction: first?.sort ?? 'asc', page: 1}, {replace: false});
  };

  const handleFilterModelChange = (model: GridFilterModel): void => {
    setEditing({key: urlFilterKey, model});
    if (!server) {
      return;
    }
    const {filter, search} = fromFilterModel(model);
    if (!sameFilter(filter, server.params.filter) || search !== server.params.search) {
      server.update({filter, search, page: 1}, {replace: true});
    }
  };

  const handleRowClick = (params: GridRowParams<Row>): void => {
    onRowClick?.(params.row);
  };

  return (
    <Box
      sx={{
        height: 'calc(100vh - 190px)',
        minHeight: 420,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 4,
        overflow: 'hidden',
      }}
      data-testid={testId}
    >
      <DataGrid<Row>
        columns={columns}
        rows={rows}
        loading={loading}
        showToolbar
        slots={{toolbar: AppDataGridToolbar}}
        slotProps={{toolbar: {actions, searchPlaceholder}, loadingOverlay: {variant: 'linear-progress'}}}
        localeText={{
          ...(i18n.language.startsWith('fr') ? frFR.components.MuiDataGrid.defaultProps.localeText : {}),
          noRowsLabel,
          noResultsOverlayLabel: noRowsLabel,
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
        sx={[GRID_SX, !onRowClick && {'& .MuiDataGrid-row': {cursor: 'default'}}]}
        {...(server
          ? {
              paginationMode: 'server',
              sortingMode: 'server',
              filterMode: 'server',
              rowCount: server.rowCount,
              paginationModel: toPaginationModel(server.params),
              onPaginationModelChange: handlePaginationModelChange,
              sortModel: toSortModel(server.params),
              onSortModelChange: handleSortModelChange,
            }
          : {initialState: {pagination: {paginationModel: {pageSize: 25}}}})}
      />
    </Box>
  );
}

// The IDS DMS grid: no outer border (the card has it), a tinted header row with small bold headings, one line between
// rows, no focus outline on a click (only for the keyboard).
const GRID_SX = {
  border: 0,
  '& .MuiDataGrid-toolbar': {gap: 1, px: 2, py: 1.5, minHeight: 'auto', borderBottom: 1, borderColor: 'divider'},
  '& .MuiDataGrid-columnHeader, & .MuiDataGrid-filler, & .MuiDataGrid-scrollbarFiller': {bgcolor: INSET_SURFACE},
  '& .MuiDataGrid-columnHeaderTitle': {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'text.secondary',
    letterSpacing: '0.04em',
  },
  '& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': {outline: 'none'},
  '& .MuiDataGrid-cell': {
    display: 'flex',
    alignItems: 'center',
    '&:focus, &:focus-within': {outline: 'none'},
    '&:focus-visible': {outline: '1px solid', outlineColor: 'primary.main', outlineOffset: '-1px'},
  },
  '& .MuiDataGrid-row': {cursor: 'pointer'},
  // A list's first column, the record's name or number, reads as the link it is.
  '& .primary-link': {color: 'primary.main', fontWeight: 600},
  // A column of codes (part numbers, bins) sets cellClassName: 'monospace'.
  '& .monospace': {fontFamily: 'monospace', fontWeight: 600},
  '& .MuiDataGrid-footerContainer': {borderTop: 1, borderColor: 'divider'},
  '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
    fontSize: '0.8rem',
    color: 'text.secondary',
  },
} as const;
