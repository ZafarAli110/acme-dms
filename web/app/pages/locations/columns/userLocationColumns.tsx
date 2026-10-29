import type {GridColDef, GridRenderCellParams} from '@mui/x-data-grid';
import type {TFunction} from 'i18next';
import {formatRole} from '../../../core/formatters/formatRole';
import {DealerUserCell} from '../components/DealerUserCell';
import {LocationAssignmentCell} from '../components/LocationAssignmentCell';
import type {DealerLocation, DealerUser} from '../types/dealerUser';

const LOCATION_FIELD = 'location:';

function renderUser(params: GridRenderCellParams<DealerUser>) {
  return <DealerUserCell user={params.row} />;
}

function renderAssignment(params: GridRenderCellParams<DealerUser>) {
  return <LocationAssignmentCell user={params.row} locationId={params.field.slice(LOCATION_FIELD.length)} />;
}

/**
 * The Locations page's columns: the person, their job, then one switch per location. The grid sorts and filters the
 * few rows itself; a location column sorts and filters as yes or no.
 */
export function userLocationColumns(
  t: TFunction<'locations'>,
  tCommon: TFunction<'common'>,
  locations: DealerLocation[],
): GridColDef<DealerUser>[] {
  return [
    {
      field: 'displayName',
      headerName: t('columns.name'),
      flex: 1,
      minWidth: 220,
      renderCell: renderUser,
    },
    {
      field: 'role',
      headerName: t('columns.role'),
      width: 170,
      valueFormatter: (value: string) => formatRole(tCommon, value),
    },
    ...locations.map((location): GridColDef<DealerUser> => ({
      field: `${LOCATION_FIELD}${location.id}`,
      headerName: location.name,
      type: 'boolean',
      width: 140,
      valueGetter: (_value: unknown, row: DealerUser) => row.locationIds.includes(location.id),
      renderCell: renderAssignment,
    })),
  ];
}
