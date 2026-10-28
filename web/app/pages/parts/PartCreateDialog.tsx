import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useNavigate} from 'react-router';
import {partQueries} from './queries/partQueries';
import {useSelectedLocation} from '../../core/contexts/location/useSelectedLocation';
import {ErrorAlert} from '../../components/ErrorAlert';

const EMPTY = {partNumber: '', description: '', unitPrice: '', binId: '', quantityOnHand: '0', reorderLevel: '0'};

/** A new part is stocked at the selected location from the start, in one of that location's bins. */
export function PartCreateDialog({open, onClose}: {open: boolean; onClose: () => void}) {
  const {t} = useTranslation('parts');
  const {t: tCommon} = useTranslation();
  const {location} = useSelectedLocation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);

  // Bins belong to one location, so the location is part of the key.
  const bins = useQuery({
    queryKey: ['bins', location?.id],
    queryFn: ({signal}) => partQueries.getBinsAsync({signal}),
    enabled: open && location !== null,
  });

  const create = useMutation({
    mutationFn: () =>
      partQueries.createPartAsync({
        partNumber: form.partNumber,
        description: form.description,
        unitPrice: Number(form.unitPrice),
        binId: form.binId,
        quantityOnHand: Number(form.quantityOnHand),
        reorderLevel: Number(form.reorderLevel),
      }),
    onSuccess: async (part) => {
      await queryClient.invalidateQueries({queryKey: ['parts']});
      setForm(EMPTY);
      onClose();
      navigate(`/parts/${part.id}`);
    },
  });

  const set = (field: keyof typeof EMPTY) => (event: {target: {value: string}}) =>
    setForm({...form, [field]: field === 'partNumber' ? event.target.value.toUpperCase() : event.target.value});
  const complete = form.partNumber && form.description && form.unitPrice !== '' && form.binId;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('create.title')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>
          {t('create.intro', {location: location?.name ?? ''})}
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{xs: 12, sm: 6}}>
            <TextField
              label={t('columns.partNumber')}
              value={form.partNumber}
              onChange={set('partNumber')}
              helperText={t('create.partNumberHelp')}
              required
              fullWidth
              data-testid="part-number"
            />
          </Grid>
          <Grid size={{xs: 12, sm: 6}}>
            <TextField
              label={t('columns.unitPrice')}
              type="number"
              value={form.unitPrice}
              onChange={set('unitPrice')}
              required
              fullWidth
              data-testid="part-unit-price"
            />
          </Grid>
          <Grid size={12}>
            <TextField
              label={t('columns.description')}
              value={form.description}
              onChange={set('description')}
              required
              fullWidth
              data-testid="part-description"
            />
          </Grid>
          <Grid size={{xs: 12, sm: 6}}>
            <TextField
              select
              label={t('create.bin')}
              value={form.binId}
              onChange={set('binId')}
              required
              fullWidth
              disabled={bins.isLoading}
              helperText={
                bins.data?.length === 0
                  ? t('create.noBins', {location: location?.name ?? ''})
                  : t('create.binHelp', {location: location?.name ?? ''})
              }
              data-testid="part-bin"
            >
              {bins.data?.map((bin) => (
                <MenuItem key={bin.id} value={bin.id}>
                  {bin.code} · {bin.description}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{xs: 6, sm: 3}}>
            <TextField
              label={t('columns.onHand')}
              type="number"
              value={form.quantityOnHand}
              onChange={set('quantityOnHand')}
              fullWidth
              data-testid="part-quantity"
            />
          </Grid>
          <Grid size={{xs: 6, sm: 3}}>
            <TextField
              label={t('columns.reorderLevel')}
              type="number"
              value={form.reorderLevel}
              onChange={set('reorderLevel')}
              fullWidth
              data-testid="part-reorder-level"
            />
          </Grid>
        </Grid>
        <ErrorAlert error={bins.error ?? create.error} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('actions.cancel')}</Button>
        <Button
          variant="contained"
          onClick={() => create.mutate()}
          disabled={!complete || create.isPending}
          data-testid="create-part-submit"
        >
          {t('create.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
