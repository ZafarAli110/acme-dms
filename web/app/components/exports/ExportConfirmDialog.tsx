import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";
import { useTranslation } from "react-i18next";

interface ExportConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Asks before an export starts: a large one runs for minutes and keeps the server busy, so it should be meant. */
export function ExportConfirmDialog({ open, title, message, onCancel, onConfirm }: ExportConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onCancel} data-testid="export-confirm-dialog">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} data-testid="export-confirm-cancel">
          {t("exports.cancel")}
        </Button>
        <Button variant="contained" onClick={onConfirm} autoFocus data-testid="export-confirm">
          {t("exports.export")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
