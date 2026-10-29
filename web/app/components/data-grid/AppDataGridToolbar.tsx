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

/** Every grid's toolbar, as in the IDS DMS: the search first, then choosing columns, filtering, and the list's own buttons. */
export function AppDataGridToolbar({actions, searchPlaceholder}: AppDataGridToolbarProps) {
  const {t} = useTranslation();
  const apiRef = useGridApiContext();
  const filterCount = useGridSelector(apiRef, gridFilterModelSelector).items.length;

  return (
    <Toolbar>
      <QuickFilter parser={wholeInput} debounceMs={400} expanded style={{flex: 1, maxWidth: 560}}>
        <QuickFilterControl
          render={
            <TextField
              size="small"
              fullWidth
              placeholder={searchPlaceholder ?? t('grid.search')}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" sx={{color: 'text.secondary'}} />
                    </InputAdornment>
                  ),
                  sx: {height: 38, borderRadius: 2},
                },
              }}
              data-testid="grid-search"
            />
          }
        />
      </QuickFilter>
      <Box sx={{flex: 1}} />
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
      {actions}
    </Toolbar>
  );
}
