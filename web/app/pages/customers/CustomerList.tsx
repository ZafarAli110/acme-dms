import AddIcon from '@mui/icons-material/Add';
import {Button} from '@mui/material';
import {Fragment, useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {type ClientLoaderFunctionArgs, Link as RouterLink, useNavigate, useNavigation} from 'react-router';
import {AppDataGrid} from '../../components/data-grid/AppDataGrid';
import {ErrorAlert} from '../../components/ErrorAlert';
import {PageHeader} from '../../components/PageHeader';
import {useSelectedLocation} from '../../core/contexts/location/useSelectedLocation';
import {useColumnVisibility} from '../../core/hooks/useColumnVisibility';
import {useListParams} from '../../core/hooks/useListParams';
import {RESOLVED_LOCATION_CONTEXT} from '../../core/middleware/routerContext';
import {readListParams} from '../../core/paging/listParams';
import {queryClient} from '../../core/queries/queryClient';
import {customerColumns} from './columns/customerColumns';
import {useCustomerList} from './hooks/useCustomerList';
import {customerQueryOptions} from './queries/customerQueryOptions';
import type {CustomerListItem} from './types/customer';

/** Fetches the page of customers the URL asks for (search, page, sort, filter) before the list shows it. */
export async function clientLoader({request, context}: ClientLoaderFunctionArgs) {
  const resolved = context.get(RESOLVED_LOCATION_CONTEXT);
  if (resolved) {
    const params = readListParams(new URL(request.url).searchParams);
    await queryClient
      .query({...customerQueryOptions.list(resolved.locationId, params), staleTime: 'static'})
      .catch(() => null);
  }
  return null;
}

export default function CustomerList() {
  const {t, i18n} = useTranslation('customers');
  const {location, can} = useSelectedLocation();
  const navigate = useNavigate();
  const {params, update} = useListParams();
  // A new page, sort or filter loads in the route's clientLoader; meanwhile the grid keeps its rows and shows a bar.
  const isLoadingPage = useNavigation().state === 'loading';
  const {data, error, isLoading} = useCustomerList(location?.id ?? '', params);
  const visibility = useColumnVisibility('customers');
  const columns = useMemo(() => customerColumns(t, i18n.language), [t, i18n.language]);
  const noRows = params.search ? t('noMatch', {search: params.search}) : t('none', {location: location?.name ?? ''});

  const openCustomer = (customer: CustomerListItem): void => {
    void navigate(`/customers/${customer.id}`);
  };

  return (
    <Fragment>
      <PageHeader title={t('title')} subtitle={t('subtitle', {location: location?.name ?? ''})} />
      <ErrorAlert error={error} />
      <AppDataGrid<CustomerListItem>
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading || isLoadingPage}
        server={{params, rowCount: data?.total ?? 0, update}}
        columnVisibilityModel={visibility.columnVisibilityModel}
        onColumnVisibilityModelChange={visibility.setColumnVisibilityModel}
        onRowClick={openCustomer}
        actions={
          can('customers.write') && (
            <Button
              component={RouterLink}
              to="/customers/new"
              variant="contained"
              startIcon={<AddIcon />}
              data-testid="create-customer"
            >
              {t('newCustomer')}
            </Button>
          )
        }
        searchPlaceholder={t('search')}
        noRowsLabel={noRows}
        testId="customers-table"
      />
    </Fragment>
  );
}
