import {Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography} from '@mui/material';
import {useTranslation} from 'react-i18next';

/** `feature` is the screen's name, already translated. */
export function ComingSoonDialog({feature, onClose}: {feature: string | null; onClose: () => void}) {
  const {t} = useTranslation('navigation');
  return (
    <Dialog open={feature !== null} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{feature}</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary">{t('comingSoon.body')}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          {t('comingSoon.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
