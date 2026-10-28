import {Button, Grid, Paper, Skeleton, Stack, Typography} from '@mui/material';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {formatInstant} from '../../core/formatters/formatDate';
import {useParams} from 'react-router';
import {customerQueries} from './queries/customerQueries';
import type {CustomerInput} from './types/customer';
import {useSelectedLocation} from '../../core/contexts/location/useSelectedLocation';
import {ErrorAlert} from '../../components/ErrorAlert';
import {PageHeader} from '../../components/PageHeader';
import {CustomerFields, EMPTY_CUSTOMER} from './components/CustomerFields';
import {CustomerStatusChip} from './components/CustomerStatusChip';

function toInput(customer: CustomerInput): CustomerInput {
  const {firstName, surname, companyName, email, phone, city, status, lastContactDate} = customer;
  return {firstName, surname, companyName, email, phone, city, status, lastContactDate};
}

export default function CustomerEdit() {
  const {t, i18n} = useTranslation('customers');
  const {customerId = ''} = useParams();
  const {location, can} = useSelectedLocation();
  const queryClient = useQueryClient();

  const {data: customer, error} = useQuery({
    queryKey: ['customers', location?.id, 'detail', customerId],
    queryFn: ({signal}) => customerQueries.getCustomerAsync(customerId, {signal}),
    enabled: location !== null,
  });

  const [draft, setDraft] = useState<CustomerInput>(EMPTY_CUSTOMER);
  useEffect(() => {
    if (customer) {
      setDraft(toInput(customer));
    }
  }, [customer]);

  const save = useMutation({
    mutationFn: () => customerQueries.updateCustomerAsync(customerId, draft),
    onSuccess: () => queryClient.invalidateQueries({queryKey: ['customers']}),
  });

  if (!customer) {
    return error ? <ErrorAlert error={error} /> : <Skeleton variant="rounded" height={240} />;
  }

  const canEdit = can('customers.write');
  const changed = JSON.stringify(draft) !== JSON.stringify(toInput(customer));
  return (
    <>
      <PageHeader
        title={`${customer.firstName} ${customer.surname}`}
        subtitle={customer.companyName ?? t('edit.customerOf', {location: location?.name ?? ''})}
        trail={[{label: t('title'), to: '/customers'}]}
        actions={<CustomerStatusChip status={customer.status} />}
      />
      <Grid container spacing={3}>
        <Grid size={{xs: 12, md: 8}}>
          <Paper sx={{p: 3}}>
            <Typography variant="h6" sx={{mb: 2}}>
              {t('edit.details')}
            </Typography>
            <CustomerFields value={draft} onChange={setDraft} disabled={!canEdit} />
            {canEdit && (
              <Stack direction="row" sx={{justifyContent: 'flex-end', mt: 2}}>
                <Button
                  variant="contained"
                  onClick={() => save.mutate()}
                  disabled={!changed || save.isPending || !draft.firstName.trim() || !draft.surname.trim()}
                  data-testid="save-customer"
                >
                  {t('edit.saveChanges')}
                </Button>
              </Stack>
            )}
            <ErrorAlert error={save.error} />
          </Paper>
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
                {t('edit.added', {date: formatInstant(customer.createdAt, i18n.language)})}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('edit.updated', {date: formatInstant(customer.updatedAt, i18n.language)})}
              </Typography>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </>
  );
}
