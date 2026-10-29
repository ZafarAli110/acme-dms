import {Stack} from '@mui/material';
import {useExports} from '../../core/contexts/exports/useExports';
import {ExportCard} from './ExportCard';

/** The exports this tab started, bottom right on every page, so one keeps reporting while the user works elsewhere. */
export function ExportDock() {
  const {exports} = useExports();
  if (exports.length === 0) {
    return null;
  }
  return (
    <Stack spacing={1} sx={{position: 'fixed', right: 16, bottom: 16, zIndex: (theme) => theme.zIndex.snackbar}}>
      {exports.map((entry) => (
        <ExportCard key={entry.job.id} entry={entry} />
      ))}
    </Stack>
  );
}
