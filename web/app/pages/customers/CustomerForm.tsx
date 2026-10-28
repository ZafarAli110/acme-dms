import {valibotResolver} from '@hookform/resolvers/valibot';
import {Alert, Button, Paper, Stack, Typography} from '@mui/material';
import {useMemo} from 'react';
import {FormProvider, useForm} from 'react-hook-form';
import {useTranslation} from 'react-i18next';
import {useNavigate, useNavigation, useSubmit} from 'react-router';
import {FormGuards} from '../../components/FormGuards';
import {CustomerFields} from './components/CustomerFields';
import {toCustomerInput, toFormValues} from './mappers/customerFormMapper';
import {createCustomerSchema} from './schemas/customerSchema';
import type {CustomerFormValues, CustomerInput} from './types/customer';

interface CustomerFormProps {
  /** The customer as saved, or null for a new one. The edit page remounts the form when it changes. */
  customer: CustomerInput | null;
  canEdit: boolean;
  /** What the page's clientAction returned: its error, and whether the last Save succeeded. */
  error: string | null;
  saved: boolean;
}

/**
 * The customer's details, for the create and the edit page. One Save sends every field (null for an empty one)
 * through the page's clientAction as JSON; create then redirects to the new customer.
 */
export function CustomerForm({customer, canEdit, error, saved}: CustomerFormProps) {
  const {t} = useTranslation('customers');
  const {t: tCommon} = useTranslation();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  const schema = useMemo(() => createCustomerSchema(t), [t]);
  const methods = useForm<CustomerFormValues>({
    resolver: valibotResolver(schema),
    defaultValues: toFormValues(customer),
  });
  const {isDirty} = methods.formState;
  const disabled = !canEdit || isSubmitting;

  const save = methods.handleSubmit((values) =>
    submit({...toCustomerInput(values)}, {method: 'post', encType: 'application/json'}),
  );

  return (
    <FormProvider {...methods}>
      {/* Not while a navigation is under way: a create's redirect to the new customer must not ask. */}
      <FormGuards isDirty={isDirty && navigation.state === 'idle'} redirectTo="/customers" />
      {error && (
        <Alert severity="error" sx={{mb: 2}} data-testid="save-error">
          {error}
        </Alert>
      )}
      {saved && !isDirty && (
        <Alert severity="success" sx={{mb: 2}} data-testid="save-success">
          {t('edit.saved')}
        </Alert>
      )}
      <Paper
        component="form"
        id="customer-form"
        noValidate
        onSubmit={save}
        sx={{p: 3, opacity: isSubmitting ? 0.6 : 1, pointerEvents: isSubmitting ? 'none' : 'auto'}}
      >
        <Typography variant="h6" sx={{mb: 2}}>
          {t('edit.details')}
        </Typography>
        <CustomerFields disabled={disabled} />
        {canEdit && (
          <Stack direction="row" sx={{justifyContent: 'flex-end', gap: 1, mt: 2}}>
            <Button onClick={() => navigate('/customers')} disabled={isSubmitting} data-testid="cancel">
              {tCommon('actions.cancel')}
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={(customer !== null && !isDirty) || isSubmitting}
              data-testid="save-customer"
            >
              {isSubmitting ? tCommon('actions.saving') : tCommon('actions.save')}
            </Button>
          </Stack>
        )}
      </Paper>
    </FormProvider>
  );
}
