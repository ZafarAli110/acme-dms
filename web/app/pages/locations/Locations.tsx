import {Fragment, useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import type {ClientActionFunctionArgs} from 'react-router';
import {AppDataGrid} from '../../components/data-grid/AppDataGrid';
import {ErrorAlert} from '../../components/ErrorAlert';
import {PageHeader} from '../../components/PageHeader';
import {problemErrorMessage} from '../../core/config/apiErrors';
import {useAuth} from '../../core/contexts/auth/useAuth';
import {useColumnVisibility} from '../../core/hooks/useColumnVisibility';
import {queryClient} from '../../core/queries/queryClient';
import {i18n} from '../../i18n';
import {userLocationColumns} from './columns/userLocationColumns';
import {useDealerLocations} from './hooks/useDealerLocations';
import {useDealerUsers} from './hooks/useDealerUsers';
import {locationQueries} from './queries/locationQueries';
import {LOCATION_QUERY_KEYS} from './queries/locationQueryKey';
import {locationQueryOptions} from './queries/locationQueryOptions';
import type {AssignmentResult, DealerUser} from './types/dealerUser';

/** Fetches the dealer's people and locations before the page shows them. */
export async function clientLoader() {
  await Promise.all([
    queryClient.query({...locationQueryOptions.users(), staleTime: 'static'}).catch(() => null),
    queryClient.query({...locationQueryOptions.locations(), staleTime: 'static'}).catch(() => null),
  ]);
  return null;
}

/** One switch: assigns a person to a location or takes it away, then refreshes the list. */
export async function clientAction({request}: ClientActionFunctionArgs): Promise<AssignmentResult> {
  const form = await request.formData();
  const userId = String(form.get('userId') ?? '');
  const locationId = String(form.get('locationId') ?? '');
  try {
    if (form.get('intent') === 'assign') {
      await locationQueries.assignAsync(userId, locationId);
    } else {
      await locationQueries.unassignAsync(userId, locationId);
    }
  } catch (error) {
    return {error: problemErrorMessage(error, i18n.t('errors.unexpected'))};
  }
  await queryClient.invalidateQueries({queryKey: LOCATION_QUERY_KEYS.users()});
  return {error: null};
}

/** The service manager's view of who works where. A change shows the next time that person signs in. */
export default function Locations() {
  const {t} = useTranslation('locations');
  const {t: tCommon} = useTranslation();
  const {user} = useAuth();
  const users = useDealerUsers();
  const locations = useDealerLocations();
  const visibility = useColumnVisibility('locations');
  const columns = useMemo(() => userLocationColumns(t, tCommon, locations.data ?? []), [t, tCommon, locations.data]);

  return (
    <Fragment>
      <PageHeader title={t('title')} subtitle={t('subtitle', {dealer: user?.dealerName ?? ''})} />
      <ErrorAlert error={users.error ?? locations.error} />
      <AppDataGrid<DealerUser>
        columns={columns}
        rows={users.data ?? []}
        loading={users.isLoading || locations.isLoading}
        columnVisibilityModel={visibility.columnVisibilityModel}
        onColumnVisibilityModelChange={visibility.setColumnVisibilityModel}
        searchPlaceholder={t('search')}
        noRowsLabel={t('none')}
        testId="locations-table"
      />
    </Fragment>
  );
}
