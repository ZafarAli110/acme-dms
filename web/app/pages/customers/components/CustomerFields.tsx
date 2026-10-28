import {Grid, MenuItem, TextField} from '@mui/material';
import {useTranslation} from 'react-i18next';
import type {CustomerInput, CustomerStatus} from '../types/customer';

export const EMPTY_CUSTOMER: CustomerInput = {
  firstName: '',
  surname: '',
  companyName: null,
  email: null,
  phone: null,
  city: null,
  status: 'prospect',
  lastContactDate: null,
};

type TextFieldName = Exclude<keyof CustomerInput, 'status'>;

interface CustomerFieldsProps {
  value: CustomerInput;
  onChange: (next: CustomerInput) => void;
  disabled?: boolean;
}

/** The editable fields of a customer, shared by the create dialog and the detail page. Empty text becomes null. */
export function CustomerFields({value, onChange, disabled = false}: CustomerFieldsProps) {
  const {t} = useTranslation('customers');
  const fieldProps = {value, onChange, disabled};

  return (
    <Grid container spacing={2}>
      <Grid size={{xs: 12, sm: 6}}>
        <CustomerTextField {...fieldProps} field="firstName" required />
      </Grid>
      <Grid size={{xs: 12, sm: 6}}>
        <CustomerTextField {...fieldProps} field="surname" required />
      </Grid>
      <Grid size={12}>
        <CustomerTextField {...fieldProps} field="companyName" />
      </Grid>
      <Grid size={{xs: 12, sm: 6}}>
        <CustomerTextField {...fieldProps} field="email" type="email" />
      </Grid>
      <Grid size={{xs: 12, sm: 6}}>
        <CustomerTextField {...fieldProps} field="phone" type="tel" />
      </Grid>
      <Grid size={{xs: 12, sm: 6}}>
        <CustomerTextField {...fieldProps} field="city" />
      </Grid>
      <Grid size={{xs: 12, sm: 6}}>
        <CustomerTextField {...fieldProps} field="lastContactDate" type="date" />
      </Grid>
      <Grid size={{xs: 12, sm: 6}}>
        <TextField
          select
          label={t('fields.status')}
          value={value.status}
          disabled={disabled}
          fullWidth
          onChange={(event) => onChange({...value, status: event.target.value as CustomerStatus})}
          data-testid="customer-status"
        >
          <MenuItem value="active">{t('status.active')}</MenuItem>
          <MenuItem value="prospect">{t('status.prospect')}</MenuItem>
          <MenuItem value="inactive">{t('status.inactive')}</MenuItem>
        </TextField>
      </Grid>
    </Grid>
  );
}

interface CustomerTextFieldProps extends CustomerFieldsProps {
  field: TextFieldName;
  required?: boolean;
  type?: string;
}

function CustomerTextField({
  value,
  onChange,
  disabled,
  field,
  required = false,
  type = 'text',
}: CustomerTextFieldProps) {
  const {t} = useTranslation('customers');
  return (
    <TextField
      label={t(`fields.${field}`)}
      type={type}
      value={value[field] ?? ''}
      required={required}
      disabled={disabled}
      fullWidth
      onChange={(event) => {
        const raw = event.target.value;
        onChange({...value, [field]: required ? raw : raw.trim() === '' ? null : raw});
      }}
      slotProps={type === 'date' ? {inputLabel: {shrink: true}} : undefined}
      data-testid={`customer-${field}`}
    />
  );
}
