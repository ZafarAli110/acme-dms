import {Alert, Button, Grid, Paper, Skeleton, Stack, Typography} from '@mui/material';
import {Fragment} from 'react';
import {useTranslation} from 'react-i18next';
import {
  type ClientActionFunctionArgs,
  type ClientLoaderFunctionArgs,
  Link as RouterLink,
  useActionData,
  useParams,
} from 'react-router';
import {PageHeader} from '../../components/PageHeader';
import {problemErrorMessage} from '../../core/config/apiErrors';
import {useSelectedLocation} from '../../core/contexts/location/useSelectedLocation';
import {formatInstant} from '../../core/formatters/formatDate';
import {RESOLVED_LOCATION_CONTEXT} from '../../core/middleware/routerContext';
import {queryClient} from '../../core/queries/queryClient';
import {i18n} from '../../i18n';
import {CustomerStatusChip} from './components/CustomerStatusChip';
import {CustomerForm} from './CustomerForm';
import {useCustomer} from './hooks/useCustomer';
import {customerQueries} from './queries/customerQueries';
import {CUSTOMER_QUERY_KEYS} from './queries/customerQueryKey';
import type {CustomerInput} from './types/customer';

/** Fetches the customer before the page shows. Another location's customer is shown by the page, not thrown. */
export async function clientLoader({context, params}: ClientLoaderFunctionArgs) {
  const resolved = context.get(RESOLVED_LOCATION_CONTEXT);
  const customerId = params['customerId'];
  if (resolved && customerId) {
    await queryClient
      .query({
        staleTime: 'static',
        queryKey: CUSTOMER_QUERY_KEYS.detail(resolved.locationId, customerId),
        queryFn: ({signal}) => customerQueries.getCustomerAsync(customerId, {signal}),
      })
      .catch(() => null);
  }
  return null;
}

/** One Save: a PUT with every field; the page then shows the customer as saved. */
export async function clientAction({request, context, params}: ClientActionFunctionArgs) {
  const resolved = context.get(RESOLVED_LOCATION_CONTEXT);
  const customerId = params['customerId'];
  if (!resolved || !customerId) {
    return {saved: false, error: i18n.t('errors.unexpected')};
  }
  try {
    await customerQueries.updateCustomerAsync(customerId, (await request.json()) as CustomerInput);
  } catch (error) {
    return {saved: false, error: problemErrorMessage(error, i18n.t('errors.unexpected'))};
  }
  await queryClient.invalidateQueries({queryKey: CUSTOMER_QUERY_KEYS.all(resolved.locationId)});
  return {saved: true, error: null};
}

export default function CustomerEdit() {
  const {t, i18n: activeI18n} = useTranslation('customers');
  const {customerId = ''} = useParams();
  const {location, can} = useSelectedLocation();
  const {data: customer, isLoading} = useCustomer(location?.id ?? '', customerId);
  const actionData = useActionData<typeof clientAction>();

  if (isLoading) {
    return <Skeleton variant="rounded" height={420} />;
  }
  if (!customer) {
    return (
      <Stack sx={{gap: 2, alignItems: 'flex-start'}}>
        <Alert severity="warning" data-testid="customer-not-found">
          {t('edit.notFound', {location: location?.name ?? ''})}
        </Alert>
        <Button component={RouterLink} to="/customers">
          {t('edit.backToList')}
        </Button>
      </Stack>
    );
  }

  return (
    <Fragment>
      <PageHeader
        title={`${customer.firstName} ${customer.surname}`}
        subtitle={customer.companyName ?? t('edit.customerOf', {location: location?.name ?? ''})}
        trail={[{label: t('title'), to: '/customers'}]}
        actions={<CustomerStatusChip status={customer.status} />}
      />
      <Grid container spacing={3}>
        <Grid size={{xs: 12, md: 8}}>
          {/* Keyed by when the customer was saved: after a Save the form starts again from what was saved, clean. */}
          <CustomerForm
            key={customer.updatedAt}
            customer={customer}
            canEdit={can('customers.write')}
            error={actionData?.error ?? null}
            saved={actionData?.saved ?? false}
          />
        </Grid>
        <Grid size={{xs: 12, md: 4}}>
          <Paper sx={{p: 3}}>
            <Typography variant="h6" sx={{mb: 2}}>
              {t('edit.record')}
            </Typography>
            <Stack spacing={1}>
              <Typography variant="body2" color="text.secondary">
                {t('edit.location', {location: location?.name ?? ''})}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('edit.added', {date: formatInstant(customer.createdAt, activeI18n.language)})}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('edit.updated', {date: formatInstant(customer.updatedAt, activeI18n.language)})}
              </Typography>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Fragment>
  );
}
