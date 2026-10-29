import type {GridColDef, GridRenderCellParams} from '@mui/x-data-grid';
import type {TFunction} from 'i18next';
import {serverColumn} from '../../../components/data-grid/serverColumns';
import {PartOnHandCell} from '../components/PartOnHandCell';
import {PartThumbnailCell} from '../components/PartThumbnailCell';
import {formatPrice} from '../formatters/formatPrice';
import type {PartListItem} from '../types/part';

function renderThumbnail(params: GridRenderCellParams<PartListItem>) {
  return <PartThumbnailCell part={params.row} />;
}

function renderOnHand(params: GridRenderCellParams<PartListItem>) {
  return <PartOnHandCell part={params.row} />;
}

/**
 * The parts list's columns. Each sortable field is one the API sorts and filters by (STOCKED_PART_COLUMNS in
 * dealership-api), under the same name; the photo is neither.
 */
export function partColumns(t: TFunction<'parts'>, language: string): GridColDef<PartListItem>[] {
  return [
    {
      field: 'photo',
      headerName: '',
      width: 56,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: renderThumbnail,
    },
    {field: 'partNumber', headerName: t('columns.partNumber'), width: 150, cellClassName: 'monospace'},
    {field: 'description', headerName: t('columns.description'), flex: 1, minWidth: 200},
    {
      field: 'bin',
      headerName: t('columns.bin'),
      width: 110,
      cellClassName: 'monospace',
      valueGetter: (_value: unknown, row: PartListItem) => row.inventory.binCode,
    },
    {
      field: 'onHand',
      headerName: t('columns.onHand'),
      type: 'number',
      width: 130,
      valueGetter: (_value: unknown, row: PartListItem) => row.inventory.quantityOnHand,
      renderCell: renderOnHand,
    },
    {
      field: 'unitPrice',
      headerName: t('columns.unitPrice'),
      type: 'number',
      width: 120,
      valueFormatter: (value: number) => formatPrice(value, language),
    },
  ].map((column) => serverColumn<PartListItem>(column as GridColDef<PartListItem>));
}
