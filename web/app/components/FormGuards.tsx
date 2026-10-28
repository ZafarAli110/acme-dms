import {useTranslation} from 'react-i18next';
import {useLocationChangePrompt} from '../core/hooks/useLocationChangePrompt';
import {useUnsavedChangesGuard} from '../core/hooks/useUnsavedChangesGuard';
import {UnsavedChangesDialog} from './UnsavedChangesDialog';

interface FormGuardsProps {
  /** Unsaved changes, and not saving right now: `formState.isDirty && !isSubmitting`. */
  isDirty: boolean;
  /** Where to go after the user confirms a location switch: usually the feature's list. */
  redirectTo: string;
}

/**
 * Every form page renders this once. While the form is dirty it asks before the user leaves the page (links, back,
 * closing the tab) or switches location in the top bar. Only one question is shown at a time.
 */
export function FormGuards({isDirty, redirectTo}: FormGuardsProps) {
  const {t} = useTranslation();
  const leave = useUnsavedChangesGuard(isDirty);
  const switchLocation = useLocationChangePrompt(isDirty, redirectTo);

  return (
    <>
      <UnsavedChangesDialog
        open={leave.showDialog}
        title={t('unsavedChanges.leaveTitle')}
        message={t('unsavedChanges.leaveMessage')}
        leaveLabel={t('unsavedChanges.leave')}
        onStay={leave.cancel}
        onLeave={leave.confirm}
      />
      <UnsavedChangesDialog
        open={switchLocation.showDialog}
        title={t('unsavedChanges.switchTitle')}
        message={t('unsavedChanges.switchMessage')}
        leaveLabel={t('unsavedChanges.switch')}
        onStay={switchLocation.cancel}
        onLeave={switchLocation.confirm}
      />
    </>
  );
}
