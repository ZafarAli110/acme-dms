import {
  getGridDateOperators,
  getGridNumericOperators,
  getGridSingleSelectOperators,
  getGridStringOperators,
  type GridColDef,
  type GridFilterOperator,
  type GridValidRowModel,
} from '@mui/x-data-grid';

// The operators the API's list endpoints take for each column type (dealership-api's FILTER_OPERATORS). The grid
// offers more (isAnyOf, doesNotContain); offering only these keeps every filter a user can build one the API answers.
const API_OPERATORS: Record<string, readonly string[]> = {
  string: ['contains', 'equals', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty'],
  number: ['=', '!=', '>', '>=', '<', '<=', 'isEmpty', 'isNotEmpty'],
  date: ['is', 'not', 'after', 'onOrAfter', 'before', 'onOrBefore', 'isEmpty', 'isNotEmpty'],
  singleSelect: ['is', 'not'],
};

function gridOperators(type: string): GridFilterOperator[] {
  switch (type) {
    case 'number':
      return getGridNumericOperators();
    case 'date':
      return getGridDateOperators();
    case 'singleSelect':
      return getGridSingleSelectOperators();
    default:
      return getGridStringOperators();
  }
}

/** A column of a server list: its filter offers only the operators the API takes for its type. */
export function serverColumn<Row extends GridValidRowModel>(column: GridColDef<Row>): GridColDef<Row> {
  if (column.filterable === false) {
    return column;
  }
  const type = column.type ?? 'string';
  const allowed = API_OPERATORS[type] ?? API_OPERATORS['string']!;
  return {...column, filterOperators: gridOperators(type).filter((operator) => allowed.includes(operator.value))};
}
