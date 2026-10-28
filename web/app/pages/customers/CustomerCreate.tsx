import {Alert} from '@mui/material';
import {Fragment} from 'react';
import {useTranslation} from 'react-i18next';
import {type ClientActionFunctionArgs, redirect, useActionData} from 'react-router';
import {PageHeader} from '../../components/PageHeader';
import {problemErrorMessage} from '../../core/config/apiErrors';
import {useSelectedLocation} from '../../core/contexts/location/useSelectedLocation';
import {RESOLVED_LOCATION_CONTEXT} from '../../core/middleware/routerContext';
import {queryClient} from '../../core/queries/queryClient';
import {i18n} from '../../i18n';
import {CustomerForm} from './CustomerForm';
import {customerQueries} from './queries/customerQueries';
import {CUSTOMER_QUERY_KEYS} from './queries/customerQueryKey';
import type {CustomerInput} from './types/customer';

/** Creates the customer at the selected location, then shows it; a failure comes back as `{error}`. */
export async function clientAction({request, context}: ClientActionFunctionArgs) {
  const resolved = context.get(RESOLVED_LOCATION_CONTEXT);
  if (!resolved) {
    return {error: i18n.t('errors.unexpected')};
  }
  let customerId: string;
  try {
    const created = await customerQueries.createCustomerAsync((await request.json()) as CustomerInput);
    customerId = created.id;
  } catch (error) {
    return {error: problemErrorMessage(error, i18n.t('errors.unexpected'))};
  }
  await queryClient.invalidateQueries({queryKey: CUSTOMER_QUERY_KEYS.all(resolved.locationId)});
  return redirect(`/customers/${customerId}`);
}

export default function CustomerCreate() {
  const {t} = useTranslation('customers');
  const {location, can} = useSelectedLocation();
  const actionData = useActionData<typeof clientAction>();

  return (
    <Fragment>
      <PageHeader
        title={t('create.title')}
        subtitle={t('create.intro', {location: location?.name ?? ''})}
        trail={[{label: t('title'), to: '/customers'}]}
      />
      {can('customers.write') ? (
        <CustomerForm customer={null} canEdit error={actionData?.error ?? null} saved={false} />
      ) : (
        <Alert severity="warning">{t('create.notAllowed', {location: location?.name ?? ''})}</Alert>
      )}
    </Fragment>
  );
}
