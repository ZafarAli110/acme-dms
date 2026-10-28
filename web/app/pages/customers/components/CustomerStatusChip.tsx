import {Chip} from '@mui/material';
import {useTranslation} from 'react-i18next';
import type {CustomerStatus} from '../types/customer';

const COLOR = {active: 'success', prospect: 'info', inactive: 'default'} as const;

export function CustomerStatusChip({status}: {status: CustomerStatus}) {
  const {t} = useTranslation('customers');
  return (
    <Chip
      size="small"
      color={COLOR[status]}
      label={t(`status.${status}`)}
      variant={status === 'inactive' ? 'outlined' : 'filled'}
    />
  );
}
