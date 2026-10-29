import type {GridColDef, GridFilterModel, GridPaginationModel, GridSortModel} from '@mui/x-data-grid';
import type {ListFilter, ListParams} from '../../core/paging/listParams';

const VALUELESS_OPERATORS = new Set(['isEmpty', 'isNotEmpty']);

function columnType(columns: readonly GridColDef[], field: string): string {
  return columns.find((column) => column.field === field)?.type ?? 'string';
}

// The grid's date filter holds a day as UTC midnight: it parses the picked day with new Date('YYYY-MM-DD') and shows
// it with toISOString(). Converting the same way keeps the day the user picked in every time zone.
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fromIsoDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

export function toPaginationModel(params: ListParams): GridPaginationModel {
  return {page: params.page - 1, pageSize: params.pageSize};
}

export function toSortModel(params: Pick<ListParams, 'sort' | 'direction'>): GridSortModel {
  return params.sort ? [{field: params.sort, sort: params.direction}] : [];
}

/** The URL's filter and search as the grid shows them: a date column's value back as a Date, a number as a number. */
export function toFilterModel(params: ListParams, columns: readonly GridColDef[]): GridFilterModel {
  const {filter} = params;
  let value: unknown = filter?.value ?? null;
  if (filter && filter.value !== null) {
    const type = columnType(columns, filter.field);
    if (type === 'date') {
      value = fromIsoDate(filter.value);
    } else if (type === 'number') {
      value = Number(filter.value);
    }
  }
  return {
    items: filter ? [{id: 1, field: filter.field, operator: filter.operator, value}] : [],
    quickFilterValues: params.search ? [params.search] : [],
  };
}

/** The grid's filter as the URL keeps it; a filter still being typed (an operator, no value yet) is none yet. */
export function fromFilterModel(model: GridFilterModel): {filter: ListFilter | null; search: string} {
  const search = (model.quickFilterValues ?? []).join(' ').trim();
  const item = model.items[0];
  if (!item) {
    return {filter: null, search};
  }
  if (VALUELESS_OPERATORS.has(item.operator)) {
    return {filter: {field: item.field, operator: item.operator, value: null}, search};
  }
  const value: unknown = item.value ?? null;
  if (value === null || value === '' || (value instanceof Date && Number.isNaN(value.getTime()))) {
    return {filter: null, search};
  }
  return {
    filter: {
      field: item.field,
      operator: item.operator,
      value: value instanceof Date ? toIsoDate(value) : String(value),
    },
    search,
  };
}

/** The same filter, whatever object holds it: a list only navigates when the filter really changed. */
export function sameFilter(a: ListFilter | null, b: ListFilter | null): boolean {
  return a?.field === b?.field && a?.operator === b?.operator && a?.value === b?.value;
}
