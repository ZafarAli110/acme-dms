import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import {Badge, Box, InputAdornment, TextField, Tooltip} from '@mui/material';
import {
  ColumnsPanelTrigger,
  FilterPanelTrigger,
  gridFilterModelSelector,
  QuickFilter,
  QuickFilterControl,
  Toolbar,
  ToolbarButton,
  useGridApiContext,
  useGridSelector,
} from '@mui/x-data-grid';
import type {ReactNode} from 'react';
import {useTranslation} from 'react-i18next';

declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    /** The list's own buttons (an export, say), between the grid's controls and the search. */
    actions?: ReactNode;
    searchPlaceholder?: string;
  }
}

interface AppDataGridToolbarProps {
  actions?: ReactNode;
  searchPlaceholder?: string;
}

/** The whole search box is one value: the API matches it as typed, not word by word. */
function wholeInput(input: string): string[] {
  return input.trim() ? [input] : [];
}

/** Every grid's toolbar: choose columns, filter, the list's own actions, and search. */
export function AppDataGridToolbar({actions, searchPlaceholder}: AppDataGridToolbarProps) {
  const {t} = useTranslation();
  const apiRef = useGridApiContext();
  const filterCount = useGridSelector(apiRef, gridFilterModelSelector).items.length;

  return (
    <Toolbar>
      <Tooltip title={t('grid.columns')}>
        <ColumnsPanelTrigger render={<ToolbarButton data-testid="grid-columns" />}>
          <ViewColumnIcon fontSize="small" />
        </ColumnsPanelTrigger>
      </Tooltip>
      <Tooltip title={t('grid.filters')}>
        <FilterPanelTrigger render={<ToolbarButton data-testid="grid-filters" />}>
          <Badge badgeContent={filterCount} color="primary" variant="dot">
            <FilterListIcon fontSize="small" />
          </Badge>
        </FilterPanelTrigger>
      </Tooltip>
      <Box sx={{flex: 1}} />
      {actions}
      <QuickFilter parser={wholeInput} debounceMs={400} expanded>
        <QuickFilterControl
          render={
            <TextField
              size="small"
              placeholder={searchPlaceholder ?? t('grid.search')}
              sx={{width: {xs: 180, sm: 320}}}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
              data-testid="grid-search"
            />
          }
        />
      </QuickFilter>
    </Toolbar>
  );
}
