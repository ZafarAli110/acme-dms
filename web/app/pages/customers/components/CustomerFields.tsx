import {Grid, MenuItem, TextField} from '@mui/material';
import {Controller, useFormContext} from 'react-hook-form';
import {useTranslation} from 'react-i18next';
import type {CustomerFormValues} from '../types/customer';

type TextFieldName = Exclude<keyof CustomerFormValues, 'status'>;

interface CustomerFieldsProps {
  disabled: boolean;
}

/** The editable fields of a customer, inside the customer form (`<FormProvider>`), for create and edit alike. */
export function CustomerFields({disabled}: CustomerFieldsProps) {
  const {t} = useTranslation('customers');
  const {control} = useFormContext<CustomerFormValues>();

  return (
    <Grid container spacing={2}>
      <Grid size={{xs: 12, sm: 6}}>
        <CustomerTextField field="firstName" disabled={disabled} required />
      </Grid>
      <Grid size={{xs: 12, sm: 6}}>
        <CustomerTextField field="surname" disabled={disabled} required />
      </Grid>
      <Grid size={12}>
        <CustomerTextField field="companyName" disabled={disabled} />
      </Grid>
      <Grid size={{xs: 12, sm: 6}}>
        <CustomerTextField field="email" disabled={disabled} type="email" />
      </Grid>
      <Grid size={{xs: 12, sm: 6}}>
        <CustomerTextField field="phone" disabled={disabled} type="tel" />
      </Grid>
      <Grid size={{xs: 12, sm: 6}}>
        <CustomerTextField field="city" disabled={disabled} />
      </Grid>
      <Grid size={{xs: 12, sm: 6}}>
        <CustomerTextField field="lastContactDate" disabled={disabled} type="date" />
      </Grid>
      <Grid size={{xs: 12, sm: 6}}>
        <Controller
          control={control}
          name="status"
          render={({field}) => (
            <TextField
              {...field}
              select
              label={t('fields.status')}
              disabled={disabled}
              fullWidth
              data-testid="customer-status"
            >
              <MenuItem value="active">{t('status.active')}</MenuItem>
              <MenuItem value="prospect">{t('status.prospect')}</MenuItem>
              <MenuItem value="inactive">{t('status.inactive')}</MenuItem>
            </TextField>
          )}
        />
      </Grid>
    </Grid>
  );
}

interface CustomerTextFieldProps {
  field: TextFieldName;
  disabled: boolean;
  required?: boolean;
  type?: string;
}

function CustomerTextField({field: name, disabled, required = false, type = 'text'}: CustomerTextFieldProps) {
  const {t} = useTranslation('customers');
  const {control} = useFormContext<CustomerFormValues>();

  return (
    <Controller
      control={control}
      name={name}
      render={({field, fieldState}) => (
        <TextField
          {...field}
          label={t(`fields.${name}`)}
          type={type}
          required={required}
          disabled={disabled}
          fullWidth
          error={fieldState.error !== undefined}
          helperText={fieldState.error?.message}
          slotProps={type === 'date' ? {inputLabel: {shrink: true}} : undefined}
          data-testid={`customer-${name}`}
        />
      )}
    />
  );
}
