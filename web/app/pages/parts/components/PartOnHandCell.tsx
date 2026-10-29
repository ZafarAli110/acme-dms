import {Box, Chip} from '@mui/material';
import {useTranslation} from 'react-i18next';
import type {PartListItem} from '../types/part';

/** The quantity on hand in a grid row, marked "Low" when it is below the reorder level. */
export function PartOnHandCell({part}: {part: PartListItem}) {
  const {t} = useTranslation('parts');
  return (
    <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, height: '100%'}}>
      {part.inventory.belowReorderLevel && (
        <Chip size="small" color="warning" label={t('low')} data-testid="low-stock" />
      )}
      {part.inventory.quantityOnHand}
    </Box>
  );
}
