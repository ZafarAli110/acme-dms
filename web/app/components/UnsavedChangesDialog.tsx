import {Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle} from '@mui/material';
import {useTranslation} from 'react-i18next';

interface UnsavedChangesDialogProps {
  open: boolean;
  title: string;
  message: string;
  leaveLabel: string;
  onStay: () => void;
  onLeave: () => void;
}

export function UnsavedChangesDialog({open, title, message, leaveLabel, onStay, onLeave}: UnsavedChangesDialogProps) {
  const {t} = useTranslation();
  return (
    <Dialog open={open} onClose={onStay} data-testid="unsaved-changes-dialog">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onStay} autoFocus data-testid="unsaved-stay">
          {t('unsavedChanges.stay')}
        </Button>
        <Button color="error" onClick={onLeave} data-testid="unsaved-leave">
          {leaveLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
