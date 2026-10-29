import AddIcon from '@mui/icons-material/Add';
import {Button} from '@mui/material';
import {Fragment, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {type ClientLoaderFunctionArgs, useNavigate, useNavigation} from 'react-router';
import {AppDataGrid} from '../../components/data-grid/AppDataGrid';
import {ErrorAlert} from '../../components/ErrorAlert';
import {PageHeader} from '../../components/PageHeader';
import {useSelectedLocation} from '../../core/contexts/location/useSelectedLocation';
import {useColumnVisibility} from '../../core/hooks/useColumnVisibility';
import {useListParams} from '../../core/hooks/useListParams';
import {RESOLVED_LOCATION_CONTEXT} from '../../core/middleware/routerContext';
import {readListParams} from '../../core/paging/listParams';
import {queryClient} from '../../core/queries/queryClient';
import {partColumns} from './columns/partColumns';
import {usePartList} from './hooks/usePartList';
import {PartCreateDialog} from './PartCreateDialog';
import {partQueryOptions} from './queries/partQueryOptions';
import type {PartListItem} from './types/part';

/** Fetches the page of parts the URL asks for (search, page, sort, filter) before the list shows it. */
export async function clientLoader({request, context}: ClientLoaderFunctionArgs) {
  const resolved = context.get(RESOLVED_LOCATION_CONTEXT);
  if (resolved) {
    const params = readListParams(new URL(request.url).searchParams);
    await queryClient
      .query({...partQueryOptions.list(resolved.locationId, params), staleTime: 'static'})
      .catch(() => null);
  }
  return null;
}

export default function PartList() {
  const {t, i18n} = useTranslation('parts');
  const {location, can} = useSelectedLocation();
  const navigate = useNavigate();
  const {params, update} = useListParams();
  // A new page, sort or filter loads in the route's clientLoader; meanwhile the grid keeps its rows and shows a bar.
  const isLoadingPage = useNavigation().state === 'loading';
  const {data, error, isLoading} = usePartList(location?.id ?? '', params);
  const visibility = useColumnVisibility('parts');
  const columns = useMemo(() => partColumns(t, i18n.language), [t, i18n.language]);
  // Creating a part opens PartCreateDialog, which predates the web standard: its own form state, not a route.
  const [creating, setCreating] = useState(false);
  const noRows = params.search
    ? t('noMatch', {search: params.search})
    : t('noneStocked', {location: location?.name ?? ''});

  const openPart = (part: PartListItem): void => {
    void navigate(`/parts/${part.id}`);
  };

  return (
    <Fragment>
      <PageHeader title={t('title')} subtitle={t('subtitle', {location: location?.name ?? ''})} />
      <ErrorAlert error={error} />
      <AppDataGrid<PartListItem>
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading || isLoadingPage}
        server={{params, rowCount: data?.total ?? 0, update}}
        columnVisibilityModel={visibility.columnVisibilityModel}
        onColumnVisibilityModelChange={visibility.setColumnVisibilityModel}
        onRowClick={openPart}
        actions={
          can('parts.write') && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreating(true)}
              data-testid="create-part"
            >
              {t('newPart')}
            </Button>
          )
        }
        searchPlaceholder={t('search')}
        noRowsLabel={noRows}
        testId="parts-table"
      />
      <PartCreateDialog open={creating} onClose={() => setCreating(false)} />
    </Fragment>
  );
}
