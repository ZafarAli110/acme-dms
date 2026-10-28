import {valibotResolver} from '@hookform/resolvers/valibot';
import {Alert, Box, Button, Chip, Grid, Paper, Stack, TextField, Typography} from '@mui/material';
import {useMemo} from 'react';
import {Controller, FormProvider, useForm} from 'react-hook-form';
import {useTranslation} from 'react-i18next';
import {useActionData, useNavigate, useNavigation, useSubmit} from 'react-router';
import {FormGuards} from '../../components/FormGuards';
import {PageHeader} from '../../components/PageHeader';
import {PartPhotosSection} from './components/PartPhotosSection';
import {toFormValues, toUpdateFormData} from './mappers/partFormMapper';
import type {clientAction} from './PartEdit';
import {createPartUpdateSchema} from './schemas/partSchema';
import type {Part, PartFormValues} from './types/part';

interface PartFormProps {
  /** The part as saved. The page remounts the form when it changes, so the form starts from what was saved. */
  part: Part;
  locationName: string;
  canEdit: boolean;
}

/**
 * The part edit form: details, the stock here (read only) and the photos. One Save sends everything together through
 * the page's clientAction; nothing is saved before that.
 */
export function PartForm({part, locationName, canEdit}: PartFormProps) {
  const {t} = useTranslation('parts');
  const {t: tCommon} = useTranslation();
  const navigate = useNavigate();
  const submit = useSubmit();
  const actionData = useActionData<typeof clientAction>();
  const isSubmitting = useNavigation().state === 'submitting';

  const schema = useMemo(() => createPartUpdateSchema(t), [t]);
  const methods = useForm<PartFormValues>({resolver: valibotResolver(schema), defaultValues: toFormValues(part)});
  const {isDirty} = methods.formState;
  const disabled = !canEdit || isSubmitting;

  const save = methods.handleSubmit((values) =>
    submit(toUpdateFormData(values, part), {method: 'post', encType: 'multipart/form-data'}),
  );

  return (
    <FormProvider {...methods}>
      <PageHeader
        title={part.partNumber}
        subtitle={part.description}
        trail={[{label: t('title'), to: '/parts'}]}
        actions={
          canEdit && (
            <>
              <Button onClick={() => navigate('/parts')} disabled={isSubmitting} data-testid="cancel">
                {tCommon('actions.cancel')}
              </Button>
              <Button
                type="submit"
                form="part-form"
                variant="contained"
                disabled={!isDirty || isSubmitting}
                data-testid="save-part"
              >
                {isSubmitting ? tCommon('actions.saving') : tCommon('actions.save')}
              </Button>
            </>
          )
        }
      />
      <FormGuards isDirty={isDirty && !isSubmitting} redirectTo="/parts" />
      {actionData?.error && (
        <Alert severity="error" sx={{mb: 2}} data-testid="save-error">
          {actionData.error}
        </Alert>
      )}
      {actionData?.saved && !isDirty && (
        <Alert severity="success" sx={{mb: 2}} data-testid="save-success">
          {t('edit.saved')}
        </Alert>
      )}
      <Box
        component="form"
        id="part-form"
        noValidate
        onSubmit={save}
        sx={{opacity: isSubmitting ? 0.6 : 1, pointerEvents: isSubmitting ? 'none' : 'auto'}}
      >
        <Grid container spacing={3}>
          <Grid size={{xs: 12, md: 7}}>
            <Paper sx={{p: 3}}>
              <Typography variant="h6" sx={{mb: 2}}>
                {t('edit.details')}
              </Typography>
              <Stack spacing={2}>
                <TextField label={t('columns.partNumber')} value={part.partNumber} disabled fullWidth />
                <Controller
                  control={methods.control}
                  name="description"
                  render={({field, fieldState}) => (
                    <TextField
                      {...field}
                      label={t('columns.description')}
                      required
                      fullWidth
                      disabled={disabled}
                      error={fieldState.error !== undefined}
                      helperText={fieldState.error?.message}
                      data-testid="part-description"
                    />
                  )}
                />
                <Controller
                  control={methods.control}
                  name="unitPrice"
                  render={({field, fieldState}) => (
                    <TextField
                      {...field}
                      label={t('columns.unitPrice')}
                      required
                      fullWidth
                      disabled={disabled}
                      slotProps={{htmlInput: {inputMode: 'decimal'}}}
                      error={fieldState.error !== undefined}
                      helperText={fieldState.error?.message}
                      data-testid="part-unit-price"
                    />
                  )}
                />
              </Stack>
            </Paper>
          </Grid>
          <Grid size={{xs: 12, md: 5}}>
            <Paper sx={{p: 3}}>
              <Typography variant="h6" sx={{mb: 2}}>
                {t('edit.stockHere', {location: locationName})}
              </Typography>
              <Stack spacing={1}>
                <Typography>
                  {t('columns.bin')}: <strong>{part.inventory.binCode}</strong>
                </Typography>
                <Typography>
                  {t('columns.onHand')}: <strong>{part.inventory.quantityOnHand}</strong>
                </Typography>
                <Typography>
                  {t('columns.reorderLevel')}: <strong>{part.inventory.reorderLevel}</strong>
                </Typography>
                {part.inventory.belowReorderLevel && (
                  <Box>
                    <Chip size="small" color="warning" label={t('edit.belowReorder')} />
                  </Box>
                )}
                <Typography variant="caption" color="text.secondary">
                  {t('edit.stockReadOnly')}
                </Typography>
              </Stack>
            </Paper>
          </Grid>
          <Grid size={12}>
            <PartPhotosSection savedPhotos={part.photos} disabled={disabled} />
          </Grid>
        </Grid>
      </Box>
    </FormProvider>
  );
}
