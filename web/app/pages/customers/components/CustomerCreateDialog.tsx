import {Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography} from '@mui/material';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useNavigate} from 'react-router';
import {customerQueries} from '../queries/customerQueries';
import type {CustomerInput} from '../types/customer';
import {useSelectedLocation} from '../../../core/contexts/location/useSelectedLocation';
import {ErrorAlert} from '../../../components/ErrorAlert';
import {CustomerFields, EMPTY_CUSTOMER} from './CustomerFields';

export function CustomerCreateDialog({open, onClose}: {open: boolean; onClose: () => void}) {
  const {t} = useTranslation('customers');
  const {t: tCommon} = useTranslation();
  const {location} = useSelectedLocation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<CustomerInput>(EMPTY_CUSTOMER);

  const create = useMutation({
    mutationFn: () => customerQueries.createCustomerAsync(customer),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({queryKey: ['customers']});
      setCustomer(EMPTY_CUSTOMER);
      onClose();
      navigate(`/customers/${created.id}`);
    },
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('create.title')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>
          The customer joins {location?.name ?? 'the selected location'}.
        </Typography>
        <CustomerFields value={customer} onChange={setCustomer} />
        <ErrorAlert error={create.error} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('actions.cancel')}</Button>
        <Button
          variant="contained"
          onClick={() => create.mutate()}
          disabled={create.isPending || !customer.firstName.trim() || !customer.surname.trim()}
          data-testid="create-customer-submit"
        >
          {t('create.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
