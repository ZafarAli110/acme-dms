import type {GridColDef, GridRenderCellParams} from '@mui/x-data-grid';
import type {TFunction} from 'i18next';
import {serverColumn} from '../../../components/data-grid/serverColumns';
import {formatPlainDate} from '../../../core/formatters/formatDate';
import {CustomerNameCell} from '../components/CustomerNameCell';
import {CustomerStatusChip} from '../components/CustomerStatusChip';
import type {CustomerListItem, CustomerStatus} from '../types/customer';

const STATUSES: CustomerStatus[] = ['active', 'prospect', 'inactive'];

function renderName(params: GridRenderCellParams<CustomerListItem>) {
  return <CustomerNameCell customer={params.row} />;
}

function renderStatus(params: GridRenderCellParams<CustomerListItem>) {
  return <CustomerStatusChip status={params.row.status} />;
}

/**
 * The customer list's columns. Each field is one the API sorts and filters by (CUSTOMER_LIST_COLUMNS in
 * dealership-api), under the same name.
 */
export function customerColumns(t: TFunction<'customers'>, language: string): GridColDef<CustomerListItem>[] {
  return [
    {field: 'name', headerName: t('columns.name'), flex: 1.4, minWidth: 220, renderCell: renderName},
    {field: 'companyName', headerName: t('fields.companyName'), flex: 1, minWidth: 140},
    {field: 'email', headerName: t('fields.email'), flex: 1.2, minWidth: 180},
    {field: 'phone', headerName: t('fields.phone'), flex: 0.9, minWidth: 140},
    {field: 'city', headerName: t('columns.city'), flex: 0.8, minWidth: 120},
    {
      field: 'status',
      headerName: t('columns.status'),
      type: 'singleSelect',
      valueOptions: STATUSES.map((status) => ({value: status, label: t(`status.${status}`)})),
      width: 120,
      renderCell: renderStatus,
    },
    {
      field: 'lastContactDate',
      headerName: t('columns.lastContact'),
      type: 'date',
      width: 140,
      // The grid filters a date column with Date objects; the API's YYYY-MM-DD is turned into one here.
      valueGetter: (value: string | null) => (value ? new Date(`${value}T00:00:00`) : null),
      valueFormatter: (_value: Date | null, row: CustomerListItem) =>
        row.lastContactDate ? formatPlainDate(row.lastContactDate, language) : '—',
    },
  ].map((column) => serverColumn<CustomerListItem>(column as GridColDef<CustomerListItem>));
}
